import sys
import json
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC
import base64

def edit_mp3(file_path, metadata):
    try:
        audio = MP3(file_path, ID3=ID3)
        
        # Create ID3 tag if it doesn't exist
        if audio.tags is None:
            audio.add_tags()

        # Set title (file name)
        if metadata.get('fileName'):
            audio.tags.add(TIT2(encoding=3, text=metadata['fileName']))

        # Set artist
        if metadata.get('artistName'):
            audio.tags.add(TPE1(encoding=3, text=metadata['artistName']))

        # Set album
        if metadata.get('albumName'):
            audio.tags.add(TALB(encoding=3, text=metadata['albumName']))

        # Set cover art
        if metadata.get('coverArt'):
            with open(metadata['coverArt'], 'rb') as img_file:
                audio.tags.add(
                    APIC(
                        encoding=3,
                        mime='image/jpeg',
                        type=3,  # Cover (front)
                        desc='Cover',
                        data=img_file.read()
                    )
                )

        audio.save()
        print('Success', file=sys.stderr)
        return True
    except Exception as e:
        print(f'Error: {str(e)}', file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Error: Please provide file path and metadata JSON", file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    metadata = json.loads(sys.argv[2])
    success = edit_mp3(file_path, metadata)
    sys.exit(0 if success else 1)