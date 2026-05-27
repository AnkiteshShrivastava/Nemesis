import os
import json
import re
import uuid
import time
import queue
import shutil
import zipfile
import threading
from flask import Flask, request, jsonify, render_template, Response, send_from_directory
from flask_cors import CORS
import yt_dlp

app = Flask(__name__)
CORS(app)

# Ensure folders exist
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Keep track of active download queues
active_jobs = {}

def sanitize_filename(name):
    # Remove invalid characters for Windows/Linux filenames
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    # Strip double spaces and limit length
    clean = re.sub(r'\s+', " ", clean).strip()
    return clean if clean else "playlist_tracks"

def strip_ansi(text):
    if not text:
        return ""
    # Regex to capture standard ANSI terminal formatting sequences
    ansi_escape = re.compile(r'(?:\x1b|\\x1b|\\u001b)\[[0-9;]*[a-zA-Z]')
    clean = ansi_escape.sub('', text)
    return clean.strip()

# Clean up downloads directory of folders older than 1 hour
def cleanup_old_downloads():
    while True:
        try:
            now = time.time()
            if os.path.exists(DOWNLOADS_DIR):
                for folder in os.listdir(DOWNLOADS_DIR):
                    folder_path = os.path.join(DOWNLOADS_DIR, folder)
                    if os.path.isdir(folder_path):
                        # check modification time
                        mtime = os.path.getmtime(folder_path)
                        if now - mtime > 3600: # 1 hour
                            shutil.rmtree(folder_path, ignore_errors=True)
        except Exception as e:
            print(f"Error in cleanup thread: {e}")
        time.sleep(300) # run every 5 mins

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_old_downloads, daemon=True)
cleanup_thread.start()

