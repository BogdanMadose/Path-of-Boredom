import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { dumpBrowserDom } from './browser-dom.mjs';

// Every overlay must fit a landscape phone without scrolling.
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!fs.existsSync(edge)) {
    console.log('SKIP: landscape fit checks require Microsoft Edge');
} else {
    const home = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
    const slice = (start, end) => home.slice(home.indexOf(start), home.indexOf(end));
    const expand = markup => markup
        .replace(/@foreach \(var skill in (CombatSkills|StarterSkills)\)\s*\{([\s\S]*?)\n\s*\}/g, (_, list, inner) =>
            (list === 'StarterSkills' ? ['a', 'b', 'c'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']).map(skill => inner.replaceAll('@skill', skill)).join(''))
        .replace(/@for \(var index = 0; index < 3; index\+\+\)\s*\{([\s\S]*?)\n\s*\}/, (_, inner) => inner.repeat(3))
        .replace(/@for \(var slot = 0; slot < 1; slot\+\+\)\s*\{([\s\S]*?)\n\s*\}/, (_, inner) => inner.replaceAll('@slot', '0'))
        .replace(/@\w+/g, '');
    const levelDraft = expand(slice('<section class="level-draft"', '<div class="overlay-card" data-run-menu>'));
    const skillChoice = expand(slice('<div class="arena-overlay skill-choice-overlay"', '<div class="arena-overlay setup-overlay"'));
    const setup = expand(slice('<div class="arena-overlay setup-overlay"', '<div class="arena-caption"'));
    const mainMenu = slice('<section class="main-menu"', '<button type="button" class="quiet-button main-menu-return"');
    const runMenuStart = home.indexOf('<div class="overlay-card" data-run-menu>');
    const runMenu = home.slice(runMenuStart, home.lastIndexOf('</div>', home.indexOf('<div class="arena-overlay skill-choice-overlay"')));
    const account = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/CloudAccountMenu.razor', import.meta.url), 'utf8');
    const accountMarkup = account.slice(account.indexOf('<div class="mm-account-body">'), account.indexOf('@if (confirmation'))
        .replace(/@if \(cloud\.AccountStatus\.SignedIn\)\s*\{([\s\S]*?)\n\s*\}\s*else\s*\{[\s\S]*?\n            \}/, '$1')
        .replace(/@if \(cloud\.AccountStatus\.SignedIn\)\s*\{/, '').replace(/@if \(lastResult is not null\)\s*\{[\s\S]*?\}/, '')
        .replace(/@\([^()]*(\([^()]*\)[^()]*)*\)/g, 'Text').replace(/@\w+(\.\w+)*/g, 'Text').replace(/\n\s*\}\s*\n/g, '\n') + '</div>';
    const css = ['../../Path of Boredom.Game/Components/Pages/Home.razor.css', '../wwwroot/css/mobile-shell.css', '../wwwroot/css/mobile-menu.css']
        .map(file => fs.readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('::deep ', '').replaceAll('@media (pointer: coarse)', '@media all')).join('\n');
    const html = `<html><head><style>html,body{margin:0}*{box-sizing:border-box}[hidden]{display:none!important}${css}
        .arena-overlay{position:fixed;inset:0;display:grid;place-items:center}</style></head>
        <body class="mobile-shell"><div class="arpg" data-canvas-hud="on" data-main-menu="on" data-game-status="paused">
        <div data-test="main">${mainMenu}</div>
        <section class="game-information mm-info-panel mm-account mm-panel mm-open" data-mm-panel="account" data-test="account"><div class="mm-head" style="order:-1">Account</div>${accountMarkup}</section>
        <div class="arena-overlay" data-test="level">${levelDraft}</div>
        <div class="arena-overlay" data-test="death">${runMenu}</div>
        <div class="arena-overlay" data-test="pause"><div class="mm-pause-card"><div class="mm-pause-side"><div class="mm-pause-emblem"></div><h2>The hollow can wait.</h2><p>Combat and game timers are paused.</p><button class="mm-resume">Return to battle</button><p class="mm-save-status mm-run-recap">Run so far: 2m 28s · 2 stages cleared · 185 kills · 0 flasks used · 195 gold spent · 0 challenges completed. Damage dealt: Cleave: 33406 · Cinder relay: 7610 · Blazing cross: 1060.</p><button class="mm-pause-option mm-pause-footer">Main menu</button></div><div class="mm-pause-groups"><section class="mm-menu-group"><h3>Character</h3><button class="mm-pause-option">Skills &amp; loadout</button><button class="mm-pause-option">Forge &amp; equipment</button><button class="mm-pause-option">Stage challenges — bonus gold</button><button class="mm-pause-option">Run options — sound &amp; practice</button></section><section class="mm-menu-group"><h3>Community</h3><button class="mm-pause-option">Rankings</button><button class="mm-pause-option">Chapter lore</button></section><section class="mm-menu-group mm-progress-group"><h3>Progress</h3><div class="mm-save-actions"><button class="mm-pause-option">Save to cloud</button><button class="mm-pause-option">Load cloud save</button><button class="mm-pause-option">Account &amp; cloud</button></div><p class="mm-save-status">Level-up boon selected. Save to keep it, or continue to the next autosaved checkpoint.</p></section></div></div></div>${skillChoice}${setup}</div><script>
        const report = [];
        const fill = (selector, text) => document.querySelectorAll(selector).forEach(e => e.textContent = text);
        fill('[data-card-category]', 'CRITICAL CHANCE'); fill('[data-card-name]', 'A shattering dawn');
        fill('[data-card-description]', '+2% crit chance per rank (cap 75%).'); fill('[data-card-rank]', 'Rank 1 / 10');
        fill('[data-skill-name]', 'Arcane bloom'); fill('[data-skill-description]', 'Erupts a blooming ring of arcane light around you, damaging nearby enemies.');
        fill('[data-skill-choice-description]', 'New skill at levels 10 and 20. Locked for this run.');
        fill('[data-setup-description]', 'Locked for this run. Starting replaces your current character.');
        fill('[data-setup-unlock]', 'Pick a starter. More skills at levels 10 and 20.');
        fill('[data-setup-loadout-feedback]', 'Ember nova: Bursts fire around you, striking every nearby enemy.');
        document.querySelector('[data-skill-choice]').hidden = false;
        document.querySelector('[data-setup]').hidden = false;
        document.querySelector('[data-level-draft]').hidden = false;
        document.querySelector('[data-setup-loadout]').hidden = false;
        document.querySelector('[data-class-preview]').hidden = true;
        const death = document.querySelector('[data-test="death"]');
        death.querySelector('[data-overlay-kicker]').textContent = 'YOU HAVE FALLEN';
        death.querySelector('[data-overlay-title]').textContent = 'The ember fades.';
        death.querySelector('[data-overlay-description]').textContent = 'Wave 14 on Nightmare. Load your checkpoint or begin again.';
        death.querySelector('[data-killing-blow]').textContent = 'Killing blow: Ashbound Reaver charge for 84 damage.';
        death.querySelector('[data-damage-history]').innerHTML = Array.from({ length: 12 }, (_, i) => '<li>Ashbound Reaver charge — ' + (20 + i) + ' damage</li>').join('');
        death.querySelector('[data-death-report]').hidden = false;
        death.querySelector('[data-run-summary]').hidden = false;
        death.querySelector('[data-summary-text]').textContent = 'Run so far: 14 waves, 512 kills, 3 bosses, 9,240 gold earned.';
        death.querySelector('[data-action="restart"]').hidden = false;
        death.querySelector('[data-action="start"]').textContent = 'Travel to The Drowned Wilds';
        death.querySelector('[data-action="endless"]').hidden = false;
        death.querySelector('[data-action="endless"]').textContent = 'New Endless Watch run';
        death.querySelector('[data-stat="checkpoint-save"]').textContent = 'Checkpoint saved at wave 13.';
        death.querySelector('[data-loading]').hidden = true;
        for (const label of ['Save on device', 'Load saved run', 'Account & cloud']) {
            const button = document.createElement('button'); button.className = 'mm-pause-option'; button.textContent = label; death.querySelector('[data-run-menu]').appendChild(button);
        }
        const actions = document.querySelector('[data-main-menu-actions]');
        for (const label of ['Save on device', 'Account & cloud', 'Rankings', 'Skills & loadout', 'Forge & equipment']) {
            const button = document.createElement('button'); button.className = 'mm-pause-option'; button.textContent = label; actions.appendChild(button);
        }
        const overlays = { level: '[data-test="level"]', death: '[data-test="death"]', skill: '[data-skill-choice]', setup: '[data-setup]', tutorial: '[data-setup]', main: '.main-menu', account: '[data-test="account"]', pause: '[data-test="pause"]' };
        window.measure = () => {
            for (const [name, selector] of Object.entries(overlays)) {
                const overlay = document.querySelector(selector);
                for (const other of new Set(Object.values(overlays))) document.querySelector(other).style.display = other === selector ? '' : 'none';
                if (selector === '[data-setup]') {
                    const touring = name === 'tutorial';
                    overlay.dataset.tutorial = touring ? 'on' : 'off';
                    for (const hidden of ['[data-setup-loadout]', '[data-setup-difficulty]', '[data-class-picker]']) overlay.querySelector(hidden).hidden = touring;
                    overlay.querySelector('[data-setup-skip]').hidden = !touring;
                    if (touring) {
                        overlay.querySelector('[data-setup-title]').textContent = 'Read danger before it strikes';
                        overlay.querySelector('[data-setup-description]').textContent = 'Tap Dodge to roll and the flask to heal (max 5). Step out of marked circles and lanes.';
                        overlay.querySelector('[data-setup-step]').textContent = 'QUICK GUIDE 2 / 3';
                    }
                }
                const card = overlay.querySelector('[data-run-menu], .overlay-card, .level-draft, .main-menu-card, .mm-account-body, .mm-pause-card') ?? overlay;
                // The death report itself is reading material and may scroll inside its own box.
                const scrollable = new Set(overlay.querySelectorAll('.death-report'));
                for (const element of [overlay, card]) if (element.scrollHeight > element.clientHeight + 1) report.push(name + ' ' + innerWidth + 'x' + innerHeight + ' overflow ' + (element.scrollHeight - element.clientHeight) + 'px [' + [...card.children].map(c => c.tagName + ':' + Math.round(c.getBoundingClientRect().height)).join(',') + ']');
                const bottom = Math.min(innerHeight, overlay.getBoundingClientRect().bottom);
                for (const button of overlay.querySelectorAll('button')) {
                    if (!button.getBoundingClientRect().height || button.children.length) continue;
                    const range = document.createRange(); range.selectNodeContents(button);
                    const text = range.getBoundingClientRect(), box = button.getBoundingClientRect();
                    if (text.width && (text.left < box.left - 1 || text.right > box.right + 1 || text.bottom > box.bottom + 1)) report.push(name + ' button label cut off: ' + button.textContent.trim().slice(0, 30));
                }
                if (name === 'death') {
                    const visible = [...overlay.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height);
                    const primary = visible.filter(b => b.classList.contains('ember-button'));
                    const secondary = visible.filter(b => !b.classList.contains('ember-button'));
                    const lowestPrimary = Math.max(...primary.map(b => b.getBoundingClientRect().bottom));
                    if (secondary.some(b => b.getBoundingClientRect().top < lowestPrimary - 1)) report.push('death: secondary buttons share a row with the main actions');
                    const widths = new Set(secondary.map(b => Math.round(b.getBoundingClientRect().width)));
                    if (widths.size > 1) report.push('death: secondary buttons have uneven widths ' + secondary.map(b => b.textContent.trim().slice(0, 12) + '=' + Math.round(b.getBoundingClientRect().width)).join('/'));
                }
                for (const button of overlay.querySelectorAll('button')) {
                    if ([...scrollable].some(box => box.contains(button))) continue;
                    const rect = button.getBoundingClientRect();
                    if (rect.height && rect.bottom > bottom + 1) report.push(name + ' button off-screen: ' + button.textContent.trim().slice(0, 30));
                }
                if (name === 'tutorial') {
                    const text = overlay.querySelector('[data-setup-description]');
                    if (!text.getBoundingClientRect().height) report.push('tutorial text hidden at ' + innerWidth + 'x' + innerHeight);
                    if (!overlay.querySelector('[data-setup-skip]').getBoundingClientRect().height) report.push('tutorial skip hidden');
                }
            }
            document.body.dataset.result = report.length ? report.join(' | ') : 'PASS';
        };
        try { measure(); } catch (e) { document.body.dataset.result = 'ERR ' + e.message; }
        </script></body></html>`;
    const server = http.createServer((request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(html); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const failures = [];
    try {
        for (const [width, height] of [[640, 360], [740, 360], [915, 412], [1280, 720], [1366, 768], [1920, 1080]]) {
            // Headless Edge reserves 24px x 92px of window chrome; compensate so the page itself is phone-sized.
            const output = await dumpBrowserDom(edge, ['--virtual-time-budget=3000', `--window-size=${width + 24},${height + 92}`, `http://127.0.0.1:${server.address().port}/`]);
            const result = output.match(/data-result="([^"]*)"/)?.[1];
            if (result !== 'PASS') failures.push(`${width}x${height}: ${result}`);
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
    assert.deepEqual(failures, [], failures.join('\n'));
    console.log('PASS: main menu, account, death/run-end card, level-up, level 10/20 skill choice, campaign setup and first-run tutorial fit landscape phones without scrolling');
}
