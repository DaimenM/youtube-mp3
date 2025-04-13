import sys
import os
import tempfile
from yt_dlp import YoutubeDL
print("test")
def convert_to_mp3(url):
    try:
        cookie_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'cookies.txt')
        
        if not os.path.exists(cookie_file):
            print(f"Cookie file not found at: {cookie_file}", file=sys.stderr)
            raise Exception("Cookie file not found - please authenticate first")

        # Create temp file

        ydl_opts = {
            'cookiefile': cookie_file,
            'format': 'bestaudio/best',  # Get best available audio
            'quiet': True,
            'no_warnings': False,
            'continue': True,  # Continue partial downloads
            'retries': 10,    # Retry on error
            'fragment_retries': 10,  # Retry on fragment error
            'outtmpl': '%(title)s.%(ext)s',  # Temporary file
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        }
        try:
            with YoutubeDL(ydl_opts) as ydl:
                # Get video title first
                info = ydl.extract_info(url, download=True)
                title = info['title']
                print("downloaded!")
                print(f"Title:{info['title']}", file=sys.stderr)

            filename = f"{title}.mp3"
            with open(filename, 'rb') as f:
                sys.stdout.buffer.write(f.read())
            #os.remove(filename)  # Clean up the temporary file
            return True

                
        except Exception as e:
            print(f"Error: {str(e)}", file=sys.stderr)
            return False
    except Exception as e:
        print(e)

if len(sys.argv) != 2:
    print("Usage: python conversion.py <youtube_url>")
    sys.exit(1)
success = convert_to_mp3(sys.argv[1])
sys.exit(0 if success else 1)
