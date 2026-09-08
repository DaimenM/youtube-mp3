import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from src.scripts.edit_playlist import edit_playlist


class PlaylistEditTests(unittest.TestCase):
    def test_shared_metadata_and_individual_titles_are_applied(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            archive_path = Path(temp_dir) / "playlist.zip"
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED) as archive:
                archive.writestr("First.mp3", b"first")
                archive.writestr("Second.mp3", b"second")

            metadata = {
                "artistName": "Shared Artist",
                "albumName": "Shared Album",
                "coverArt": None,
                "tracks": [
                    {"id": "one", "title": "Renamed One"},
                    {"id": "two", "title": "Renamed Two"},
                ],
            }
            with patch("src.scripts.edit_playlist.edit_mp3", return_value=True) as editor:
                edit_playlist(str(archive_path), metadata)

            self.assertEqual(editor.call_count, 2)
            self.assertEqual(editor.call_args_list[0].args[1]["fileName"], "Renamed One")
            self.assertEqual(editor.call_args_list[1].args[1]["fileName"], "Renamed Two")
            for call in editor.call_args_list:
                self.assertEqual(call.args[1]["artistName"], "Shared Artist")
                self.assertEqual(call.args[1]["albumName"], "Shared Album")

            with zipfile.ZipFile(archive_path) as archive:
                self.assertEqual(archive.namelist(), [
                    "Renamed One.mp3",
                    "Renamed Two.mp3",
                ])

    def test_duplicate_titles_use_track_ids_instead_of_number_prefixes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            archive_path = Path(temp_dir) / "playlist.zip"
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED) as archive:
                archive.writestr("First.mp3", b"first")
                archive.writestr("Second.mp3", b"second")

            metadata = {
                "tracks": [
                    {"id": "video-one", "title": "Same title"},
                    {"id": "video-two", "title": "Same title"},
                ],
            }
            with patch("src.scripts.edit_playlist.edit_mp3", return_value=True):
                edit_playlist(str(archive_path), metadata)

            with zipfile.ZipFile(archive_path) as archive:
                self.assertEqual(archive.namelist(), [
                    "Same title.mp3",
                    "Same title [video-two].mp3",
                ])

    def test_rejects_archive_paths_outside_the_playlist_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            archive_path = Path(temp_dir) / "playlist.zip"
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED) as archive:
                archive.writestr("../escape.mp3", b"unsafe")

            with self.assertRaisesRegex(ValueError, "unsafe path"):
                edit_playlist(str(archive_path), {"tracks": [{"id": "one", "title": "One"}]})


if __name__ == "__main__":
    unittest.main()
