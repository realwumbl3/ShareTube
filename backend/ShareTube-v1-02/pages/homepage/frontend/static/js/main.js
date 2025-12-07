// Homepage main application using Zyx framework
import { html, css, LiveVar, LiveList } from "/extension/app/@dep/zyx.js";
import HomepageApp from "./components/HomepageApp.js";
css`
    @import "/static/homepage/@css/styles.css";
`;

function initHomepage() {
    // Create and mount the main homepage app
    const homepage = new HomepageApp();
    document.body.appendChild(homepage.main);
}

// Initialize the homepage
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHomepage);
} else {
    initHomepage();
}


