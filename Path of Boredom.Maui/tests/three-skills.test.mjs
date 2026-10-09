import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startRun, startEndlessRun, step } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { STARTER_SKILLS, SLOTTABLE_SKILLS, skillCapacity, selectedSkills, needsSkillChoice, validLoadout, setLoadout, skillPointsLeft } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';

assert.equal(STARTER_SKILLS.length, 3);
assert.ok(STARTER_SKILLS.length < SLOTTABLE_SKILLS.length);
assert.ok(STARTER_SKILLS.every(key => SLOTTABLE_SKILLS.includes(key)));
for (const start of [startRun, startEndlessRun]) {
    for (const hero of ['knight', 'ranger', 'warden']) {
        for (const starter of STARTER_SKILLS) {
            const state = start(() => 0.5, 'hard', hero);
            state.loadout.auto = [starter, 'none', 'none', 'none'];
            for (const [level, capacity] of [[1, 1], [4, 1], [5, 2], [9, 2], [10, 3], [15, 3], [100, 3]]) {
                state.player.level = level;
                assert.equal(skillCapacity(state), capacity);
            }
            state.player.level = 5;
            step(state, {}, 0.01);
            assert.equal(state.status, 'paused');
            assert.equal(needsSkillChoice(state), true);
            const other = SLOTTABLE_SKILLS.filter(key => key !== starter);
            assert.equal(setLoadout(state, 'none', [starter, other[0], 'none', 'none']), true);
            assert.equal(needsSkillChoice(state), false);
            state.player.level = 10;
            assert.equal(needsSkillChoice(state), true);
            assert.equal(setLoadout(state, 'none', [starter, other[0], other[1], 'none']), true);
            assert.equal(selectedSkills(state).length, 3);
            assert.equal(setLoadout(state, 'none', [starter, other[0], other[2], 'none']), false, 'choices remain locked');
            state.player.level = 15;
            assert.equal(needsSkillChoice(state), false, 'level 15 must not offer a fourth skill');
            assert.equal(validLoadout(state, 'none', [starter, other[0], other[1], other[2]]), false);
            assert.deepEqual(restoreSnapshot(captureSnapshot(state)).loadout, state.loadout);
        }
    }
}

const state = startRun(() => 0.5, 'hard', 'knight');
state.status = 'paused';
state.player.level = 15;
state.loadout.auto = ['nova', 'chain', 'reap', 'none'];
const old = captureSnapshot(state);
old.version = 15;
old.state.loadout.auto[3] = 'siphon';
old.state.skillTree.siphon.potency = 2;
old.state.player.siphon = 8;
const restored = restoreSnapshot(old);
assert.deepEqual(restored.loadout.auto, ['nova', 'chain', 'reap', 'none']);
assert.equal(restored.skillTree.siphon.potency, 0);
assert.equal(restored.player.siphon, 0);
assert.equal(skillPointsLeft(restored), 7, 'fourth-skill points are refunded');
assert.deepEqual(restoreSnapshot(captureSnapshot(restored)).loadout, restored.loadout);
const invalidNew = structuredClone(old);
invalidNew.version = 16;
assert.throws(() => restoreSnapshot(invalidNew), 'v16 cannot contain a fourth skill');
old.state.player.level = 10;
assert.throws(() => restoreSnapshot(old), 'invalid legacy fourth slots are still rejected');

const page = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../wwwroot/css/mobile-shell.css', import.meta.url), 'utf8');
assert.match(page, /slot <= 3/);
assert.match(page, /foreach \(var skill in StarterSkills\)/);
assert.match(page, /arena-overlay skill-choice-overlay/);
assert.match(css, /\.skill-choice-overlay \.overlay-card\s*\{[^}]*overflow-y: auto;[^}]*touch-action: pan-y;/);
assert.doesNotMatch(css, /\[data-setup-loadout\][^{]*\{\s*display: none !important;/);
console.log('PASS: restricted starters, three locked skill choices, legacy save refunds, and scrollable mobile picker styles');
