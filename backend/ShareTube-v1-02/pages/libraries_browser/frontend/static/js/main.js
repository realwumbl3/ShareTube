// Libraries Browser JavaScript
// Served by Nginx from:
//   /static/libraries_browser/js/main.js
// and located in:
//   pages/libraries_browser/frontend/static/js/main.js

document.addEventListener("DOMContentLoaded", function () {
    // Initialize the libraries browser UI once the DOM is ready.
    initializeApp();
});

let currentView = "libraries";
let currentLibraryId = null;
let currentVideoId = null;

function initializeApp() {
    // Wire up search controls.
    document
        .getElementById("search-btn")
        .addEventListener("click", performSearch);
    document
        .getElementById("search-input")
        .addEventListener("keypress", function (e) {
            if (e.key === "Enter") performSearch();
        });

    // Wire up navigation buttons.
    document
        .getElementById("all-libraries-btn")
        .addEventListener("click", showLibraries);
    document
        .getElementById("back-btn")
        .addEventListener("click", showLibraries);
    document
        .getElementById("back-to-videos-btn")
        .addEventListener("click", showVideos);

    // Wire up sort and view mode controls.
    document
        .getElementById("sort-select")
        .addEventListener("change", sortVideos);
    document
        .getElementById("grid-view-btn")
        .addEventListener("click", () => setViewMode("grid"));
    document
        .getElementById("list-view-btn")
        .addEventListener("click", () => setViewMode("list"));

    // Load the initial list of libraries from the backend API.
    loadLibraries();
}

async function loadLibraries() {
    try {
        // Query the backend for all available libraries.
        const response = await fetch("/libraries-browser/api/libraries");
        const libraries = await response.json();

        // Populate the main libraries grid and the tab strip.
        renderLibraries(libraries);
        renderLibraryTabs(libraries);
    } catch (error) {
        console.error("Error loading libraries:", error);
    }
}

