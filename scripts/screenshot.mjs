#!/usr/bin/env node
/**
 * Screenshots of the app for the README (both languages share them): the sheet with its sprites found, and the
 * Background tab with a tolerance typed in place.
 *
 *   npm run screenshot                                         starts its own dev server on a spare port
 *   SCREENSHOT_URL=http://localhost:5173 npm run screenshot    use a server that is already running
 *
 * Needs Chrome or Edge installed (driven through playwright-core, nothing is downloaded).
 * Output: docs/media/sheet.png, background.png. The example sheet is drawn in code, so every run is the same.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'media');
mkdirSync(OUT, { recursive: true });

async function waitFor(url, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        try {
            if ((await fetch(url)).ok) return;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`The dev server did not come up at ${url}`);
}

async function startServer() {
    if (process.env.SCREENSHOT_URL) return { url: process.env.SCREENSHOT_URL, stop() {} };
    const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    const port = 5195;
    const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    const url = `http://localhost:${port}`;
    await waitFor(url);
    return { url, stop: () => child.kill() };
}

async function launch() {
    for (const channel of ['chrome', 'msedge']) {
        try {
            return await chromium.launch({ channel });
        } catch {
            // try the next one
        }
    }
    throw new Error('Neither Chrome nor Edge could be launched');
}

const server = await startServer();
const browser = await launch();
try {
    const shot = async (page, name) => {
        await page.screenshot({ path: join(OUT, `${name}.png`) });
        console.log(`docs/media/${name}.png`);
    };

    /** A fresh page: clean storage, the chosen language and theme, the example opened. */
    const open = async (locale, scheme) => {
        const context = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1, colorScheme: scheme, locale });
        const page = await context.newPage();
        await page.addInitScript(() => localStorage.clear());
        await page.goto(server.url);
        await page.getByRole('button', { name: /example|пример/i }).click();
        await page.waitForTimeout(900);
        return page;
    };

    // 1. The sheet: the sprites found.
    {
        const page = await open('en-US', 'dark');
        await shot(page, 'sheet');
        await page.context().close();
    }

    // 2. The Background tab: one tolerance is being typed straight into the bar, the other shows its name and value.
    {
        const page = await open('en-US', 'dark');
        await page.getByRole('tab', { name: /Background/ }).click();
        await page.getByRole('button', { name: 'Add colour' }).click();
        // Enter on a thumb opens the field without touching the value (a click on the rail would move it).
        await page.locator('.tolerance [role=slider]').first().focus();
        await page.keyboard.press('Enter');
        await page.keyboard.type('12');
        await page.waitForTimeout(200);
        await shot(page, 'background');
        await page.keyboard.press('Escape');
        await page.context().close();
    }
} finally {
    await browser.close();
    server.stop();
}
