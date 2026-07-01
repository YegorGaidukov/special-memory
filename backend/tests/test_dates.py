from backend.exifdata import resolve_captured_at, validate_captured_at


def test_date_only_to_midnight_utc():
    assert validate_captured_at("2026-06-15") == "2026-06-15T00:00:00.000Z"


def test_full_iso_normalised_to_z():
    assert validate_captured_at("2026-06-02T21:59:01Z") == "2026-06-02T21:59:01.000Z"
    assert validate_captured_at("2026-06-02T21:59:01+00:00") == "2026-06-02T21:59:01.000Z"


def test_rejects_empty_and_garbage():
    assert validate_captured_at("") is None
    assert validate_captured_at("   ") is None
    assert validate_captured_at("not a date") is None
    assert validate_captured_at("2026-13-40") is None
    assert validate_captured_at(None) is None
    assert validate_captured_at(12345) is None


def test_resolve_manual_wins_over_exif():
    # The phone prefills the field from EXIF and lets the user edit — the submitted
    # date is authoritative.
    assert (
        resolve_captured_at("2026-04-27T12:00:00.000Z", "2026-05-01")
        == "2026-05-01T00:00:00.000Z"
    )


def test_resolve_falls_back_to_exif():
    # Desktop drag-drop sends no date field.
    assert resolve_captured_at("2026-04-27T12:00:00.000Z", None) == "2026-04-27T12:00:00.000Z"
    assert resolve_captured_at("2026-04-27T12:00:00.000Z", "garbage") == "2026-04-27T12:00:00.000Z"


def test_resolve_none_when_neither():
    assert resolve_captured_at(None, None) is None
