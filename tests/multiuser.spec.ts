/// <reference types="node" />
import { test, expect, Page, BrowserContext } from "@playwright/test";
import { createRoom, addRickRollToQueue, getShareTubeState, launchExtensionContextWithTwoPages, callShareTube } from "./helpers";

let joinedRoomUrl: string | null = null;

test.describe("Multi-user room join", async () => {
    test("Two users join the same room and see synced state", async () => {
        const { contextA, contextB, pageA, pageB } = await launchExtensionContextWithTwoPages({ launchA: true, launchB: true });
        if (!pageA) {
            throw new Error("Page A is null");
        }
        if (!pageB) {
            throw new Error("Page B is null");
        }
        if (!contextA) {
            throw new Error("Context A is null");
        }
        if (!contextB) {
            throw new Error("Context B is null");
        }
        try {

            await pageA.goto("https://youtube.com/");

            // User A creates the room and copies the invite URL from clipboard
            const invite = await createRoom(pageA, { clearClipboard: false });
            expect(invite).toContain("#sharetube:");

            console.log("[Player A creates the room and copies the invite URL from clipboard...]");

            // User B opens the invite URL
            await pageB.goto(invite);

            console.log("[Player B opens the invite URL...]");

            await pageB.waitForURL("**/*");

            // User A adds a video
            console.log("[Player A adds a video to the queue...]");
            await addRickRollToQueue(pageA);

            // Wait for B to observe a non-empty queue (sync via room)
            await expect.poll(async () => {
                const s = await getShareTubeState(pageB);
                return Number(s.queueLength ?? 0);
            }, { timeout: 10000 }).toBeGreaterThan(0);

            console.log("[Player B observes a non-empty queue...]");

            joinedRoomUrl = invite;

            // Both should be connected to socket/room (refresh state after waits)
            const finalStateA = await getShareTubeState(pageA);
            const finalStateB = await getShareTubeState(pageB);

            // If both expose room id, they should match
            const roomIdA = finalStateA.roomId ?? finalStateA.room?.id;
            const roomIdB = finalStateB.roomId ?? finalStateB.room?.id;
            if (roomIdA && roomIdB) {
                expect(roomIdA).toBe(roomIdB);
            }


        } finally {
            await contextA.close();
            await contextB.close();
        }
    });
});

let persistedContexts = {
    contextA: null as BrowserContext | null,
    contextB: null as BrowserContext | null,
    pageA: null as Page | null,
    pageB: null as Page | null,
};


test("Two users in the same room can start playing", async () => {


    if (!joinedRoomUrl) {
        throw new Error("Room not joined");
    }

    const { contextA, contextB, pageA, pageB } = await launchExtensionContextWithTwoPages({ launchA: true, launchB: true });
    if (!pageA) {
        throw new Error("Page A is null");
    }
    if (!pageB) {
        throw new Error("Page B is null");
    }
    if (!contextA) {
        throw new Error("Context A is null");
    }
    if (!contextB) {
        throw new Error("Context B is null");
    }

    try {

        await pageA.goto(joinedRoomUrl);
        await pageB.goto(joinedRoomUrl);

        await pageA.waitForURL("**/*");
        await pageB.waitForURL("**/*");

        // interact with the page to trigger the video to load and autoplay

        await pageA.waitForTimeout(2000);

        await callShareTube(pageA, "roomManager.togglePlayPause");

        console.log("Requested room to start via bridge; watch pages may navigate...");

        // Allow SPA/nav to occur if app routes to video URL
        await pageA.waitForURL("**/*");
        await pageB.waitForURL("**/*");

        console.log("[Videos should start playing.....]");

        // Wait for both sides to reach playing state (bridge-backed state read)
        await expect.poll(async () => {
            try { return (await getShareTubeState(pageA)).roomState; } catch { return ""; }
        }, { timeout: 25000 }).toBe("playing");
        await expect.poll(async () => {
            try { return (await getShareTubeState(pageB)).roomState; } catch { return ""; }
        }, { timeout: 25000 }).toBe("playing");

    } finally {
        // await contextA.close();
        console.log("[Closing Player B...]");
        await contextB.close();
        persistedContexts.contextA = contextA;
        persistedContexts.pageA = pageA;
    }
});


test("Users joining late join and see synced state", async () => {
    if (!joinedRoomUrl) {
        throw new Error("Room not joined");
    }

    const { contextB, pageB } = await launchExtensionContextWithTwoPages({ launchA: false, launchB: true });

    if (!pageB || !contextB) {
        throw new Error("Test setup failed");
    }

    try {
        console.log("[Player B should navigate to the room...]");

        await pageB.goto(joinedRoomUrl);

        console.log("[Player B should detect it's not on the video page and navigate to it...]");

        await pageB.waitForURL("**/watch?v=*");

        console.log("[Player B is on the video page...]");

        // await expect.poll(async () => {
        //     const state = await getShareTubeState(pageB);
        //     return state.player.desiredState;
        // }, { timeout: 15000 }).toBe("playing");
    }
    finally {
        // await contextB.close();
        persistedContexts.contextB = contextB;
        persistedContexts.pageB = pageB;
    }
});


test("Videos should be playing for both users", async () => {
    if (!joinedRoomUrl) {
        throw new Error("Room not joined");
    }

    const { contextA, contextB, pageA, pageB } = persistedContexts;
    if (!pageA || !pageB || !contextA || !contextB) {
        throw new Error("Test setup failed");
    }

    try {
        // check if the video is playing for Player A
        await expect(pageA.locator("video.html5-main-video")).toHaveJSProperty("paused", false, { timeout: 15000 });

        console.log("[Video is playing for Player A...]");

        // check if the video is playing for Player B
        await expect(pageB.locator("video.html5-main-video")).toHaveJSProperty("paused", false, { timeout: 15000 });

        console.log("[Video is playing for Player B...]");
    }
    finally {
        await contextA.close();
        await contextB.close();
    }
});

test("Users in the same room can pause and resume", async () => {
    if (!joinedRoomUrl) {
        throw new Error("Room not joined");
    }

    const { contextA, contextB, pageA, pageB } = persistedContexts;
    if (!pageA || !pageB || !contextA || !contextB) {
        throw new Error("Test setup failed");
    }

    try {
        // click the pause button
        await callShareTube(pageA, "player.requestPause");

        // wait for the video to pause
        await expect(pageA.locator("video.html5-main-video")).toHaveJSProperty("paused", true, { timeout: 15000 });

        console.log("[Video has paused for Player A...]");

        // check if the video is paused for Player B
        await expect(pageB.locator("video.html5-main-video")).toHaveJSProperty("paused", true, { timeout: 15000 });

        console.log("[Video has paused for Player B...]");

        // click the play button
        await callShareTube(pageA, "player.requestPlay");

        // wait for the video to play
        await expect(pageA.locator("video.html5-main-video")).toHaveJSProperty("paused", false, { timeout: 15000 });

        console.log("[Video has resumed for Player A...]");

        // check if the video is playing for Player B
        await expect(pageB.locator("video.html5-main-video")).toHaveJSProperty("paused", false, { timeout: 15000 });

        console.log("[Video has resumed for Player B...]");
    } finally {
        await contextA.close();
        await contextB.close();
    }


});