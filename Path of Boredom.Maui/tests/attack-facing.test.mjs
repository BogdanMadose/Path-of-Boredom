import assert from 'node:assert/strict';
import { startRun, startEndlessRun, step } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { angleDifference, turnToward, updateCombatFacing, MAX_WEAPON_TWIST, WEAPON_TURN_SPEED } from '../../Path of Boredom.Game/wwwroot/js/arpg-facing.js';
import { drawHero } from '../../Path of Boredom.Game/wwwroot/js/arpg-graphics.js';
import { HERO_CLASSES } from '../../Path of Boredom.Game/wwwroot/js/arpg-classes.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';

function arena(hero, offsets) {
    const template = startEndlessRun(() => 0.99, 'hard', hero).enemies[0];
    const state = startRun(() => 0.99, 'hard', hero);
    state.wave = 1;
    state.resumeDelay = 0;
    state.player.x = 400;
    state.player.y = 325;
    state.player.facing = 0;
    state.player.nova = 30;
    state.enemies = offsets.map(([x, y]) => ({ ...structuredClone(template), kind: 'husk', elite: 0, modifier: 'none',
        x: 400 + x, y: 325 + y, health: 10000, maxHealth: 10000, radius: 8, speed: 0, damage: 1,
        cooldown: 30, slam: 30, winding: 0, charging: 0, attackWindup: 0,
        combat: { volleys: [], phase: 1, rest: 0, pattern: 1 }, chilled: 0, chillStrength: 0 }));
    return state;
}
const tick = (state, movement = { x: 1 }) => step(state, { ...movement, autoAttack: true }, 0.05);

for (const hero of ['knight', 'ranger', 'warden']) {
    const rear = arena(hero, [[-60, 0]]);
    tick(rear);
    assert.ok(rear.player.attack > 0, `${hero} attacks immediately even when turning toward a rear target`);
    if (hero === 'ranger') assert.ok(rear.playerShots.some(shot => shot.vx < 0));
    else assert.ok(rear.enemies[0].health < 10000);
    assert.ok(rear.player.weaponFacing > 0 && rear.player.weaponFacing < Math.PI, 'rear-facing turn stays animated');

    const front = arena(hero, [[60, 0], [-40, 0]]);
    tick(front);
    assert.ok(front.player.attack > 0, 'nearest enemy remains the target regardless of facing');
    if (hero !== 'ranger') assert.ok(front.enemies[1].health < 10000);
    assert.equal(front.enemies[0].health, 10000);
    if (hero === 'ranger') assert.ok(front.playerShots.every(shot => shot.vx < 0));

    const idle = arena(hero, [[-60, 0]]);
    tick(idle, {});
    assert.ok(idle.player.attack > 0, 'standing character attacks without waiting for animation');
    if (hero === 'ranger') assert.ok(idle.playerShots.some(shot => shot.vx < 0));
    assert.ok(Math.abs(idle.player.weaponFacing) <= WEAPON_TURN_SPEED * 0.05 + 1e-8);
    for (let frame = 0; frame < 4; frame++) tick(idle, {});
    assert.ok(Math.abs(angleDifference(idle.player.weaponFacing, Math.PI)) < 1e-8, 'full turn finishes within 250ms');
    assert.ok(idle.enemies[0].health < 10000);

    const saved = captureSnapshot(idle);
    assert.equal(saved.version, 16);
    assert.equal('weaponFacing' in saved.state.player, false, 'animation-only facing must not change saves');
    assert.equal('attackFacing' in saved.state.player, false);
    assert.equal('weaponFacing' in restoreSnapshot(saved).player, false);
}

