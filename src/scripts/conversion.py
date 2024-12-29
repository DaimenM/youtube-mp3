import sys
import os
from yt_dlp import YoutubeDL

def convert_to_mp3(url):
    try:
        output_path = os.path.join(os.getcwd(), 'public', 'downloads')
        os.makedirs(output_path, exist_ok=True)
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': os.path.join(output_path, '%(title)s.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            # Custom headers to avoid restrictions
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        }

        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info).replace('.webm', '.mp3').replace('.m4a', '.mp3')
            
            # Return the relative URL for download
            relative_path = f'/downloads/{os.path.basename(filename)}'
            print(f'Download URL:{relative_path}')
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