import sys
import os
from yt_dlp import YoutubeDL

def convert_to_mp3(url):
    cookie_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'cookies.txt')
    
    if not os.path.exists(cookie_file):
        print(f"Cookie file not found at: {cookie_file}", file=sys.stderr)
        raise Exception("Cookie file not found - please authenticate first")

    ydl_opts = {
        'format': 'bestaudio/best',
        'cookiefile': cookie_file,
        'cookiesfrombrowser': None,  # Disable browser cookies
        'extractaudio': True,
        'audioformat': 'mp3',
        'outtmpl': '-',  # Output to stdout
        'quiet': True,
        'no_warnings': True,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            # Get video title first
            info = ydl.extract_info(url, download=False)
            print(f"Title:{info['title']}", file=sys.stderr)
            
            # Download and process video
            ydl.download([url])
            
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python conversion.py <youtube_url>")
        sys.exit(1)
    
    convert_to_mp3(sys.argv[1])