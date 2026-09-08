import json
import os
import re
import sys
import tempfile
import unicodedata
import zipfile
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL


EVENT_PREFIX = "YTMP3_EVENT:"


def emit_event(event: str, **payload: Any) -> None:
    message = {"event": event, **payload}
    print(f"{EVENT_PREFIX}{json.dumps(message, ensure_ascii=True)}", file=sys.stderr, flush=True)


def clean_title(title: str) -> str:
    """Return a portable, bounded filename without its extension."""
    normalized = unicodedata.normalize("NFKC", title)
    normalized = re.sub(r'[\\/*?:"<>|\x00-\x1f]', "", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .")
    return normalized[:100] or "audio"


def safe_detail(error: Exception) -> str:
    detail = str(error).replace(os.getcwd(), "<project>")
    detail = re.sub(r"(?i)(cookie|token|authorization)=?[^\s,;]+", r"\1=<redacted>", detail)
    return detail[:700]


def classify_error(error: Exception) -> tuple[str, str, str]:
    detail = safe_detail(error)
    lower = detail.lower()

    if "playlist contains" in lower and "limit is" in lower:
        return (
            "PLAYLIST_TOO_LARGE",
            "This playlist contains more tracks than the server allows in one conversion.",
            "Use a shorter playlist or increase MAX_PLAYLIST_TRACKS for this deployment.",
        )
    if "my_cookies is invalid" in lower:
        return (
            "COOKIE_CONFIGURATION_INVALID",
            "The configured YouTube cookies could not be loaded.",
            "Set MY_COOKIES to a valid JSON array of browser-cookie objects, or remove it.",
        )
    if "javascript runtime" in lower or "challenge solver" in lower:
        return (
            "JAVASCRIPT_RUNTIME_UNAVAILABLE",
            "yt-dlp could not run YouTube's JavaScript challenge solver.",
            "Use Node.js 22+ and install the yt-dlp default dependency group.",
        )
    if "ffmpeg" in lower and ("not found" in lower or "not installed" in lower):
        return (
            "FFMPEG_UNAVAILABLE",
            "FFmpeg is not available to create the MP3.",
            "Install FFmpeg and make sure it is available on PATH.",
        )
    if "sign in to confirm" in lower or "not a bot" in lower or "cookies" in lower and "required" in lower:
        return (
            "YOUTUBE_AUTH_REQUIRED",
            "YouTube requires a valid authenticated session for this video.",
            "Refresh MY_COOKIES or cookies.txt and try again.",
        )
    if "private video" in lower or "members-only" in lower or "members only" in lower:
        return (
            "VIDEO_PRIVATE",
            "This video is private or restricted to channel members.",
            "Use an account that can access the video, or choose a public video.",
        )
    if "age-restricted" in lower or "confirm your age" in lower:
        return (
            "VIDEO_AGE_RESTRICTED",
            "This video is age-restricted.",
            "Provide fresh cookies from an account permitted to view it.",
        )
    if "video is unavailable" in lower or "this content isn't available" in lower:
        return (
            "VIDEO_UNAVAILABLE",
            "YouTube reports that this video is unavailable.",
            "Check that the link is public and available in the server's region.",
        )
    if "copyright" in lower or "removed" in lower:
        return (
            "VIDEO_REMOVED",
            "The video appears to have been removed or blocked.",
            "Choose a video that is currently available on YouTube.",
        )
    if "429" in lower or "too many requests" in lower:
        return (
            "YOUTUBE_RATE_LIMITED",
            "YouTube temporarily rate-limited the converter.",
            "Wait a few minutes before trying again.",
        )
    if any(term in lower for term in ("timed out", "unable to download", "failed to resolve", "network is unreachable")):
        return (
            "YOUTUBE_NETWORK_ERROR",
            "The server could not reliably reach YouTube.",
            "Try again shortly. If the problem continues, check the server's network and DNS configuration.",
        )
    if "requested format is not available" in lower or "no video formats found" in lower:
        return (
            "AUDIO_FORMAT_UNAVAILABLE",
            "YouTube did not provide a usable audio stream for this video.",
            "Update yt-dlp and its JavaScript support, then try again.",
        )

    return (
        "CONVERSION_FAILED",
        "The video could not be converted.",
        "Check the diagnostic detail and server logs, then try another public video.",
    )


def validate_cookie_field(value: Any) -> str:
    text = str(value)
    if "\t" in text or "\r" in text or "\n" in text:
        raise ValueError("Cookie data contains invalid control characters")
    return text


def write_environment_cookies(temp_dir: str) -> str | None:
    raw_cookies = os.getenv("MY_COOKIES")
    if not raw_cookies:
        return None

    try:
        cookies = json.loads(raw_cookies)
        if not isinstance(cookies, list):
            raise ValueError("MY_COOKIES must contain a JSON array")

        cookie_path = Path(temp_dir) / "cookies.txt"
        with cookie_path.open("x", encoding="utf-8", newline="\n") as cookie_file:
            cookie_file.write("# Netscape HTTP Cookie File\n")
            for cookie in cookies:
                if not isinstance(cookie, dict) or not cookie.get("name"):
                    continue
                domain = validate_cookie_field(cookie.get("domain", ".youtube.com"))
                include_subdomains = "TRUE" if domain.startswith(".") else "FALSE"
                cookie_path_value = validate_cookie_field(cookie.get("path", "/"))
                secure = "TRUE" if cookie.get("secure", False) else "FALSE"
                expires = int(cookie.get("expirationDate") or cookie.get("expiry") or 0)
                name = validate_cookie_field(cookie["name"])
                value = validate_cookie_field(cookie.get("value", ""))
                cookie_file.write(
                    f"{domain}\t{include_subdomains}\t{cookie_path_value}\t"
                    f"{secure}\t{expires}\t{name}\t{value}\n"
                )
        cookie_path.chmod(0o600)
        emit_event("configuration", cookieSource="environment", cookieCount=len(cookies))
        return str(cookie_path)
    except (json.JSONDecodeError, TypeError, ValueError, OSError) as error:
        raise ValueError(f"MY_COOKIES is invalid: {safe_detail(error)}") from error


def resolve_cookie_file(temp_dir: str) -> str | None:
    environment_cookie_file = write_environment_cookies(temp_dir)
    if environment_cookie_file:
        return environment_cookie_file

    local_cookie_file = Path.cwd() / "cookies.txt"
    if local_cookie_file.is_file():
        emit_event("configuration", cookieSource="file")
        return str(local_cookie_file)

    emit_event("configuration", cookieSource="none")
    return None


class ConversionLogger:
    def debug(self, message: str) -> None:
        return

    def warning(self, message: str) -> None:
        emit_event("warning", detail=message[:500])

    def error(self, message: str) -> None:
        emit_event("extractor_error", detail=message[:700])


def convert_to_mp3(url: str) -> bool:
    emit_event("stage", stage="initializing", message="Preparing the conversion environment.")

    with tempfile.TemporaryDirectory(prefix="youtube-mp3-") as temp_dir:
        try:
            cookie_file = resolve_cookie_file(temp_dir)
            output_template = os.path.join(temp_dir, "%(id)s.%(ext)s")
            node_path = os.getenv("YTDLP_NODE_PATH")
            js_runtimes = {"node": {"path": node_path}} if node_path else {"node": {}}

            base_options = {
                "quiet": True,
                "no_warnings": False,
                "socket_timeout": 30,
                "retries": 5,
                "extractor_retries": 3,
                "cachedir": False,
                "js_runtimes": js_runtimes,
                "logger": ConversionLogger(),
            }
            if cookie_file:
                base_options["cookiefile"] = cookie_file

            emit_event("stage", stage="inspecting", message="Reading video or playlist details.")
            with YoutubeDL({**base_options, "extract_flat": "in_playlist", "skip_download": True}) as inspector:
                inspected_info = inspector.extract_info(url, download=False)

            inspected_entries_value = inspected_info.get("entries") if isinstance(inspected_info, dict) else None
            is_playlist = inspected_entries_value is not None
            inspected_entries = list(inspected_entries_value) if is_playlist else []
            max_playlist_tracks = max(1, int(os.getenv("MAX_PLAYLIST_TRACKS", "50")))
            if is_playlist and len(inspected_entries) > max_playlist_tracks:
                raise ValueError(
                    f"Playlist contains {len(inspected_entries)} tracks; the configured limit is {max_playlist_tracks}."
                )

            options = {
                **base_options,
                "format": "bestaudio/best",
                "fragment_retries": 5,
                "concurrent_fragment_downloads": 4,
                "outtmpl": output_template,
                "noplaylist": not is_playlist,
                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }
                ],
            }
            track_count = len(inspected_entries) if is_playlist else 1
            emit_event(
                "stage",
                stage="downloading",
                message=f"Downloading {track_count} audio track{'s' if track_count != 1 else ''}.",
                trackCount=track_count,
            )
            with YoutubeDL(options) as downloader:
                info = downloader.extract_info(url, download=True)

            raw_entries = info.get("entries") if is_playlist else [info]
            entries = [entry for entry in raw_entries if isinstance(entry, dict)]
            tracks = []
            for index, entry in enumerate(entries, start=1):
                video_id = entry.get("id")
                if not video_id:
                    raise ValueError(f"Track {index} did not provide a video ID")
                mp3_path = os.path.join(temp_dir, f"{video_id}.mp3")
                if not os.path.isfile(mp3_path):
                    raise FileNotFoundError(f"FFmpeg did not produce MP3 output for track {index}")
                tracks.append({
                    "id": str(video_id),
                    "title": clean_title(entry.get("title") or f"Track {index}"),
                    "path": mp3_path,
                })

            if not tracks:
                raise ValueError("No downloadable tracks were found")

            playlist_title = clean_title(info.get("title") or "YouTube playlist")
            if is_playlist:
                output_path = os.path.join(temp_dir, "playlist.zip")
                with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_STORED) as archive:
                    used_names = set()
                    for track in tracks:
                        archive_name = f"{track['title']}.mp3"
                        if archive_name.casefold() in used_names:
                            archive_name = f"{track['title']} [{track['id']}].mp3"
                        used_names.add(archive_name.casefold())
                        archive.write(track["path"], archive_name)
                result_title = playlist_title
                media_type = "playlist"
                output_tracks = [{"id": track["id"], "title": track["title"]} for track in tracks]
            else:
                output_path = tracks[0]["path"]
                result_title = tracks[0]["title"]
                media_type = "track"
                output_tracks = [{"id": tracks[0]["id"], "title": tracks[0]["title"]}]

            file_size = os.path.getsize(output_path)
            emit_event(
                "result",
                title=result_title,
                mediaType=media_type,
                tracks=output_tracks,
                fileSize=file_size,
                message=f"Converted {len(tracks)} track{'s' if len(tracks) != 1 else ''} successfully.",
            )

            with open(output_path, "rb") as audio_file:
                while chunk := audio_file.read(1024 * 1024):
                    sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
            return True
        except Exception as error:
            code, message, suggestion = classify_error(error)
            emit_event(
                "error",
                code=code,
                stage="youtube_or_ffmpeg",
                message=message,
                detail=safe_detail(error),
                suggestion=suggestion,
            )
            return False


def main() -> int:
    if len(sys.argv) != 2:
        emit_event(
            "error",
            code="INVALID_ARGUMENTS",
            stage="initializing",
            message="A YouTube URL was not provided to the converter.",
            detail="Usage: python3 conversion.py <youtube_url>",
            suggestion="Pass exactly one validated YouTube URL.",
        )
        return 2
    return 0 if convert_to_mp3(sys.argv[1]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
