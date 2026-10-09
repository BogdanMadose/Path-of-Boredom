import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function dumpBrowserDom(browser, args, timeoutMs = 30000) {
    const folder = fileURLToPath(new URL('../../.copilot-validation/', import.meta.url));
    fs.mkdirSync(folder, { recursive: true });
    const profile = fs.mkdtempSync(path.join(folder, 'layout-browser-'));
    try {
        return await new Promise((resolve, reject) => {
            const child = spawn(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--dump-dom', `--user-data-dir=${profile}`, ...args], { windowsHide: true });
            let output = '', errors = '', finished = false;
            const stop = () => {
                if (!child.pid) return;
                if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 5000, windowsHide: true });
                else child.kill();
            };
            const finish = error => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                stop();
                if (error) reject(error);
                else resolve(output);
            };
            const timer = setTimeout(() => finish(new Error(`Browser DOM dump timed out. ${errors.slice(-2000)}`)), timeoutMs);
            child.stdout.on('data', data => {
                output += data;
                // Edge can finish its DOM dump without terminating its background services.
                if (output.includes('</html>')) finish();
            });
            child.stderr.on('data', data => { errors = (errors + data).slice(-4000); });
            child.on('error', error => finish(error));
            child.on('close', code => {
                if (!finished) finish(new Error(`Browser exited (${code}) before completing its DOM dump. ${errors}`));
            });
        });
    } finally {
        try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* A delayed browser shutdown can temporarily retain profile locks. */ }
    }
}
