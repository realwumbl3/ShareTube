/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Resolve the unpacked Chrome extension path to the repo's `extension/` directory.
// This avoids relying on the current working directory and prevents Windows UNC issues under WSL.
const EXTENSION_PATH = path.join(process.cwd(), 'extension');

export default defineConfig({
  testDir: __dirname,
  // Write all Playwright output to a repo-local directory to avoid defaulting to C:\Windows\test-results
  // when a Windows shim accidentally launches. This path works on Linux/WSL and Windows.
  outputDir: path.join(__dirname, "tests", "test-results"),
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // Use a deterministic HTML report path rooted in the tests directory.
  reporter: [['list'], ['html', { outputFolder: path.join(__dirname, 'tests', 'report') }]],
  use: {
    headless: process.env.HEADLESS === '1' || process.env.CI === 'true',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: (() => {
        // Prefer repo-local Chromium installed under .browsers
        const repoRoot = path.join(__dirname, '..');
        const browsersDir = path.join(repoRoot, '.browsers');
        if (fs.existsSync(browsersDir)) {
          const candidates = ['chrome', 'chromium'];
          // Shallow scan a few common nesting levels
          const queue = [browsersDir];
          const visited = new Set<string>();
          while (queue.length) {
            const dir = queue.shift()!;
            if (visited.has(dir)) continue;
            visited.add(dir);
            let entries: string[] = [];
            try {
              entries = fs.readdirSync(dir).map((n) => path.join(dir, n));
            } catch { /* ignore */ }
            for (const p of entries) {
              let stat; try { stat = fs.statSync(p); } catch { continue; }
              if (stat.isDirectory()) {
                // Avoid descending too deep
                if (dir.split(path.sep).length - browsersDir.split(path.sep).length < 6) queue.push(p);
              } else if (stat.isFile()) {
                const base = path.basename(p);
                if (candidates.includes(base)) {
                  try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* not executable */ }
                }
              }
            }
          }
        }
        return undefined;
      })(),
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    }
  }
});


