import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

try:
    from .edit_mp3 import edit_mp3
except ImportError:
    from edit_mp3 import edit_mp3


def edit_playlist(zip_path, metadata):
    with tempfile.TemporaryDirectory(prefix="youtube-playlist-edit-") as temp_dir:
        source_dir = Path(temp_dir) / "source"
        source_dir.mkdir()

        with zipfile.ZipFile(zip_path, "r") as archive:
            members = [member for member in archive.infolist() if not member.is_dir()]
            if any(Path(member.filename).name != member.filename for member in members):
                raise ValueError("Playlist archive contains an unsafe path")
            if any(not member.filename.lower().endswith(".mp3") for member in members):
                raise ValueError("Playlist archive contains a non-MP3 file")
            if any(member.compress_type != zipfile.ZIP_STORED for member in members):
                raise ValueError("Playlist archive uses an unsupported compression method")
            if sum(member.file_size for member in members) > 200 * 1024 * 1024:
                raise ValueError("Playlist archive expands beyond the 200 MB limit")
            archive.extractall(source_dir)

        # ZIP member order matches the playlist metadata order returned by conversion.py.
        files = [source_dir / member.filename for member in members]
        tracks = metadata.get("tracks") or []
        if not files or len(files) != len(tracks):
            raise ValueError("Playlist track metadata does not match the archive")

        edited_files = []
        used_names = set()
        for index, (source_file, track) in enumerate(zip(files, tracks), start=1):
            title = track.get("title") if isinstance(track, dict) else None
            if not title:
                raise ValueError(f"Song name {index} is missing")
            track_metadata = {
                "fileName": title,
                "artistName": metadata.get("artistName"),
                "albumName": metadata.get("albumName"),
                "coverArt": metadata.get("coverArt"),
            }
            if not edit_mp3(str(source_file), track_metadata):
                raise ValueError(f"Failed to edit track {index}")
            archive_name = f"{title}.mp3"
            if archive_name.casefold() in used_names:
                track_id = track.get("id") or source_file.stem
                archive_name = f"{title} [{track_id}].mp3"
            used_names.add(archive_name.casefold())
            edited_files.append((source_file, archive_name))

        replacement_path = Path(temp_dir) / "edited.zip"
        with zipfile.ZipFile(replacement_path, "w", compression=zipfile.ZIP_STORED) as archive:
            for source_file, archive_name in edited_files:
                archive.write(source_file, archive_name)
        shutil.copyfile(replacement_path, zip_path)


def main():
    if len(sys.argv) != 3:
        print("Usage: python3 edit_playlist.py <zip_path> <metadata_json>", file=sys.stderr)
        return 2
    try:
        edit_playlist(sys.argv[1], json.loads(sys.argv[2]))
        return 0
    except Exception as error:
        print(f"Playlist edit error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
