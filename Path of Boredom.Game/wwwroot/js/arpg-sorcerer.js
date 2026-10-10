export const SORCERER_SKILLS = {
    chain: { name: 'Arc relay', cooldown: 8, reach: 480, damage: 1.25, color: '#baa4ef', detail: 'Lightning jumps to three enemies within 180 units, retaining 75% damage per jump.', keystone: 'Arc relay jumps to two additional enemies.' },
    frost: { name: 'Rime sphere', cooldown: 10, reach: 440, damage: 1.1, color: '#a4daef', detail: 'An icy blast around the nearest enemy slows walking by 35% for two seconds. Charges are unaffected.', keystone: 'Rime sphere radius increases by 40.' },
    reap: { name: 'Soul needle', cooldown: 6, reach: 600, damage: 1.7, color: '#baa4ef', detail: 'A focused spell strikes the nearest enemy, dealing 30% more damage below 35% health.', keystone: 'Soul needle finishing damage rises to 60%.' },
    meteor: { name: 'Falling star', cooldown: 13, reach: 550, damage: 2.2, color: '#e3b0f0', detail: 'A star bursts around the farthest enemy in range. Each target is struck once.', keystone: 'Falling star radius increases by 35.' },
    siphon: { name: 'Astral draught', cooldown: 13, reach: 360, damage: 1.1, color: '#a4efdf', detail: 'Drain the nearest enemy to restore 3% maximum health, before difficulty penalties.', keystone: 'Astral draught restores 5% maximum health.' },
    nullwave: { name: 'Spellbreak', cooldown: 15, reach: 230, damage: 0.9, color: '#baa4ef', detail: 'A close arcane pulse destroys nearby enemy projectiles and pushes ordinary enemies back 50 units.', keystone: 'Spellbreak pushes ordinary enemies back 80 units.' }
};
export const SORCERER_TREES = Object.fromEntries(Object.entries(SORCERER_SKILLS).map(([skill, definition]) => [skill, {
    potency: { name: `${definition.name} potency`, detail: '+10% spell damage per rank.', icon: '✦' },
    reach: { name: `${definition.name} reach`, detail: '+30 targeting range per rank; area spells gain +15 radius per rank.', icon: '◎' },
    ember: { name: `${definition.name} mastery`, detail: definition.keystone, icon: '◆' },
    recovery: { name: `${definition.name} cadence`, detail: '+8% cooldown recovery per rank.', icon: '↻' }
}]));