function renderLibraries(libraries) {
    const grid = document.getElementById("libraries-grid");
    grid.innerHTML = "";

    // Create a card for each library and attach click handlers.
    libraries.forEach((library) => {
        const card = document.createElement("div");
        card.className = "library-card";
        card.onclick = () => showLibraryVideos(library.id, library.name);

        card.innerHTML = `
            <div class="library-header">
                <h3>${library.name}</h3>
                <div class="library-type">${library.type}</div>
            </div>
            <div class="library-stats">
                <div class="library-stat">
                    <span>Videos:</span>
                    <span>${library.video_count}</span>
                </div>
                <div class="library-stat">
                    <span>Duration:</span>
                    <span>${library.total_duration}</span>
                </div>
                <div class="library-stat">
                    <span>Updated:</span>
                    <span>${new Date(
                        library.last_updated,
                    ).toLocaleDateString()}</span>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });
}

function renderLibraryTabs(libraries) {
    const tabs = document.getElementById("library-tabs");
    tabs.innerHTML = "";

    // Build a set of buttons that let the user quickly jump between libraries.
    libraries.forEach((library) => {
        const tab = document.createElement("button");
        tab.className = "nav-btn";
        tab.textContent = library.name;
        tab.onclick = () => showLibraryVideos(library.id, library.name);
        tabs.appendChild(tab);
    });
}

async function showLibraryVideos(libraryId, libraryName) {
    currentLibraryId = libraryId;
    currentView = "videos";

    // Update section titles and visibility for the videos view.
    document.getElementById("current-library-title").textContent = libraryName;
    document
        .getElementById("libraries-section")
        .classList.add("hidden");
    document
        .getElementById("videos-section")
        .classList.remove("hidden");
    document
        .getElementById("video-detail-section")
        .classList.add("hidden");

    // Clear active state on nav buttons and tabs.
    document
        .querySelectorAll(".nav-btn")
        .forEach((btn) => btn.classList.remove("active"));
    document
        .getElementById("all-libraries-btn")
        .classList.remove("active");

    try {
        // Load all videos for the selected library from the backend.
        const response = await fetch(
            `/libraries-browser/api/libraries/${libraryId}`,
        );
        const videos = await response.json();
        renderVideos(videos);
    } catch (error) {
        console.error("Error loading videos:", error);
    }
}

function renderVideos(videos) {
    const container = document.getElementById("videos-container");
    const isListView = container.classList.contains("videos-list");

    container.innerHTML = "";

    // Render each video into either the grid or list layout.
    videos.forEach((video) => {
        const item = document.createElement("div");
        item.className = isListView
            ? "video-list-item video-item"
            : "video-item";
        item.onclick = () => showVideoDetail(video.id);

        if (isListView) {
            item.innerHTML = `
                <div class="video-thumbnail">
                    <span>🎬</span>
                    <div class="video-duration">${video.duration}</div>
                </div>
                <div class="video-info">
                    <div class="video-title">${video.title}</div>
                    <div class="video-meta">
                        <span>${video.uploaded_by}</span>
                        <span>${video.views} views</span>
                    </div>
                </div>
            `;
        } else {
            item.innerHTML = `
                <div class="video-thumbnail">
                    <span>🎬</span>
                    <div class="video-duration">${video.duration}</div>
                </div>
                <div class="video-info">
                    <div class="video-title">${video.title}</div>
                    <div class="video-meta">
                        <span>${video.uploaded_by}</span>
                        <span>${video.views} views</span>
                    </div>
                </div>
            `;
        }

        container.appendChild(item);
    });
}

async function showVideoDetail(videoId) {
    currentVideoId = videoId;
    currentView = "detail";

    // Toggle layout to show the video detail panel.
    document
        .getElementById("videos-section")
        .classList.add("hidden");
    document
        .getElementById("video-detail-section")
        .classList.remove("hidden");

    try {
        // Fetch full details for the selected video.
        const response = await fetch(
            `/libraries-browser/api/libraries/${currentLibraryId}/videos/${videoId}`,
        );
        const video = await response.json();
        renderVideoDetail(video);
    } catch (error) {
        console.error("Error loading video details:", error);
    }
}

function renderVideoDetail(video) {
    const detail = document.getElementById("video-detail");
    // Render out the rich metadata for a single video.
    detail.innerHTML = `
        <div class="video-detail-header">
            <h1 class="video-detail-title">${video.title}</h1>
            <div class="video-detail-meta">
                <span>By ${video.uploaded_by}</span>
                <span>${new Date(
                    video.upload_date,
                ).toLocaleDateString()}</span>
                <span>${video.views} views</span>
            </div>
        </div>

        <div class="video-description">
            ${video.description}
        </div>

        <div class="video-stats">
            <div class="stat-item">
                <span class="stat-value">${video.likes}</span>
                <span class="stat-label">Likes</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${video.duration}</span>
                <span class="stat-label">Duration</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${video.file_size}</span>
                <span class="stat-label">File Size</span>
            </div>
        </div>

        <div class="video-tags">
            <h3>Tags:</h3>
            <div class="tags-list">
                ${video.tags
                    .map((tag) => `<span class="tag">${tag}</span>`)
                    .join("")}
            </div>
        </div>
    `;
}

function showLibraries() {
    currentView = "libraries";
    currentLibraryId = null;
    currentVideoId = null;

    // Switch back to the libraries list view.
    document
        .getElementById("libraries-section")
        .classList.remove("hidden");
    document
        .getElementById("videos-section")
        .classList.add("hidden");
    document
        .getElementById("video-detail-section")
        .classList.add("hidden");

    // Mark the "All Libraries" button as active.
    document
        .getElementById("all-libraries-btn")
        .classList.add("active");
    document
        .querySelectorAll(".nav-btn")
        .forEach((btn) => btn.classList.remove("active"));
}

function showVideos() {
    currentView = "videos";
    currentVideoId = null;

    // Show the grid/list of videos while hiding the detail view.
    document
        .getElementById("libraries-section")
        .classList.add("hidden");
    document
        .getElementById("videos-section")
        .classList.remove("hidden");
    document
        .getElementById("video-detail-section")
        .classList.add("hidden");
}

function setViewMode(mode) {
    const container = document.getElementById("videos-container");
    const gridBtn = document.getElementById("grid-view-btn");
    const listBtn = document.getElementById("list-view-btn");

    if (mode === "grid") {
        container.className = "videos-grid";
        gridBtn.classList.add("active");
        listBtn.classList.remove("active");
    } else {
        container.className = "videos-list";
        listBtn.classList.add("active");
        gridBtn.classList.remove("active");
    }

    // Re-render videos with the new layout mode if a library is selected.
    if (currentLibraryId) {
        loadVideosForCurrentLibrary();
    }
}

async function loadVideosForCurrentLibrary() {
    try {
        // Reload videos for the current library, preserving sort/view state.
        const response = await fetch(
            `/libraries-browser/api/libraries/${currentLibraryId}`,
        );
        const videos = await response.json();
        renderVideos(videos);
    } catch (error) {
        console.error("Error reloading videos:", error);
    }
}

function sortVideos() {
    const sortBy = document.getElementById("sort-select").value;
    // Sorting is not yet implemented; this console log is a placeholder.
    console.log("Sorting by:", sortBy);
}

async function performSearch() {
    const query = document.getElementById("search-input").value.trim();
    if (!query) return;

    try {
        // Build the appropriate search URL depending on whether a library is active.
        const url = currentLibraryId
            ? `/libraries-browser/api/search?q=${encodeURIComponent(
                  query,
              )}&library_id=${currentLibraryId}`
            : `/libraries-browser/api/search?q=${encodeURIComponent(query)}`;

        const response = await fetch(url);
        const results = await response.json();

        // TODO: Render search results in the UI; for now, log them.
        console.log("Search results:", results);
    } catch (error) {
        console.error("Error performing search:", error);
    }
}


