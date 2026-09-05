import json
import os
import tempfile
import unittest
from unittest.mock import patch

from src.scripts.conversion import classify_error, clean_title, write_environment_cookies


class ConversionTests(unittest.TestCase):
    def test_clean_title_removes_unsafe_filename_characters(self):
        self.assertEqual(clean_title('  Artist / Song: "Live"  '), "Artist Song Live")

    def test_clean_title_uses_fallback_for_empty_titles(self):
        self.assertEqual(clean_title(" <> "), "audio")

    def test_classifies_common_youtube_failures(self):
        cases = {
            "This video is unavailable": "VIDEO_UNAVAILABLE",
            "Sign in to confirm you're not a bot": "YOUTUBE_AUTH_REQUIRED",
            "HTTP Error 429: Too Many Requests": "YOUTUBE_RATE_LIMITED",
            "ffmpeg not found": "FFMPEG_UNAVAILABLE",
            "Unable to download API page": "YOUTUBE_NETWORK_ERROR",
        }
        for detail, expected_code in cases.items():
            with self.subTest(detail=detail):
                code, _, _ = classify_error(RuntimeError(detail))
                self.assertEqual(code, expected_code)

    def test_environment_cookies_are_written_in_netscape_format(self):
        cookies = [{
            "domain": ".youtube.com",
            "path": "/",
            "secure": True,
            "expirationDate": 2_000_000_000,
            "name": "session",
            "value": "secret",
        }]
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"MY_COOKIES": json.dumps(cookies)}):
                cookie_path = write_environment_cookies(temp_dir)

            self.assertIsNotNone(cookie_path)
            with open(cookie_path, encoding="utf-8") as cookie_file:
                contents = cookie_file.read()
            self.assertTrue(contents.startswith("# Netscape HTTP Cookie File\n"))
            self.assertIn(".youtube.com\tTRUE\t/\tTRUE\t2000000000", contents)

    def test_invalid_environment_cookies_fail_with_context(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"MY_COOKIES": "not-json"}):
                with self.assertRaisesRegex(ValueError, "MY_COOKIES is invalid"):
                    write_environment_cookies(temp_dir)


if __name__ == "__main__":
    unittest.main()
