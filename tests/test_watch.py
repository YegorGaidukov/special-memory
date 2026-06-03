from pipeline.watch import select_pending


def test_select_pending_filters_ready_and_in_flight():
    assert select_pending({"a", "b", "c"}, {"a"}, {"b"}) == ["c"]


def test_select_pending_empty_when_all_ready():
    assert select_pending({"a"}, {"a"}, set()) == []


def test_select_pending_empty_inbox():
    assert select_pending(set(), set(), set()) == []