def download_worker(job_id, video_list, playlist_title, q):
    """
    video_list is a list of dicts: [{"id": "...", "title": "..."}]
    """
    job_dir = os.path.join(DOWNLOADS_DIR, job_id)
    mp3_dir = os.path.join(job_dir, "mp3")
    os.makedirs(mp3_dir, exist_ok=True)
    
    successful_downloads = 0
    total_videos = len(video_list)
    
    for idx, video in enumerate(video_list):
        video_id = video.get('id')
        video_title = video.get('title', f"Track {idx+1}")
        
        q.put({
            "event": "song_start",
            "index": idx,
            "title": video_title,
            "total": total_videos
        })
        
        # Build ydl progress hook for this specific video
        def progress_hook(d):
            if d['status'] == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes', 0)
                percent = (downloaded / total * 100) if total > 0 else 0
                speed = strip_ansi(d.get('_speed_str', '0B/s'))
                eta = strip_ansi(d.get('_eta_str', '00:00'))
                q.put({
                    "event": "song_progress",
                    "index": idx,
                    "percent": round(percent, 1),
                    "speed": speed,
                    "eta": eta
                })
            elif d['status'] == 'finished':
                q.put({
                    "event": "song_converting",
                    "index": idx
                })
        
        # Options for yt_dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(mp3_dir, '%(title)s.%(ext)s'),
            'ffmpeg_location': BASE_DIR, # ffmpeg is in workspace
            'progress_hooks': [progress_hook],
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'quiet': True,
            'no_warnings': True,
            'ignoreerrors': False,
        }
        
        try:
            url = f"https://www.youtube.com/watch?v={video_id}"
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
                # We can verify file creation, but typically it downloads.
                # Just increment successful downloads count.
                successful_downloads += 1
                q.put({
                    "event": "song_done",
                    "index": idx
                })
        except Exception as e:
            print(f"Error downloading {video_title}: {e}")
            q.put({
                "event": "song_failed",
                "index": idx,
                "error": str(e)
            })
            
    # Zipping phase
    if successful_downloads > 0:
        q.put({"event": "zip_start"})
        try:
            if not os.path.exists(mp3_dir):
                q.put({
                    "event": "error",
                    "message": "Output folder does not exist. No MP3 files found."
                })
                return
                
            mp3_files = [f for f in os.listdir(mp3_dir) if f.endswith('.mp3')]
            if not mp3_files:
                q.put({
                    "event": "error",
                    "message": "Files downloaded, but no MP3 files were generated by FFmpeg conversion."
                })
                return
                
            zip_filename = f"{sanitize_filename(playlist_title)}.zip"
            zip_path = os.path.join(job_dir, zip_filename)
            
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file in mp3_files:
                    file_path = os.path.join(mp3_dir, file)
                    zipf.write(file_path, arcname=file)
                    
            # ZIP complete! Clean up the temporary MP3 files to save space
            shutil.rmtree(mp3_dir, ignore_errors=True)
            
            q.put({
                "event": "complete",
                "job_id": job_id,
                "zip_name": zip_filename
            })
        except Exception as e:
            q.put({
                "event": "error",
                "message": f"Zipping failed: {str(e)}"
            })
    else:
        q.put({
            "event": "error",
            "message": "All track downloads failed."
        })

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/fetch', methods=['POST'])
def fetch_playlist():
    data = request.json or {}
    url = data.get('url')
    if not url:
        return jsonify({"success": False, "error": "No URL provided"}), 400

    try:
        ydl_opts = {
            'extract_flat': True,
            'skip_download': True,
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            if not info:
                return jsonify({"success": False, "error": "Could not extract playlist information. Check URL."}), 400
            
            is_playlist = 'entries' in info
            
            playlist_title = info.get('title', 'YouTube Playlist')
            uploader = info.get('uploader') or info.get('channel', 'Unknown Creator')
            thumbnail = info.get('thumbnail')
            
            videos = []
            if is_playlist:
                for entry in info['entries']:
                    if entry:
                        videos.append({
                            "id": entry.get('id'),
                            "title": entry.get('title', 'Unknown Track'),
                            "duration": entry.get('duration'),
                            "thumbnail": entry.get('thumbnail') or f"https://img.youtube.com/vi/{entry.get('id')}/mqdefault.jpg"
                        })
            else:
                videos.append({
                    "id": info.get('id'),
                    "title": info.get('title', 'Unknown Track'),
                    "duration": info.get('duration'),
                    "thumbnail": info.get('thumbnail') or f"https://img.youtube.com/vi/{info.get('id')}/mqdefault.jpg"
                })
            
            return jsonify({
                "success": True,
                "is_playlist": is_playlist,
                "title": playlist_title,
                "uploader": uploader,
                "thumbnail": thumbnail,
                "videos": videos
            })
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/download', methods=['POST'])
def start_download():
    data = request.json or {}
    video_list = data.get('videos', [])
    playlist_title = data.get('title', 'YouTube Playlist')
    
    if not video_list:
        return jsonify({"success": False, "error": "No videos selected"}), 400
        
    job_id = str(uuid.uuid4())
    q = queue.Queue()
    active_jobs[job_id] = q
    
    # Start background worker thread
    thread = threading.Thread(
        target=download_worker,
        args=(job_id, video_list, playlist_title, q),
        daemon=True
    )
    thread.start()
    
    return jsonify({
        "success": True,
        "job_id": job_id
    })

@app.route('/api/download-stream')
def download_stream():
    job_id = request.args.get('job_id')
    if not job_id or job_id not in active_jobs:
        return Response("data: {\"event\": \"error\", \"message\": \"Invalid or expired Job ID\"}\n\n", mimetype="text/event-stream")
        
    def generate():
        q = active_jobs[job_id]
        while True:
            try:
                # Wait for progress message with a short timeout (15s)
                msg = q.get(timeout=15)
                yield f"data: {json.dumps(msg)}\n\n"
                
                # If job complete or error, we are done
                if msg.get('event') in ('complete', 'error'):
                    active_jobs.pop(job_id, None)
                    break
            except queue.Empty:
                # Stream SSE comment packet as keepalive to prevent client/gateway drops
                yield ": keepalive\n\n"
            except GeneratorExit:
                # Client closed the connection
                break
                
    return Response(generate(), mimetype="text/event-stream")

@app.route('/api/download-zip/<job_id>/<zip_name>')
def download_zip(job_id, zip_name):
    # Sanitize inputs
    job_id = os.path.basename(job_id)
    zip_name = os.path.basename(zip_name)
    
    job_dir = os.path.join(DOWNLOADS_DIR, job_id)
    zip_path = os.path.join(job_dir, zip_name)
    
    if os.path.exists(zip_path):
        return send_from_directory(job_dir, zip_name, as_attachment=True)
    else:
        return "File not found or has expired.", 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
