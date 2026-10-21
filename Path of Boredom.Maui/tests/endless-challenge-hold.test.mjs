import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startEndlessRun, continueJourney, step } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { needsSkillChoice } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';

// Endless travel must freeze while the "New challenge available" notice is showing, and resume
// only after the player taps View challenges or Later.
const ui = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
assert.match(ui, /holdForChallenge = endlessTravel && !challengeNudge\.hidden;/, 'nudge visibility drives the hold');
assert.match(ui, /loreReader\.hidden && !holdForChallenge\) step\(/, 'render loop skips step() while held');
const dismissStart = ui.indexOf('on(root.querySelector("[data-dismiss-challenges]")');
const dismiss = ui.slice(dismissStart, ui.indexOf('});', dismissStart));
assert.match(dismiss, /holdForChallenge = false/, 'Later releases the hold');
const view = ui.slice(ui.indexOf('on(root.querySelector("[data-open-challenges]")'), ui.indexOf('on(root.querySelector("[data-dismiss-challenges]")'));
assert.match(view, /pause\(\)/, 'View challenges pauses the run');

// Simulate the loop exactly as arpg.js gates it.
const state = startEndlessRun(() => 0.5, 'hard', 'knight');
state.loadout = { manual: 'none', auto: ['nova', 'burst', 'guard', 'none'] };
state.status = 'camp';
state.enemies = [];
assert.ok(continueJourney(state));
assert.ok(!needsSkillChoice(state), 'test run has its skills chosen');
const input = () => ({ x: 0, y: 0 });
let holdForChallenge = true, nudgeVisible = true;
const frame = dt => { holdForChallenge = holdForChallenge && nudgeVisible; if (!holdForChallenge) step(state, input(), dt); };

const before = { delay: state.resumeDelay, wave: state.wave, pending: state.travelPending };
for (let i = 0; i < 600; i++) frame(1 / 60); // 10 seconds untouched
assert.equal(state.resumeDelay, before.delay, 'countdown frozen while the notice waits');
assert.equal(state.wave, before.wave, 'no wave spawns while the notice waits');
assert.equal(state.travelPending, before.pending, 'travel still pending');

nudgeVisible = false; holdForChallenge = false; // player taps Later
for (let i = 0; i < 300; i++) frame(1 / 60);
assert.equal(state.resumeDelay, 0, 'countdown runs after Later');
assert.notEqual(state.wave, before.wave, 'next wave starts after Later');
console.log('PASS: Endless travel waits on the challenge notice until View or Later is tapped');
