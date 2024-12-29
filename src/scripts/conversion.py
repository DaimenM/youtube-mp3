import sys
import os
from yt_dlp import YoutubeDL

def convert_to_mp3(url):
    try:
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': '%(title)s.%(ext)s',  # Temporary file
            'quiet': True,
            'no_warnings': True
        }

        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info['title']
            print(f'Title:{title}', file=sys.stderr)  # Print title to stderr
            
            # Read and output the file to stdout
            filename = f"{title}.mp3"
            with open(filename, 'rb') as f:
                sys.stdout.buffer.write(f.read())
            
            # Clean up temp file
            os.remove(filename)
            return True
            
    except Exception as e:
        print(f'Error: {str(e)}', file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Error: Please provide a YouTube URL", file=sys.stderr)
        sys.exit(1)
    
    success = convert_to_mp3(sys.argv[1])
    sys.exit(0 if success else 1)