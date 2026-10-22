import { mapIndexForWave, MAPS } from './arpg-campaign.js';
import { challengeSucceeded, challengeReward } from './arpg-run-systems.js';

export const BOSS_RELICS = [
    { name: "Warden's oath", detail: '+2 physical armor.' },
    { name: 'Ferryman token', detail: '+2 spell resistance.' },
    { name: 'Furnace heart', detail: '+3% all damage.' },
    { name: 'Glass memory', detail: '+2% movement speed.' },
    { name: 'Unwritten page', detail: '+3% global cooldown recovery, within the normal cap.' },
    { name: 'Sixth dawn', detail: '+3% all damage and +2 spell resistance.' }
];
export const STAGE_EVENTS = [
    { name: 'Lantern keeper', detail: 'Give 80 gold to restore 30% maximum health, before difficulty penalties.', cost: 80, kind: 'heal' },
    { name: 'Lost pilgrim', detail: 'Give one flask charge to receive {gold} gold.', cost: 0, kind: 'flask', reward: 200, perStage: 60 },
    { name: 'Sealed coffer', detail: 'Sacrifice 20% maximum health to receive {gold} gold. Cannot be used if the cost would defeat you.', cost: 0, kind: 'blood', reward: 300, perStage: 80 },
    { name: 'Wandering alchemist', detail: 'Pay 150 gold to refill all flask charges.', cost: 150, kind: 'refill' },
    { name: 'Dice of the drowned', detail: 'Stake 200 gold: half the time it returns {gold} gold, otherwise it is lost.', cost: 200, kind: 'gamble', reward: 400, perStage: 40 },
    { name: 'Blood scholar', detail: 'Sacrifice 25% maximum health to gain {gold} experience. Cannot be used if the cost would defeat you.', cost: 0, kind: 'lore', reward: 250, perStage: 120 },
    { name: 'Field surgeon', detail: 'Give one flask charge to fully restore your health, before difficulty penalties.', cost: 0, kind: 'surgeon' }
];
export const eventReward = (state, event = stageEvent(state)) => (event.reward ?? 0) + (event.perStage ?? 0) * Math.floor(state.wave / 5);
export const eventDetail = (state, event = stageEvent(state)) => event.detail.replace('{gold}', eventReward(state, event));
export const newAdventures = () => ({ relics: [0, 0, 0, 0, 0, 0], chapters: [0, 0, 0, 0, 0, 0], eventStage: -1 });
export function discoverChapter(state) {
    if (state.training || state.mode !== 'campaign' || state.wave < 1) return;
    state.adventures.chapters[mapIndexForWave(state.wave)] = 1;
}
export const stageEvent = state => STAGE_EVENTS[Math.floor(state.wave / 5) % STAGE_EVENTS.length];
export const eventAvailable = state => !state.training && ['paused', 'camp', 'won'].includes(state.status)
    && state.wave % 5 === 0 && state.enemies.length === 0 && state.adventures.eventStage !== Math.floor(state.wave / 5);
