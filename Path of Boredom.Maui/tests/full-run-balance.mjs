import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createSkilledPlayer } from './skilled-player.mjs';
import { startRun, step, continueJourney, chooseLevelCard, buyUpgrade, skillReach } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { HERO_CLASSES } from '../../Path of Boredom.Game/wwwroot/js/arpg-classes.js';
import { needsSkillChoice, setLoadout } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
import { bossDanger } from '../../Path of Boredom.Game/wwwroot/js/arpg-boss-patterns.js';
import { bossProfile } from '../../Path of Boredom.Game/wwwroot/js/arpg-bosses.js';
import { arenaHazards, hazardPhase } from '../../Path of Boredom.Game/wwwroot/js/arpg-hazards.js';
import { acceptChallenge } from '../../Path of Boredom.Game/wwwroot/js/arpg-run-systems.js';

function seeded(seed) {
    return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
const builds = { balanced: ['nova', 'burst', 'guard'], control: ['nova', 'frost', 'meteor'], sustain: ['nova', 'siphon', 'reap'] };
export function simulateRun(heroClass, difficulty, seed, build = 'balanced', limit = 2400, controller = 'baseline') {
    const state = startRun(seeded(seed), difficulty, heroClass);
    state.loadout.auto[0] = builds[build][0];
    const bossTimes = [], bossStarts = new Map();
    const recordedHits = new WeakSet();
    const skilledInput = controller === 'skilled' ? createSkilledPlayer() : null;
    let damageTaken = 0, minimumHealth = 1, ticks = 0;
    const dt = 0.05;
    while (!['dead', 'won'].includes(state.status) && ticks++ < limit / dt) {
        if (state.status === 'choosing') {
            const choices = state.cardChoices;
            const preferred = ['edge', 'bulwark', 'focus', 'stride', 'vitality', 'critChance'];
            chooseLevelCard(state, preferred.find(key => choices.includes(key)) ?? choices[0]);
            continue;
        }
        if (needsSkillChoice(state)) {
            const count = state.player.level >= 20 ? 3 : 2;
            assert.equal(setLoadout(state, 'none', [...builds[build].slice(0, count), ...Array(4 - count).fill('none')]), true);
            state.status = 'playing';
        }
        if (state.status === 'camp') {
            for (const key of ['weapon', 'armor', 'flask', 'nova', 'dodge', 'cleave', ...state.loadout.auto.filter(key => key !== 'none')]) {
                for (let rank = 0; rank < 2; rank++) if (!buyUpgrade(state, key)) break;
            }
            acceptChallenge(state, 'flaskless');
            continueJourney(state);
        }
        const p = state.player;
        const targets = state.enemies.filter(enemy => enemy.health > 0);
        const nearest = targets.toSorted((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        const boss = targets.find(enemy => enemy.kind === 'boss');
        if (boss && !bossStarts.has(state.wave)) bossStarts.set(state.wave, state.runSystems.summary.seconds);
        let x = 0, y = 0;
        if (nearest) {
            const dx = nearest.x - p.x, dy = nearest.y - p.y, distance = Math.hypot(dx, dy) || 1;
            const desired = Math.min(300, skillReach(state, 'attack') * 0.7);
            const approach = distance > desired ? 1 : distance < desired * 0.6 ? -1 : 0;
            x = dx / distance * approach - dy / distance * 0.35;
            y = dy / distance * approach + dx / distance * 0.35;
        }
        const danger = point => (boss?.winding > 0 && bossDanger(bossProfile(state.wave), boss, point))
            || arenaHazards(state).some(hazard => hazardPhase(hazard, state.time) >= 2 && Math.hypot(point.x - hazard.x, point.y - hazard.y) < hazard.radius + p.radius)
            || targets.some(enemy => enemy.attackWindup > 0 && Math.hypot(point.x - enemy.attackX, point.y - enemy.attackY) < (enemy.kind === 'artillerist' ? 100 : 35));
        const threatened = danger(p);
        if (threatened) {
            const candidates = Array.from({ length: 16 }, (_, i) => {
                const angle = i * Math.PI / 8;
                const point = { x: p.x + Math.cos(angle) * 145, y: p.y + Math.sin(angle) * 145, radius: p.radius };
                const score = (danger(point) ? 10000 : 0) + (point.x < 50 || point.x > 1050 || point.y < 50 || point.y > 600 ? 10000 : 0)
                    + Math.hypot(point.x - 550, point.y - 325);
                return { angle, score };
            }).toSorted((a, b) => a.score - b.score);
            x = Math.cos(candidates[0].angle); y = Math.sin(candidates[0].angle);
        }
        const controls = skilledInput ? skilledInput(state) : { x, y, autoAttack: true, dodge: threatened && p.dodge <= 0, potion: p.health < p.maxHealth * 0.45 && p.potions > 0 };
        step(state, controls, dt);
        for (const hit of state.damageHistory) if (!recordedHits.has(hit)) {
            recordedHits.add(hit);
            damageTaken += hit.damage;
        }
        minimumHealth = Math.min(minimumHealth, p.health / p.maxHealth);
        if (boss && boss.health <= 0) bossTimes.push({ wave: state.wave, seconds: +(state.runSystems.summary.seconds - bossStarts.get(state.wave)).toFixed(1) });
    }
    const damage = Object.values(state.runSystems.summary.damage).reduce((a, b) => a + b, 0);
    return { heroClass, difficulty, seed, build, controller, outcome: ['dead', 'won'].includes(state.status) ? state.status : 'timeout', wave: state.wave, seconds: +state.runSystems.summary.seconds.toFixed(1),
        damage: Math.round(damage), damageTaken: Math.round(damageTaken), minimumHealth: +minimumHealth.toFixed(3), flasks: state.runSystems.summary.flasks, bossTimes,
        level: state.player.level, loadout: state.loadout.auto, goldSpent: state.runSystems.summary.spent,
        treePoints: Object.values(state.skillTree).reduce((sum, tree) => sum + Object.values(tree).reduce((a, b) => a + b, 0), 0),
        deathSource: state.damageHistory.findLast(hit => hit.lethal)?.source ?? null };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const results = [];
for (const difficulty of ['hard', 'nightmare', 'inferno']) for (const build of Object.keys(builds)) for (const seed of [17, 83, 251]) for (const hero of Object.keys(HERO_CLASSES)) {
    const result = simulateRun(hero, difficulty, seed, build);
    assert.ok(Number.isFinite(result.damage) && result.damage > 0);
    results.push(result);
}
console.log(JSON.stringify({ methodology: '108 seeded real-engine campaign simulations; same movement/avoidance, flask threshold, card priorities and checkpoint spending per class. No invulnerability, stat overrides or forced kills. This is a repeatable AI-policy comparison, not a claim of human balance. Damage taken sums unique recorded post-mitigation hits, including hits healed in the same tick.', results }, null, 2));
}
