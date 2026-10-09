import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { startRun, startEndlessRun, step, useSkill, continueJourney, togglePause, forgeSkillSelected, forgeComplete, buyUpgrade } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { LEVEL_CARDS, drawLevelCards, levelCardAvailable, normalizeCardChoices } from '../../Path of Boredom.Game/wwwroot/js/arpg-cards.js';
import { UPGRADES, MAPS, mapForWave } from '../../Path of Boredom.Game/wwwroot/js/arpg-campaign.js';
import { HERO_CLASSES } from '../../Path of Boredom.Game/wwwroot/js/arpg-classes.js';
import { upgradePreview } from '../../Path of Boredom.Game/wwwroot/js/arpg-upgrade-preview.js';
import { captureSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';
import { automaticCheckpoint, forgeNotification, bossHudTop } from '../../Path of Boredom.Game/wwwroot/js/arpg-ui-state.js';
import { encounterForWave, encounterKind, encounterElite } from '../../Path of Boredom.Game/wwwroot/js/arpg-encounters.js';

for (const hero of Object.keys(HERO_CLASSES)) {
    const state = startRun(() => 0.2, 'hard', hero);
    state.player.level = 12;
    state.loadout.auto = ['chain', 'reap', 'siphon', 'none'];
    state.status = 'paused'; state.gold = 100000;
    for (const key of ['nova', 'burst', 'guard']) {
        assert.equal(levelCardAvailable(state, key), false);
        assert.equal(forgeSkillSelected(state, key), false);
        assert.equal(buyUpgrade(state, key), false);
    }
    for (let draft = 0; draft < 100; draft++) assert.ok(drawLevelCards(state).every(key => levelCardAvailable(state, key)));
    state.cardChoices = ['nova', 'burst', 'guard'];
    normalizeCardChoices(state);
    assert.equal(new Set(state.cardChoices).size, 3);
    assert.ok(state.cardChoices.every(key => !['nova', 'burst', 'guard'].includes(key)));
    for (const key of ['cleave', 'weapon', 'armor', 'dodge', 'flask', 'critChance', 'critDamage']) assert.equal(forgeSkillSelected(state, key), true);
    for (const key of Object.keys(UPGRADES)) if (forgeSkillSelected(state, key)) state.upgrades[key] = UPGRADES[key].max;
    assert.equal(forgeComplete(state), true, 'unchosen skills do not block training');
    assert.ok(!upgradePreview(state, 'area', true).text.includes('Special reach'));
    assert.ok(!upgradePreview(state, 'recovery', true).text.includes('Special recharge'));
    state.loadout.auto = ['nova', 'burst', 'guard', 'none'];
    for (const key of state.loadout.auto.slice(0, 3)) assert.equal(levelCardAvailable(state, key), true);
}

function veteran() {
    const state = startEndlessRun(() => 0, 'hard', 'knight');
    state.loadout.auto = ['chain', 'reap', 'siphon', 'none'];
    state.player.nova = 30;
    state.player.facing = 0;
    state.resumeDelay = 0;
    return state;
}
const reward = veteran();
for (const key of Object.keys(UPGRADES)) if (forgeSkillSelected(reward, key)) reward.upgrades[key] = UPGRADES[key].max;
reward.upgrades.weapon = 0;
const target = reward.enemies[0];
reward.enemies = [target];
Object.assign(target, { kind: 'boss', x: reward.player.x + 20, y: reward.player.y, health: 1 });
assert.equal(useSkill(reward, 'attack'), true);
assert.ok(reward.loot.some(drop => drop.kind === 'upgrade'));
assert.ok(reward.loot.filter(drop => drop.kind === 'upgrade').every(drop => forgeSkillSelected(reward, Object.keys(UPGRADES)[drop.value])));
const obsolete = veteran();
obsolete.enemies = [];
obsolete.loot = [{ kind: 'upgrade', x: obsolete.player.x, y: obsolete.player.y, value: Object.keys(UPGRADES).indexOf('guard'), life: 20 }];
const gold = obsolete.gold, guard = obsolete.upgrades.guard;
step(obsolete, {}, 0.01);
assert.equal(obsolete.upgrades.guard, guard);
assert.ok(obsolete.gold > gold, 'old irrelevant scrolls are salvaged, not applied');

const notices = {};
const offers = [{ key: 'forge:weapon', rank: 0 }];
assert.equal(forgeNotification(notices, offers), true);
assert.equal(forgeNotification(notices, offers, true), false);
assert.equal(forgeNotification(notices, offers), false, 'affordable gold alone cannot keep the badge on');
assert.equal(forgeNotification(notices, [{ key: 'forge:weapon', rank: 1 }]), true, 'a newly affordable next rank can notify');
assert.equal(forgeNotification(notices, []), false);
for (const height of [180, 250, 350, 650]) for (const top of [0, 40]) {
    const menu = { height: 58, bottom: 58 };
    const y = bossHudTop({ top, height }, menu, true);
    assert.ok(top + (y - 14) * height / 650 > menu.bottom, 'boss title and bar are below the actual buttons');
}
assert.equal(bossHudTop({ top: 0, height: 650 }, null, false), 49);

const source = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
const countdown = source.slice(source.indexOf('function drawCountdown('), source.indexOf('// The module\'s single export'));
const labels = [];
const brush = new Proxy({}, { get: (object, key) => key in object ? object[key] : key === 'fillText' ? text => labels.push(text) : () => {},
    set: (object, key, value) => { object[key] = value; return true; } });
const drawing = vm.createContext({ reducedMotion: { matches: false }, WIDTH: 1100, HEIGHT: 650, mapForWave });
vm.runInContext(countdown, drawing);
drawing.drawCountdown(brush, { status: 'playing', resumeDelay: 2, wave: 35 }, true);
assert.ok(labels.every(label => !label.includes('P to pause')));
labels.length = 0;
drawing.drawCountdown(brush, { status: 'playing', resumeDelay: 2, wave: 35 }, false);
assert.ok(labels.some(label => label.includes('P to pause')));

const persistCode = source.slice(source.indexOf('    async function persist('), source.indexOf('    if (saveButton && saveStatus)'));
for (const outcome of ['success', 'failure', 'exception']) {
    const state = veteran();
    state.wave = 35; state.status = 'camp'; state.enemies = []; state.effects = [];
    let complete;
    const pending = new Promise((resolve, reject) => { complete = outcome === 'exception' ? () => reject(new Error('offline')) : () => resolve({ success: outcome === 'success', message: 'Test save' }); });
    const screens = [];
    const sandbox = { state, saving: false, checkingUnlock: false, setupAction: null, disposed: false,
        checkpointSaveFailed: false, promptOpen: false, endlessUnlocked: true, releaseRankings: false,
        root: { dataset: { localSaves: 'on' }, dispatchEvent() {} }, saveStatus: {}, saveBridge: { invokeMethodAsync: () => pending },
        clearInput() {}, reportScore() {}, captureSnapshot, continueJourney, togglePause, automaticCheckpoint,
        document: { hidden: false, hasFocus: () => true }, canvas: { focus() {} }, performance: { now: () => 1 },
        CustomEvent: class {}, updateHud() { screens.push(sandbox.state.status !== 'playing' && !automaticCheckpoint(sandbox.state, sandbox.checkpointSaveFailed)); } };
    vm.createContext(sandbox);
    vm.runInContext(`${persistCode}\nthis.persist = persist;`, sandbox);
    const saving = sandbox.persist(false, true);
    assert.equal(sandbox.saving, true);
    assert.equal(screens.at(-1), false, 'no full menu while the automatic checkpoint is saving');
    complete(); await saving;
    if (outcome === 'success') {
        assert.equal(sandbox.state.status, 'playing');
        assert.equal(sandbox.state.travelPending, 1);
        assert.equal(sandbox.checkpointSaveFailed, false);
        assert.ok(screens.every(shown => !shown), 'successful checkpoints never flash a menu');
    } else {
        assert.equal(sandbox.state.status, 'camp');
        assert.equal(sandbox.checkpointSaveFailed, true);
        assert.equal(screens.at(-1), true, 'failed saves show a stable retry screen');
    }
}

assert.deepEqual([1, 2, 3, 4, 5].map(wave => encounterForWave(wave).key), ['swarm', 'elites', 'ranged', 'mixed', 'boss']);
for (let stage = 0; stage < 12; stage++) {
    const wave = stage * 5 + 1;
    assert.equal(encounterForWave(wave + 4).key, 'boss');
    const ranged = Array.from({ length: 30 }, (_, i) => encounterKind(wave + 2, i));
    assert.ok(ranged.filter(kind => ['wisp', 'spitter', 'artillerist'].includes(kind)).length >= 20);
    if (wave >= 6) assert.ok(Array.from({ length: 30 }, (_, i) => encounterElite(wave + 1, i)).reduce((a, b) => a + b, 0) >= 15);
    const state = startRun(() => 0.5);
    state.player.level = 12; state.loadout.auto = ['chain', 'reap', 'siphon', 'none'];
    state.wave = wave - 1;
    if (wave > 30) { state.mode = 'endless'; state.rankingMode = 'endless'; state.campaignComplete = 1; }
    state.travelPending = 1; state.resumeDelay = 0.01;
    step(state, {}, 0.05);
    assert.equal(state.wave, wave);
    assert.ok(state.enemies.length > 0 && state.enemies.length <= 40);
    assert.equal(captureSnapshot(state).version, 18, 'encounters and presentation remain compatible with current saves');
}
assert.ok(Object.keys(LEVEL_CARDS).includes('siphon'), 'Ashdrinker remains a global elite/boss-healing boon, not a selected-ability upgrade');
console.log('PASS: loadout-aware drafts/Forge/scrolls, acknowledged notifications, mobile countdown and boss HUD, automatic Endless save/retry flow, encounter variety, and compatible v18 snapshots');
