import assert from 'node:assert/strict';
import { startRun, step } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';

// Hit-stop freezes the simulation briefly, then play resumes; shake decays on its own.
const state = startRun(() => 0.5, 'hard', 'knight');
state.status = 'playing';
state.resumeDelay = 0;
state.hitStop = 0.04;
state.shake = 0.1;
const time = state.time;
step(state, {}, 0.016);
assert.equal(state.time, time, 'simulation is frozen during hit-stop');
assert.ok(state.shake < 0.1, 'shake decays even while frozen');
step(state, {}, 0.05);
assert.equal(state.hitStop, 0);
step(state, {}, 0.016);
assert.ok(state.time > time, 'simulation resumes after hit-stop');
for (let i = 0; i < 20; i++) step(state, {}, 0.016);
assert.equal(state.shake, 0, 'shake fully settles');

// Expired effects are recycled in place; the array identity is kept and no stale fields leak.
const effects = state.effects;
for (let i = 0; i < 200; i++) step(state, { attack: true }, 0.016);
assert.equal(state.effects, effects, 'effects array is reused, not reallocated each frame');
assert.ok(state.effects.length <= 256);
assert.ok(state.effects.every(item => item.life > 0 && typeof item.kind === 'string'));
console.log('PASS: hit-stop freezes then resumes, shake decays, effects are pooled without leaking fields');
