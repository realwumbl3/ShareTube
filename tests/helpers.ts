import { Page, expect, Frame, BrowserContext, chromium } from "@playwright/test";
import path from "path";
import fs from "fs";

// Profiles are stored under tests/.pw-multi so they don't collide with single-user tests
const PROFILE_A = path.join(process.cwd(), "tests", ".profiles", "A");
const PROFILE_B = path.join(process.cwd(), "tests", ".profiles", "B");

// Launch a persistent Chromium context with the extension loaded for a given profile directory.
// Ensures the profile directory exists and grants clipboard permissions for YouTube origins.
export async function launchExtensionContext(
    profileDir: string,
    options?: { headless?: boolean; windowPosition?: { x: number; y: number }; windowSize?: { width: number; height: number } }
): Promise<BrowserContext> {
    const headless = options?.headless ?? false;
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
    const EXT_PATH = path.join(process.cwd(), "extension");
    const args: string[] = [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
        "--no-sandbox",
        "--disable-features=IsolateOrigins,site-per-process",
        "--autoplay-policy=no-user-gesture-required",
    ];
    if (options?.windowPosition) {
        const { x, y } = options.windowPosition;
        args.push(`--window-position=${x},${y}`);
    }
    if (options?.windowSize) {
        const { width, height } = options.windowSize;
        args.push(`--window-size=${width},${height}`);
    }
    const viewport = options?.windowSize ? { width: options.windowSize.width, height: options.windowSize.height } : { width: 1280, height: 800 };
    const context = await chromium.launchPersistentContext(profileDir, {
        headless,
        viewport,
        args,
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://www.youtube.com" });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://youtube.com" });
    return context;
}


export async function withExtension(run: (page: any, context: any) => Promise<void>) {
    const profileADir = "/home/wumbl3wsl/ShareTube/tests/.profiles/A";

    const context = await launchExtensionContext(profileADir, {
        headless: false,
        windowSize: { width: 1280, height: 800 },
        windowPosition: { x: 0, y: 0 },
    });
    try {
        const page = await context.newPage();
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


export async function launchExtensionContextWithTwoPages({ launchA, launchB }: { launchA: boolean, launchB: boolean } = { launchA: true, launchB: true }) {
    const out = { contextA: null as BrowserContext | null, contextB: null as BrowserContext | null, pageA: null as Page | null, pageB: null as Page | null };
    if (launchA) {
        out.contextA = await launchExtensionContext(PROFILE_A, { headless: false, windowPosition: { x: 0, y: 0 }, windowSize: { width: 1280, height: 800 } });
        out.pageA = await out.contextA.newPage();
    }
    if (launchB) {
        out.contextB = await launchExtensionContext(PROFILE_B, { headless: false, windowPosition: { x: 1280, y: 0 }, windowSize: { width: 1280, height: 800 } });
        out.pageB = await out.contextB.newPage();
    }
    return out;
}

export async function addConsentCookies(_context: BrowserContext) {
    // Intentionally left as a no-op for now; hook for setting consent cookies if needed.
}

export async function getShareTubeState(page: Page, opts?: { timeoutMs?: number; }): Promise<any> {
    const _ = opts; // reserved for future options

    async function requestBridgeState(): Promise<any | null> {
        const id = Math.random().toString(36).slice(2);
        try {
            const res: any = await page.evaluate(({ id }) => {
                return new Promise((resolve) => {
                    try {
                        const onResp = (ev) => {
                            try {
                                const d = ev && ev.detail;
                                if (!d || d.id !== id) return;
                                window.removeEventListener('sharetube:test:resp', onResp, true);
                                resolve({ ok: !!d.ok, result: d.result, error: d.error });
                            } catch { resolve(null); }
                        };
                        window.addEventListener('sharetube:test:resp', onResp, true);
                        window.dispatchEvent(new CustomEvent('sharetube:test', { detail: { id, action: 'getState' } }));
                        setTimeout(() => {
                            try { window.removeEventListener('sharetube:test:resp', onResp, true); } catch { }
                            resolve(null);
                        }, 800);
                    } catch { resolve(null); }
                });
            }, { id });
            return res && res.ok ? res.result : null;
        } catch {
            return null; // navigation or context loss
        }
    }

    // Try bridge; if it fails, wait for reinjection once, then try again.
    let state = await requestBridgeState();
    if (!state) {
        try { await page.waitForLoadState('domcontentloaded', { timeout: 3000 }); } catch { }
        try { await page.waitForSelector('#sharetube_pill', { timeout: 3000 }); } catch { }
        state = await requestBridgeState();
    }
    if (state) return state;
    throw new Error("ShareTube test bridge unavailable or not ready");
}

export async function callShareTube(page: Page, method: string, ...args: any[]): Promise<any> {
    const id = Math.random().toString(36).slice(2);
    const res = await page.evaluate(({ id, method, args }) => {
        return new Promise((resolve, reject) => {
            try {
                const onResp = (ev) => {
                    try {
                        const d = ev && ev.detail;
                        if (!d || d.id !== id) return;
                        window.removeEventListener('sharetube:test:resp', onResp, true);
                        if (d.ok) resolve(d.result);
                        else reject(new Error(d.error || 'ShareTube call failed'));
                    } catch (e) { reject(e); }
                };
                window.addEventListener('sharetube:test:resp', onResp, true);
                const detail = { id, action: 'call', method, args };
                window.dispatchEvent(new CustomEvent('sharetube:test', { detail }));
                setTimeout(() => { try { window.removeEventListener('sharetube:test:resp', onResp, true); } catch { } reject(new Error('ShareTube bridge timeout')); }, 1500);
            } catch (e) { reject(e); }
        });
    }, { id, method, args });
    return res;
}

// Test helper to queue a known video via drag-and-drop on the ShareTube overlay root.
export async function addRickRollToQueue(page: Page) {
    await page.waitForSelector("#sharetube_main");
    await page.evaluate(() => {
        const root = document.querySelector("#sharetube_main");
        if (!root) return;
        const url = "https://www.youtube.com/watch?v=doEqUhFiQS4";
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/uri-list", url);
        dataTransfer.setData("text/plain", url);
        dataTransfer.setData("text/html", `<a href="${url}">${url}</a>`);

        function fire(type: string) {
            let event: DragEvent;
            try {
                event = new DragEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer,
                });
            } catch {
                // Fallback for environments that restrict DragEvent constructor
                event = document.createEvent("DragEvent");
                // @ts-ignore - legacy init path
                event.initEvent(type, true, true);
                Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
            }
            root?.dispatchEvent(event);
        }

        fire("dragenter");
        fire("dragover");
        fire("drop");
    });
}

// Click the + button to create a room and return the clipboard contents (invite/link).
export async function createRoom(page: Page, { clearClipboard }: { clearClipboard?: boolean } = { clearClipboard: true }): Promise<string> {
    if (clearClipboard) {
        console.log("[Clearing clipboard]");
        await page.evaluate(() => navigator.clipboard.writeText(""));
    }
    console.log("[Clicking + button to create room]");
    await page.locator("#sharetube_plus_button").click();
    await page.waitForTimeout(1000);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    console.log("[Clipboard contents]:", clipboard);
    return clipboard ?? "";
}