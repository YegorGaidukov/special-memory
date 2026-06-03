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


def test_process_one_ready_notify_failure_does_not_mark_failed(tmp_path):
    public = tmp_path / "public"; public.mkdir()
    inbox = tmp_path / "inbox"; inbox.mkdir()
    img = inbox / "mem-3.jpg"; img.write_bytes(b"jpeg")

    def fake_reconstruct(in_dir, out_dir):
        (Path(out_dir) / "splats").mkdir(parents=True)
        (Path(out_dir) / "splats" / "mem-3.ply").write_text("ply")
        (Path(out_dir) / "thumbs").mkdir(parents=True)
        (Path(out_dir) / "thumbs" / "mem-3.jpg").write_text("thumb")

    def fake_convert(splats_dir, public_dir):
        (Path(public_dir) / "mem-3.sog").write_text("sog")

    def boom_ready(i):
        raise RuntimeError("ingest endpoint down")

    failed = []
    # A ready-notify failure after assets are committed must NOT mark the record
    # failed, must NOT quarantine the image, and must NOT raise out of process_one.
    process_one(
        "mem-3", img,
        public_dir=public, inbox=inbox, base_url="http://x",
        reconstruct=fake_reconstruct, convert=fake_convert,
        on_ready=boom_ready,
        on_fail=lambda i, e: failed.append((i, e)),
    )

    assert (public / "mem-3.sog").exists()   # reconstruction succeeded
    assert failed == []                       # not marked failed
    assert img.exists()                       # not quarantined
    assert not (inbox / "failed" / "mem-3.jpg").exists()


from pipeline.watch import resolve_base_url, candidate_ports


def test_candidate_ports_defaults_to_the_dev_server_range():
    assert candidate_ports({}) == [3000, 3001, 3002, 3003]


def test_candidate_ports_tries_PORT_env_first():
    # If the curator set an explicit dev PORT, probe it before the defaults.
    assert candidate_ports({"PORT": "3001"}) == [3001, 3000, 3002, 3003]


def test_resolve_base_url_explicit_override_skips_probing():
    def probe(_url):
        raise AssertionError("must not probe when WEB_BASE_URL is set")
    assert resolve_base_url({"WEB_BASE_URL": "http://box:9999"}, probe=probe) == "http://box:9999"


def test_resolve_base_url_picks_first_port_serving_our_api():
    tried = []
    def probe(url):
        tried.append(url)
        return url == "http://localhost:3001"  # 3000 is some other app
    assert resolve_base_url({}, probe=probe) == "http://localhost:3001"
    assert tried == ["http://localhost:3000", "http://localhost:3001"]


def test_resolve_base_url_falls_back_to_first_candidate_when_none_answer():
    assert resolve_base_url({}, probe=lambda _url: False) == "http://localhost:3000"
