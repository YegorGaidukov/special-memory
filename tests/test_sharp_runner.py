from pathlib import Path
from pipeline import sharp_runner


def test_build_command_basic():
    cmd = sharp_runner.build_command("in_dir", "out_dir")
    assert cmd == ["sharp", "predict", "-i", "in_dir", "-o", "out_dir"]


def test_build_command_with_checkpoint_and_extra():
    cmd = sharp_runner.build_command(
        "in_dir", "out_dir", checkpoint="ckpt.pt", extra_args=["--foo", "bar"]
    )
    assert cmd == [
        "sharp", "predict", "-i", "in_dir", "-o", "out_dir",
        "-c", "ckpt.pt", "--foo", "bar",
    ]


def test_run_sharp_invokes_subprocess_and_returns_ply(tmp_path, monkeypatch):
    out_dir = tmp_path / "out"
    calls = {}

    def fake_run(cmd, check):
        calls["cmd"] = cmd
        calls["check"] = check
        # simulate SHARP writing one .ply
        (out_dir / "a.ply").write_text("ply")

    monkeypatch.setattr(sharp_runner.subprocess, "run", fake_run)

    result = sharp_runner.run_sharp(tmp_path / "imgs", out_dir)

    assert calls["check"] is True
    assert calls["cmd"][:2] == ["sharp", "predict"]
    assert result == [out_dir / "a.ply"]
