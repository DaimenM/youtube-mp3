import sys
import json
import imghdr
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC

def edit_mp3(file_path, metadata):
    try:
        print(f"Starting MP3 edit for: {file_path}", file=sys.stderr)
        audio = MP3(file_path, ID3=ID3)
        
        if audio.tags is None:
            print("No existing tags, creating new", file=sys.stderr)
            audio.add_tags()
        else:
            print("Existing tags found", file=sys.stderr)
            # Clear existing tags to avoid duplicates
            audio.tags.delete()
            audio.add_tags()

        # Set metadata
        if metadata.get('fileName'):
            audio.tags.add(TIT2(encoding=3, text=metadata['fileName']))
        if metadata.get('artistName'):
            audio.tags.add(TPE1(encoding=3, text=metadata['artistName']))
        if metadata.get('albumName'):
            audio.tags.add(TALB(encoding=3, text=metadata['albumName']))

        # Handle cover art
        if metadata.get('coverArt'):
            try:
                print(f"Processing cover art from: {metadata['coverArt']}", file=sys.stderr)
                with open(metadata['coverArt'], 'rb') as img_file:
                    img_data = img_file.read()
                    img_type = imghdr.what(None, img_data)
                    print(f"Detected image type: {img_type}", file=sys.stderr)
                    
                    if img_type:
                        mime_type = f'image/{img_type}'
                        # Remove any existing APIC frames
                        audio.tags.delall('APIC')
                        # Add new cover art
                        audio.tags.add(
                            APIC(
                                encoding=3,
                                mime=mime_type,
                                type=3,  # Cover (front)
                                desc='Cover',
                                data=img_data
                            )
                        )
                        print("Cover art added successfully", file=sys.stderr)
            except Exception as e:
                print(f"Cover art error: {str(e)}", file=sys.stderr)

        # Save changes and verify
        audio.save(v1=2, v2_version=3)
        
        # Verify saved tags
        verify = MP3(file_path, ID3=ID3)
        print(f"Verification - Tags present: {verify.tags is not None}", file=sys.stderr)
        if verify.tags:
            print(f"Tag keys: {list(verify.tags.keys())}", file=sys.stderr)
        
        return True
    except Exception as e:
        print(f"Error in edit_mp3: {str(e)}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Error: Please provide file path and metadata JSON", file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    metadata = json.loads(sys.argv[2])
    success = edit_mp3(file_path, metadata)
    sys.exit(0 if success else 1)