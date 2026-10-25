import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { dumpBrowserDom } from './browser-dom.mjs';

// The Ember Camp must fit landscape phones without scrolling, horizontal overflow, or a hidden Back button.
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!fs.existsSync(edge)) {
    console.log('SKIP: Ember Camp landscape checks require Microsoft Edge');
} else {
    const home = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
    const camp = home.slice(home.indexOf('<section class="ember-camp"'), home.indexOf('</section>', home.indexOf('<section class="ember-camp"')) + 10);
    assert.doesNotMatch(camp, /relic codex|data-relic-codex/i, 'run relic records are no longer shown in Account Progression');
    const css = ['../../Path of Boredom.Game/Components/Pages/Home.razor.css', '../wwwroot/css/mobile-shell.css', '../wwwroot/css/mobile-menu.css']
        .map(file => fs.readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('::deep ', '').replaceAll('@media (pointer: coarse)', '@media all')).join('\n');
    const node = (name, detail, price, cls = '') => `<button class="quiet-button camp-node ${cls}"><b>${name}</b><small>${detail}</small><small>${price}</small></button>`;
    const nodes = node('Ember might 0/10', '+2% base damage per rank.', '40 Embers · need 26 more', 'is-unaffordable')
        + node('Spare flask 0/2', 'Start every run with +1 flask charge per rank.', '150 Embers · need 136 more', 'is-unaffordable')
        + node("Pilgrim's purse 0/5", 'Start every run with +40 gold per rank.', 'Buy · 60 Embers')
        + node('Second sight 3/3', '+1 level-up card reroll per run, per rank.', 'Maxed', 'is-maxed');
    const row = (title, hint, select) => `<div class="camp-mastery-row"><strong>${title}</strong><div class="camp-mastery-bar"><i style="width:40%"></i></div><small>${hint}</small>${select ? '<select><option>Default trim</option><option>Gilded trim</option></select>' : ''}</div>`;
    const mastery = row('Ember Knight · Mastery 4/30', 'Next at 6: new starting skill (Blazing cross)', true) + row('Dawn Ranger · Mastery 1/30', 'Next at 3: Gilded trim', false)
        + '<div class="camp-mastery-row"><strong>🔒 Iron Warden</strong><small>Beat the campaign with the Ember Knight or Dawn Ranger to unlock.</small></div>'
        + '<div class="camp-mastery-row"><strong>🔒 Astral Sorcerer</strong><small>Beat the campaign with the Iron Warden to unlock.</small></div>';
    const html = `<html><head><style>html,body{margin:0}*{box-sizing:border-box}[hidden]{display:none!important}${css}</style></head>
        <body class="mobile-shell"><div class="arpg" data-canvas-hud="on" data-main-menu="on">${camp.replace(' hidden', '')}</div><script>
        const report = [];
        try {
            const q = s => document.querySelector(s);
            q('[data-camp-balance]').textContent = '14 Embers · earned every run, even when you fall.';
            q('[data-camp-nodes]').innerHTML = ${JSON.stringify(nodes)};
            q('[data-camp-mastery]').innerHTML = ${JSON.stringify(mastery)};
            const overlay = q('[data-ember-camp]'), card = q('.ember-camp-card');
            const style = getComputedStyle(overlay);
            if (style.position !== 'fixed') report.push('camp is not an overlay (' + style.position + ')');
            const box = card.getBoundingClientRect();
            if (box.top < -1 || box.bottom > innerHeight + 1 || box.left < -1 || box.right > innerWidth + 1) report.push('card outside viewport ' + JSON.stringify([box.top, box.bottom, box.left, box.right]));
            if (card.scrollWidth > card.clientWidth + 1) report.push('horizontal overflow ' + (card.scrollWidth - card.clientWidth));
            if (card.scrollHeight > card.clientHeight + 1) report.push('camp needs scrolling ' + card.scrollHeight + '/' + card.clientHeight);
            for (const el of card.querySelectorAll('button, .camp-relic, .camp-mastery-row')) {
                const r = el.getBoundingClientRect();
                if (r.width > box.width + 1) report.push('element wider than card: ' + el.textContent.trim().slice(0, 20));
                if (el.scrollWidth > el.clientWidth + 1) report.push('text overflows: ' + el.textContent.trim().slice(0, 20));
            }
            const back = q('[data-close-camp]');
            const b = back.getBoundingClientRect();
            for (const s of card.querySelectorAll('.camp-node small, .camp-relic small')) {
                const r = s.getBoundingClientRect(), p = s.parentElement.getBoundingClientRect();
                if (r.height < 8 || r.bottom > p.bottom + 1 || r.bottom > box.bottom + 1) report.push('description hidden: ' + s.textContent.trim().slice(0, 20));
                if (r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom) report.push('Back covers text: ' + s.textContent.trim().slice(0, 20));
            }
            if (b.bottom > innerHeight + 1 || b.height < 22) report.push('Back button unreachable/too small ' + b.bottom + '/' + b.height);
            report.push('INFO content ' + card.scrollHeight + '/' + card.clientHeight);
        } catch (e) { report.push('ERR ' + e.message); }
        document.body.dataset.result = report.join(' | ');
        </script></body></html>`;
    const server = http.createServer((request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const failures = [];
    try {
        for (const [width, height] of [[640, 360], [740, 360], [915, 412], [1280, 720], [1366, 768], [1920, 1080]]) {
            const output = await dumpBrowserDom(edge, ['--virtual-time-budget=3000', `--window-size=${width + 24},${height + 92}`, `http://127.0.0.1:${server.address().port}/`]);
            const result = (output.match(/data-result="([^"]*)"/)?.[1] ?? 'no result').replaceAll('&amp;', '&');
            const problems = result.split(' | ').filter(item => item && !item.startsWith('INFO'));
            console.log(`${width}x${height}: ${result}`);
            if (problems.length) failures.push(`${width}x${height}: ${problems.join(' | ')}`);
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
    assert.deepEqual(failures, [], failures.join('\n'));
    console.log('PASS: Ember Camp fits landscape phones and desktop without scrolling or horizontal overflow, Back visible');
}
