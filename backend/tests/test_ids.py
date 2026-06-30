import re

from backend.ids import ext_of, make_record_id


class TestExtOf:
    def test_lowercased_known_extensions(self):
        assert ext_of("Photo.JPG") == ".jpg"
        assert ext_of("a.jpeg") == ".jpeg"
        assert ext_of("b.PNG") == ".png"

    def test_defaults_to_jpg(self):
        assert ext_of("noext") == ".jpg"
        assert ext_of("weird.gif") == ".jpg"


class TestMakeRecordId:
    def test_safe_id_from_stem_plus_suffix(self):
        assert re.match(r"^IMG_1234-[a-f0-9]{8}$", make_record_id("IMG_1234.jpg"))

    def test_replaces_unsafe_characters(self):
        assert re.match(r"^my_photo__1__-[a-f0-9]{8}$", make_record_id("my photo (1)!.png"))

    def test_unique_each_call(self):
        assert make_record_id("x.jpg") != make_record_id("x.jpg")

    def test_falls_back_to_memory(self):
        assert re.match(r"^memory-[a-f0-9]{8}$", make_record_id(".jpg"))
