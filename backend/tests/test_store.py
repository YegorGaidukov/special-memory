import json

from backend.store import (
    add_record,
    empty_store,
    find_by_id,
    load_store,
    save_store,
    update_record,
)


def rec(record_id: str) -> dict:
    return {
        "id": record_id,
        "status": "uploaded",
        "source_image": f"{record_id}.jpg",
        "thumbnail_url": "",
        "splat_url": "",
        "transform": {"position": [0, 0, 0], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1]},
        "created_at": "2026-06-03T00:00:00.000Z",
    }


class TestStoreOps:
    def test_empty_store(self):
        assert empty_store()["records"] == []

    def test_add_record_immutable(self):
        s0 = empty_store()
        s1 = add_record(s0, rec("a"))
        assert len(s1["records"]) == 1
        assert len(s0["records"]) == 0

    def test_find_by_id(self):
        s = add_record(empty_store(), rec("a"))
        assert find_by_id(s, "a")["id"] == "a"
        assert find_by_id(s, "missing") is None

    def test_update_record(self):
        s = add_record(empty_store(), rec("a"))
        s2 = update_record(s, "a", {"status": "ready", "splat_url": "a.sog"})
        assert find_by_id(s2, "a")["status"] == "ready"
        assert find_by_id(s2, "a")["splat_url"] == "a.sog"

    def test_update_unknown_is_noop(self):
        s = add_record(empty_store(), rec("a"))
        assert update_record(s, "missing", {"status": "failed"}) == s

    def test_update_does_not_mutate_input(self):
        s = add_record(empty_store(), rec("a"))
        update_record(s, "a", {"status": "approved"})
        assert find_by_id(s, "a")["status"] == "uploaded"

    def test_update_can_mark_failed_with_error(self):
        s = add_record(empty_store(), rec("a"))
        s2 = update_record(s, "a", {"status": "failed", "error": "sharp exploded"})
        assert find_by_id(s2, "a")["status"] == "failed"
        assert find_by_id(s2, "a")["error"] == "sharp exploded"


class TestStoreFs:
    def test_load_missing_returns_empty(self, tmp_path):
        assert load_store(tmp_path / "nope.json") == empty_store()

    def test_save_then_load_round_trips(self, tmp_path):
        path = tmp_path / "data" / "memories.json"
        store = add_record(empty_store(), rec("a"))
        save_store(store, path)
        assert json.loads(path.read_text())["records"][0]["id"] == "a"
        assert load_store(path) == store
