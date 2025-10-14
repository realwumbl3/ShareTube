/// <reference types="node" />
import { test, expect, chromium, Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import os from "os";
import { addConsentCookies, getShareTubeState, createRoom, addRickRollToQueue } from "./helpers";

// Resolve unpacked extension path explicitly to the repo's `extension/` directory
const EXT_PATH = path.join(process.cwd(), "extension");

console.log(`Running tests with extension at ${EXT_PATH}`);

async function withExtension(run: (page: any, context: any) => Promise<void>) {
    const profileDir = "/home/wumbl3wsl/ShareTube/tests/.profiles/A";
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
    const context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
        args: [
            `--disable-extensions-except=${EXT_PATH}`,
            `--load-extension=${EXT_PATH}`,
            "--no-sandbox",
            "--disable-features=IsolateOrigins,site-per-process",
            "--autoplay-policy=no-user-gesture-required",
        ],
    });
    // Pre-grant clipboard permissions for YouTube to avoid popup prompts
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://www.youtube.com" });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://youtube.com" });
    const page = await context.newPage();
    try {
        await context.tracing.start({ screenshots: true, snapshots: true });
        await addConsentCookies(context);
        await run(page, context);
    } finally {
        try {
            await context.tracing.stop();
        } catch { }
        await context.close();
    }
}

test("Extension should load and clicking + button should create a room and copy the invite URL to the clipboard", async () => {
    await withExtension(async (page) => {
        await page.goto("https://youtube.com/");

        // ensure the extension overlay is present
        await expect(page.locator("#sharetube_pill")).toBeVisible();

        const clipboard = await createRoom(page, { clearClipboard: true });

        expect(clipboard).toContain("#sharetube:");
    });
});


test("Adding a video to the queue and clicking on the play button should start the queue, video page should be loaded and state should be 'playing'", async () => {
    await withExtension(async (page: Page) => {
        await page.goto("https://youtube.com/");

        await createRoom(page, { clearClipboard: false });

        await addRickRollToQueue(page);

        // click on the play button
        await page.locator("#sharetube_control_button").click();

        // wait for page to load new location. (this could be any video/room url)
        await page.waitForURL("https://www.youtube.com/*");

        console.log("page loaded, video should start playing if AD is not playing.");

        // wait for 5 seconds
        await expect.poll(async () => {
            const state = await getShareTubeState(page);
            return state.roomState;
        }, { timeout: 20000 }).toBe("playing");
    });
});
