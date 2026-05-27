# ☄️ Nemesis | YouTube Playlist to MP3 Converter & Packager

![Nemesis Header](https://img.shields.io/badge/Status-Active-success?style=for-the-badge) ![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white) ![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white) ![HTML5/CSS3](https://img.shields.io/badge/UI-Glassmorphism-8A2BE2?style=for-the-badge)

**Nemesis** is a blazing-fast, premium web application that allows users to seamlessly extract, convert, and package entire YouTube playlists into high-quality MP3 files. Built with a robust Flask backend and a stunning dark-themed glassmorphic frontend, Nemesis handles heavy audio processing workloads without breaking a sweat.

## ✨ Features

- **Selective Downloading**: Instantly fetch playlist metadata and select exactly which tracks you want to keep.
- **Real-Time Progress Streaming**: Powered by Server-Sent Events (SSE), the UI provides a butter-smooth, real-time dashboard displaying exact download percentages, speeds, and ETAs.
- **High-Fidelity Audio**: Automatically converts raw media into premium 192kbps MP3s using an integrated FFmpeg post-processor.
- **One-Click ZIP Packaging**: Groups all your downloaded tracks into a single, neat `.zip` archive for effortless downloading.
- **Interactive System Console**: Watch the backend work in real-time through a beautifully styled, collapsible terminal UI.
- **Smart Resource Management**: Features an asynchronous daemon that automatically purges temporary audio files and expires old ZIP archives to keep your server's disk space highly optimized.
- **Resilient Architecture**: Built with advanced SSE keepalive pings to handle massive 1Hr+ jukebox conversions without dropping the connection.

## 🛠️ Tech Stack

- **Backend**: Python, Flask, Flask-CORS
- **Extraction Engine**: `yt-dlp`
- **Audio Processing**: FFmpeg
- **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism & CSS Variables), Vanilla JavaScript (SSE API)
- **Design System**: Google Fonts (Outfit & Inter), FontAwesome Icons

## 🚀 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YourUsername/nemesis-converter.git
   cd nemesis-converter

2. **Install Python dependencies: Ensure you have Python 3.8+ installed, then run:**

   ```bash
   pip install flask flask-cors yt-dlp
   Install FFmpeg: Make sure you have ffmpeg installed on your system or place ffmpeg.exe and ffprobe.exe directly in the project root directory.

3.**Run the server:**

   ```bash
   python app.py
   Open the App: Navigate to http://127.0.0.1:5000 in your browser.
