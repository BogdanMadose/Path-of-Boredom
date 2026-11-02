import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

// Run against a locally started Itch host; no sign-in or save data is needed.
const url = process.argv[2];
if (!url) throw new Error('Pass the local Itch URL, e.g. http://127.0.0.1:5098');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pob-smoke-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let next = 0;
    const pending = new Map(), errors = [];
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        if (message.id) {
            const callback = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
            else callback.resolve(message.result);
        }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++next;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, includeCommandLineAPI: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    };
    const wait = async expression => {
        for (let i = 0; i < 300; i++) { if (await evaluate(expression)) return; await sleep(200); }
        const state = await evaluate(`JSON.stringify({root: document.querySelector('.arpg')?.dataset, options: document.querySelector('.options-panel')?.className, main: document.querySelector('[data-main-menu]')?.hidden, lore: document.querySelector('[data-lore-reader]')?.hidden, optionsButton: document.querySelector('[data-main-options]')?.outerHTML, optionListeners: getEventListeners(document.querySelector('[data-main-options]')).click?.length, menuListeners: getEventListeners(document.querySelector('.arpg'))['mobile-menu']?.length})`);
        throw new Error('Timed out: ' + expression + '\n' + state + '\n' + errors.join('\n'));
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.__audioContexts = []; window.__audioMeters = []; window.__audioFaults = [];
        const NativeContext = window.AudioContext;
        window.AudioContext = new Proxy(NativeContext, { construct(target, args) {
            const context = new target(...args); window.__audioContexts.push(context); return context;
        }});
        const connect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function(target, ...args) {
            if (target === this.context.destination) {
                const meter = this.context.createAnalyser();
                window.__audioMeters.push(meter);
                connect.call(this, meter); return connect.call(meter, target, ...args);
            }
            return connect.call(this, target, ...args);
        };
        for (const name of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) {
            const original = AudioParam.prototype[name];
            AudioParam.prototype[name] = function(...args) {
                try { return original.apply(this, args); }
                catch (error) { window.__audioFaults.push(name + ': ' + error.message); throw error; }
            };
        }
    ` });
    for (const [desktop, width, height] of [[true, 1280, 800], [false, 844, 390]]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: !desktop });
        await send('Emulation.setTouchEmulationEnabled', { enabled: !desktop, maxTouchPoints: desktop ? 1 : 5 });
        await send('Page.navigate', { url });
        await wait(`document.querySelector('.arpg')?.dataset.gameStatus === 'ready' && document.querySelector('.arpg')?.dataset.saveBusy === 'off' && !!document.querySelector('.mm-layer') && !document.querySelector('#boot-splash')`);
        assert.equal(await evaluate('window.pobDesktopShell'), desktop);
        assert.equal(await evaluate(`document.querySelector('.arpg').dataset.autoAttack`), 'on', 'Itch uses automatic targeting on desktop and touch');
        assert.equal(await evaluate(`document.getElementById('mobile-shell-css').disabled`), desktop);
        assert.equal(await evaluate(`document.getElementById('mobile-menu-css').disabled`), false);
        await evaluate(`document.querySelector('[data-main-account]').click()`);
        await wait(`document.querySelector('.options-panel').classList.contains('mm-open') && document.querySelector('.options-panel').dataset.mobileSection === 'account'`);
        assert.ok(await evaluate(`!!document.querySelector('.account-intro')`), 'signed-out account explains cloud saves and optional offline play');
        await evaluate(`document.querySelector('.options-panel .mm-close').click()`);
        assert.equal(await evaluate(`document.querySelector('.arpg').dataset.mainMenu`), 'on', 'direct Account Back returns to main');
        const playPoint = await evaluate(`(() => { const r = document.querySelector('[data-main-play]').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
        if (desktop) {
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...playPoint, button: 'left', clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...playPoint, button: 'left', clickCount: 1 });
        } else {
            await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [playPoint] });
            await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        }
        let sound = false;
        for (let attempt = 0; attempt < 30 && !sound; attempt++) {
            await sleep(100);
            sound = await evaluate(`window.__audioMeters.some(meter => { const samples = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(samples); return samples.some(value => Math.abs(value) > 0.00001); })`);
        }
        const audio = await evaluate(`({states:window.__audioContexts.map(c=>c.state), faults:window.__audioFaults})`);
        assert.ok(sound, 'real browser audio output after gesture: ' + JSON.stringify(audio));
        assert.deepEqual(audio.faults, [], 'no invalid Web Audio scheduling');
        assert.equal(await evaluate(`document.querySelector('[data-main-play-menu]').hidden`), false, 'Play opens its choices');
        assert.equal(await evaluate(`document.querySelector('.options-panel').classList.contains('mm-open')`), false, 'Play does not open Options');
        await evaluate(`document.querySelector('[data-close-play-menu]').click(); document.querySelector('[data-main-options]').click()`);
        await wait(`document.querySelector('.options-panel').classList.contains('mm-open')`);
        await evaluate(`Array.from(document.querySelectorAll('.options-panel .mm-subtab')).find(b => b.textContent.includes('Account')).click()`);
        assert.equal(await evaluate(`document.querySelector('.options-panel').dataset.mobileSection`), 'account');
        assert.ok(await evaluate(`(() => { const a = document.querySelector('.mm-account-body').getBoundingClientRect(), b = document.querySelector('.run-options').getBoundingClientRect(); return a.width > b.width - 30 && a.top - b.top < 12; })()`), 'real Account component starts at tab edge');
        await evaluate(`document.querySelector('.options-panel .mm-close').click()`);
        assert.equal(await evaluate(`document.querySelector('.arpg').dataset.mainMenu`), 'on', 'Options Back returns to main');
        await evaluate(`document.querySelector('[data-main-play]').click(); document.querySelector('[data-main-new]').click()`);
        await wait(`!document.querySelector('[data-setup]').hidden`);
        assert.equal(await evaluate(`document.querySelector('.options-panel').classList.contains('mm-open')`), false, 'Campaign opens setup, not Options');
        await evaluate(`document.querySelector('[data-setup-cancel]').click()`);
        // Exercise the real information-panel handler even before starting a run.
        await evaluate(`document.querySelector('.arpg').dispatchEvent(new CustomEvent('open-main-panel')); Array.from(document.querySelectorAll('.mm-pause-option')).find(b => b.textContent === 'Rankings').click()`);
        await wait(`document.querySelector('[data-game-rankings]').classList.contains('mm-open')`);
        const ranking = await evaluate(`(() => { const b = document.querySelector('[data-rankings-refresh]'), r = b.getBoundingClientRect(); return { visible: r.width > 0 && r.height > 0 && r.bottom <= innerHeight && b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)), height: document.querySelector('.rankings').clientHeight }; })()`);
        assert.ok(ranking.visible && ranking.height > 100, 'real Rankings filters visible and content not clipped');
        await evaluate(`document.querySelector('[data-game-rankings] .mm-close').click()`);
        assert.equal(await evaluate(`document.querySelector('.arpg').dataset.mainMenu`), 'on', 'Rankings Back returns to main');
        console.log(`PASS: live Itch ${desktop ? 'desktop' : 'touch'} Play, Campaign setup, Options/Account and Rankings rendering/back navigation`);
    }
    assert.deepEqual(errors, [], 'no browser runtime exceptions');
} finally {
    socket?.close();
    if (browser.pid) spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { }
}
