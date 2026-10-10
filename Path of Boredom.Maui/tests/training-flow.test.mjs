import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { startRun, startTraining, togglePause } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { SLOTTABLE_SKILLS } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
import { captureSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';

const source = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
const flow = source.slice(source.indexOf('    let practiceReturn = null;'), source.indexOf('    let promptOpen = false;'));
const button = dataset => ({ dataset, listeners: {}, addEventListener(event, callback) { this.listeners[event] = callback; } });
const setup = button({}), exit = button({}), start = button({});
const skills = SLOTTABLE_SKILLS.map(trainingSkill => button({ trainingSkill }));
const original = startRun(() => 0.99, 'hard', 'ranger');
original.status = 'paused';
const saved = captureSnapshot(original);
const events = [];
const context = vm.createContext({
    state: original, saving: false, checkingUnlock: false, setupAction: null,
    checkpointHandled: 'campaign:5', shownStatus: 'paused', last: 0,
    startTraining, togglePause, SLOTTABLE_SKILLS, Math, performance: { now: () => 500 },
    reportScore() {}, clearInput() {}, updateHud() {}, canvas: { focus() {} },
    setEquipmentStyle() {}, acceptChallenge() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    root: {
        querySelectorAll(selector) { return ({ '[data-training]': [setup], '[data-exit-training]': [exit], '[data-training-skill]': skills, '[data-equipment-style]': [] })[selector] ?? []; },
        querySelector(selector) { return selector === '[data-start-training]' ? start : button({}); },
        dispatchEvent(event) { events.push(event); }
    },
    on(target, event, handler) { target.addEventListener(event, handler); }
});
vm.runInContext(flow, context);
setup.listeners.click();
assert.equal(context.state.training, true);
assert.equal(context.state.heroClass, 'ranger');
assert.equal(context.state.status, 'paused');
assert.equal(context.shownStatus, '', 'training copy refreshes even when original run was paused');
assert.equal(events.at(-1).detail.action, 'setup');
assert.deepEqual(captureSnapshot(original), saved);
skills.find(item => item.dataset.trainingSkill === 'chain').listeners.click();
assert.equal(context.state.loadout.auto[0], 'chain');
skills.find(item => item.dataset.trainingSkill === 'guard').listeners.click();
assert.equal(new Set(context.state.loadout.auto.filter(key => key !== 'none')).size, 3, 'selection swaps duplicate skills');
start.listeners.click();
assert.equal(context.state.status, 'playing');
assert.ok(context.state.resumeDelay > 0, 'practice starts with a preparation countdown');
assert.equal(events.at(-1).detail.action, 'start');
const chosen = context.state.loadout.auto[0];
skills.find(item => item.dataset.trainingSkill === 'reap').listeners.click();
assert.equal(context.state.loadout.auto[0], chosen, 'cannot change practice ability during combat');
exit.listeners.click();
assert.equal(context.state, original, 'exit returns the exact original in-memory run');
assert.equal(context.state.status, 'paused');
assert.deepEqual(captureSnapshot(context.state), saved, 'practice did not change original progression');
assert.equal(events.at(-1).detail.action, 'exit');
context.saving = true;
setup.listeners.click();
assert.equal(context.state, original, 'cannot enter training while saving');
console.log('PASS: training setup, inline ability selection, countdown start, combat guards and unchanged original-run restoration');
