// Mobile Remote JavaScript
// Served by Nginx from:
//   /static/mobile_remote/js/main.js
// and located in:
//   pages/mobile_remote/frontend/static/js/main.js

document.addEventListener("DOMContentLoaded", function () {
    // Wire up UI controls and fetch initial state/queue.
    initializeControls();
    loadStatus();
    loadQueue();

    // Poll for playback status updates every 5 seconds to keep the UI in sync.
    setInterval(loadStatus, 5000);
});

function initializeControls() {
    // Playback controls: play/pause, previous, next.
    document
        .getElementById("play-pause-btn")
        .addEventListener("click", togglePlayPause);
    document
        .getElementById("prev-btn")
        .addEventListener("click", previousVideo);
    document
        .getElementById("next-btn")
        .addEventListener("click", nextVideo);

    // Volume slider.
    document
        .getElementById("volume-slider")
        .addEventListener("input", setVolume);

    // Progress bar click-to-seek.
    document
        .querySelector(".progress-bar")
        .addEventListener("click", seekToPosition);
}

async function togglePlayPause() {
    try {
        // Ask the backend to toggle playback state.
        const response = await fetch("/mobile-remote/api/control/play", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "toggle" }),
        });

        // If the request succeeded, flip the button icon locally as feedback.
        if (response.ok) {
            const btn = document.getElementById("play-pause-btn");
            btn.textContent = btn.textContent === "▶" ? "⏸" : "▶";
        }
    } catch (error) {
        console.error("Error toggling playback:", error);
    }
}

async function previousVideo() {
    try {
        // Tell the backend to move to the previous item in the queue.
        await fetch("/mobile-remote/api/control/play", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "previous" }),
        });
    } catch (error) {
        console.error("Error going to previous video:", error);
    }
}

async function nextVideo() {
    try {
        // Tell the backend to move to the next item in the queue.
        await fetch("/mobile-remote/api/control/play", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "next" }),
        });
    } catch (error) {
        console.error("Error going to next video:", error);
    }
}

async function setVolume() {
    const volume = document.getElementById("volume-slider").value;
    // Update the on-screen numeric volume as the slider moves.
    document.getElementById("volume-value").textContent = volume + "%";

    try {
        // Send the new volume level to the backend.
        await fetch("/mobile-remote/api/control/volume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volume: parseInt(volume, 10) }),
        });
    } catch (error) {
        console.error("Error setting volume:", error);
    }
}

async function seekToPosition(event) {
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;

    try {
        // Ask the backend to seek to the corresponding fractional position.
        await fetch("/mobile-remote/api/control/seek", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position: percentage }),
        });
    } catch (error) {
        console.error("Error seeking:", error);
    }
}

async function loadStatus() {
    try {
        // Pull the latest playback status from the backend.
        const response = await fetch("/mobile-remote/api/status");
        const status = await response.json();

        // Update play/pause button icon.
        const playBtn = document.getElementById("play-pause-btn");
        playBtn.textContent = status.is_playing ? "⏸" : "▶";

        // Update the progress bar fill based on current time vs duration.
        const progressPercent = (status.current_time / status.duration) * 100;
        document.getElementById("progress-fill").style.width =
            progressPercent + "%";

        // Update human-readable time displays.
        document.getElementById("current-time").textContent = formatTime(
            status.current_time,
        );
        document.getElementById("duration").textContent = formatTime(
            status.duration,
        );

        // Update volume slider and label from the status payload.
        document.getElementById("volume-slider").value = status.volume;
        document.getElementById("volume-value").textContent =
            status.volume + "%";

        // Display the currently playing video's title when available.
        if (status.current_video) {
            document.getElementById("video-title").textContent =
                status.current_video.title;
        }
    } catch (error) {
        console.error("Error loading status:", error);
    }
}

async function loadQueue() {
    try {
        // Fetch the current playback queue from the backend.
        const response = await fetch("/mobile-remote/api/queue");
        const queue = await response.json();

        const queueList = document.getElementById("queue-list");
        queueList.innerHTML = "";

        // Render each queue entry into the UI, marking the first as active.
        queue.forEach((item, index) => {
            const queueItem = document.createElement("div");
            queueItem.className = "queue-item";
            if (index === 0) queueItem.classList.add("active");

            queueItem.innerHTML = `
                <div class="title">${item.title}</div>
                <div class="duration">${item.duration}</div>
            `;

            queueItem.addEventListener("click", () =>
                selectQueueItem(item.id),
            );
            queueList.appendChild(queueItem);
        });
    } catch (error) {
        console.error("Error loading queue:", error);
    }
}

async function selectQueueItem(videoId) {
    try {
        // Tell the backend to start playing a specific video from the queue.
        await fetch("/mobile-remote/api/control/play", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "select", videoId: videoId }),
        });
    } catch (error) {
        console.error("Error selecting queue item:", error);
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Prevent zoom on double tap for a more native-app-like feel.
let lastTouchEnd = 0;
document.addEventListener(
    "touchend",
    function (event) {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    },
    false,
);


