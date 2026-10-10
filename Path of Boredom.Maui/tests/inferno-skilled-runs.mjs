import assert from 'node:assert/strict';
import { simulateRun } from './full-run-balance.mjs';
import { HERO_CLASSES } from '../../Path of Boredom.Game/wwwroot/js/arpg-classes.js';
const results = [];
const seeds = Array.from({ length: 20 }, (_, i) => 17 + i * 137);
for (const controller of ['baseline', 'skilled']) for (const build of controller === 'skilled' ? ['balanced', 'control', 'sustain'] : ['balanced']) for (const seed of seeds) for (const hero of Object.keys(HERO_CLASSES)) {
    const result = simulateRun(hero, 'inferno', seed, build, 1800, controller);
    assert.ok(Number.isFinite(result.damage) && result.damage > 0);
    results.push(result);
}
console.log(JSON.stringify({ methodology: '320 Inferno campaigns: 80 baseline balanced runs and 240 skilled runs across balanced/control/sustain, with 20 seeds per class/build, 50 ms engine ticks, 30-minute simulated combat limit. Balanced runs are paired by seed and class. Skilled policy uses 150 ms movement decisions, current telegraphs/projectile velocities, 0.7-second prediction, class-aware reach, support target preference, legal skill-tree/Forge purchases and heal-efficient flask use. No future RNG access, extra stats, forced kills or invulnerability. Deterministic expert-controller approximation, not human-play evidence: precise state access and optimal pausing exceed typical human execution. Baseline rerun at the same tick rate. Comparison bundles movement and progression improvements; it does not isolate their individual effects.', results }, null, 2));
