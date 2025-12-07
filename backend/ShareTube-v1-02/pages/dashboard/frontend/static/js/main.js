// Dashboard main application using Zyx framework
import { html, css, LiveVar, LiveList } from "/extension/app/@dep/zyx.js";
import { io } from "/extension/app/@dep/socket.io.min.esm.js";
import DashboardApp from "./components/DashboardApp.js";
css`
    @import "/static/dashboard/@css/styles.css";
`;

function initDashboard() {
    // Create and mount the main dashboard app
    const dashboard = new DashboardApp();
    document.body.appendChild(dashboard.main);
    window.___DASHBOARD_APP__ = dashboard;
    // Initialize Socket.IO for real-time updates
    const socket = io({
        path: "/socket.io",
        transports: ["websocket", "polling"],
    });

    // Listen for real-time dashboard updates
    socket.on("dashboard.update", (data) => {
        dashboard.handleRealtimeUpdate(data);
    });

    socket.on("connect", () => {
        console.log("Dashboard connected to server");
    });

    socket.on("disconnect", () => {
        console.log("Dashboard disconnected from server");
    });
}

// Initialize the dashboard
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboard);
} else {
    initDashboard();
}

