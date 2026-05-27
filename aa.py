import os
import yt_dlp

def download_smart_playlist(playlist_url, download_folder="Mohammed_Rafi_Collection"):
    if not os.path.exists(download_folder):
        os.makedirs(download_folder)
        print(f"Created folder: '{download_folder}'")

    print(f"Scanning your existing files to prevent duplicates...\n")

    # 1. Grab the names of all the MP3s you ALREADY have in the folder
    # We convert them to lowercase and remove the ".mp3" to make matching easier
    existing_songs = []
    for file in os.listdir(download_folder):
        if file.endswith(".mp3"):
            # Strip out underscores and dashes to make it clean (e.g. "mohammed_rafi" -> "mohammed rafi")
            clean_name = file.replace('.mp3', '').replace('_', ' ').replace('-', ' ').lower()
            existing_songs.append(clean_name)

    # 2. This is our Custom Filter that yt-dlp will run BEFORE downloading a song
    def check_if_song_exists(info_dict, **kwargs):
        # Get the title of the YouTube video
        video_title = info_dict.get('title', '').replace('_', ' ').replace('-', ' ').lower()
        
        for existing_song in existing_songs:
            # If the existing song name is inside the YouTube title (or vice versa), SKIP IT.
            # We enforce a length > 5 so it doesn't accidentally trigger on tiny words.
            if len(existing_song) > 5 and existing_song in video_title:
                return f"Smart Skip: You already have a file similar to '{existing_song}'"
            
            if len(video_title) > 5 and video_title in existing_song:
                return f"Smart Skip: You already have a file similar to '{video_title}'"
                
        # Returning None gives yt-dlp the green light to download
        return None

    # 3. Configure yt-dlp
    archive_file = os.path.join(download_folder, "youtube_history.txt")

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(download_folder, '%(title)s.%(ext)s'),
        'ignoreerrors': True,
        
        # Keep tracking YouTube IDs just in case
        'download_archive': archive_file,
        
        # ACTIVATE OUR CUSTOM PYTHON FILTER
        'match_filter': check_if_song_exists,
        
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        
        'quiet': False, 
        'no_warnings': True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([playlist_url])
            
        print("\nProcess complete! Duplicates skipped and new songs downloaded.")
        
    except Exception as e:
        print(f"\nAn error occurred: {e}")

# --- Execution ---
if __name__ == "__main__":
    # The folder where your current MP3s are sitting
    folder_name = "Udit_narayan_hit_songs" # Change this to whatever your folder is named!
    
    # The YouTube playlist link
    target_playlist = "https://www.youtube.com/playlist?list=PLVCunFqPPOVTI9BNs-_IQwUlxU3A1ctu_" # Change this to your desired playlist link!
    
    download_smart_playlist(target_playlist, download_folder=folder_name)