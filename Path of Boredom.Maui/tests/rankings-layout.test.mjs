import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dumpBrowserDom } from './browser-dom.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const page = fs.readFileSync(path.join(root, 'Path of Boredom.Game/Components/Pages/Rankings.razor'), 'utf8');
const css = fs.readFileSync(path.join(root, 'Path of Boredom.Game/Components/Pages/Rankings.razor.css'), 'utf8');
assert.match(page, /class="class-boards"/);
assert.match(page, /rows\.GroupBy\(row => row\.HeroClass\)/);
assert.match(page, /data-hero-class="@board.Key"/);
assert.match(page, /Automatic skills:<\/strong>/);
assert.match(page, /build\.Equipment is \{ \} equipment/);
assert.match(page, /RankingRules\.WeaponStyleName\(equipment\.WeaponStyle\)/);
assert.match(page, /RankingRules\.ArmorStyleName\(equipment\.ArmorStyle\)/);
assert.match(page, /Equipment was not recorded for this older build/);
assert.ok(!page.includes('build.ManualSkill'), 'manual skill is omitted from every build overview');
assert.match(page, /row\.AchievedAt/);
assert.match(page, /row\.IsCurrentUser/);
assert.match(page, /build\.Upgrades\.GroupBy/);
assert.match(css, /\.ranking-cards\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
console.log('PASS: class-grouped ranking cards preserve records, automatic skills and upgrades without manual-skill lines');

const edge = process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe');
if (edge && fs.existsSync(edge)) {
    const folder = path.join(root, '.copilot-validation');
    fs.mkdirSync(folder, { recursive: true });
    const fixture = path.join(folder, 'rankings-layout.html');
    const boards = ['knight', 'ranger', 'warden'].map(hero => `<section class="class-board" data-hero-class="${hero}">
        <div class="class-heading"><h2>${hero}</h2><span>2 players</span></div><div class="ranking-cards">
        ${[1, 2].map(rank => `<article class="ranking-card"><div class="record-heading"><span class="rank">#${rank}</span>
            <strong>VeryLongPlayerNickname24<small>YOU</small></strong><span class="record-score"><span class="score">123,456</span><small>BEST KILLS</small></span></div>
            <p class="record-date">2026-01-01 12:00 UTC</p><details class="build-details" open><summary>Level 32 · Build details</summary>
            <p><strong>Automatic skills:</strong> Cinder relay, Execution arc, Sun spear</p>
            ${rank === 1 ? `<section class="build-equipment" aria-label="Equipment and trade-offs"><h3>Equipment &amp; trade-offs</h3>
                <p><strong>Weapon:</strong> VeryLongEquipmentNameThatNeedsWrapping · equipment rating 600<br />Heavy edge — +20% damage; -15% cooldown recovery</p>
                <p><strong>Armor:</strong> Starwoven mantle · equipment rating 40<br />Light weave — -8 armor; +12% movement speed</p>
                <small>Equipment ratings are separate from the Forge ranks below.</small></section>`
                : '<p class="build-unavailable">Equipment was not recorded for this older build.</p>'}<h3>Skill upgrades</h3>
            <ul><li>VeryLongUpgradeNameThatNeedsWrapping <strong>rank 3</strong></li></ul></details></article>`).join('')}
        </div></section>`).join('');
    const checks = `
        function check(condition, message) { if (!condition) throw new Error(message); }
        const boards = [...document.querySelectorAll('.class-board')];
        const positions = boards.map(board => board.getBoundingClientRect());
        const wide = window.innerWidth > 650;
        check(wide ? positions.every(position => Math.abs(position.top - positions[0].top) < 1)
            : positions[1].top >= positions[0].bottom, 'class positions at ' + window.innerWidth + 'px: ' + positions.map(position => position.x + ',' + position.y).join(';'));
        check(boards.every(board => board.scrollWidth <= board.clientWidth), 'class content must stay inside its column');
        check(document.documentElement.scrollWidth <= window.innerWidth, 'page must not overflow horizontally');
        for (const board of boards) {
            const cards = board.querySelectorAll('.ranking-card');
            check(cards[1].getBoundingClientRect().top >= cards[0].getBoundingClientRect().bottom, 'one player list per class');
        }
        const grid = document.querySelector('.class-boards');
        grid.replaceChildren(boards[0]);
        check(boards[0].clientWidth >= grid.clientWidth - 2, 'single class filter fills the available board width');
    `;
    for (const embedded of [false, true]) {
        fs.writeFileSync(fixture, `<html><head><meta charset="utf-8"><style>html,body{margin:0}${css}</style></head><body>
            <main class="rankings ${embedded ? 'embedded' : ''}"><div class="class-boards">${boards}</div></main>
            <script>try { ${checks}; document.body.dataset.result = 'PASS'; } catch (error) { document.body.dataset.result = error.message; }</script></body></html>`);
        for (const width of [390, 740, 1280]) {
            const output = await dumpBrowserDom(edge, ['--virtual-time-budget=1000', `--window-size=${width},800`, `${pathToFileURL(fixture).href}?check=${Date.now()}`]);
            assert.equal(output.match(/data-result="([^"]*)"/)?.[1], 'PASS', `width ${width}, embedded ${embedded}`);
        }
    }
    console.log('PASS: browser-verified responsive class columns, single-class width, stacked player records and expanded builds at 390/740/1280px');
} else {
    console.log('SKIP: browser geometry checks require Microsoft Edge');
}
