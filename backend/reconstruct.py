"""Thin wrappers around the existing ``pipeline`` package — the GPU/Node seams.

Reconstruction runs **inline** in this backend (no more ``pipeline.watch`` handoff),
but the heavy calls stay isolated here so the orchestration in :mod:`backend.services`
is unit-testable with these injected as fakes (no GPU, no Node).
"""
from __future__ import annotations

from pathlib import Path


def run_reconstruct(in_dir: Path, out_dir: Path) -> None:
    """Run SHARP + thumbnails + manifest over an input dir (GPU seam)."""
    from pipeline.cli import reconstruct as sharp_reconstruct

    sharp_reconstruct(in_dir, out_dir)


def run_convert(splats_dir: Path, public_dir: Path) -> None:
    """Run the Node convert-splats step (.ply -> .sog + .preview.ply)."""
    from pipeline.watch import run_convert as _convert

    _convert(splats_dir, public_dir)
