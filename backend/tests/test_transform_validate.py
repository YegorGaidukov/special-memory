from backend.transform_validate import is_valid_transform

GOOD = {"position": [1, 2, 3], "quaternion": [0, 0, 0, 1], "scale": 1.5}


def test_accepts_valid():
    assert is_valid_transform(GOOD) is True


def test_rejects_non_object():
    assert is_valid_transform(None) is False
    assert is_valid_transform([1, 2, 3]) is False


def test_rejects_wrong_length_arrays():
    assert is_valid_transform({**GOOD, "position": [1, 2]}) is False
    assert is_valid_transform({**GOOD, "quaternion": [0, 0, 1]}) is False


def test_rejects_non_positive_scale():
    assert is_valid_transform({**GOOD, "scale": 0}) is False
    assert is_valid_transform({**GOOD, "scale": -1}) is False


def test_rejects_non_finite():
    assert is_valid_transform({**GOOD, "position": [float("nan"), 0, 0]}) is False
    assert is_valid_transform({**GOOD, "scale": float("inf")}) is False


def test_rejects_array_scale():
    # The gizmo writes a uniform scalar scale; an array is rejected here.
    assert is_valid_transform({**GOOD, "scale": [1, 1, 1]}) is False
