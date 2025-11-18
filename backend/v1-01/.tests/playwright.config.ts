/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Resolve the unpacked Chrome extension path to the repo's `extension/` directory.
// This avoids relying on the current working directory and prevents Windows UNC issues under WSL.
const EXTENSION_PATH = path.join(process.cwd(), 'extension');
const BROWSER_PATH = path.join(process.cwd(), '.browsers/chromium-1194/chrome-linux/chrome');

export default defineConfig({
  testDir: __dirname,
  // Write all Playwright output to a repo-local directory to avoid defaulting to C:\Windows\test-results
  // when a Windows shim accidentally launches. This path works on Linux/WSL and Windows.
  outputDir: path.join(__dirname, ".tests", "test-results"),
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // Use a deterministic HTML report path rooted in the tests directory.
  reporter: [['list'], ['html', { outputFolder: path.join(__dirname, '.tests', 'report') }]],
  use: {
    headless: process.env.HEADLESS === '1' || process.env.CI === 'true',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: BROWSER_PATH,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-features=IsolateOrigins,site-per-process',
        '--autoplay-policy=no-user-gesture-required'
      ]
    }
  }
});


