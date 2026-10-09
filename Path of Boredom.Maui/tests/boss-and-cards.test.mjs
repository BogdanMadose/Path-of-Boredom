import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startRun, step, chooseLevelCard } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { LEVEL_CARDS, drawLevelCards, levelCardAvailable } from '../../Path of Boredom.Game/wwwroot/js/arpg-cards.js';
import { SLOTTABLE_SKILLS } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
import { difficultyFor } from '../../Path of Boredom.Game/wwwroot/js/arpg-difficulty.js';
import { mapIndexForWave } from '../../Path of Boredom.Game/wwwroot/js/arpg-campaign.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';

for (const hero of ['knight', 'ranger', 'warden']) {
    for (const chosen of SLOTTABLE_SKILLS) {
        const state = startRun(() => 0.5, 'hard', hero);
        state.loadout.auto = [chosen, 'none', 'none', 'none'];
        for (const skill of ['nova', 'burst', 'guard']) assert.equal(levelCardAvailable(state, skill), chosen === skill);
        for (const key of ['edge', 'cleave', 'focus', 'siphon', 'fortune']) assert.equal(levelCardAvailable(state, key), true, `${key} is a general boon, not a chosen ability`);
        let seed = 42;
        state.random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
        for (let draft = 0; draft < 100; draft++) {
            const choices = drawLevelCards(state);
            assert.equal(new Set(choices).size, 3);
            assert.ok(choices.every(key => levelCardAvailable(state, key)));
            assert.ok(choices.every(key => !['nova', 'burst', 'guard'].includes(key) || key === chosen));
        }
        state.boons.focus = LEVEL_CARDS.focus.max;
        assert.equal(levelCardAvailable(state, 'focus'), false);
        state.player.level = 10;
        state.loadout.auto = ['nova', 'burst', 'guard', 'none'];
        for (const skill of ['nova', 'burst', 'guard']) assert.equal(levelCardAvailable(state, skill), true);
    }
}

const pending = startRun(() => 0.5, 'hard', 'ranger');
pending.player.level = 2;
pending.loadout.auto = ['chain', 'none', 'none', 'none'];
pending.status = 'choosing';
pending.pendingChoices = 1;
pending.cardChoices = ['edge', 'vitality', 'fortune'];
const validDraft = captureSnapshot(pending);
assert.deepEqual(restoreSnapshot(validDraft).cardChoices, pending.cardChoices, 'valid offers must remain unchanged');
const oldDraft = structuredClone(validDraft);
oldDraft.state.cardChoices = ['nova', 'edge', 'guard'];
const repaired = restoreSnapshot(oldDraft, () => 0.1);
assert.equal(repaired.cardChoices[1], 'edge', 'valid offer stays in its original position');
assert.equal(new Set(repaired.cardChoices).size, 3);
assert.ok(repaired.cardChoices.every(key => levelCardAvailable(repaired, key)));
assert.deepEqual(restoreSnapshot(oldDraft, () => 0.9).cardChoices, repaired.cardChoices, 'repair must not depend on random rolls');
assert.deepEqual(restoreSnapshot(captureSnapshot(repaired)).cardChoices, repaired.cardChoices);
pending.cardChoices = ['nova', 'edge', 'guard'];
assert.equal(chooseLevelCard(pending, 'guard'), false, 'unselected-skill bonuses cannot be chosen from stale offers');
assert.equal(pending.pendingChoices, 1);
assert.equal(chooseLevelCard(pending, 'edge'), true);

