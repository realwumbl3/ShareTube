// Mobile Remote main application using Zyx framework
import { css } from "/extension/app/dep/zyx.js";
import { io } from "/extension/app/dep/socket.io.min.esm.js";
import MobileRemoteApp from "./components/MobileRemoteApp.js";

css`
    @import "/static/mobile_remote/css/styles.css";
`;

// Initialize the mobile remote when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    // Create and mount the main mobile remote app
    const mobileRemote = new MobileRemoteApp();
    document.body.appendChild(mobileRemote.main);

    // Initialize Socket.IO for real-time updates (if needed)
    const socket = io({
        path: "/socket.io",
        transports: ["websocket", "polling"],
    });

    // Listen for real-time mobile remote updates
    socket.on("mobile-remote.update", (data) => {
        mobileRemote.handleRealtimeUpdate(data);
    });

    socket.on("connect", () => {
        console.log("Mobile Remote connected to server");
    });

    socket.on("disconnect", () => {
        console.log("Mobile Remote disconnected from server");
    });
});

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
    false
);
