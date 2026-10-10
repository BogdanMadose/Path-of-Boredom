import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOSS_PROFILES, bossProfile, drawBoss } from '../../Path of Boredom.Game/wwwroot/js/arpg-bosses.js';
import { MAPS } from '../../Path of Boredom.Game/wwwroot/js/arpg-campaign.js';
import { startEndlessRun, step } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';
assert.equal(new Set(BOSS_PROFILES.map(profile => profile.id)).size, 6);
const drawings = [];
for (const [index, profile] of BOSS_PROFILES.entries()) {
    assert.equal(bossProfile((index + 1) * 5), profile);
    assert.ok(profile.lore.length > 100);
    const calls = [];
    const ctx = new Proxy({}, { get: (_, key) => (...args) => { calls.push([key, ...args]); for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg)); }, set: () => true });
    drawBoss(ctx, { radius: 32, flash: 0 }, MAPS[index], 1);
    drawings.push(JSON.stringify(calls));
    for (const pattern of [1, 2, 3]) {
        const state = startEndlessRun(() => 0.99);
        state.wave = 35 + index * 5;
        state.resumeDelay = 0;
        state.intermission = 0;
        state.player.invulnerable = 10;
        state.loadout.auto = ['nova', 'burst', 'guard', 'none'];
        state.player.nova = state.player.burst = state.player.guard = 30;
        const boss = state.enemies[0];
        Object.assign(boss, { kind: 'boss', health: 1000, maxHealth: 1000, winding: 0.01, x: 100, y: 100, attackX: 500, attackY: 300, attackWindup: 0 });
        boss.combat = { phase: 3, pattern, rest: 0, volleys: [] };
        state.enemies = [boss];
        state.projectiles = [];
        step(state, {}, 0.02);
        assert.equal(boss.combat.rest, profile.recovery + (pattern === 3 ? 0.3 : 0));
        assert.equal(state.projectiles.length, pattern === 1 ? 0 : pattern === 2 ? profile.fan.length : profile.rays);
        assert.equal(restoreSnapshot(captureSnapshot(state)).enemies[0].combat.rest, boss.combat.rest);
    }
}
assert.equal(new Set(drawings).size, 6, 'boss silhouettes use distinct drawing paths');
const home = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
assert.ok(home.includes('data-lore-reader') && home.includes('data-open-lore'));
console.log('PASS: six boss silhouettes, lore profiles, projectile identities, recovery windows and save round-trips');
