import assert from 'node:assert/strict';
import { startRun, step, pendingSpawns, weaponDamage } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';

function spawn(wave, difficulty = 'hard', hero = 'knight', upgraded = false) {
    const state = startRun(() => 0.5, difficulty, hero, true);
    if (upgraded) {
        state.upgrades.weapon = 8;
        state.upgrades.cleave = 8;
        state.player.weaponBonus = 600;
        state.player.level = 30;
        state.loadout.auto = ['nova', 'burst', 'guard', 'none'];
    }
    state.wave = wave - 1;
    state.intermission = 0;
    state.resumeDelay = 0.01;
    state.travelPending = 1;
    state.quickTravel = 1;
    step(state, {}, 0.01);
    assert.equal(state.wave, wave);
    return state;
}
const all = state => [...state.enemies, ...state.spawnQueue];
const stats = state => all(state).map(({ kind, maxHealth, damage, speed }) => ({ kind, maxHealth, damage, speed }));
const baseline = { hard: [48, 19], nightmare: [68, 26], inferno: [94, 36] };
for (const difficulty of Object.keys(baseline)) {
    const first = spawn(1, difficulty);
    assert.deepEqual([first.enemies[0].maxHealth, first.enemies[0].damage], baseline[difficulty], 'wave 1 remains unchanged');
    assert.equal(all(first).length, 7);
    let previousHealth = 0, previousDamage = 0;
    for (let wave = 1; wave <= 30; wave++) {
        const state = spawn(wave, difficulty);
        const enemy = all(state).find(e => !e.elite && !['boss', 'brute', 'sentinel', 'runner'].includes(e.kind));
        assert.ok(enemy, `standard enemy available at wave ${wave}`);
        assert.ok(enemy.maxHealth > previousHealth, `${difficulty} health grows at wave ${wave}`);
        assert.ok(enemy.damage >= previousDamage, `${difficulty} damage does not fall at wave ${wave}`);
        previousHealth = enemy.maxHealth;
        previousDamage = enemy.damage;
    }
    for (const hero of ['knight', 'ranger', 'warden', 'sorcerer']) {
        const ordinary = spawn(20, difficulty, hero);
        const upgraded = spawn(20, difficulty, hero, true);
        assert.deepEqual(stats(ordinary), stats(upgraded), 'upgrades do not trigger reactive enemy scaling');
        assert.ok(weaponDamage(upgraded) > weaponDamage(ordinary), 'upgrades retain real power');
    }
    let lastFloor = 0, lastInterval = Infinity;
    for (const wave of [2, 8, 14, 20, 26]) {
        const state = spawn(wave, difficulty);
        state.enemies = [];
        const before = pendingSpawns(state);
        step(state, {}, 0.01);
        assert.ok(state.enemies.length > lastFloor, `active floor rises at wave ${wave}`);
        assert.equal(before - pendingSpawns(state), state.enemies.length);
        assert.ok(state.spawnTimer < lastInterval, 'reinforcement intervals shorten');
        lastFloor = state.enemies.length;
        lastInterval = state.spawnTimer;
    }
}
console.table([1, 5, 10, 15, 20, 25, 30].map(wave => {
    const state = spawn(wave);
    return { wave, openingHealth: state.enemies[0].maxHealth, openingDamage: state.enemies[0].damage, waveEnemies: all(state).length };
}));
console.log('PASS: unchanged wave 1, all-wave growth, escalating pacing and non-reactive upgrades across classes/difficulties');
