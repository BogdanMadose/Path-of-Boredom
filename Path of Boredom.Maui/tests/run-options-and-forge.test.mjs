import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import { dumpBrowserDom } from './browser-dom.mjs';
import { startRun, startEndlessRun, startTraining, step, useSkill, buyUpgrade, forgeSkillSelected, forgeComplete, skillReach, upgradeCost } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { NEW_SKILLS, skillName } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
import { UPGRADES } from '../../Path of Boredom.Game/wwwroot/js/arpg-campaign.js';
import { levelCardAvailable } from '../../Path of Boredom.Game/wwwroot/js/arpg-cards.js';
import { upgradePreview } from '../../Path of Boredom.Game/wwwroot/js/arpg-upgrade-preview.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';
import { acceptChallenge, resolveChallenge, setEquipmentStyle, runSummary } from '../../Path of Boredom.Game/wwwroot/js/arpg-run-systems.js';

const skills = Object.keys(NEW_SKILLS);
for (const hero of ['knight', 'ranger', 'warden']) {
    for (const skill of skills) {
        const state = startRun(() => 0.99, 'hard', hero);
        state.player.level = 12;
        state.loadout.auto = [skill, 'nova', 'guard', 'none'];
        state.status = 'paused'; state.gold = 100000;
        assert.equal(forgeSkillSelected(state, skill), true);
        assert.equal(levelCardAvailable(state, `${skill}Oath`), true);
        for (const other of skills.filter(key => key !== skill)) {
            assert.equal(forgeSkillSelected(state, other), false);
            assert.equal(levelCardAvailable(state, `${other}Oath`), false);
            assert.equal(buyUpgrade(state, other), false);
        }
        const reach = skillReach(state, skill), cost = upgradeCost(state, skill);
        const preview = upgradePreview(state, skill);
        assert.equal(preview.capped, false);
        assert.match(preview.text, /Skill hit:.*Skill recharge s:.*Skill reach:/);
        assert.equal(buyUpgrade(state, skill), true);
        assert.equal(state.upgrades[skill], 1);
        assert.equal(state.runSystems.summary.spent, cost);
        assert.equal(skillReach(state, skill), reach + 8);
        const restored = restoreSnapshot(captureSnapshot(state));
        assert.equal(restored.upgrades[skill], 1);
        assert.equal(restored.heroClass, hero);
        assert.equal(restored.runSystems.summary.spent, cost);
        for (const [key, upgrade] of Object.entries(UPGRADES)) if (forgeSkillSelected(state, key)) state.upgrades[key] = upgrade.max;
        assert.equal(forgeComplete(state), true, 'unselected tracks do not block mastery');
        state.loadout.auto[1] = skills.find(key => key !== skill);
        assert.equal(forgeComplete(state), false, 'newly selected track must be improved too');
    }
}

function arena(hero, rank = 0) {
    const state = startEndlessRun(() => 0.99, 'hard', hero);
    state.player.level = 12;
    state.loadout.auto = ['chain', 'nova', 'guard', 'none'];
    state.resumeDelay = 0;
    const enemy = state.enemies[0];
    Object.assign(enemy, { kind: 'husk', modifier: 'none', health: 100000, maxHealth: 100000, x: state.player.x + 80, y: state.player.y });
    state.enemies = [enemy];
    state.player.facing = 0;
    state.upgrades.chain = rank;
    return state;
}
for (const hero of ['knight', 'ranger', 'warden']) {
    const baseline = arena(hero), upgraded = arena(hero, 1);
    assert.equal(useSkill(baseline, 'chain', true), true);
    assert.equal(useSkill(upgraded, 'chain', true), true);
    assert.ok(upgraded.enemies[0].health < baseline.enemies[0].health);
    assert.ok(Math.abs(upgraded.player.chain - baseline.player.chain / 1.08) < 1e-9);
    assert.ok(upgraded.runSystems.summary.damage.chain > baseline.runSystems.summary.damage.chain);
    const preview = upgradePreview(baseline, 'chain').text;
    assert.ok(preview.includes(`Skill hit: ${baseline.runSystems.summary.damage.chain}`));
}

const pickup = arena('knight');
pickup.enemies = [];
pickup.loot = [{ kind: 'upgrade', value: Object.keys(UPGRADES).indexOf('chain'), x: pickup.player.x, y: pickup.player.y, life: 30 }];
step(pickup, {}, 0.05);
assert.equal(pickup.upgrades.chain, 1, 'selected skill scroll gives a real Forge rank');
pickup.upgrades.chain = UPGRADES.chain.max;
pickup.loot = [{ kind: 'upgrade', value: Object.keys(UPGRADES).indexOf('chain'), x: pickup.player.x, y: pickup.player.y, life: 30 }];
const gold = pickup.gold;
step(pickup, {}, 0.05);
assert.equal(pickup.upgrades.chain, UPGRADES.chain.max);
assert.ok(pickup.gold > gold, 'capped skill scroll salvages');

