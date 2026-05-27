document.addEventListener('DOMContentLoaded', () => {
    // State Variables
    let fetchedVideos = [];
    let playlistTitle = 'YouTube Playlist';
    let playlistThumbnail = '';
    let playlistUploader = '';
    let isPlaylist = false;
    let eventSource = null;
    let successfulCount = 0;
    let activeTrackIndex = 0;

    // DOM Elements - Navigation & Cards
    const searchCard = document.getElementById('search-card');
    const playlistCard = document.getElementById('playlist-card');
    const progressCard = document.getElementById('progress-card');
    const successCard = document.getElementById('success-card');

    // DOM Elements - Step 1: Search Input
    const playlistUrlInput = document.getElementById('playlist-url');
    const fetchBtn = document.getElementById('fetch-btn');
    const clearBtn = document.getElementById('clear-btn');
    const fetchError = document.getElementById('fetch-error');
    const errorText = document.getElementById('error-text');

    // DOM Elements - Step 2: Playlist Selection
    const playlistThumbnailEl = document.getElementById('playlist-thumbnail');
    const playlistTitleEl = document.getElementById('playlist-title');
    const playlistAuthorEl = document.getElementById('playlist-author');
    const totalSongsCountEl = document.getElementById('total-songs-count');
    const totalSongsCount2El = document.getElementById('total-songs-count-2');
    const estimatedSizeEl = document.getElementById('estimated-size');
    const selectedSongsCountEl = document.getElementById('selected-songs-count');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    const tracksListUl = document.getElementById('tracks-list');
    const backToSearchBtn = document.getElementById('back-to-search-btn');
    const downloadTriggerBtn = document.getElementById('download-trigger-btn');

    // DOM Elements - Step 3: Progress
    const globalProgressFill = document.getElementById('global-progress-fill');
    const progressPercentEl = document.getElementById('progress-percent');
    const completedCountEl = document.getElementById('completed-count');
    const downloadSpeedEl = document.getElementById('download-speed');
    const downloadEtaEl = document.getElementById('download-eta');
    const currentActiveSongTitle = document.getElementById('current-active-song-title');
    const statusTracksListDiv = document.getElementById('status-tracks-list');
    const terminalBody = document.getElementById('terminal-body');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');

    // DOM Elements - Step 4: Success
    const zipNameLabel = document.getElementById('zip-name-label');
    const downloadZipBtn = document.getElementById('download-zip-btn');
    const resetAppBtn = document.getElementById('reset-app-btn');

    /* ==========================================================================
       UTILITIES
       ========================================================================== */

    // Format seconds to MM:SS
    function formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Estimate file size (192kbps = 24 KB/s)
    function estimateTrackSizeMB(seconds) {
        if (!seconds) return 5.0; // default 5MB if duration unknown
        const sizeMB = (seconds * 24) / 1024;
        return parseFloat(sizeMB.toFixed(1));
    }

    // Toggle screen cards helper
    function showCard(cardToShow) {
        [searchCard, playlistCard, progressCard, successCard].forEach(card => {
            card.classList.add('hidden');
            card.classList.remove('active');
        });
        cardToShow.classList.remove('hidden');
        // trigger reflow for smooth opacity fade-in
        setTimeout(() => cardToShow.classList.add('active'), 50);
    }

    // Log message to virtual system terminal
    function appendTerminalLog(message, isSystem = true, isError = false) {
        const line = document.createElement('div');
        line.className = `log-line${isSystem ? ' system-line' : ''}${isError ? ' error-line' : ''}`;
        
        const timestamp = new Date().toLocaleTimeString();
        line.textContent = `[${timestamp}] ${message}`;
        
        terminalBody.appendChild(line);
        terminalBody.scrollTop = terminalBody.scrollHeight;
    }

    /* ==========================================================================
       INTERACTIONS & INPUT CONTROLS
       ========================================================================== */

    // Show/hide input clear button
    playlistUrlInput.addEventListener('input', () => {
        clearBtn.style.display = playlistUrlInput.value ? 'block' : 'none';
        fetchError.classList.add('hidden');
    });

    clearBtn.addEventListener('click', () => {
        playlistUrlInput.value = '';
        clearBtn.style.display = 'none';
        playlistUrlInput.focus();
    });

    // Toggle Console Log Container
    toggleConsoleBtn.addEventListener('click', () => {
        terminalBody.classList.toggle('collapsed');
        toggleConsoleBtn.classList.toggle('collapsed');
    });

    /* ==========================================================================
       STEP 1: FETCH PLAYLIST
       ========================================================================== */

    fetchBtn.addEventListener('click', handleFetchPlaylist);
    playlistUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleFetchPlaylist();
    });

    async function handleFetchPlaylist() {
        const url = playlistUrlInput.value.trim();
        if (!url) {
            showError('Please paste a YouTube URL first.');
            return;
        }

        // Add Loading State
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Parsing Tracks...</span>
        `;
        fetchError.classList.add('hidden');

        try {
            const response = await fetch('/api/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch playlist details.');
            }

            // Save state
            fetchedVideos = data.videos || [];
            playlistTitle = data.title;
            playlistThumbnail = data.thumbnail;
            playlistUploader = data.uploader;
            isPlaylist = data.is_playlist;

            // Fill Playlist Card UI
            playlistTitleEl.textContent = playlistTitle;
            playlistAuthorEl.textContent = `By ${playlistUploader}`;
            playlistThumbnailEl.src = playlistThumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&h=300&fit=crop';
            
            totalSongsCountEl.textContent = fetchedVideos.length;
            totalSongsCount2El.textContent = fetchedVideos.length;

            // Build tracks list selection DOM
            buildTracksSelectionList();

            // Transition
            showCard(playlistCard);

        } catch (err) {
            showError(err.message || 'Could not parse playlist. Please verify the URL and try again.');
        } finally {
            // Restore button
            fetchBtn.disabled = false;
            fetchBtn.innerHTML = `
                <span>Fetch Playlist</span>
                <i class="fa-solid fa-arrow-right btn-icon"></i>
            `;
        }
    }

    function showError(message) {
        errorText.textContent = message;
        fetchError.classList.remove('hidden');
    }

    /* ==========================================================================
       STEP 2: RENDER & SELECT TRACKS
       ========================================================================== */

    function buildTracksSelectionList() {
        tracksListUl.innerHTML = '';
        
        fetchedVideos.forEach((video, index) => {
            const li = document.createElement('li');
            li.className = 'track-row';
            
            li.innerHTML = `
                <div class="track-checkbox-wrapper">
                    <label class="custom-checkbox">
                        <input type="checkbox" class="track-select-checkbox" data-index="${index}" checked>
                        <span class="checkmark"></span>
                    </label>
                </div>
                <div class="track-thumbnail-wrapper">
                    <img class="track-thumbnail" src="${video.thumbnail}" alt="Thumbnail" onerror="this.src='https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&h=300&fit=crop'">
                    <span class="track-duration">${formatDuration(video.duration)}</span>
                </div>
                <div class="track-title" title="${video.title}">${video.title}</div>
            `;
            
            tracksListUl.appendChild(li);
        });

        // Add event listeners to individual checkboxes
        document.querySelectorAll('.track-select-checkbox').forEach(chk => {
            chk.addEventListener('change', updateSelectionCalculations);
        });

        // Select All listener
        selectAllCheckbox.checked = true;
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.track-select-checkbox').forEach(chk => {
                chk.checked = isChecked;
            });
            updateSelectionCalculations();
        });

        updateSelectionCalculations();
    }

    function updateSelectionCalculations() {
        const checkedBoxes = document.querySelectorAll('.track-select-checkbox:checked');
        const selectedCount = checkedBoxes.length;
        
        selectedSongsCountEl.textContent = selectedCount;

        // Sync select-all state
        const allBoxes = document.querySelectorAll('.track-select-checkbox');
        selectAllCheckbox.checked = selectedCount === allBoxes.length;

        // Calculate estimated ZIP size
        let totalSizeMB = 0;
        checkedBoxes.forEach(chk => {
            const idx = parseInt(chk.getAttribute('data-index'));
            const video = fetchedVideos[idx];
            totalSizeMB += estimateTrackSizeMB(video.duration);
        });

        estimatedSizeEl.textContent = `${totalSizeMB.toFixed(1)} MB`;

        // Disable download button if no tracks are selected
        downloadTriggerBtn.disabled = selectedCount === 0;
    }

    backToSearchBtn.addEventListener('click', () => {
        showCard(searchCard);
    });

    /* ==========================================================================
       STEP 3: STREAM DOWNLOADS & PROCESSES
       ========================================================================== */

    downloadTriggerBtn.addEventListener('click', handleInitiateDownload);

    async function handleInitiateDownload() {
        const checkedBoxes = document.querySelectorAll('.track-select-checkbox:checked');
        const selectedVideos = Array.from(checkedBoxes).map(chk => {
            const idx = parseInt(chk.getAttribute('data-index'));
            return fetchedVideos[idx];
        });

        if (selectedVideos.length === 0) return;

        // Reset progress counters
        successfulCount = 0;
        globalProgressFill.style.width = '0%';
        progressPercentEl.textContent = '0%';
        completedCountEl.textContent = `0 / ${selectedVideos.length}`;
        downloadSpeedEl.textContent = '0 KB/s';
        downloadEtaEl.textContent = '00:00';
        currentActiveSongTitle.textContent = 'Initiating download request...';
        
        // Build Status tracks grid UI for step 3
        buildStatusGrid(selectedVideos);

        // Prep terminal body
        terminalBody.innerHTML = '';
        appendTerminalLog('System initialized.');
        appendTerminalLog(`Queueing ${selectedVideos.length} songs for download and audio post-processing...`);

        // Show Progress screen
        showCard(progressCard);

        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videos: selectedVideos,
                    title: playlistTitle
                })
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to start download backend task.');
            }

            // Start Event Stream Listener
            startProgressStream(data.job_id, selectedVideos.length);

        } catch (err) {
            appendTerminalLog(`FATAL ERROR: ${err.message}`, true, true);
            currentActiveSongTitle.textContent = 'Initialization failed.';
            downloadSpeedEl.textContent = '--';
            downloadEtaEl.textContent = '--';
        }
    }

    function buildStatusGrid(selectedVideos) {
        statusTracksListDiv.innerHTML = '';
        
        selectedVideos.forEach((video, index) => {
            const item = document.createElement('div');
            item.className = 'status-item';
            item.id = `status-item-${index}`;
            
            item.innerHTML = `
                <div class="status-item-title" title="${video.title}">${video.title}</div>
                <div class="status-badge pending" id="status-badge-${index}">
                    <i class="fa-regular fa-clock"></i>
                    <span>Pending</span>
                </div>
            `;
            
            statusTracksListDiv.appendChild(item);
        });
    }

    function startProgressStream(jobId, totalSongs) {
        if (eventSource) {
            eventSource.close();
        }

        eventSource = new EventSource(`/api/download-stream?job_id=${jobId}`);

        eventSource.onmessage = function (e) {
            const msg = JSON.parse(e.data);
            const idx = msg.index;

            switch (msg.event) {
                case 'song_start':
                    activeTrackIndex = idx;
                    currentActiveSongTitle.textContent = `Downloading: ${msg.title}`;
                    updateStatusBadge(idx, 'downloading', 'Downloading');
                    appendTerminalLog(`[${idx + 1}/${totalSongs}] Started downloading: "${msg.title}"`, false);
                    
                    // Update global counts
                    completedCountEl.textContent = `${successfulCount} / ${totalSongs}`;
                    updateGlobalProgress(idx, 0, totalSongs);
                    break;

                case 'song_progress':
                    // Update speed and ETA labels
                    downloadSpeedEl.textContent = msg.speed || '0B/s';
                    downloadEtaEl.textContent = msg.eta || '00:00';
                    
                    // Update status badge inline percentage
                    const badge = document.getElementById(`status-badge-${idx}`);
                    if (badge) {
                        badge.querySelector('span').textContent = `Downloading (${msg.percent}%)`;
                    }
                    
                    // Update global progress smoothly
                    updateGlobalProgress(idx, msg.percent, totalSongs);
                    break;

                case 'song_converting':
                    updateStatusBadge(idx, 'converting', 'Converting');
                    currentActiveSongTitle.textContent = `Converting: ${fetchedVideos[idx].title}`;
                    appendTerminalLog(`[${idx + 1}/${totalSongs}] Running audio post-processors...`, true);
                    break;

                case 'song_done':
                    successfulCount++;
                    updateStatusBadge(idx, 'completed', 'Completed');
                    appendTerminalLog(`[${idx + 1}/${totalSongs}] Conversion finished successfully. Saved MP3.`, true);
                    
                    // Update counters
                    completedCountEl.textContent = `${successfulCount} / ${totalSongs}`;
                    updateGlobalProgress(idx + 1, 0, totalSongs);
                    break;

                case 'song_failed':
                    updateStatusBadge(idx, 'failed', 'Failed');
                    appendTerminalLog(`[${idx + 1}/${totalSongs}] ERROR: Download failed. skipping.`, true, true);
                    
                    // Advance progress even on failure
                    updateGlobalProgress(idx + 1, 0, totalSongs);
                    break;

                case 'zip_start':
                    currentActiveSongTitle.textContent = 'Packaging MP3 files...';
                    downloadSpeedEl.textContent = '--';
                    downloadEtaEl.textContent = '--';
                    appendTerminalLog('Compressing MP3s into ZIP file container...');
                    break;

                case 'complete':
                    eventSource.close();
                    appendTerminalLog('Success! ZIP file created.');
                    
                    // Fill step 4 Success Card UI
                    zipNameLabel.textContent = msg.zip_name;
                    downloadZipBtn.href = `/api/download-zip/${msg.job_id}/${encodeURIComponent(msg.zip_name)}`;
                    
                    // Display finished ZIP
                    setTimeout(() => {
                        showCard(successCard);
                    }, 800);
                    break;

                case 'error':
                    eventSource.close();
                    appendTerminalLog(`CRITICAL BACKEND ERROR: ${msg.message}`, true, true);
                    currentActiveSongTitle.textContent = 'Task aborted due to server error.';
                    downloadSpeedEl.textContent = '--';
                    downloadEtaEl.textContent = '--';
                    break;
            }
        };

        eventSource.onerror = function () {
            eventSource.close();
            appendTerminalLog('Connection to progress server interrupted.', true, true);
        };
    }

    function updateStatusBadge(idx, stateClass, text) {
        const badge = document.getElementById(`status-badge-${idx}`);
        if (!badge) return;

        badge.className = `status-badge ${stateClass}`;
        
        let iconHtml = '<i class="fa-regular fa-clock"></i>';
        if (stateClass === 'downloading') {
            iconHtml = '<i class="fa-solid fa-spinner fa-spin"></i>';
        } else if (stateClass === 'converting') {
            iconHtml = '<i class="fa-solid fa-arrows-spin fa-spin"></i>';
        } else if (stateClass === 'completed') {
            iconHtml = '<i class="fa-solid fa-circle-check"></i>';
        } else if (stateClass === 'failed') {
            iconHtml = '<i class="fa-solid fa-circle-xmark"></i>';
        }

        badge.innerHTML = `${iconHtml} <span>${text}</span>`;
    }

    // Advanced Progress Math: Combines completed tracks and sub-track percentage for high smoothness
    function updateGlobalProgress(trackIdx, trackPercent, totalTracks) {
        const completedWeight = trackIdx / totalTracks;
        const currentWeight = (trackPercent / 100) / totalTracks;
        const totalProgress = (completedWeight + currentWeight) * 100;
        
        const roundedProgress = Math.min(Math.round(totalProgress), 100);
        
        globalProgressFill.style.width = `${roundedProgress}%`;
        progressPercentEl.textContent = `${roundedProgress}%`;
    }

    /* ==========================================================================
       STEP 4: SUCCESS & RESET
       ========================================================================== */

    resetAppBtn.addEventListener('click', () => {
        // Clear inputs and state
        playlistUrlInput.value = '';
        clearBtn.style.display = 'none';
        fetchedVideos = [];
        successfulCount = 0;
        activeTrackIndex = 0;
        
        showCard(searchCard);
    });
});
