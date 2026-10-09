import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { HERO_CLASSES } from '../../Path of Boredom.Game/wwwroot/js/arpg-classes.js';
import { SKILL_KEYS, skillIcon, skillName } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const assets = new Map();
for (const heroClass of Object.keys(HERO_CLASSES)) for (const skill of SKILL_KEYS) {
    const url = skillIcon({ heroClass }, skill);
    assert.ok(url.startsWith('/_content/PathOfBoredom.Game/images/skills/'), 'icons must resolve independently of the stylesheet URL');
    const svg = read(`Path of Boredom.Game/wwwroot/${url.replace('/_content/PathOfBoredom.Game/', '')}`);
    assert.ok(svg.includes(`<title>${skillName({ heroClass }, skill)}</title>`));
    assets.set(url, svg);
}
assert.equal(new Set(Object.keys(HERO_CLASSES).map(heroClass => skillIcon({ heroClass }, 'attack'))).size, 3);
const menu = read('Path of Boredom.Maui/wwwroot/js/mobile-menu.js');
const treeArt = vm.runInNewContext(`(${menu.slice(menu.indexOf('function treeArt('), menu.indexOf('    // ---- Panel construction'))})`);
for (const heroClass of Object.keys(HERO_CLASSES)) for (const skill of SKILL_KEYS) {
    assert.equal(treeArt({ dataset: { heroClass, treeSkill: skill } }), skillIcon({ heroClass }, skill), 'initial mobile tabs use the same shared URLs');
}
const css = read('Path of Boredom.Game/Components/Pages/Home.razor.css');
const mobileCss = read('Path of Boredom.Maui/wwwroot/css/mobile-shell.css');
assert.match(css, /\.tree-node-icon\s*\{[^}]*background: var\(--skill-art\)/);
assert.match(mobileCss, /\[data-run-menu\]\s*\{[^}]*overflow-y: auto;[^}]*touch-action: pan-y;/);
assert.match(css, /data-game-status="dead"[^}]*grid-template-rows: minmax\(0, 1fr\)/);
console.log('PASS: every skill has a shared SVG, class-specific basic attacks, matching mobile-tab URLs, and death-scroll rules');

const edge = process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe');
if (edge && fs.existsSync(edge)) {
    const page = read('Path of Boredom.Game/Components/Pages/Home.razor');
    const start = page.indexOf('<div class="overlay-card" data-run-menu>');
    const end = page.indexOf('<div class="arena-overlay skill-choice-overlay"', start);
    const runMenu = page.slice(start, end).replace('data-death-report hidden', 'data-death-report')
        .replace('<ol data-damage-history></ol>', `<ol data-damage-history>${Array.from({ length: 12 }, (_, i) => `<li>Hit ${i + 1}: enemy attack — 24 health lost after protection.</li>`).join('')}</ol>`);
    const checks = `
        function check(condition, message) { if (!condition) throw new Error(message); }
        const viewport = document.querySelector('.arena-viewport');
        const card = document.querySelector('[data-run-menu]');
        const report = document.querySelector('.death-report');
        for (const height of [180, 280, 600]) {
            viewport.style.cssText = 'width:650px;height:' + height + 'px;';
            card.scrollTop = 0;
            check(getComputedStyle(card).overflowY === 'auto', 'whole card must scroll');
            check(getComputedStyle(card).touchAction === 'pan-y', 'touch scrolling must be allowed');
            check(getComputedStyle(report).overflowY === 'visible', 'report must not trap scrolling');
            check(getComputedStyle(report.querySelector('ol')).overflowY === 'visible', 'hit list must not trap scrolling');
            check(card.clientHeight <= viewport.clientHeight, 'card must fit the arena');
            if (height < 300) {
                check(card.scrollHeight > card.clientHeight, 'short screens need overflow');
                card.scrollTop = card.scrollHeight;
                check(card.scrollTop > 0, 'card must actually scroll');
                const action = card.querySelector('[data-action="start"]').getBoundingClientRect();
                const bounds = card.getBoundingClientRect();
                check(action.top >= bounds.top - 1 && action.bottom <= bounds.bottom + 1, 'primary action must be reachable');
            }
        }
        const parser = new DOMParser();
        for (const url of ${JSON.stringify([...assets.keys()])}) {
            const response = await fetch(url);
            check(response.ok, 'missing asset: ' + url);
            check(!parser.parseFromString(await response.text(), 'image/svg+xml').querySelector('parsererror'), 'invalid SVG: ' + url);
        }
    `;
    const html = `<html><head><style>html,body{margin:0}${css}${mobileCss.replace('@media (pointer: coarse)', '@media all')}</style></head>
        <body class="mobile-shell"><div class="arpg" data-game-status="dead"><main class="game-shell"><div class="game-grid"><section class="arena-section"><div class="combat-view"><div class="arena-viewport"><div class="arena-overlay" data-overlay>${runMenu}</div></div></section></div></main></div>
        <script>(async () => { try { ${checks}; document.body.dataset.result = 'PASS'; } catch (error) { document.body.dataset.result = error.message; } })();</script></body></html>`;
    const server = http.createServer((request, response) => {
        response.setHeader('Content-Type', assets.has(request.url) ? 'image/svg+xml' : 'text/html');
        response.end(assets.get(request.url) ?? html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = path.join(root, '.copilot-validation/death-scroll-browser');
    try {
        const result = await new Promise((resolve, reject) => {
            const child = spawn(edge, ['--headless', '--disable-gpu', '--dump-dom', '--virtual-time-budget=5000', '--window-size=740,360', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/`]);
            let output = '', errors = '';
            child.stdout.on('data', data => output += data);
            child.stderr.on('data', data => errors += data);
            const timeout = setTimeout(() => { child.kill(); reject(new Error('Browser test timed out')); }, 30000);
            child.on('error', error => { clearTimeout(timeout); reject(error); });
            child.on('close', code => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(new Error(errors)); });
        });
        assert.match(result, /data-result="PASS"/, result.match(/data-result="[^"]*"/)?.[0] ?? 'Browser checks did not finish');
        console.log('PASS: browser-verified death-card scrolling and reachable actions at 180/280/600px arena heights; all SVGs load and parse');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
} else {
    console.log('SKIP: browser geometry checks require Microsoft Edge');
}