const current = captureSnapshot(arena('knight', 2));
for (const version of [16, 17]) {
    const legacy = structuredClone(current);
    legacy.version = version;
    for (const key of skills) delete legacy.state.upgrades[key];
    if (version < 17) {
        delete legacy.state.runSystems;
        for (const key of skills) delete legacy.state.boons[`${key}Oath`];
    }
    const restored = restoreSnapshot(legacy);
    for (const key of skills) assert.equal(restored.upgrades[key], 0);
    assert.equal(captureSnapshot(restored).version, 18);
}
const invalid = structuredClone(current);
invalid.state.upgrades.chain = 9;
assert.throws(() => restoreSnapshot(invalid));

const practice = startTraining(() => 0.99);
assert.throws(() => captureSnapshot(practice), 'training cannot be saved');
const options = startRun(() => 0.99);
options.status = 'paused';
assert.equal(setEquipmentStyle(options, 'weapon', 'heavy'), true);
assert.equal(acceptChallenge(options, 'flaskless'), true);
options.wave = 5;
assert.equal(resolveChallenge(options), 150);
assert.equal(resolveChallenge(options), 0, 'no duplicate challenge rewards');
assert.match(runSummary(options, key => skillName(options, key)), /1 challenges completed/);
assert.equal(restoreSnapshot(captureSnapshot(options)).runSystems.equipment.weapon, 'heavy');

const script = fs.readFileSync(new URL('../wwwroot/js/mobile-menu.js', import.meta.url), 'utf8');
const sync = script.slice(script.indexOf('    function syncBadges('), script.indexOf('    // ---- Init'));
const save = { textContent: 'Device save ready' }, summary = { textContent: 'Training session: damage 123' };
const originalTraining = { hidden: true, disabled: false }, originalExit = { hidden: false, disabled: false };
const proxies = ['training', 'exit-training'].map(action => ({ dataset: { practiceProxy: action } }));
const status = { textContent: '' }, mirroredSummary = { textContent: '', hasAttribute: name => name === 'data-mobile-run-summary' };
status.hasAttribute = () => false;
const sourceRoot = {
    isConnected: true, dataset: { gameStatus: 'paused', saveBusy: 'off' },
    querySelector(selector) {
        return ({ '[data-training]': originalTraining, '[data-exit-training]': originalExit, '[data-save-status]': save, '[data-summary-text]': summary })[selector] ?? null;
    },
    querySelectorAll(selector) {
        return ({ '[data-practice-proxy]': proxies, '.mm-save-status': [status, mirroredSummary], '[data-mobile-run-summary]': [mirroredSummary] })[selector] ?? [];
    }
};
const tabs = [{ click() {} }, {}], badge = {};
const context = vm.createContext({
    document: { querySelector: selector => selector === '.arpg' ? sourceRoot : null },
    layer: { querySelectorAll: () => [], querySelector: () => badge },
    panels: {
        skills: { syncTabs() {}, root: { querySelector: () => null } },
        forge: { root: { dataset: { mobileSection: 'systems' }, querySelector: selector => selector === '.mm-subtabs' ? { children: tabs } : null } }
    }
});
vm.runInContext(sync, context);
context.syncBadges();
assert.equal(proxies[0].hidden, true);
assert.equal(proxies[1].hidden, false);
assert.equal(proxies[1].disabled, false);
assert.equal(status.textContent, save.textContent);
assert.equal(mirroredSummary.textContent, summary.textContent, 'save status must never overwrite the run summary');
sourceRoot.dataset.saveBusy = 'on';
context.syncBadges();
assert.equal(proxies[1].disabled, true);
originalTraining.hidden = false; originalExit.hidden = true;
summary.textContent = 'Run so far: 5 stages';
sourceRoot.dataset.saveBusy = 'off';
context.syncBadges();
assert.equal(proxies[0].hidden, false);
assert.equal(proxies[1].hidden, true);
assert.equal(mirroredSummary.textContent, summary.textContent);

