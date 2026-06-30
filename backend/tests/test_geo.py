import math

from backend.geo import (
    geo_to_transform,
    heading_to_quaternion,
    project_to_local,
    quaternion_to_heading_deg,
)

ORIGIN = {"lat": 52.4227, "lon": 10.7865}


class TestProjectToLocal:
    def test_maps_origin_to_world_origin(self):
        assert project_to_local(ORIGIN, ORIGIN) == [0, 0, 0]

    def test_keeps_on_ground_plane(self):
        assert project_to_local({"lat": 52.43, "lon": 10.79}, ORIGIN)[1] == 0

    def test_east_of_origin_is_positive_x(self):
        x, _, _ = project_to_local({"lat": ORIGIN["lat"], "lon": ORIGIN["lon"] + 0.01}, ORIGIN)
        assert x > 0

    def test_north_of_origin_is_negative_z(self):
        _, _, z = project_to_local({"lat": ORIGIN["lat"] + 0.01, "lon": ORIGIN["lon"]}, ORIGIN)
        assert z < 0

    def test_metres_per_degree_latitude(self):
        _, _, z = project_to_local({"lat": ORIGIN["lat"] + 1, "lon": ORIGIN["lon"]}, ORIGIN)
        assert round(-z) == 111320

    def test_longitude_shrinks_by_cos_latitude(self):
        x, _, _ = project_to_local({"lat": ORIGIN["lat"], "lon": ORIGIN["lon"] + 1}, ORIGIN)
        expected = 111320 * math.cos(math.radians(ORIGIN["lat"]))
        assert abs(x - expected) < 1


class TestHeadingToQuaternion:
    def test_heading_0_is_identity(self):
        assert heading_to_quaternion(0) == [0, 0, 0, 1]

    def test_matches_seed_for_45(self):
        x, y, z, w = heading_to_quaternion(45)
        assert abs(x) < 1e-9
        assert abs(y - 0.38268343) < 1e-6
        assert abs(z) < 1e-9
        assert abs(w - 0.92387953) < 1e-6

    def test_matches_seed_for_90(self):
        _, y, _, w = heading_to_quaternion(90)
        assert abs(y - 0.70710678) < 1e-6
        assert abs(w - 0.70710678) < 1e-6

    def test_is_unit_quaternion(self):
        q = heading_to_quaternion(123)
        assert abs(math.hypot(*q) - 1) < 1e-6

    def test_only_rotates_about_y(self):
        x, _, z, _ = heading_to_quaternion(-45)
        assert x == 0
        assert z == 0


class TestQuaternionToHeadingDeg:
    def test_identity_is_heading_0(self):
        assert abs(quaternion_to_heading_deg([0, 0, 0, 1])) < 1e-6

    def test_round_trips(self):
        for deg in (0, 45, 90, 123, 180, 270, 359):
            assert abs(quaternion_to_heading_deg(heading_to_quaternion(deg)) - deg) < 1e-4

    def test_normalises_into_0_360(self):
        h = quaternion_to_heading_deg(heading_to_quaternion(-45))
        assert 0 <= h < 360
        assert abs(h - 315) < 1e-4


class TestGeoToTransform:
    def test_origin_heading_zero(self):
        t = geo_to_transform(ORIGIN, ORIGIN, 0, 1)
        assert t["position"] == [0, 0, 0]
        assert t["quaternion"] == [0, 0, 0, 1]
        assert t["scale"] == [1, 1, 1]
