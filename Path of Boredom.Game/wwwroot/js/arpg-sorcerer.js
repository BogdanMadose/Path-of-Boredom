export const SORCERER_SKILLS = {
    chain: { name: 'Arc relay', cooldown: 8, reach: 480, damage: 1.25, color: '#baa4ef', detail: 'Lightning strikes up to three enemies by default. Each jump deals 25% less damage than the previous hit; jumps can travel 180 units.', keystone: 'Adds two lightning jumps, raising the base target limit from three to five.' },
    frost: { name: 'Rime sphere', cooldown: 10, reach: 440, damage: 1.1, color: '#a4daef', detail: 'An ice burst around the nearest enemy deals damage and slows walking by 35% for two seconds. Charges are unaffected.', keystone: 'Rime sphere burst radius increases by 40 units.' },
    reap: { name: 'Soul needle', cooldown: 6, reach: 600, damage: 1.7, color: '#baa4ef', detail: 'A focused spell strikes the nearest enemy. Below 35% health, the hit deals 30% bonus damage.', keystone: 'Raises Soul needle’s low-health bonus from 30% to 60%.' },
    meteor: { name: 'Falling star', cooldown: 13, reach: 550, damage: 2.2, color: '#e3b0f0', detail: 'A star bursts around the farthest enemy in range, damaging enemies in its radius once.', keystone: 'Falling star burst radius increases by 35 units.' },
    siphon: { name: 'Astral draught', cooldown: 13, reach: 360, damage: 1.1, color: '#a4efdf', detail: 'Drain the nearest enemy to restore 3% of maximum health, before difficulty healing modifiers.', keystone: 'Raises Astral draught’s healing from 3% to 5% maximum health.' },
    nullwave: { name: 'Spellbreak', cooldown: 15, reach: 230, damage: 0.9, color: '#baa4ef', detail: 'An arcane pulse damages nearby enemies, destroys enemy projectiles in range, and pushes ordinary survivors back 50 units.', keystone: 'Spellbreak pushes ordinary enemies 80 units instead of 50.' }
};
const reachDetails = {
    chain: 'Adds 30 units to the first target range per rank.',
    frost: 'Adds 30 units to target range and 15 units to the burst radius per rank.',
    reap: 'Adds 30 units to target range per rank.',
    meteor: 'Adds 30 units to target range and 15 units to the burst radius per rank.',
    siphon: 'Adds 30 units to target range per rank.',
    nullwave: 'Adds 30 units to the pulse range per rank.'
};
export const SORCERER_TREES = Object.fromEntries(Object.entries(SORCERER_SKILLS).map(([skill, definition]) => [skill, {
    potency: { name: `${definition.name} potency`, detail: `${definition.name} deals 10% more damage per rank.`, icon: '✦' },
    reach: { name: `${definition.name} reach`, detail: reachDetails[skill], icon: '◎' },
    ember: { name: `${definition.name} mastery`, detail: definition.keystone, icon: '◆' },
    recovery: { name: `${definition.name} cadence`, detail: 'Cooldown recovery rises by 8% per rank.', icon: '↻' }
}]));
