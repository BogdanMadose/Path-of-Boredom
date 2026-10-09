// Stable rank keys and caps preserve existing saves; branch effects belong to each ability.
const branch = (name, detail, icon = '✦') => ({ name, detail, icon });
const tree = (root, shape, keystone, mastery) => ({ potency: root, reach: shape, ember: branch(keystone, '', '◆'), recovery: mastery });
export const CLASS_SKILL_TREES = {
    knight: {
        chain: tree(branch('Living embers', '+10% Cinder relay hit damage per rank.'), branch('Fire bridges', '+60 initial targeting range and +30 jump range per rank.', '↝'), 'Ember procession', branch('Banked inferno', '+8% cooldown recovery and +5 percentage points jump damage retention per rank.', '♨')),
        frost: tree(branch('White-hot seams', '+10% Blazing cross damage per rank.'), branch('Burning avenues', '+25 lane reach and +6 lane half-width per rank.', '╋'), 'Fourfold furnace', branch('Crossfire heart', '+8% cooldown recovery per rank; enemies within the inner quarter of the cross take +10% damage per rank.', '⊕')),
        reap: tree(branch('Headsman edge', '+10% Execution arc damage per rank.'), branch('Sweeping sentence', '+15 reach and +25 degrees total swing arc per rank.', '◔'), 'Armorless verdict', branch('Merciless finish', '+8% cooldown recovery and +5 percentage points execution health threshold per rank (35% becomes up to 45%).', '⚔')),
        meteor: tree(branch('Solar point', '+10% Sun spear damage per rank.'), branch('Lance corridor', '+80 range and +8 beam half-width per rank.', '↟'), 'Twin sunshaft', branch('Distant blaze', '+8% cooldown recovery per rank; targets in the outer half of the beam take +10% damage per rank.', '☀')),
        siphon: tree(branch('Sanguine seal', '+10% Bloodbrand damage per rank.'), branch('Crimson tether', '+30 brand range and +0.5 percentage points maximum-health healing per rank.', '♡'), 'Heartfire pact', branch('Desperate flame', '+8% cooldown recovery per rank; missing-health damage scaling strengthens by 10% per rank.', '♥')),
        nullwave: tree(branch('Incinerating front', '+10% Flamebreaker damage per rank.'), branch('Cinder fan', '+20 reach and +10 degrees total cone angle per rank.', '⋔'), 'Half-circle pyre', branch('Ashen shove', '+8% cooldown recovery per rank; surviving ordinary enemies are pushed back 15 units per rank.', '↗'))
    },
    ranger: {
        chain: tree(branch('Springsteel shot', '+10% Rebound shot damage per rank.'), branch('Skipping trajectory', '+50 initial range and +35 rebound range per rank.', '↝'), 'Third ricochet', branch('Returning force', '+8% cooldown recovery and +10 percentage points rebound damage per rank.', '»')),
        frost: tree(branch('Thornhead', '+10% Snaring shot damage per rank.'), branch('Overgrown snare', '+40 targeting range and +20 vine-burst radius per rank.', '♧'), 'Deep roots', branch('Entangled quarry', '+8% cooldown recovery per rank; already slowed enemies take +15% Snaring shot damage per rank.', '❧')),
        reap: tree(branch('True flight', '+10% Deadeye damage per rank.'), branch('Distant sight', '+80 precision targeting range per rank.', '⌖'), 'Marked giant', branch('Patient hunter', '+8% cooldown recovery per rank; the distance damage bonus grows from 100% to up to 120%.', '◎')),
        meteor: tree(branch('Barbed scatter', '+10% Scattershot lane damage per rank.'), branch('Wide draw', '+40 range and +10 degrees total fan angle per rank.', '⋙'), 'Sevenfold draw', branch('Dense fletching', '+8% cooldown recovery and +2 lane hit half-width per rank; each enemy is still hit only once.', '➶')),
        siphon: tree(branch('Harvest heads', '+10% Field harvest damage per rank.'), branch('Wounded trail', '+30 range per rank; eligible enemy health threshold rises by 5 percentage points per rank (50% becomes up to 60%).', '♡'), 'Fourth gathering', branch('Restorative herbs', '+8% cooldown recovery per rank; each hit restores an extra 1% of missing health per rank.', '✚')),
        nullwave: tree(branch('Cutting gust', '+10% Gale escape damage per rank.'), branch('Open clearing', '+25 blast radius and +15 knockback distance per rank.', '≋'), 'Stormward step', branch('Archer reprieve', '+8% cooldown recovery per rank; projectile-using enemies take +15% blast damage per rank.', '↗'))
    },
    warden: {
        chain: tree(branch('Crushing singularity', '+10% Gravity well damage per rank.'), branch('Widening sink', '+30 targeting range and +20 well radius per rank.', '◎'), 'Event horizon', branch('Inward collapse', '+8% cooldown recovery and +20 ordinary-enemy pull distance per rank. Bosses are never pulled.', '↙')),
        frost: tree(branch('Rime blades', '+10% Glacial rampart damage per rank.'), branch('Ice battlements', '+20 reach and +15 degrees total wedge angle per rank.', '⬡'), 'Permafrost wall', branch('Deep freeze', '+8% cooldown recovery and +5 percentage points walking slow per rank, up to 55%. Boss resistance applies; charges are unaffected.', '❄')),
        reap: tree(branch('Anvil impact', '+10% Shieldbreaker damage per rank.'), branch('Long haft', '+25 crushing-strike reach per rank.', '↔'), 'Titan breaker', branch('Buckled plate', '+8% cooldown recovery per rank; the armored-target damage bonus rises by 25 percentage points per rank (50% becomes up to 100%).', '⬟')),
        meteor: tree(branch('Fault pressure', '+10% Fault pillars damage per rank.'), branch('Stone foundations', '+40 line reach and +10 pillar radius per rank.', '▥'), 'Mountain teeth', branch('Converging faults', '+8% cooldown recovery per rank; enemies overlapping multiple pillars take +10% damage per rank, but are struck only once.', '⋈')),
        siphon: tree(branch('Runic resonance', '+10% Stone renewal damage per rank.'), branch('Mending masonry', '+20 pulse radius per rank; healing per hit rises by 0.25 percentage points per rank, capped at five hits.', '✚'), 'Enduring runestone', branch('Last foundation', '+8% cooldown recovery per rank; at or below 35% health, Stone renewal heals 10% more per rank.', '⬡')),
        nullwave: tree(branch('Siege pressure', '+10% Siege wave damage per rank.'), branch('Closing breach', '+30 outer radius per rank; inner blind spot shrinks by 2.5 percentage points per rank.', '◉'), 'Broken inner wall', branch('Battering stones', '+8% cooldown recovery and +20 knockback distance per rank. Bosses are never displaced.', '»'))
    }
};
const RANGE_STEP = {
    knight: { chain: 60, frost: 25, reap: 15, meteor: 80, siphon: 30, nullwave: 20 },
    ranger: { chain: 50, frost: 40, reap: 80, meteor: 40, siphon: 30, nullwave: 25 },
    warden: { chain: 30, frost: 20, reap: 25, meteor: 40, siphon: 20, nullwave: 30 }
};
export const skillRangeBonus = (state, skill) => RANGE_STEP[state.heroClass][skill] * state.skillTree[skill].reach;
