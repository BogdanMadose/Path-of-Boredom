import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOSS_PROFILES } from '../../Path of Boredom.Game/wwwroot/js/arpg-bosses.js';
import { bossShapes, bossDanger, drawBossDanger, bossWarning } from '../../Path of Boredom.Game/wwwroot/js/arpg-boss-patterns.js';
import { ELITE_FORMATIONS, encounterFormation, encounterKind, encounterElite } from '../../Path of Boredom.Game/wwwroot/js/arpg-encounters.js';
import { BUILD_SYNERGIES, buildSynergy, checkpointReport } from '../../Path of Boredom.Game/wwwroot/js/arpg-adventures.js';
import { startRun, armorRating, resistanceRating, movementSpeed, cooldownRecovery, step } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';

for (const profile of BOSS_PROFILES) {
    const enemy = { x: 300, y: 300, attackX: 600, attackY: 300, combat: { pattern: 1 } };
    const shapes = [];
    for (const pattern of [1, 2, 3]) {
        enemy.combat.pattern = pattern;
        shapes.push(JSON.stringify(bossShapes(profile, enemy)));
        assert.ok(bossWarning(profile, pattern).includes('—'));
        let saves = 0;
        const ctx = new Proxy({}, { get: (_, key) => (...args) => {
            if (key === 'save') saves++;
            if (key === 'restore') saves--;
            for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
        } });
        drawBossDanger(ctx, profile, enemy);
        assert.equal(saves, 0);
        for (const shape of bossShapes(profile, enemy)) {
            const point = shape.kind === 'lane' ? { x: shape.x + Math.cos(shape.angle) * shape.length / 2, y: shape.y + Math.sin(shape.angle) * shape.length / 2 }
                : { x: shape.x + (shape.radius + shape.inner) / 2, y: shape.y };
            assert.equal(bossDanger(profile, enemy, point), true);
        }
        assert.equal(bossDanger(profile, enemy, { x: -2000, y: -2000 }), false);
    }
    assert.equal(new Set(shapes).size, 3, `${profile.id} has three distinct moves`);
}
for (const formation of ELITE_FORMATIONS) {
    const wave = Array.from({ length: 90 }, (_, i) => i + 1).find(wave => encounterFormation(wave) === formation);
    assert.ok(wave);
    assert.deepEqual([0, 1, 2].map(i => encounterKind(wave, i)), formation.kinds);
    assert.deepEqual([0, 1, 2].map(i => encounterElite(wave, i)), [1, 0, 0]);
}
for (const synergy of BUILD_SYNERGIES) {
    const state = startRun(() => 0.99);
    state.loadout.auto = [...synergy.skills, 'none', 'none'];
    assert.ok(buildSynergy(state).detail.includes(synergy.name));
    assert.ok(buildSynergy(state)[synergy.stat] > (synergy.stat === 'damage' ? 1 : 0));
}
const state = startRun(() => 0.99);
state.loadout.auto = ['guard', 'repulse', 'none', 'none'];
assert.equal(armorRating(state), armorRating(startRun(() => 0.99)) + 3);
state.loadout.auto = ['guard', 'siphon', 'none', 'none'];
assert.equal(resistanceRating(state), resistanceRating(startRun(() => 0.99)) + 3);
state.loadout.auto = ['meteor', 'frost', 'none', 'none'];
assert.ok(movementSpeed(state) > movementSpeed(startRun(() => 0.99)));
state.loadout.auto = ['chain', 'repulse', 'none', 'none'];
assert.equal(cooldownRecovery(state), 1.03);
state.wave = 5; state.status = 'camp'; state.adventures.relics[0] = 1;
state.runSystems.challenge = { key: 'flaskless', stage: 1, elapsed: 20, damage: 0, flasks: 0, resolved: 1 };
assert.match(checkpointReport(state), /completed \(\+150 gold\)/);
state.runSystems.challenge.flasks = 1;
assert.match(checkpointReport(state), /failed \(no penalty\)/);
assert.match(checkpointReport(state), /Available now/);
state.adventures.eventStage = 1;
assert.match(checkpointReport(state), /Already resolved/);
const fresh = startRun(() => 0.99);
fresh.resumeDelay = 0;
step(fresh, {}, 0.05);
assert.equal(restoreSnapshot(captureSnapshot(fresh)).heroClass, 'knight');
const runtime = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
assert.ok(runtime.indexOf('const descriptions =') < runtime.indexOf("descriptions.attack ="), 'descriptions are initialized before use');
const home = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
const equipment = home.slice(home.indexOf('<section class="equipment-options">'), home.indexOf('<div class="forge-grid">'));
assert.ok(equipment.includes('data-equipment-preview'));
console.log('PASS: 18 distinct boss moves, shared safe/hit geometry, complementary elite formations, eight bounded synergies, factual checkpoint results, equipment preview placement and description initialization');
