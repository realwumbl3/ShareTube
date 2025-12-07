// Mobile Remote main application using Zyx framework
import { css } from "/extension/app/@dep/zyx.js";
import { io } from "/extension/app/@dep/socket.io.min.esm.js";
import MobileRemoteApp from "./components/MobileRemoteApp.js";

css`
    @import "/static/mobile_remote/@css/styles.css";
`;

// Initialize the mobile remote when DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
    // Create and mount the main mobile remote app
    const mobileRemote = new MobileRemoteApp();
    document.body.appendChild(mobileRemote.main);

    // Get room code and error from config (passed from backend)
    const roomCode = window.mobileRemoteConfig?.roomCode;
    const token = window.mobileRemoteConfig?.token;
    const error = window.mobileRemoteConfig?.error;

    console.log('Mobile Remote: Config loaded:', {
        roomCode: roomCode ? `'${roomCode}'` : 'none',
        token: token ? `'${token.substring(0, 20)}...'` : 'none',
        error: error || 'none'
    });

    if (error) {
        console.log(`Mobile Remote: Error from backend: ${error}`);
        mobileRemote.showError(error);
    } else if (roomCode) {
        console.log(`Mobile Remote: Connecting to room ${roomCode}`);
        mobileRemote.connectToRoom(roomCode);
    } else {
        console.log("Mobile Remote: No room code provided");
        mobileRemote.showError("No room code provided. Please scan a QR code from the ShareTube extension.");
    }

    // Reveal the app after initialization
    mobileRemote.revealApp();
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
