import copy

import pytest

from backend.manifest import (
    merge_manifest,
    parse_manifest,
    patch_manifest_memory_transform,
    to_explorer_manifest,
)

CITY = {"name": "Wolfsburg", "origin_lat": 52.4227, "origin_lon": 10.7865}


def rec(record_id: str, **over) -> dict:
    base = {
        "id": record_id,
        "status": "approved",
        "source_image": f"{record_id}.jpg",
        "thumbnail_url": f"{record_id}.jpg",
        "splat_url": f"{record_id}.sog",
        "transform": {"position": [1, 0, 2], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1]},
        "created_at": "2026-06-03T00:00:00.000Z",
    }
    base.update(over)
    return base


def seed(record_id: str) -> dict:
    return {
        "id": record_id,
        "status": "approved",
        "thumbnail_url": f"{record_id}.jpg",
        "splat_url": f"{record_id}.sog",
        "transform": {"position": [0, 0, 0], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1]},
    }


def roundtrip(manifest):
    """JSON round-trip then strict-parse, proving the output is renderable."""
    return parse_manifest(copy.deepcopy(manifest))


class TestToExplorerManifest:
    def test_includes_city(self):
        assert to_explorer_manifest({"records": []}, CITY)["city"] == CITY

    def test_only_approved(self):
        store = {
            "records": [
                rec("a", status="approved"),
                rec("b", status="ready"),
                rec("c", status="uploaded", splat_url=""),
                rec("d", status="processing", splat_url=""),
            ]
        }
        assert [m["id"] for m in to_explorer_manifest(store, CITY)["memories"]] == ["a"]

    def test_drops_source_image(self):
        store = {"records": [rec("a")]}
        assert "source_image" not in to_explorer_manifest(store, CITY)["memories"][0]

    def test_output_parses(self):
        store = {"records": [rec("a"), rec("b", status="uploaded")]}
        assert [m["id"] for m in roundtrip(to_explorer_manifest(store, CITY))["memories"]] == ["a"]


class TestMergeManifest:
    def test_preserves_external_seeds(self):
        existing = [seed("mem-01"), seed("mem-02")]
        ids = [m["id"] for m in merge_manifest(existing, {"records": []}, CITY)["memories"]]
        assert ids == ["mem-01", "mem-02"]

    def test_appends_approved_after_external(self):
        existing = [seed("mem-01")]
        store = {"records": [rec("up-1", status="approved")]}
        assert [m["id"] for m in merge_manifest(existing, store, CITY)["memories"]] == ["mem-01", "up-1"]

    def test_replaces_store_managed_id(self):
        existing = [seed("up-1"), seed("mem-01")]
        store = {"records": [rec("up-1", status="approved", splat_url="up-1.sog")]}
        out = merge_manifest(existing, store, CITY)["memories"]
        assert len([m for m in out if m["id"] == "up-1"]) == 1
        assert [m["id"] for m in out] == ["mem-01", "up-1"]

    def test_drops_unapproved_store_id(self):
        existing = [seed("up-1")]
        store = {"records": [rec("up-1", status="processing", splat_url="")]}
        assert [m["id"] for m in merge_manifest(existing, store, CITY)["memories"]] == []

    def test_output_parses(self):
        merged = merge_manifest([seed("mem-01")], {"records": [rec("up-1")]}, CITY)
        assert [m["id"] for m in roundtrip(merged)["memories"]] == ["mem-01", "up-1"]


NEW = {"position": [9, 8, 7], "quaternion": [0, 0, 0, 1], "scale": 2}


def manifest():
    return {
        "city": {"name": "Wolfsburg", "origin_lat": 52.4, "origin_lon": 10.7},
        "memories": [
            {"id": "mem-01", "status": "approved", "splat_url": "mem-01.sog", "transform": {"position": [0, 0, 0], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1]}, "heading_deg": 0},
            {"id": "mem-02", "status": "approved", "splat_url": "mem-02.sog", "transform": {"position": [30, 0, 0], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1]}},
        ],
    }


class TestPatchManifestMemoryTransform:
    def test_replaces_and_reports_found(self):
        out = patch_manifest_memory_transform(manifest(), "mem-02", NEW)
        assert out["found"] is True
        mem = next(m for m in out["manifest"]["memories"] if m["id"] == "mem-02")
        assert mem["transform"] == NEW

    def test_leaves_others_untouched(self):
        out = patch_manifest_memory_transform(manifest(), "mem-02", NEW)["manifest"]
        assert out["memories"][0]["transform"]["position"] == [0, 0, 0]
        assert out["memories"][0]["heading_deg"] == 0
        assert out["city"]["name"] == "Wolfsburg"

    def test_unknown_id_not_found(self):
        out = patch_manifest_memory_transform(manifest(), "nope", NEW)
        assert out["found"] is False
        scales = [m["transform"]["scale"] for m in out["manifest"]["memories"]]
        assert scales == [[1, 1, 1], [1, 1, 1]]

    def test_tolerates_no_memories_array(self):
        assert patch_manifest_memory_transform({"city": {}}, "mem-01", NEW)["found"] is False


class TestParseManifest:
    def test_raises_on_non_object(self):
        with pytest.raises(ValueError):
            parse_manifest([])

    def test_raises_on_bad_transform(self):
        bad = {"city": CITY, "memories": [{"id": "a", "status": "approved", "thumbnail_url": "", "splat_url": "a.sog", "transform": {"position": [0, 0], "quaternion": [0, 0, 0, 1], "scale": 1}}]}
        with pytest.raises(ValueError):
            parse_manifest(bad)

    def test_filters_non_renderable(self):
        m = {"city": CITY, "memories": [
            {"id": "a", "status": "approved", "thumbnail_url": "", "splat_url": "a.sog", "transform": {"position": [0, 0, 0], "quaternion": [0, 0, 0, 1], "scale": 1}},
            {"id": "b", "status": "uploaded", "thumbnail_url": "", "splat_url": "", "transform": {"position": [0, 0, 0], "quaternion": [0, 0, 0, 1], "scale": 1}},
        ]}
        assert [x["id"] for x in parse_manifest(m)["memories"]] == ["a"]
