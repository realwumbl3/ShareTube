/// <reference types="node" />
import { test, expect, Page, BrowserContext } from "@playwright/test";
import { createRoom, addRickRollToQueue, getShareTubeState, launchExtensionContextWithTwoPages } from "./helpers";

async function joinRoomWithTwoPages(pageA: Page, pageB: Page) {
    await pageA.goto("https://youtube.com/");

    // User A creates the room and copies the invite URL from clipboard
    const invite = await createRoom(pageA);
    expect(invite).toContain("#sharetube:");

    // Navigate A to the invite to ensure the extension/router handles the room state
    await pageA.goto(invite);
    await pageA.waitForURL("**/*");

    // User A adds a video
    await addRickRollToQueue(pageA);

    // User B opens the invite URL
    await pageB.goto(invite);

    // Wait for B to observe a non-empty queue (sync via room)
    await expect.poll(async () => {
        const s = await getShareTubeState(pageB);
        return Number(s.queueLength ?? 0);
    }, { timeout: 10000 }).toBeGreaterThan(0);

    // Read state snapshots from both users
    const stateA = await getShareTubeState(pageA);
    const stateB = await getShareTubeState(pageB);

    return { stateA, stateB, invite };
}


let joinedRoomUrl: string | null = null;

test.describe("Multi-user room join", () => {
    test("Two users join the same room and see synced state", async () => {
        const { contextA, contextB, pageA, pageB } = await launchExtensionContextWithTwoPages();

        try {
            const { stateA, stateB, invite } = await joinRoomWithTwoPages(pageA, pageB);
            joinedRoomUrl = invite;

            // Both should be connected to socket/room
            expect(stateA.socketConnected).toBeTruthy();
            expect(stateB.socketConnected).toBeTruthy();

            // If both expose room id, they should match
            const roomIdA = stateA.roomId ?? stateA.room?.id;
            const roomIdB = stateB.roomId ?? stateB.room?.id;
            if (roomIdA && roomIdB) {
                expect(roomIdA).toBe(roomIdB);
            }
        } finally {
            await contextA.close();
            await contextB.close();
        }
    });
});


test("Two users in the same room can start playing", async () => {

    if (!joinedRoomUrl) {
        throw new Error("Room not joined");
    }

    const { contextA, contextB, pageA, pageB } = await launchExtensionContextWithTwoPages();
    await pageA.goto(joinedRoomUrl);
    await pageB.goto(joinedRoomUrl);

    await pageA.waitForURL("**/*");
    await pageB.waitForURL("**/*");

    await pageA.waitForTimeout(2000);

    await pageA.click("#sharetube_control_button");
    console.log("Video watch pages should now be loading...");

    await pageA.waitForURL("**/*");
    await pageB.waitForURL("**/*");

    await pageA.waitForTimeout(4000);

    const stateA = await getShareTubeState(pageA);
    const stateB = await getShareTubeState(pageB);

    console.log("stateA", stateA);
    console.log("stateB", stateB);

    expect(stateA.roomState).toBe("playing");
    expect(stateB.roomState).toBe("playing");
});
