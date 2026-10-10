export const skillDamageType = (state, skill) => state.heroClass === 'sorcerer' || state.heroClass === 'knight' && !['attack', 'reap'].includes(skill)
    || state.heroClass === 'warden' && ['chain', 'frost', 'siphon'].includes(skill) ? 'magical' : 'physical';
export const enemyDamageType = (kind, attack = 'melee strike', mapIndex = 0) => attack === 'melee strike' || attack === 'charge' || attack === 'mortar blast' || attack === 'explosion' ? 'physical'
    : kind === 'boss' ? mapIndex >= 2 ? 'magical' : 'physical'
    : ['wisp', 'hexer', 'summoner', 'cantor'].includes(kind) ? 'magical' : 'physical';
export const hazardDamageType = hazard => ['fire', 'storm', 'void'].includes(hazard) ? 'magical' : 'physical';
export const incomingDamageType = source => source?.startsWith('[MAG]') ? 'magical' : source?.startsWith('[PHY]') ? 'physical'
    : /wisp: projectile|hexer: projectile|summoner: projectile|cantor: projectile|ground hazard/i.test(source ?? '') ? 'magical' : 'physical';
export const enemyDefense = enemy => ({ physical: enemy.modifier === 'armored' ? 20 : 0, magical: ['wisp', 'hexer', 'cantor'].includes(enemy.kind) ? 20 : 0 });
export const mitigateDamage = (damage, rating) => Math.max(1, Math.round(damage * (1 - Math.max(0, Math.min(60, rating)) / 100)));
