import assert from 'node:assert/strict';
import { startRun, startTraining, startEndlessRun, step, useSkill, armorRating, resistanceRating, weaponDamage } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { enemyDamageType, hazardDamageType, skillDamageType, mitigateDamage, incomingDamageType } from '../../Path of Boredom.Game/wwwroot/js/arpg-damage.js';
import { awardBossRelic, resolveStageEvent, discoverChapter, buildSynergy } from '../../Path of Boredom.Game/wwwroot/js/arpg-adventures.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';
import { skillCapacity } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
assert.equal(enemyDamageType('wisp', 'projectile'), 'magical');
assert.equal(enemyDamageType('spitter', 'projectile'), 'physical');
assert.equal(enemyDamageType('hexer', 'melee strike'), 'physical');
assert.equal(enemyDamageType('boss', 'slam', 2), 'magical');
for (const hazard of ['fire', 'storm', 'void']) assert.equal(hazardDamageType(hazard), 'magical');
assert.equal(hazardDamageType('slow'), 'physical');
assert.equal(incomingDamageType('[MAG] boss: projectile'), 'magical');
assert.equal(mitigateDamage(100, 80), 40);
const state = startRun(() => 0.99, 'hard', 'sorcerer');
assert.equal(skillDamageType(state, 'attack'), 'magical');
assert.equal(armorRating(state), 0); assert.equal(resistanceRating(state), 12);
for (const [level, capacity] of [[1,1],[9,1],[10,2],[19,2],[20,3]]) { state.player.level = level; assert.equal(skillCapacity(state), capacity); }
state.status = 'paused'; state.loadout.auto = ['nova','frost','burst','none'];
assert.equal(buildSynergy(state).damage, 1.04);
state.wave = 15; const damage = weaponDamage(state); awardBossRelic(state); awardBossRelic(state);
assert.equal(state.adventures.relics[2], 1); assert.ok(weaponDamage(state) > damage);
state.wave = 0; state.gold = 100; state.player.health = 30;
assert.equal(resolveStageEvent(state, true, 0.8), true); assert.equal(state.gold, 20);
assert.equal(resolveStageEvent(state, true), false);
state.wave = 11; discoverChapter(state); state.wave = 0;
const saved = captureSnapshot(state); assert.equal(saved.version, 20);
assert.deepEqual(restoreSnapshot(saved).adventures, state.adventures);
for (const version of [18, 19]) {
    const old = structuredClone(saved); old.version = version; delete old.state.adventures;
    if (version === 18) delete old.state.skillSchedule;
    const restored = restoreSnapshot(old);
    assert.equal(restored.skillSchedule, version === 18 ? 'legacy' : 'modern');
    assert.deepEqual(restored.adventures.relics, [0,0,0,0,0,0]);
}
const invalid = structuredClone(saved); invalid.state.adventures.relics[0] = 2; assert.throws(() => restoreSnapshot(invalid));
const practice = startTraining(() => 0.99, 'hard', 'sorcerer'); awardBossRelic(practice); assert.equal(practice.adventures.relics.reduce((a,b)=>a+b), 0);
for (const type of ['[PHY]', '[MAG]']) {
    const run = startRun(() => 0.99, 'hard', 'sorcerer'); run.resumeDelay = 0;
    run.upgrades.armor = 5; run.player.maxHealth = run.player.health = 1000;
    run.projectiles = [{ x: run.player.x, y: run.player.y, vx: 0, vy: 0, life: 1, damage: 100, source: `${type} test projectile` }];
    step(run, {}, 0.01);
    const rating = type === '[PHY]' ? armorRating(run) : resistanceRating(run);
    assert.equal(1000 - run.player.health, mitigateDamage(100, rating));
}
console.log('PASS: explicit mob/hazard damage types, independent mitigations, modern/legacy slots, relics, events, synergies, codex and format-20 round-trips');
