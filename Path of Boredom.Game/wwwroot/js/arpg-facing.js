// Mobile attack facing is transient animation state, not part of the saved build.
export const MAX_WEAPON_TWIST = Math.PI / 3;
export const ATTACK_ALIGNMENT = Math.PI / 18;
export const BODY_TURN_SPEED = 4;
export const WEAPON_TURN_SPEED = 3;
export const angleDifference = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
export const turnToward = (from, to, dt, speed) => from + clamp(angleDifference(from, to), dt * speed);

export function updateCombatFacing(player, movementAngle, targetAngle, dt) {
    const weapon = player.weaponFacing ?? player.facing;
    const desired = targetAngle ?? movementAngle ?? player.facing;
    player.facing = turnToward(player.facing, movementAngle ?? desired, dt, BODY_TURN_SPEED);
    const constrained = player.facing + clamp(angleDifference(player.facing, desired), MAX_WEAPON_TWIST);
    const turned = turnToward(weapon, constrained, dt, WEAPON_TURN_SPEED);
    player.weaponFacing = player.facing + clamp(angleDifference(player.facing, turned), MAX_WEAPON_TWIST);
}
