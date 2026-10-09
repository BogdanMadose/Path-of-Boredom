import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startEndlessRun, useSkill, skillReach, weaponDamage } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { CLASS_SKILLS, SLOTTABLE_SKILLS, STARTER_SKILLS, TREE_NODES, skillName, combatSkillDefinition, treeNodeDefinition } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';

function arena(hero, skill, offsets = [[60, 0], [160, 0], [300, 0], [150, 120], [-80, 0], [0, 100]]) {
    const state = startEndlessRun(() => 0.99, 'hard', hero);
    const template = state.enemies.find(enemy => enemy.kind !== 'boss');
    state.resumeDelay = 0;
    state.intermission = 0;
    state.player.level = 20;
    state.player.x = 400;
    state.player.y = 325;
    state.player.facing = 0;
    state.player.health = state.player.maxHealth / 2;
    state.playerShots = [];
    state.projectiles = [];
    state.loadout.auto = [skill, ...SLOTTABLE_SKILLS.filter(key => key !== skill).slice(0, 2), 'none'];
    state.enemies = offsets.map(([x, y]) => ({ ...structuredClone(template), kind: 'husk', elite: 0, modifier: 'none',
        x: state.player.x + x, y: state.player.y + y, radius: 10, health: 10000, maxHealth: 25000,
        chilled: 0, chillStrength: 0, charging: 0, winding: 0, attackWindup: 0,
        combat: { volleys: [], phase: 1, rest: 0, pattern: 1 } }));
    return state;
}
const hitIndices = state => state.enemies.flatMap((enemy, index) => enemy.health < 10000 ? [index] : []);
const names = Object.keys(CLASS_SKILLS).flatMap(hero => SLOTTABLE_SKILLS.map(skill => skillName({ heroClass: hero }, skill)));
assert.equal(names.length, 27);
assert.equal(new Set(names).size, 27, 'all combat abilities have distinct names');
const fixtures = [];
for (const hero of Object.keys(CLASS_SKILLS)) {
    assert.equal(Object.keys(CLASS_SKILLS[hero]).length + 3, 9);
    assert.equal(new Set(STARTER_SKILLS.map(skill => skillName({ heroClass: hero }, skill))).size, 3);
    for (const skill of SLOTTABLE_SKILLS) {
        for (const upgraded of [false, true]) {
            const state = arena(hero, skill);
            if (upgraded) for (const [node, definition] of Object.entries(TREE_NODES[skill])) state.skillTree[skill][node] = definition.max;
            assert.equal(useSkill(state, skill, true), true, `${hero}/${skill} must cast`);
            assert.ok(state.player[skill] > 0);
            assert.equal(useSkill(state, skill, true), false, 'cooldown prevents recasting');
            assert.ok(hitIndices(state).length || state.playerShots.length, 'ability must deal damage or fire projectiles');
            if (CLASS_SKILLS[hero][skill]) {
                assert.equal(state.player[skill], combatSkillDefinition(state, skill).cooldown / (1 + state.skillTree[skill].recovery * 0.1));
                assert.equal(treeNodeDefinition(state, skill, 'ember').detail, CLASS_SKILLS[hero][skill].keystone);
            }
            const snapshot = captureSnapshot(state);
            assert.equal(snapshot.version, 16);
            const restored = restoreSnapshot(snapshot);
            assert.deepEqual(restored.loadout, state.loadout);
            assert.equal(restored.player.afterstep, state.player.afterstep);
            assert.equal(restored.player.flaskWard, state.player.flaskWard);
            assert.deepEqual(restored.enemies.map(enemy => [enemy.health, enemy.chilled, enemy.chillStrength]), state.enemies.map(enemy => [enemy.health, enemy.chilled, enemy.chillStrength]));
            fixtures.push(snapshot);
        }
    }
}

// Shared save keys must resolve to genuinely different targeting and secondary effects.
const chainResults = Object.keys(CLASS_SKILLS).map(hero => {
    const state = arena(hero, 'chain');
    useSkill(state, 'chain', true);
    return hitIndices(state);
});
assert.deepEqual(chainResults, [[0, 1, 3], [0, 3], [0, 1, 4, 5]]);
const knightCross = arena('knight', 'frost', [[100, 0], [0, 100], [100, 100]]);
useSkill(knightCross, 'frost', true);
assert.deepEqual(hitIndices(knightCross), [0, 1]);
assert.ok(knightCross.enemies.every(enemy => enemy.chilled === 0));
const rangerSnare = arena('ranger', 'frost', [[200, 0], [240, 40], [-80, 0]]);
useSkill(rangerSnare, 'frost', true);
assert.deepEqual(hitIndices(rangerSnare), [2], 'snare bursts around nearest target, not around player');
assert.equal(rangerSnare.enemies[2].chillStrength, 0.55);
const iceWedge = arena('warden', 'frost', [[100, 0], [0, 100], [-80, 0]]);
useSkill(iceWedge, 'frost', true);
assert.deepEqual(hitIndices(iceWedge), [0]);
assert.equal(iceWedge.enemies[0].chillStrength, 0.45);

