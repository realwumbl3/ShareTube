import { Page, expect, Frame, BrowserContext, chromium } from "@playwright/test";
import path from "path";
import fs from "fs";

// Profiles are stored under tests/.pw-multi so they don't collide with single-user tests
const PROFILE_A = path.join(process.cwd(), "tests", ".profiles", "A");
const PROFILE_B = path.join(process.cwd(), "tests", ".profiles", "B");


export async function launchExtensionContextWithTwoPages() {
    const contextA = await launchExtensionContext(PROFILE_A, { headless: false, windowPosition: { x: 0, y: 0 }, windowSize: { width: 1280, height: 800 } });
    const contextB = await launchExtensionContext(PROFILE_B, { headless: false, windowPosition: { x: 1280, y: 0 }, windowSize: { width: 1280, height: 800 } });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    return { contextA, contextB, pageA, pageB };
}

export async function addConsentCookies(_context: BrowserContext) {
    // Intentionally left as a no-op for now; hook for setting consent cookies if needed.
}

export async function getShareTubeState(page: Page, opts?: { timeoutMs?: number; clickSelector?: string; labels?: string[]; }): Promise<any> {
    const timeoutMs = opts?.timeoutMs ?? 5000;
    const clickSelector = opts?.clickSelector ?? "#sharetube_log_self_button";
    const labels = opts?.labels ?? ["app state", "ShareTubeApp"]; // support both formats

    const captured = new Promise<any>((resolve, reject) => {
        const onConsole = async (msg: any) => {
            try {
                if (msg.type() !== "log") return;
                const args = msg.args();
                if (!args || args.length < 2) return;
                const first = await args[0].jsonValue().catch(() => null);
                if (!labels.includes(first)) return;
                const snapshot = await args[1].evaluate((app: any) => {
                    function isPlainObject(value: any) {
                        return Object.prototype.toString.call(value) === "[object Object]";
                    }
                    function serialize(value: any, seen: WeakSet<any>, depth: number): any {
                        if (value === null || value === undefined) return value;
                        const t = typeof value;
                        if (t === "string" || t === "number" || t === "boolean") return value;
                        if (t === "function") return undefined;
                        if (seen.has(value)) return "[Circular]";
                        if (depth > 2) return "[MaxDepth]";

                        if (typeof Element !== "undefined" && value instanceof Element) {
                            return { $el: true, tag: value.tagName, id: (value as any).id || "", class: (value as any).className || "" };
                        }
                        if (typeof Map !== "undefined" && value instanceof Map) {
                            const obj: any = {};
                            seen.add(value);
                            for (const [k, v] of value.entries()) obj[String(k)] = serialize(v, seen, depth + 1);
                            return obj;
                        }
                        if (typeof Set !== "undefined" && value instanceof Set) {
                            seen.add(value);
                            return Array.from(value.values()).map((v) => serialize(v, seen, depth + 1));
                        }
                        if (Array.isArray(value)) {
                            seen.add(value);
                            return value.map((v) => serialize(v, seen, depth + 1));
                        }
                        if (isPlainObject(value) && "value" in value && "initialValue" in value && "eventListeners" in value) {
                            return serialize((value as any).value, seen, depth + 1);
                        }
                        try {
                            if (typeof (value as any)[Symbol.iterator] === "function") {
                                seen.add(value);
                                return Array.from(value as any).map((v) => serialize(v, seen, depth + 1));
                            }
                        } catch { }

                        if (t === "object") {
                            seen.add(value);
                            const out: any = {};
                            for (const key of Object.keys(value)) {
                                try {
                                    out[key] = serialize((value as any)[key], seen, depth + 1);
                                } catch { }
                            }
                            return out;
                        }
                        return undefined;
                    }

                    const seen = new WeakSet<any>();
                    const base = serialize(app, seen, 0) || {};
                    try { (base as any).queueLength = Array.isArray((app as any).queue) ? (app as any).queue.length : (typeof (app as any).queue?.length === "number" ? (app as any).queue.length : undefined); } catch { }
                    try { (base as any).socketConnected = !!(app as any).socket?.connected; } catch { }
                    try { (base as any).userId = (app as any).userId ?? (base as any).userId; } catch { }
                    return base;
                });
                clearTimeout(timer);
                page.off("console", onConsole);
                resolve(snapshot);
            } catch { }
        };

        const timer = setTimeout(() => {
            page.off("console", onConsole);
            reject(new Error("Timed out waiting for ShareTube state log"));
        }, timeoutMs);

        // Attach listener; it will resolve once the specific log is seen
        page.on("console", onConsole);
    });

    await page.locator(clickSelector).click();
    return captured;
}

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
export async function createRoom(page: Page): Promise<string> {
    await page.locator("#sharetube_plus_button").click();
    await page.waitForTimeout(500);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    return clipboard ?? "";
}