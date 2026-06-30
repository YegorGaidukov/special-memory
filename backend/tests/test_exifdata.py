from datetime import datetime, timezone

from backend.exifdata import extract_placement


class TestExtractPlacement:
    def test_pulls_decimal_lat_lon(self):
        p = extract_placement({"latitude": 52.42, "longitude": 10.78})
        assert p["geo"] == {"lat": 52.42, "lon": 10.78}

    def test_no_geo_when_gps_absent(self):
        assert "geo" not in extract_placement({"Make": "Apple"})

    def test_no_geo_when_one_coordinate(self):
        assert "geo" not in extract_placement({"latitude": 52.42})

    def test_ignores_non_finite(self):
        assert "geo" not in extract_placement({"latitude": float("nan"), "longitude": 10})

    def test_formats_capture_time_iso_z(self):
        when = datetime(2026, 6, 2, 21, 59, 1, tzinfo=timezone.utc)
        assert extract_placement({"DateTimeOriginal": when})["captured_at"] == "2026-06-02T21:59:01.000Z"

    def test_naive_datetime_treated_as_utc(self):
        when = datetime(2026, 6, 2, 21, 59, 1)
        assert extract_placement({"DateTimeOriginal": when})["captured_at"] == "2026-06-02T21:59:01.000Z"

    def test_no_capture_when_missing_or_invalid(self):
        assert "captured_at" not in extract_placement({})
        assert "captured_at" not in extract_placement({"DateTimeOriginal": "not a date"})

    def test_empty_for_null_garbage(self):
        assert extract_placement(None) == {}
        assert extract_placement(42) == {}