export function resolveStageEvent(state, accept, healing = 1, maxFlasks = 5, gainXp = null) {
    if (!eventAvailable(state)) return false;
    const event = stageEvent(state), p = state.player;
    if (accept) {
        if (state.gold < event.cost || ['flask', 'surgeon'].includes(event.kind) && p.potions < 1 || event.kind === 'blood' && p.health <= p.maxHealth * 0.2
            || event.kind === 'lore' && (p.health <= p.maxHealth * 0.25 || !gainXp) || event.kind === 'refill' && p.potions >= maxFlasks) return false;
        state.gold -= event.cost;
        state.runSystems.summary.spent += event.cost;
        if (event.kind === 'heal') p.health = Math.min(p.maxHealth, p.health + p.maxHealth * 0.3 * healing);
        if (event.kind === 'flask') { p.potions--; state.gold += eventReward(state, event); }
        if (event.kind === 'blood') { p.health -= p.maxHealth * 0.2; state.gold += eventReward(state, event); }
        if (event.kind === 'refill') p.potions = maxFlasks;
        if (event.kind === 'gamble' && (typeof state.random === 'function' ? state.random : Math.random)() < 0.5) state.gold += eventReward(state, event);
        if (event.kind === 'lore')
        if (event.kind === 'surgeon') { p.potions--; p.health = Math.min(p.maxHealth, p.health + p.maxHealth * healing); }
    }
    state.adventures.eventStage = Math.floor(state.wave / 5);
    state.journal = accept ? `${event.name}: bargain completed.` : `${event.name}: passed by safely.`;
    return true;
}
export function awardBossRelic(state) {
    if (state.training) return;
    const index = mapIndexForWave(state.wave);
    if (!state.adventures.relics[index]) {
        state.adventures.relics[index] = 1;
        state.journal = `${BOSS_RELICS[index].name} recovered. ${BOSS_RELICS[index].detail}`;
    }
}
export const BUILD_SYNERGIES = [
    { name: 'Shatter', skills: ['frost', 'burst'], stat: 'damage', value: 0.04, detail: '+4% damage against slowed enemies.' },
    { name: 'Sanctuary', skills: ['guard', 'siphon'], stat: 'resistance', value: 3, detail: '+3 spell resistance.' },
    { name: 'Stormfront', skills: ['chain', 'nova'], stat: 'areaDamage', value: 0.03, detail: '+3% Chain and Nova damage.' },
    { name: 'Execution window', skills: ['reap', 'burst'], stat: 'executeDamage', value: 0.04, detail: '+4% damage against enemies below 35% health.' },
    { name: 'Mobile artillery', skills: ['meteor', 'frost'], stat: 'speed', value: 0.03, detail: '+3% movement speed.' },
    { name: 'Counterguard', skills: ['guard', 'repulse'], stat: 'armor', value: 3, detail: '+3 physical armor.' },
    { name: 'Battle rhythm', skills: ['chain', 'repulse'], stat: 'recovery', value: 0.03, detail: '+3% cooldown recovery, within the normal cap.' },
    { name: 'Sustained assault', skills: ['siphon', 'reap'], stat: 'basicDamage', value: 0.04, detail: '+4% regular-attack damage.' }
];
export function buildSynergy(state) {
    const active = BUILD_SYNERGIES.filter(synergy => synergy.skills.every(skill => state.loadout.auto.includes(skill)));
    const result = { damage: 1, resistance: 0, armor: 0, speed: 0, recovery: 0, areaDamage: 0, executeDamage: 0, basicDamage: 0 };
    for (const synergy of active) result[synergy.stat] += synergy.value;
    result.detail = active.map(synergy => `${synergy.name}: ${synergy.detail}`).join(' · ')
        || 'Optional synergies: Frost + Burst (slowed-target damage), Guard + Siphon (resistance), Chain + Nova (area damage), Reap + Burst (finishing), Meteor + Frost (movement), Guard + Repulse (armor), Chain + Repulse (recovery), Siphon + Reap (regular attacks).';
    return result;
}
export function checkpointReport(state) {
    const index = mapIndexForWave(state.wave), challenge = state.runSystems.challenge;
    const success = challengeSucceeded(state, challenge);
    const result = challenge.key === 'none' || challenge.stage !== Math.ceil(state.wave / 5) ? 'No challenge selected.'
        : challenge.resolved ? `${challenge.key}: ${success ? `completed (+${challengeReward(challenge)} gold)` : 'failed (no penalty)'}.` : `${challenge.key}: not yet resolved.`;
    const event = stageEvent(state);
    return `${MAPS[index].boss} defeated. Relic: ${state.adventures.relics[index] ? `${BOSS_RELICS[index].name} — ${BOSS_RELICS[index].detail}` : 'none earned in practice' } Challenge: ${result} Event: ${event.name} — ${event.detail} ${eventAvailable(state) ? 'Available now; accept or skip in Stage encounter.' : 'Already resolved or unavailable.'}`;
}
export const codexEntries = state => MAPS.map((map, index) => ({ map, index })).filter(({ index }) => state.adventures.chapters[index]);