const deadeye = arena('ranger', 'reap', [[60, 0], [600, 0]]);
useSkill(deadeye, 'reap', true);
assert.deepEqual(hitIndices(deadeye), [1]);
const shieldbreaker = arena('warden', 'reap', [[60, 0], [160, 0]]);
shieldbreaker.enemies[1].kind = 'sentinel';
useSkill(shieldbreaker, 'reap', true);
assert.deepEqual(hitIndices(shieldbreaker), [1], 'armored targets take priority');
const execution = arena('knight', 'reap', [[60, 0], [-60, 0]]);
useSkill(execution, 'reap', true);
assert.deepEqual(hitIndices(execution), [0]);

const spear = arena('knight', 'meteor', [[60, 0], [300, 0], [150, 80]]);
useSkill(spear, 'meteor', true);
assert.deepEqual(hitIndices(spear), [0, 1]);
const scatter = arena('ranger', 'meteor', [[60, 0], [160, 0], [-60, 0]]);
useSkill(scatter, 'meteor', true);
assert.deepEqual(hitIndices(scatter), [0], 'front targets block arrow lanes');
const pillars = arena('warden', 'meteor', [[150, 0], [300, 0], [450, 0], [225, 80]]);
useSkill(pillars, 'meteor', true);
assert.deepEqual(hitIndices(pillars), [0, 1, 2]);

for (const hero of Object.keys(CLASS_SKILLS)) {
    const state = arena(hero, 'siphon');
    const health = state.player.health;
    useSkill(state, 'siphon', true);
    assert.ok(state.player.health > health);
    assert.equal(state.player.flaskWard > 0, hero === 'warden');
}
const harvest = arena('ranger', 'siphon');
for (const enemy of harvest.enemies) enemy.health = enemy.maxHealth;
assert.equal(useSkill(harvest, 'siphon', true), false);
assert.equal(harvest.player.siphon, 0, 'no wounded target must not consume cooldown');
const siege = arena('warden', 'nullwave', [[60, 0], [160, 0], [-200, 0]]);
useSkill(siege, 'nullwave', true);
assert.deepEqual(hitIndices(siege), [1, 2], 'siege wave has an inner blind spot');
const gale = arena('ranger', 'nullwave');
useSkill(gale, 'nullwave', true);
assert.equal(gale.player.afterstep, 1.2);
assert.ok(gale.enemies[0].x > 460);
const breaker = arena('knight', 'nullwave', [[60, 0], [-60, 0]]);
breaker.projectiles = [{ x: 500, y: 325 }, { x: 300, y: 325 }];
useSkill(breaker, 'nullwave', true);
assert.deepEqual(hitIndices(breaker), [0]);
assert.deepEqual(breaker.projectiles, [{ x: 300, y: 325 }]);

const quake = arena('warden', 'nova', [[50, 0], [150, 0]]);
useSkill(quake, 'nova', true);
assert.ok(10000 - quake.enemies[0].health > 10000 - quake.enemies[1].health);
assert.equal(quake.enemies[0].chillStrength, 0.15);
for (const hero of ['ranger', 'warden']) {
    const ward = arena(hero, 'guard', [[60, 0]]);
    useSkill(ward, 'guard', true);
    if (hero === 'ranger') assert.equal(ward.enemies[0].chillStrength, 0.25);
    else assert.equal(ward.enemies[0].x, 520);
}
const invalidBuff = captureSnapshot(arena('knight', 'siphon'));
invalidBuff.state.player.flaskWard = 1;
assert.throws(() => restoreSnapshot(invalidBuff), 'buffs cannot be claimed by unrelated classes');
const invalidSlow = captureSnapshot(arena('ranger', 'frost'));
invalidSlow.state.enemies[0].chilled = 4;
assert.throws(() => restoreSnapshot(invalidSlow), 'slow duration stays bounded');

if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(fixtures));
console.log(`PASS: 27 unique class abilities, ${fixtures.length} base/upgraded active-combat save round-trips, distinct targeting and class effects`);
