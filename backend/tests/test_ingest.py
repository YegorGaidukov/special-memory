from backend.ingest import expected_assets, resolve_ingest


def test_expected_assets():
    assert expected_assets("photo_42") == {
        "splat": "photo_42.sog",
        "preview": "photo_42.preview.ply",
        "thumbnail": "photo_42.jpg",
    }


def test_ready_with_splat_and_thumb():
    present = {"photo_42.sog", "photo_42.preview.ply", "photo_42.jpg"}
    assert resolve_ingest("photo_42", present) == {
        "ok": True,
        "patch": {"status": "ready", "splat_url": "photo_42.sog", "thumbnail_url": "photo_42.jpg"},
    }


def test_fails_without_splat():
    assert resolve_ingest("photo_42", {"photo_42.jpg"}) == {
        "ok": False,
        "reason": "splat photo_42.sog not found in public/memories",
    }


def test_readies_without_thumbnail():
    out = resolve_ingest("photo_42", {"photo_42.sog"})
    assert out["ok"] is True
    assert out["patch"]["thumbnail_url"] == ""
