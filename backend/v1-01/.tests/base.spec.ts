/// <reference types="node" />
import { test, expect, chromium, Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import os from "os";
import { addConsentCookies, getShareTubeState, createRoom, addRickRollToQueue, withExtension } from "./helpers";


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
        await page.waitForURL("https://www.youtube.com/watch?v=*");

        console.log("page loaded, video should start playing if AD is not playing.");

        // wait for 5 seconds
        await expect.poll(async () => {
            const state = await getShareTubeState(page);
            return state.roomState;
        }, { timeout: 20000 }).toBe("playing");
    });
});
