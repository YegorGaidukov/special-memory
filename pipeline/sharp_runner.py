import subprocess
from pathlib import Path


def build_command(input_dir, output_dir, checkpoint=None, render=False, extra_args=None):
    """Build the `sharp predict` argv list."""
    cmd = ["sharp", "predict", "-i", str(input_dir), "-o", str(output_dir)]
    if checkpoint:
        cmd += ["-c", str(checkpoint)]
    if render:
        cmd += ["--render"]
    if extra_args:
        cmd += list(extra_args)
    return cmd


def run_sharp(input_dir, output_dir, checkpoint=None, render=False, extra_args=None):
    """Run SHARP on a folder of images; return sorted list of produced .ply paths."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    cmd = build_command(input_dir, output_dir, checkpoint, render, extra_args)
    subprocess.run(cmd, check=True)
    return sorted(output_dir.glob("*.ply"))
