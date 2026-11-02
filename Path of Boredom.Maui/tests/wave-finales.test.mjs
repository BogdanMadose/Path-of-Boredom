import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startRun, startEndlessRun, step, pendingSpawns, LAST_WAVE } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';
import { bossProfile } from '../../Path of Boredom.Game/wwwroot/js/arpg-bosses.js';
import { bossShapes, bossDanger, bossWarning } from '../../Path of Boredom.Game/wwwroot/js/arpg-boss-patterns.js';
import { DIFFICULTIES } from '../../Path of Boredom.Game/wwwroot/js/arpg-difficulty.js';

function spawn(wave, endless = false, difficulty = 'hard') {
    const state = endless ? startEndlessRun(() => 0.5, difficulty, 'knight', true) : startRun(() => 0.5, difficulty, 'knight', true);
    if (endless) state.loadout.auto = ['nova', 'burst', 'none', 'none'];
    state.player.nova = state.player.burst = 30;
    state.wave = wave - 1;
    state.enemies = []; state.spawnQueue = [];
    state.resumeDelay = 0.01; state.travelPending = 1; state.quickTravel = 1;
    step(state, {}, 0.01);
    assert.equal(state.wave, wave);
    return state;
}
const all = state => [...state.enemies, ...(state.spawnQueue ?? [])];
const regular = state => all(state).find(e => !e.elite && !['boss', 'runner', 'brute', 'sentinel'].includes(e.kind));
const saveFixtures = [];
for (const difficulty of Object.keys(DIFFICULTIES)) {
    const pressure = {hard:1.22, nightmare:1.42, inferno:1.62}[difficulty];
    let lastHealth = 0, lastDamage = 0;
    for (let echo = 1; echo <= 61; echo++) {
        const endless = spawn(LAST_WAVE + echo, true, difficulty), enemy = regular(endless);
        assert.ok(enemy.maxHealth > lastHealth, `Endless health keeps rising at echo ${echo}, ${difficulty}`);
        assert.ok(enemy.damage >= lastDamage, `Endless damage does not reset at echo ${echo}`);
        lastHealth = enemy.maxHealth; lastDamage = enemy.damage;
        if (echo <= 30) {
            const campaign = regular(spawn(echo, false, difficulty));
            const campaignBase = Math.round((32 + echo * 13) * (1 + Math.floor((echo - 1) / 5) * 0.18));
            const endlessBase = Math.round((32 + 30 * 13) * (1 + 5 * 0.18) * (1 + echo * 0.014));
            const campaignCurve = campaign.maxHealth / (campaignBase * DIFFICULTIES[difficulty].health * pressure);
            const endlessCurve = enemy.maxHealth / (endlessBase * DIFFICULTIES[difficulty].health * pressure * 1.12);
            assert.ok(Math.abs(campaignCurve - endlessCurve) < 0.02, `echo ${echo} follows the campaign curve on a veteran baseline`);
        }
    }
}
for (const endless of [false, true]) for (const local of [5, 10, 15, 20, 25, 30]) {
    const state = spawn(local + (endless ? LAST_WAVE : 0), endless);
    const boss = state.spawnQueue.at(-1);
    assert.equal(boss.kind, 'boss');
    assert.equal(state.enemies.some(e => e.kind === 'boss'), false, 'no opening boss');
    assert.equal(state.effects.some(e => e.kind === 'boss-intro'), false, 'no premature boss reveal');
    const saved = captureSnapshot(state), loaded = restoreSnapshot(saved);
    saveFixtures.push(saved);
    assert.equal(loaded.enemies.length, state.enemies.length);
    assert.equal(loaded.spawnQueue.length, state.spawnQueue.length);
    assert.equal(loaded.spawnQueue.at(-1).kind, 'boss', 'queued boss survives reload');
    assert.deepEqual(captureSnapshot(loaded).state.enemies, saved.state.enemies);
    for (const count of [-1, saved.state.enemies.length + 1, 0.5]) {
        const bad = structuredClone(saved); bad.state.queuedEnemies = count;
        assert.throws(() => restoreSnapshot(bad), 'invalid queue metadata is rejected');
    }
    const old = structuredClone(saved); delete old.state.queuedEnemies; delete old.state.spawnTimer;
    assert.equal(restoreSnapshot(old).enemies.length, saved.state.enemies.length, 'legacy snapshots still retain all enemies');
    while (state.spawnQueue[0]?.kind !== 'boss') {
        state.enemies = []; state.spawnTimer = 0;
        step(state, {}, 0.01);
        assert.equal(state.enemies.some(e => e.kind === 'boss'), false, 'guards precede boss');
    }
    const guard = state.enemies[0];
    state.enemies = Array.from({length:3}, () => structuredClone(guard));
    step(state, {}, 0.01);
    assert.equal(pendingSpawns(state), 1, 'boss waits while three guards remain');
    state.enemies.pop();
    step(state, {}, 0.01);
    assert.equal(pendingSpawns(state), 0);
    assert.equal(state.enemies.at(-1), boss);
    assert.equal(state.effects.filter(e => e.kind === 'boss-intro').length, 1, 'one reveal at actual arrival');
    assert.equal(captureSnapshot(state).state.queuedEnemies, 0);

    state.enemies = [boss]; state.player.invulnerable = 100;
    boss.cooldown = 100; boss.attackWindup = 0;
    let previous = boss.combat.pattern;
    for (let i = 0; i < 6; i++) {
        boss.combat.rest = 0; boss.winding = 0; boss.slam = 0;
        step(state, {}, 0.01);
        assert.equal(boss.combat.pattern, previous % 3 + 1, 'fixed learnable pattern sequence');
        previous = boss.combat.pattern;
        assert.equal(boss.winding, 1.1, 'full warning in every phase');
        const aim = [boss.attackX, boss.attackY];
        state.player.x = state.player.x === 100 ? 900 : 100;
        step(state, {}, 0.05);
        assert.deepEqual([boss.attackX, boss.attackY], aim, 'warning does not track the player after locking');
    }
    const profile = bossProfile(state.wave);
    for (const phase of [1, 2, 3]) for (const pattern of [1, 2, 3]) {
        boss.combat.phase = phase; boss.combat.pattern = pattern;
        boss.x = 550; boss.y = 325; boss.attackX = 750; boss.attackY = 400;
        const shapes = bossShapes(profile, boss);
        assert.ok(shapes.length > 0);
        assert.ok(bossWarning(profile, pattern, phase));
        let safe = 0;
        for (let x = 58; x < 1042; x += 40) for (let y = 58; y < 592; y += 40) {
            if (!bossDanger(profile, boss, {x,y,radius:16})) safe++;
        }
        assert.ok(safe > 10, `${profile.id} phase ${phase} pattern ${pattern} leaves safe space`);
    }
    boss.combat.phase = 1;
    const base = bossShapes(profile, boss, 1).length;
    boss.combat.phase = 3;
    assert.ok(bossShapes(profile, boss, 1).length > base, 'every boss has an extra final-phase hazard');
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(saveFixtures));
console.log('PASS: Endless 30-wave alignment and continued growth, boss finales, save queues, deterministic warnings and safe zones for all six bosses');
