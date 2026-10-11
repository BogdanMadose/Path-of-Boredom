import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { startRun, continueJourney, togglePause, step } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { mapForWave, mapIndexForWave } from '../../Path of Boredom.Game/wwwroot/js/arpg-campaign.js';
import { bossProfile } from '../../Path of Boredom.Game/wwwroot/js/arpg-bosses.js';

const source = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
const openStart = source.indexOf('    function openLore(');
const openEnd = source.indexOf('    on(root.querySelector("[data-open-lore]")', openStart);
const closeStart = source.indexOf('    on(root.querySelector("[data-close-lore]")', openEnd);
const closeEnd = source.indexOf('    const mainMenu =', closeStart);
const frameStart = source.indexOf('    function animate(now) {');
const frameEnd = source.indexOf('        root.dataset.gameStatus =', frameStart);
assert.ok(openStart >= 0 && openEnd > openStart && closeEnd > closeStart && frameEnd > frameStart);
assert.ok(source.includes('"click", () => openLore()'), 'manual lore does not receive a click event as a wave');

function harness(state, flags = {}) {
    const elements = new Map();
    const root = { isConnected: true, querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, { textContent: '', focus() {} });
        return elements.get(selector);
    } };
    const loreReader = { hidden: true };
    let closeLore;
    let steps = 0;
    const context = vm.createContext({ state, root, loreReader, mapForWave, mapIndexForWave, bossProfile, togglePause,
        saving: false, setupAction: null, inMainMenu: false, disposed: false, last: 1000,
        clearInput() {}, updateHud() {}, dispose() {}, input: () => ({}), canvas: { focus() {} },
        performance: { now: () => 1000 }, on: (element, event, callback) => { closeLore = callback; },
        step: (...args) => { steps++; step(...args); }, ...flags });
    vm.runInContext(`const loreSeen = new WeakMap(); let loreResume = false;\n${source.slice(openStart, openEnd)}\n${source.slice(closeStart, closeEnd)}\n${source.slice(frameStart, frameEnd)}\n}\nthis.frame = animate; this.manualLore = () => openLore();`, context);
    return { context, root, loreReader, frame: () => context.frame(1100), close: () => closeLore(), get steps() { return steps; } };
}

const state = startRun(() => 0.5);
const game = harness(state);
for (const wave of [1, 6, 11, 16, 21, 26]) {
    if (wave > 1) {
        state.wave = wave - 1;
        state.status = 'camp';
        assert.ok(continueJourney(state));
    }
    const beforeWave = state.wave, beforeTime = state.time, delay = state.resumeDelay, stepsBefore = game.steps;
    game.frame();
    assert.equal(game.loreReader.hidden, false, `chapter ${wave} lore opens immediately`);
    assert.equal(state.status, 'paused', 'lore pauses gameplay before the countdown');
    assert.equal(game.steps, stepsBefore, 'simulation has not advanced before opening lore');
    assert.equal(state.wave, beforeWave, 'no need to wait for the next wave to spawn');
    assert.equal(state.resumeDelay, delay, 'full countdown remains available');
    assert.equal(game.root.querySelector('[data-lore-title]').textContent, mapForWave(wave).name, 'shows upcoming chapter, not the previous one');
    assert.ok(game.root.querySelector('[data-lore-boss]').textContent.startsWith(mapForWave(wave).boss));
    game.frame();
    assert.equal(state.time, beforeTime, 'reading lore does not advance game time');
    assert.equal(state.resumeDelay, delay, 'reading lore does not consume countdown');
    game.close();
    assert.equal(state.status, 'playing');
    assert.equal(state.resumeDelay, delay, 'closing automatic lore preserves the full countdown');
    game.frame();
    assert.equal(game.loreReader.hidden, true, 'lore is not repeated while counting down');
    assert.ok(state.resumeDelay < delay, 'countdown begins only after closing lore');
    for (let tick = 0; tick < 100 && state.wave !== wave; tick++) game.frame();
    assert.equal(state.wave, wave, 'new wave starts after countdown');
    game.frame();
    assert.equal(game.loreReader.hidden, true, 'lore is not reopened after the wave spawns');
}

for (const flags of [{ inMainMenu: true }, { setupAction: 'campaign' }, { saving: true }]) {
    const game = harness(startRun(() => 0.5), flags);
    game.frame();
    assert.equal(game.loreReader.hidden, true, 'automatic lore respects menu/setup/save guards');
}
for (const kind of ['endless', 'training']) {
    const state = startRun(() => 0.5);
    if (kind === 'endless') state.mode = 'endless';
    else state.training = { active: true };
    const game = harness(state);
    game.frame();
    assert.equal(game.loreReader.hidden, true, `${kind} does not show campaign lore`);
}
const camp = startRun(() => 0.5);
camp.wave = 5; camp.status = 'camp';
const manual = harness(camp);
manual.context.manualLore();
assert.equal(manual.root.querySelector('[data-lore-title]').textContent, mapForWave(5).name, 'manual camp lore still describes the current chapter');
console.log('PASS: all six campaign chapters show upcoming lore before any countdown tick; full countdown follows dismissal, lore does not repeat, and manual/menu/setup/save/training/Endless guards remain correct');