function spawnBoss(wave, difficulty = 'hard') {
    const state = startRun(() => 0.5, difficulty, 'knight');
    state.resumeDelay = 0;
    state.wave = wave - 1;
    state.intermission = 0;
    step(state, {}, 0.05);
    assert.equal(state.wave, wave);
    const boss = state.enemies.find(enemy => enemy.kind === 'boss');
    assert.ok(boss);
    return { state, boss };
}
const fixtures = [];
for (const difficulty of ['hard', 'nightmare', 'inferno']) {
    for (const wave of [5, 10, 15, 20, 25, 30]) {
        const { state, boss } = spawnBoss(wave, difficulty);
        const act = mapIndexForWave(wave), rules = difficultyFor(state);
        const oldHealth = Math.round(Math.round((680 + act * 380) * (1 + act * 0.22)) * rules.health);
        assert.ok(boss.maxHealth >= oldHealth * 1.49, 'boss durability increases by about 50%');
        assert.equal(boss.speed, (90 + act * 10) * rules.speed);
        state.player.level = 20;
        state.loadout.auto = ['nova', 'burst', 'guard', 'none'];
        fixtures.push(captureSnapshot(state));
    }
}
const tick = state => step(state, {}, 0.05);
function isolatedBoss() {
    const arena = spawnBoss(5);
    arena.state.enemies = [arena.boss];
    arena.state.player.invulnerable = 10;
    arena.state.player.nova = 30;
    arena.boss.attackX = arena.state.player.x;
    arena.boss.attackY = arena.state.player.y;
    return arena;
}
for (const pattern of [1, 2, 3]) {
    const { state, boss } = isolatedBoss();
    boss.combat.phase = pattern;
    boss.combat.pattern = pattern;
    boss.health = boss.maxHealth * (pattern === 1 ? 1 : pattern === 2 ? 0.5 : 0.25);
    boss.winding = 0.05;
    tick(state);
    assert.equal(boss.combat.rest, pattern === 3 ? 0.65 : 0.45);
    assert.equal(boss.slam, 2.4);
    const duringRecovery = captureSnapshot(state);
    assert.equal(restoreSnapshot(duringRecovery).enemies[0].combat.rest, boss.combat.rest);
    tick(state);
    assert.ok(boss.slam < 2.4, 'next attack timer runs during recovery');
    for (let frame = 0; frame < 14; frame++) tick(state);
    assert.equal(boss.combat.rest, 0);
    assert.ok(boss.moving, 'boss resumes pursuing after its brief recovery');
    for (let frame = 0; frame < 40 && boss.winding === 0; frame++) tick(state);
    assert.ok(boss.winding > 0, 'boss proceeds into another telegraphed special promptly');
    assert.ok(boss.winding <= 1.1, 'special attack telegraphs remain readable');
    captureSnapshot(state);
}

const phaseChange = isolatedBoss();
phaseChange.boss.combat.rest = 1.5;
phaseChange.boss.health = phaseChange.boss.maxHealth * 0.25;
tick(phaseChange.state);
assert.equal(phaseChange.boss.combat.phase, 3, 'burst damage skips directly to the correct phase');
assert.ok(phaseChange.boss.combat.rest <= 0.35, 'phase change cannot stack a long stagger onto recovery');
for (let frame = 0; frame < 8; frame++) tick(phaseChange.state);
assert.equal(phaseChange.boss.combat.rest, 0);

const loadedRecovery = isolatedBoss();
loadedRecovery.boss.combat.rest = 2;
const reloaded = restoreSnapshot(captureSnapshot(loadedRecovery.state));
reloaded.status = 'playing';
tick(reloaded);
assert.ok(reloaded.enemies[0].combat.rest <= 0.65, 'legacy long recoveries are shortened after loading');

const telegraph = isolatedBoss();
telegraph.boss.health = telegraph.boss.maxHealth * 0.25;
telegraph.boss.winding = 0.8;
tick(telegraph.state);
assert.ok(telegraph.boss.winding > 0 && telegraph.boss.combat.rest === 0, 'phase transition must not cancel an attack telegraph');
captureSnapshot(telegraph.state);

if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(fixtures));
console.log('PASS: selected-skill drafts, deterministic legacy offer repair, tougher bosses, short recovery, concurrent attack timers, and valid current saves');
