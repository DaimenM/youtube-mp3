import sys
import os
from yt_dlp import YoutubeDL
from youtube_auth import YouTubeAuth

def convert_to_mp3(url, email=None, password=None):
    try:
        # Login if credentials provided
        if email and password:
            auth = YouTubeAuth()
            if not auth.login(email, password):
                raise Exception("Failed to authenticate with YouTube")
        
        ydl_opts = {
            'cookiefile': 'cookies.txt' if os.path.exists('cookies.txt') else None,
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': '%(title)s.%(ext)s',
            'quiet': True,
            'no_warnings': True
        }

        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info['title']
            print(f'Title:{title}', file=sys.stderr)
            
            filename = f"{title}.mp3"
            with open(filename, 'rb') as f:
                sys.stdout.buffer.write(f.read())
            
            os.remove(filename)
            return True
            
    except Exception as e:
        print(f'Error: {str(e)}', file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: conversion.py <url> [email] [password]", file=sys.stderr)
        sys.exit(1)
        
    url = sys.argv[1]
    email = sys.argv[2] if len(sys.argv) > 2 else None
    password = sys.argv[3] if len(sys.argv) > 3 else None
    
    success = convert_to_mp3(url, email, password)
    sys.exit(0 if success else 1)