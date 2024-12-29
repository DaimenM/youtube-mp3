// filepath: /c:/Users/mdaim/Youtube-mp3/install_ffmpeg.sh
#!/bin/bash

# Download FFmpeg static build
wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar -xvf ffmpeg-release-amd64-static.tar.xz
cd ffmpeg-*-amd64-static

# Move FFmpeg binaries to /usr/local/bin
mv ffmpeg /usr/local/bin/
mv ffprobe /usr/local/bin/