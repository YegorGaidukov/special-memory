from backend.placement import placement_transform

ORIGIN = {"lat": 52.4227, "lon": 10.7865}


def test_uses_exif_gps_when_present():
    t = placement_transform(geo=ORIGIN, origin=ORIGIN, standoff=10)
    assert t["position"] == [0, 0, 0]
    assert t["quaternion"] == [0, 0, 0, 1]
    assert t["scale"] == [1, 1, 1]


def test_drops_in_front_of_camera_without_gps():
    t = placement_transform(
        camera_position=[0, 5, 0], camera_forward=[0, 0, -2], origin=ORIGIN, standoff=10
    )
    assert abs(t["position"][0]) < 1e-6
    assert abs(t["position"][1] - 5) < 1e-6
    assert abs(t["position"][2] + 10) < 1e-6
    assert t["quaternion"] == [0, 0, 0, 1]


def test_falls_back_to_origin():
    t = placement_transform(origin=ORIGIN, standoff=10)
    assert t["position"] == [0, 0, 0]


def test_normalises_diagonal_forward():
    t = placement_transform(
        camera_position=[1, 2, 3], camera_forward=[1, 2, -2], origin=ORIGIN, standoff=12
    )
    assert abs(t["position"][0] - 5) < 1e-6
    assert abs(t["position"][1] - 10) < 1e-6
    assert abs(t["position"][2] + 5) < 1e-6
    assert t["scale"] == [1, 1, 1]


def test_ignores_non_finite_geo():
    t = placement_transform(
        geo={"lat": float("nan"), "lon": 0},
        camera_position=[0, 0, 0],
        camera_forward=[0, 0, -1],
        origin=ORIGIN,
        standoff=10,
    )
    assert t["position"] == [0, 0, -10]
