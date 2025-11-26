// Dashboard main application using Zyx framework
import { html, css, LiveVar, LiveList } from "/extension/app/dep/zyx.js";
import { io } from "/extension/app/dep/socket.io.min.esm.js";
import DashboardApp from "./components/DashboardApp.js";

// Initialize the dashboard when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    // Create and mount the main dashboard app
    const dashboard = new DashboardApp();
    document.body.appendChild(dashboard.main);

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

    // Apply global dashboard styles
    css`
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #f5f5f5;
            color: #333;
        }

        * {
            box-sizing: border-box;
        }
    `;
});
