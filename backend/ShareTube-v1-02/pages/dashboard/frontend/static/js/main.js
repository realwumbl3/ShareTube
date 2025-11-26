// Dashboard JavaScript
// This file is served directly by Nginx from:
//   /static/dashboard/js/main.js
// and is colocated with the dashboard page under:
//   pages/dashboard/frontend/static/js/main.js

document.addEventListener("DOMContentLoaded", function () {
    // On initial load, fetch both stats and recent activity for the dashboard.
    loadStats();
    loadActivity();

    // Refresh dashboard data every 30 seconds to keep the UI up to date.
    setInterval(() => {
        loadStats();
        loadActivity();
    }, 30000);
});

async function loadStats() {
    try {
        // Call the dashboard stats API endpoint provided by the backend blueprint.
        const response = await fetch("/dashboard/api/stats");
        const stats = await response.json();

        // Update the DOM with values returned from the server.
        document.getElementById("total-users").textContent = stats.total_users;
        document.getElementById("active-sessions").textContent =
            stats.active_sessions;
        document.getElementById("videos-shared").textContent =
            stats.videos_shared;
        document.getElementById("storage-used").textContent =
            stats.storage_used;
    } catch (error) {
        // Log any failure to fetch or parse stats; UI will simply remain stale.
        console.error("Error loading stats:", error);
    }
}

async function loadActivity() {
    try {
        // Call the dashboard activity API endpoint to get recent events.
        const response = await fetch("/dashboard/api/activity");
        const activities = await response.json();

        // Locate the container that will hold the rendered activity items.
        const activityList = document.getElementById("activity-list");
        // Clear any previously rendered entries before repopulating.
        activityList.innerHTML = "";

        // For each activity event returned by the backend, create a DOM element.
        activities.forEach((activity) => {
            const activityItem = document.createElement("div");
            activityItem.className = "activity-item";
            activityItem.innerHTML = `
                <div class="type">${activity.type
                    .replace("_", " ")
                    .toUpperCase()}</div>
                <div class="user">User: ${activity.user}</div>
                <div class="timestamp">${new Date(
                    activity.timestamp,
                ).toLocaleString()}</div>
            `;
            activityList.appendChild(activityItem);
        });
    } catch (error) {
        // If the activity feed fails to load, log the error for debugging.
        console.error("Error loading activity:", error);
    }
}

// Navigation handling for the dashboard nav links.
document.querySelectorAll("nav a").forEach((link) => {
    link.addEventListener("click", function (e) {
        // Prevent the default hash change and use smooth scrolling instead.
        e.preventDefault();
        const targetId = this.getAttribute("href").substring(1);
        const targetSection = document.getElementById(targetId);

        // If the target section exists, smoothly scroll it into view.
        if (targetSection) {
            targetSection.scrollIntoView({ behavior: "smooth" });
        }
    });
});

import module from "./module.js";
console.log(module);