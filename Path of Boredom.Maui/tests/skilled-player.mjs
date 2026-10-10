import { movementSpeed, skillReach, chargeLaneEnd, flaskHealing, buyUpgrade, togglePause } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { learnSkill, skillPointsLeft } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
import { bossDanger } from '../../Path of Boredom.Game/wwwroot/js/arpg-boss-patterns.js';
import { bossProfile } from '../../Path of Boredom.Game/wwwroot/js/arpg-bosses.js';
import { arenaHazards, hazardPhase } from '../../Path of Boredom.Game/wwwroot/js/arpg-hazards.js';

const ranged = new Set(['wisp', 'spitter', 'hexer', 'artillerist', 'summoner', 'cantor']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segmentDistance(point, start, end) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(point.x - start.x - dx * t, point.y - start.y - dy * t);
}
export function threatScore(state, point, horizon = 0) {
    let risk = 0;
    if (point.x < 48 || point.x > 1052 || point.y < 48 || point.y > 602) risk += 500;
    for (const shot of state.projectiles) {
        const start = { x: shot.x + shot.vx * Math.max(0, horizon - 0.15), y: shot.y + shot.vy * Math.max(0, horizon - 0.15) };
        const end = { x: shot.x + shot.vx * (horizon + 0.15), y: shot.y + shot.vy * (horizon + 0.15) };
        if (shot.life >= horizon && segmentDistance(point, start, end) < point.radius + 14) risk += shot.damage * 3;
    }
    for (const hazard of arenaHazards(state)) {
        const phase = hazardPhase(hazard, state.time + horizon);
        if (phase >= 2 && distance(point, hazard) < hazard.radius + point.radius + 8) risk += phase >= 4 ? 100 : 35;
    }
    for (const enemy of state.enemies) {
        if (enemy.health <= 0) continue;
        const d = distance(point, enemy);
        if (enemy.kind === 'boss' && enemy.winding > 0 && bossDanger(bossProfile(state.wave), enemy, point)) risk += enemy.damage * (enemy.winding <= horizon + 0.2 ? 4 : 1.5);
        if (['lancer', 'reaver'].includes(enemy.kind) && (enemy.winding > 0 || enemy.charging > 0)) {
            if (segmentDistance(point, enemy, chargeLaneEnd(enemy)) < enemy.radius + point.radius + 12) risk += enemy.damage * 3;
        }
        if (enemy.kind === 'bomber' && d < 130 + point.radius) risk += enemy.damage * 3;
        if (enemy.kind === 'artillerist' && enemy.attackWindup > 0 && distance(point, { x: enemy.attackX, y: enemy.attackY }) < 100 + point.radius) risk += enemy.damage * 3;
        if (!ranged.has(enemy.kind)) {
            const reach = enemy.kind === 'duelist' ? 85 : enemy.radius + point.radius + 28;
            if (enemy.attackWindup > 0 && d < reach + point.radius + 10) {
                const angle = Math.atan2(enemy.attackY - enemy.y, enemy.attackX - enemy.x);
                if (Math.cos(Math.atan2(point.y - enemy.y, point.x - enemy.x) - angle) > 0.15) risk += enemy.damage * 3;
            }
            if (d < enemy.radius + point.radius + 15) risk += 25;
        }
    }
    return risk;
}
export function spendProgression(state) {
    const original = state.status;
    if (!['playing', 'paused', 'camp'].includes(original)) return;
    if (original === 'playing') togglePause(state);
    const selected = state.loadout.auto.filter(key => key !== 'none');
    const priorities = [['attack', 'edge'], ['attack', 'rhythm'], ['potion', 'concentration'], ['dodge', 'agility'],
        ...selected.map(skill => [skill, Object.keys(state.skillTree[skill])[0]]), ['nova', 'chill'], ['guard', 'barrier']];
    for (let pass = 0; pass < 8 && skillPointsLeft(state) > 0; pass++) for (const [skill, node] of priorities) learnSkill(state, skill, node);
    for (const key of ['weapon', 'armor', 'cleave', 'flask', ...selected, 'dodge']) buyUpgrade(state, key);
    if (original === 'playing') togglePause(state);
}
export function createSkilledPlayer() {
    let nextDecision = -1, input = { x: 0, y: 0, autoAttack: true }, lastLevel = 0, lastWave = 0;
    return state => {
        if (state.player.level !== lastLevel || state.wave !== lastWave) {
            spendProgression(state); lastLevel = state.player.level; lastWave = state.wave;
        }
        if (state.time < nextDecision) return { ...input, dodge: false, potion: false };
        nextDecision = state.time + 0.15;
        const p = state.player, speed = movementSpeed(state);
        const targets = state.enemies.filter(enemy => enemy.health > 0);
        const reach = skillReach(state, 'attack');
        const target = targets.toSorted((a, b) => {
            const score = enemy => distance(p, enemy) + (['cantor', 'summoner'].includes(enemy.kind) ? -120 : 0) + enemy.health / enemy.maxHealth * 20;
            return score(a) - score(b);
        })[0];
        const desired = reach > 300 ? Math.min(440, reach * 0.65) : reach * 0.65;
        const candidates = Array.from({ length: 17 }, (_, i) => {
            const angle = i * Math.PI / 8;
            const x = i === 16 ? 0 : Math.cos(angle), y = i === 16 ? 0 : Math.sin(angle);
            let score = 0;
            for (const horizon of [0.15, 0.4, 0.7]) {
                const point = { x: p.x + x * speed * horizon, y: p.y + y * speed * horizon, radius: p.radius };
                score += threatScore(state, point, horizon) * (horizon === 0.15 ? 2 : 1);
                if (target) score += Math.abs(distance(point, target) - desired) * 0.035;
                score += Math.max(0, 95 - Math.min(point.x, 1100 - point.x, point.y, 650 - point.y)) * 0.2;
            }
            score += (1 - x * input.x - y * input.y) * 2;
            return { x, y, score };
        }).toSorted((a, b) => a.score - b.score);
        const best = candidates[0];
        const imminent = threatScore(state, { ...p, x: p.x + p.vx * 0.15, y: p.y + p.vy * 0.15 }, 0.15);
        const landing = { x: clamp(p.x + best.x * 220, 42, 1058), y: clamp(p.y + best.y * 220, 42, 608), radius: p.radius };
        const healing = flaskHealing(state);
        input = { x: best.x, y: best.y, autoAttack: true,
            dodge: imminent > 35 && p.dodge <= 0 && p.rolling <= 0 && threatScore(state, landing, 0.32) < imminent,
            potion: p.potions > 0 && p.potion <= 0 && p.health < p.maxHealth * 0.7 && p.maxHealth - p.health >= healing * 0.9 };
        return input;
    };
}