const css = fs.readFileSync(new URL('../wwwroot/css/mobile-menu.css', import.meta.url), 'utf8');
assert.match(css, /forge-panel \.mm-subtabs \{ grid-template-columns: repeat\(3,/);
assert.match(css, /forge-panel:not\(\[data-mobile-section="systems"\]\) > \.equipment-options \{ display: none;/);
assert.match(css, /\.mm-panel \.run-options,[^}]*min-height: 0;[^}]*overflow-y: auto;/);
console.log('PASS: selected-skill Forge/card availability, real combat bonuses, previews, scrolls, mastery gating, v16/v17 migration, training save isolation and synchronized mobile Pause options');

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (fs.existsSync(edge)) {
    const home = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
    const optionsMarkup = home.slice(home.indexOf('<section class="options-panel"'), home.indexOf('<section class="challenges-panel"'))
        .replace(/@foreach \(var skill in CombatSkills\)\s*\{([\s\S]*?)\}/g, (_, markup) =>
            ['nova', 'burst', 'guard', ...skills].map(skill => markup.replaceAll('@skill', skill)).join(''));
    const equipmentMarkup = home.slice(home.indexOf('<section class="equipment-options">'), home.indexOf('<div class="forge-grid">'));
    const baseCss = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor.css', import.meta.url), 'utf8');
    const shellCss = fs.readFileSync(new URL('../wwwroot/css/mobile-shell.css', import.meta.url), 'utf8');
    const html = `<html><head><style>html,body{margin:0}*{box-sizing:border-box}[hidden]{display:none!important}${baseCss}${shellCss.replace('@media (pointer: coarse)', '@media all')}${css.replace('@media (pointer: coarse)', '@media all')}</style></head>
        <body class="mobile-shell"><div class="arpg">${optionsMarkup}<section class="forge-panel mm-panel" data-mobile-section="systems">
        ${equipmentMarkup}<div class="forge-grid"><button>Skill forging</button></div><section class="mastery-panel">Mastery</section>
        <div class="mm-head">Forge</div><div class="mm-subtabs"><button>Upgrades</button><button>Mastery</button><button>Equipment</button></div>
        </section></div><script>
        try {
            const panel = document.querySelector('.options-panel'), forgePanel = document.querySelector('.forge-panel'), options = document.querySelector('.run-options'), equipment = document.querySelector('.equipment-options'), forge = document.querySelector('.forge-grid'), mastery = document.querySelector('.mastery-panel');
            panel.classList.add('mm-panel', 'mm-open');
            const head = document.createElement('div'); head.className = 'mm-head'; head.textContent = 'Run options'; panel.appendChild(head);
            const check = (condition, message) => { if (!condition) throw new Error(message); };
            for (const [width, height] of [[390,740],[740,360]]) {
                panel.style.width = width + 'px'; panel.style.height = height + 'px';
                panel.classList.add('mm-open'); forgePanel.classList.remove('mm-open');
                check(!panel.querySelector('[data-equipment-style]') && !panel.querySelector('[data-challenge-choice]'), 'options must be separate from equipment and challenges');
                check(options.clientHeight > 0 && getComputedStyle(options).overflowY === 'auto', 'Run options must have a usable scrolling container');
                if (height === 360) check(options.scrollHeight > options.clientHeight, 'short landscape options must scroll');
                const bounds = options.getBoundingClientRect();
                check(bounds.bottom <= panel.getBoundingClientRect().bottom && bounds.top >= 58, 'Run options must fit below the header');
                for (const select of options.querySelectorAll('select')) check(select.getBoundingClientRect().right <= bounds.right + 1, 'select must not overflow');
                options.scrollTop = options.scrollHeight;
                check(!options.querySelector('[data-training]'), 'training must start only from main menu');
                const picker = options.querySelector('[data-training-picker]');
                picker.hidden = false;
                options.querySelector('[data-exit-training]').hidden = false;
                check(!picker.querySelector('select'), 'practice abilities must not open a native dropdown');
                check(picker.querySelectorAll('[data-training-skill]').length === 9, 'all nine abilities available inline');
                for (const button of picker.querySelectorAll('[data-training-skill]')) {
                    const rect = button.getBoundingClientRect();
                    check(rect.width > 0 && rect.left >= bounds.left && rect.right <= bounds.right + 1, 'practice buttons fit within Run options');
                }
                options.scrollTop = options.scrollHeight;
                const exit = options.querySelector('[data-exit-training]').getBoundingClientRect();
                check(exit.top >= bounds.top - 1 && exit.bottom <= bounds.bottom + 1, 'exit training must be reachable');
                check(panel.getBoundingClientRect().height === height, 'training setup must not expand the panel');
                picker.hidden = true;
                options.querySelector('[data-exit-training]').hidden = true;
                panel.classList.remove('mm-open'); forgePanel.classList.add('mm-open');
                forgePanel.style.width = width + 'px'; forgePanel.style.height = height + 'px';
                forgePanel.dataset.mobileSection = 'systems';
                check(getComputedStyle(equipment).display !== 'none' && getComputedStyle(forge).display === 'none' && getComputedStyle(mastery).display === 'none', 'Equipment tab isolation');
                forgePanel.dataset.mobileSection = 'upgrades';
                check(getComputedStyle(equipment).display === 'none' && getComputedStyle(forge).display !== 'none' && getComputedStyle(mastery).display === 'none', 'Upgrades tab isolation');
                forgePanel.dataset.mobileSection = 'training';
                check(getComputedStyle(equipment).display === 'none' && getComputedStyle(forge).display === 'none' && getComputedStyle(mastery).display !== 'none', 'Mastery tab isolation');
            }
            document.body.dataset.result = 'PASS';
        } catch (error) { document.body.dataset.result = error.message; }
        </script></body></html>`;
    const server = http.createServer((request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(html); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const output = await dumpBrowserDom(edge, ['--virtual-time-budget=5000', '--window-size=900,900', `http://127.0.0.1:${server.address().port}/`]);
        assert.equal(output.match(/data-result="([^"]*)"/)?.[1], 'PASS', 'Run options browser geometry');
        console.log('PASS: browser-verified Run options scrolling, reachable practice action and tab isolation at portrait and short landscape sizes');
    } finally { await new Promise(resolve => server.close(resolve)); }
} else console.log('SKIP: Run options browser geometry checks require Microsoft Edge');
