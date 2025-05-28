import sys
import os
from yt_dlp import YoutubeDL
import json
from datetime import datetime, timedelta
import re
import unicodedata

def clean_title(title):
    title = unicodedata.normalize('NFKD', title)
    
    # Replace visually odd characters with ASCII equivalents
    title = title.replace('｜', '|')  # full-width vertical bar
    title = title.replace('–', '-')  # en dash
    title = title.replace('—', '-')  # em dash
    title = title.replace('“', '"').replace('”', '"')
    title = title.replace('‘', "'").replace('’', "'")

    # Remove unsafe file characters (Windows + Unix)
    title = re.sub(r'[\\/*?:"<>|]', '', title)

    # Remove weird symbols and currency signs (like ¥, £, €)
    title = re.sub(r'[^\w\s\-.,()\'"&]', '', title)

    # Normalize multiple spaces and dashes
    title = re.sub(r'\s+', ' ', title).strip()
    title = re.sub(r'-{2,}', '-', title)

    # Optional: limit length
    title = title[:100]

    return title
def get_cookies():
    cookie_json = os.environ.get("MY_COOKIES")
    cookies = json.loads(cookie_json)

    with open("cookies.txt", "w") as f:
        f.write("# Netscape HTTP Cookie File\n")
        for cookie in cookies:
            domain = cookie.get("domain", ".youtube.com")
            flag = "TRUE" if domain.startswith('.') else "FALSE"
            path = cookie.get("path", "/")
            secure = "TRUE" if cookie.get("secure", False) else "FALSE"
            expires = int((datetime.utcnow() + timedelta(days=180)).timestamp())
            name = cookie["name"]
            value = cookie["value"]
            f.write(f"{domain}\t{flag}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n")
def convert_to_mp3(url):
    try:
        cookie_file = os.path.join(os.getcwd(), 'cookies.txt')
        if not os.path.exists(cookie_file):
            print(f"Cookie file not found at: {cookie_file}", file=sys.stderr)
            raise Exception("Cookie file not found - please authenticate first")
        with YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            cleaned_title = clean_title(info['title'])

        ydl_opts = {
            'format': 'bestaudio/best',  # Get best available audio
            'quiet': True,
            'no_warnings': False,
            'continue': True,  # Continue partial downloads
            'retries': 10,    # Retry on error
            'fragment_retries': 10,  # Retry on fragment error
            'outtmpl': f'{cleaned_title}',  # Temporary file
            'cookies': cookie_file,  # Path to your cookies file
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        }
        try:
            with YoutubeDL(ydl_opts) as ydl:
                # Get video title first
                print("downloading...")
                info = ydl.extract_info(url, download=True)
                title = clean_title(info['title'])
                #title = title.replace("/", "⧸")
                #title = title.replace("|","｜")
                print(title)
                print("downloaded!")
                print(f"Title:{info['title']}", file=sys.stderr)

            filename = f"{title}.mp3"
            with open(filename, 'rb') as f:
                sys.stdout.buffer.write(f.read())
            os.remove(filename)  # Clean up the temporary file
            return True

                
        except Exception as e:
            print(f"Error: {str(e)}", file=sys.stderr)
            return False
    except Exception as e:
        print(e)
    finally:
        if os.path.exists(cleaned_title):
            os.remove(cleaned_title)

if len(sys.argv) != 2:
    print("Usage: python conversion.py <youtube_url>")
    sys.exit(1)
success = convert_to_mp3(sys.argv[1])
sys.exit(0 if success else 1)
