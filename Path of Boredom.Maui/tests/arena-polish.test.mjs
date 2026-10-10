import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createState, startRun, startEndlessRun, step } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { arenaHazards, hazardPhase } from '../../Path of Boredom.Game/wwwroot/js/arpg-hazards.js';
import { ENEMY_KINDS, mapForWave } from '../../Path of Boredom.Game/wwwroot/js/arpg-campaign.js';
import { HERO_CLASSES } from '../../Path of Boredom.Game/wwwroot/js/arpg-classes.js';
import { drawHero, drawOrb } from '../../Path of Boredom.Game/wwwroot/js/arpg-graphics.js';
import { turnToward } from '../../Path of Boredom.Game/wwwroot/js/arpg-facing.js';
import { drawBoss } from '../../Path of Boredom.Game/wwwroot/js/arpg-bosses.js';

for (let run = 0; run < 40; run++) {
    const state = createState(() => run / 40);
    let previous;
    for (let wave = 1; wave <= 60; wave++) {
        state.wave = wave;
        const hazards = arenaHazards(state);
        assert.strictEqual(arenaHazards(state), hazards, 'layout stays fixed within a stage');
        assert.notStrictEqual(hazards, previous, 'every wave generates a fresh layout');
        previous = hazards;
        if (mapForWave(wave).hazard === 'none') { assert.equal(hazards.length, 0); continue; }
        assert.ok(hazards.length >= 2 && hazards.length <= 5);
        for (const hazard of hazards) {
            assert.ok(hazard.radius >= 48 && hazard.radius <= 100);
            assert.ok(hazard.x - hazard.radius >= 42 && hazard.x + hazard.radius <= 1058);
            assert.ok(hazard.y - hazard.radius >= 42 && hazard.y + hazard.radius <= 608);
            assert.ok(Math.hypot(hazard.x - 550, hazard.y - 325) >= hazard.radius + 80);
            assert.ok(hazardPhase(hazard, hazard.start) < 4, 'no immediate burning');
            assert.ok(hazardPhase(hazard, hazard.start + hazard.delay + hazard.period / 2) >= 2);
            assert.ok(hazardPhase(hazard, hazard.start + hazard.delay + hazard.period * 0.8) >= 4);
        }
        for (let i = 0; i < hazards.length; i++) for (let j = i + 1; j < hazards.length; j++) {
            assert.ok(Math.hypot(hazards[i].x - hazards[j].x, hazards[i].y - hazards[j].y) >= hazards[i].radius + hazards[j].radius + 20);
        }
    }
}
const first = createState(() => 0.1), second = createState(() => 0.9);
first.wave = second.wave = 11;
assert.notDeepEqual(arenaHazards(first), arenaHazards(second), 'different runs get different layouts');
assert.ok(new Set(arenaHazards(first).map(hazard => hazard.delay)).size > 1, 'spawn timing is staggered');
assert.ok(new Set(arenaHazards(first).map(hazard => hazard.radius)).size > 1, 'sizes vary');

const state = startRun(() => 0.7);
state.wave = 11;
state.resumeDelay = 0;
const hazard = arenaHazards(state)[0];
state.player.x = hazard.x; state.player.y = hazard.y;
state.player.nova = 100;
state.enemies = [{ ...structuredClone(startEndlessRun(() => 0.99).enemies[0]), kind: 'husk', x: 42, y: 42,
    speed: 0, cooldown: 100, slam: 100, winding: 0, charging: 0, attackWindup: 0 }];
state.time = hazard.start + hazard.delay + hazard.period * 0.5;
const health = state.player.health;
step(state, {}, 0.01);
assert.equal(state.player.health, health, 'warning circles do not damage');
state.time = hazard.start + hazard.delay + hazard.period * 0.8;
step(state, {}, 0.01);
assert.ok(state.player.health < health, 'damage uses the randomized circle and phase');

function context() {
    return new Proxy({}, {
        get: (target, key) => key in target ? target[key]
            : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} })
            : (...args) => { for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} receives finite coordinates`); },
        set: (target, key, value) => { target[key] = value; return true; }
    });
}
globalThis.document = { createElement: () => ({ getContext: () => context() }) };
const source = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
const actorCode = source.slice(source.indexOf('function drawActor('), source.indexOf('// The main per-frame draw call:'));
const sandbox = { reducedMotion: { matches: false }, mobFacing: new WeakMap(), turnToward, drawHero, drawOrb, drawBoss,
    HERO_CLASSES, circle: (ctx, x, y, radius) => ctx.arc(x, y, radius, 0, Math.PI * 2) };
vm.createContext(sandbox);
vm.runInContext(`${actorCode}\nthis.drawActor = drawActor;`, sandbox);
const player = createState().player;
for (const kind of ENEMY_KINDS) {
    const actor = { kind, x: 300, y: 300, radius: kind === 'boss' ? 40 : 18, moving: 1, stridePhase: 0.4,
        swing: 0.1, health: 100, maxHealth: 100, elite: 0, chilled: 0, winding: 0, attackWindup: 0, flash: 0 };
    sandbox.drawActor(context(), actor, player, 1, mapForWave(11), 'knight');
    player.x = 100;
    sandbox.drawActor(context(), actor, player, 1.016, mapForWave(11), 'knight');
    assert.ok(Number.isFinite(sandbox.mobFacing.get(actor).angle));
    assert.ok(Math.abs(turnToward(0, Math.PI, 0.016, 10)) <= 0.16);
}
console.log('PASS: randomized stage layouts, bounds, safe center, staggered warnings/damage, and finite drawing for all mob kinds');
