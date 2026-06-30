from backend.exifdata import validate_captured_at


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