const turning = arena('ranger', [[400, 300]]);
tick(turning);
assert.ok(turning.player.attack > 0, 'off-axis targets are attacked on the first frame');
assert.ok(turning.player.weaponFacing > 0 && turning.player.weaponFacing <= WEAPON_TURN_SPEED * 0.05 + 1e-8);
const shot = turning.playerShots[0];
assert.ok(Math.abs(angleDifference(turning.player.attackFacing, Math.atan2(shot.vy, shot.vx))) < 1e-8, 'projectile aims accurately while the visual catches up');
turning.playerShots = [];
turning.player.attack = 0;
turning.enemies[0].y = turning.player.y - 250;
const before = turning.player.weaponFacing;
tick(turning);
assert.ok(Math.abs(angleDifference(before, turning.player.weaponFacing)) <= WEAPON_TURN_SPEED * 0.05 + 1e-8, 'target changes keep the brief turn animation');
assert.ok(turning.player.attack > 0, 'target changes never stall an available attack');
assert.ok(turning.playerShots.some(shot => shot.vy < 0));

const melee = arena('knight', [[80, 30]]);
tick(melee);
assert.ok(melee.player.attack > 0);
const slash = melee.effects.find(effect => effect.kind === 'slash');
assert.equal(slash.angle, melee.player.attackFacing, 'swing hits the target immediately instead of waiting for the visual pose');

for (const hero of ['knight', 'ranger', 'warden']) {
    const cadence = switching => {
        const state = arena(hero, [[60, 0]]);
        const attacks = [];
        for (let frame = 0; frame < 30; frame++) {
            const angle = switching ? [0, Math.PI / 2, Math.PI, -Math.PI / 2][frame % 4] : 0;
            state.enemies[0].x = state.player.x + Math.cos(angle) * 60;
            state.enemies[0].y = state.player.y + Math.sin(angle) * 60;
            const cooldown = state.player.attack;
            tick(state);
            if (state.player.attack > cooldown) attacks.push(frame);
        }
        return attacks;
    };
    const steady = cadence(false);
    assert.ok(steady.length > 1);
    assert.deepEqual(cadence(true), steady, `${hero} keeps its full attack cadence despite continuous target direction changes`);
}

const dodge = arena('ranger', [[80, 0]]);
tick(dodge, { y: 1, dodge: true });
assert.ok(Math.abs(dodge.player.rollX) < 1e-8);
assert.equal(dodge.player.rollY, 1, 'dodge follows movement, not weapon aim');

const desktop = arena('ranger', [[0, 60]]);
step(desktop, { x: 1, attack: true, aim: { x: 400, y: 385 } }, 0.05);
assert.equal(desktop.player.facing, Math.PI / 2);
assert.equal('weaponFacing' in desktop.player, false);
assert.ok(desktop.playerShots.some(shot => shot.vy > 0), 'desktop mouse aiming is unchanged');

const wrapped = turnToward(Math.PI - 0.01, -Math.PI + 0.1, 0.01, 3);
assert.ok(Math.abs(angleDifference(Math.PI - 0.01, wrapped)) <= 0.03 + 1e-8, 'turning across pi takes the short path');
for (let frame = 0, player = { facing: 0, weaponFacing: 0 }; frame < 120; frame++) {
    updateCombatFacing(player, frame < 60 ? Math.PI : -Math.PI / 2, Math.PI / 4, 1 / 60);
    assert.ok(Math.abs(angleDifference(player.facing, player.weaponFacing)) <= MAX_WEAPON_TWIST + 1e-8);
}

function context(rotations = []) {
    return new Proxy({}, { get: (target, key) => key in target ? target[key]
        : key === 'rotate' ? angle => rotations.push(angle)
        : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {},
        set: (target, key, value) => { target[key] = value; return true; } });
}
globalThis.document = { createElement: () => ({ getContext: () => context() }) };
for (const hero of Object.values(HERO_CLASSES)) {
    const rotations = [];
    drawHero(context(rotations), { facing: 0, weaponFacing: 0.5, invulnerable: 0, swing: 0 }, hero, 0, 0, 0, false);
    assert.ok(rotations.includes(0.5 * 0.45), 'torso follows aim partially');
    assert.ok(rotations.includes(0.5), 'weapon follows its attack heading');
}
console.log('PASS: immediate accurate attacks in every direction, unchanged attack cadence, quick cosmetic turning, dodge, desktop aiming, and unchanged v16 saves');
