/// <reference types="node" />
import { test, expect, Page } from "@playwright/test";
import path from "path";
import { launchExtensionContext, createRoom, addRickRollToQueue, getShareTubeState } from "./helpers";

// Profiles are stored under tests/.pw-multi so they don't collide with single-user tests
const PROFILE_A = path.join(process.cwd(), "tests", ".profiles", "A");
const PROFILE_B = path.join(process.cwd(), "tests", ".profiles", "B");

test.describe("Multi-user room join", () => {
    test("Two users join the same room and see synced state", async () => {
        const contextA = await launchExtensionContext(PROFILE_A, { headless: false });
        const contextB = await launchExtensionContext(PROFILE_B, { headless: false });
        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();

        try {
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


