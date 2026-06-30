from backend.assets import asset_content_type, safe_asset_name


class TestSafeAssetName:
    def test_accepts_plain_filenames(self):
        assert safe_asset_name("mem-09-ee62c63c.sog") == "mem-09-ee62c63c.sog"
        assert safe_asset_name("mem-09.preview.ply") == "mem-09.preview.ply"
        assert safe_asset_name("manifest.json") == "manifest.json"

    def test_rejects_separators(self):
        assert safe_asset_name("sub/a.sog") is None
        assert safe_asset_name("sub\\a.sog") is None

    def test_rejects_traversal(self):
        assert safe_asset_name("..") is None
        assert safe_asset_name("../secret") is None
        assert safe_asset_name("a/../../etc/passwd") is None

    def test_rejects_empty_dot_and_nul(self):
        assert safe_asset_name("") is None
        assert safe_asset_name(".") is None
        assert safe_asset_name("a\0.sog") is None


class TestAssetContentType:
    def test_known_extensions(self):
        assert asset_content_type("a.sog") == "application/octet-stream"
        assert asset_content_type("a.preview.ply") == "application/octet-stream"
        assert asset_content_type("manifest.json") == "application/json; charset=utf-8"
        assert asset_content_type("a.jpg") == "image/jpeg"
        assert asset_content_type("a.JPEG") == "image/jpeg"
        assert asset_content_type("a.png") == "image/png"

    def test_unknown_falls_back(self):
        assert asset_content_type("a.unknown") == "application/octet-stream"
        assert asset_content_type("noext") == "application/octet-stream"
