from pipeline.watch import select_pending


def test_select_pending_filters_ready_and_in_flight():
    assert select_pending({"a", "b", "c"}, {"a"}, {"b"}) == ["c"]


def test_select_pending_empty_when_all_ready():
    assert select_pending({"a"}, {"a"}, set()) == []


def test_select_pending_empty_inbox():
    assert select_pending(set(), set(), set()) == []


from pathlib import Path
from pipeline.watch import process_one


def test_process_one_success(tmp_path):
    public = tmp_path / "public"; public.mkdir()
    inbox = tmp_path / "inbox"; inbox.mkdir()
    img = inbox / "mem-1.jpg"; img.write_bytes(b"jpeg")

    def fake_reconstruct(in_dir, out_dir):
        (Path(out_dir) / "splats").mkdir(parents=True)
        (Path(out_dir) / "splats" / "mem-1.ply").write_text("ply")
        (Path(out_dir) / "thumbs").mkdir(parents=True)
        (Path(out_dir) / "thumbs" / "mem-1.jpg").write_text("thumb")

    def fake_convert(splats_dir, public_dir):
        (Path(public_dir) / "mem-1.sog").write_text("sog")

    readied, failed = [], []
    process_one(
        "mem-1", img,
        public_dir=public, inbox=inbox, base_url="http://x",
        reconstruct=fake_reconstruct, convert=fake_convert,
        on_ready=lambda i: readied.append(i),
        on_fail=lambda i, e: failed.append((i, e)),
    )

    assert (public / "mem-1.sog").exists()
    assert (public / "mem-1.jpg").exists()
    assert readied == ["mem-1"]
    assert failed == []
    assert img.exists()  # left in place on success


def test_process_one_failure_quarantines_and_reports(tmp_path):
    public = tmp_path / "public"; public.mkdir()
    inbox = tmp_path / "inbox"; inbox.mkdir()
    img = inbox / "mem-2.jpg"; img.write_bytes(b"jpeg")

    def boom(in_dir, out_dir):
        raise RuntimeError("sharp exploded")

    readied, failed = [], []
    process_one(
        "mem-2", img,
        public_dir=public, inbox=inbox, base_url="http://x",
        reconstruct=boom, convert=lambda a, b: None,
        on_ready=lambda i: readied.append(i),
        on_fail=lambda i, e: failed.append((i, e)),
    )

    assert readied == []
    assert failed and failed[0][0] == "mem-2"
    assert "sharp exploded" in failed[0][1]
    assert not img.exists()                          # moved out of the inbox
    assert (inbox / "failed" / "mem-2.jpg").exists()
