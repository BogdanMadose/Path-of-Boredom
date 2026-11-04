// Stable IDs are shared by account profiles, the in-game list and platform mappings.
const list = [];
const add = (id, name, description, metric, target) => list.push(Object.freeze({ id, name, description, metric, target }));
add('first_blood', 'First Blood', 'Defeat your first enemy.', 'kills', 1);
for (const n of [100, 500, 1000, 2500, 5000, 10000])
    add(`kills_${n}`, `Ember Reaper ${n}`, `Defeat ${n} enemies in one run.`, 'kills', n);
for (const [i, name] of ['Ashen Hollow', 'Drowned Wilds', 'Cinder Citadel', 'Glass Expanse', 'Storm Archive', 'Starless Gate'].entries())
    add(`chapter_${i + 1}`, `Dawn ${i + 1}: ${name}`, `Clear campaign chapter ${i + 1}.`, 'campaignStages', i + 1);
add('campaign_complete', 'Six Dawns', 'Complete the campaign.', 'victory', 1);
for (const [hero, name] of Object.entries({ knight: 'Ember Knight', ranger: 'Dawn Ranger', warden: 'Iron Warden', sorcerer: 'Astral Sorcerer' })) {
    add(`victory_${hero}`, `${name}: Dawnbringer`, `Complete the campaign as the ${name}.`, `victory_${hero}`, 1);
    for (const n of [10, 20, 30])
        add(`mastery_${hero}_${n}`, `${name}: Mastery ${n}`, `Reach account mastery level ${n} as the ${name}.`, `mastery_${hero}`, n);
}
add('victory_medium', 'Against the Night', 'Complete the campaign on Medium or Hard.', 'victoryMedium', 1);
add('victory_hard', 'Inferno Conqueror', 'Complete the campaign on Hard.', 'victoryHard', 1);
add('victory_all_classes', 'Four Bearers of Dawn', 'Complete the campaign with all four classes.', 'victoriousClasses', 4);
for (const n of [5, 10, 25]) add(`victories_${n}`, `Dawnkeeper ${n}`, `Record ${n} campaign victories on your account.`, 'victories', n);
for (const n of [1, 5, 10, 20, 40])
    add(`endless_stages_${n}`, `Endless Watch ${n}`, `Clear ${n} Endless stages in one run (5 waves per stage).`, 'endlessStages', n);
for (const n of [10, 20, 30, 50]) add(`level_${n}`, `Growing Flame ${n}`, `Reach character level ${n} in a run.`, 'level', n);
for (const n of [1000, 5000, 10000]) add(`gold_${n}`, `Golden Ember ${n}`, `Hold ${n} gold at once.`, 'gold', n);
for (const n of [1000, 5000, 20000]) add(`spent_${n}`, `Forge Patron ${n}`, `Spend ${n} gold in one run.`, 'spent', n);
for (const n of [1, 3, 6, 12]) add(`challenges_${n}`, `Oathkeeper ${n}`, `Complete ${n} optional stage challenges in one run.`, 'challenges', n);
for (const n of [1, 5, 6]) add(`relics_${n}`, `Relic Hunter ${n}`, `Discover ${n} different relics in your account codex.`, 'relics', n);
for (const n of [100, 1000, 5000, 10000]) add(`embers_${n}`, `Eternal Flame ${n}`, `Earn ${n} lifetime Embers.`, 'embers', n);
for (const [key, name, max] of [['might', 'Ember Might', 10], ['flask', 'Spare Flask', 2], ['purse', "Pilgrim's Purse", 5], ['reroll', 'Second Sight', 3]])
    add(`camp_${key}`, `${name}: Complete`, `Fully upgrade ${name} at Ember Camp.`, `camp_${key}`, max);
add('camp_first', 'Make Yourself at Home', 'Purchase your first Ember Camp upgrade.', 'campRanks', 1);
add('camp_complete', 'A Camp for the Ages', 'Fully upgrade all four Ember Camp nodes.', 'campRanks', 20);
add('unlock_warden', 'Iron Resolve', 'Unlock the Iron Warden.', 'warden', 1);
add('unlock_sorcerer', 'Written in the Stars', 'Unlock the Astral Sorcerer.', 'sorcerer', 1);
for (const n of [10000, 100000, 1000000]) add(`damage_${n}`, `Unleashed ${n}`, `Deal ${n} total damage in one run.`, 'damage', n);
for (const n of [10, 25, 50]) add(`boons_${n}`, `Oathbound ${n}`, `Collect ${n} boon ranks in one run.`, 'boons', n);
add('first_fall', 'The Ember Remembers', 'Finish a run in defeat. Your account progress remains.', 'death', 1);

export const ACHIEVEMENTS = Object.freeze(list);
export const ACHIEVEMENT_IDS = new Set(list.map(a => a.id));

// Maxima, not additive counters: loading a checkpoint cannot pay the same progress twice.
export function achievementMetrics(state, profile) {
    const active = state && ['playing', 'paused', 'camp', 'won', 'dead', 'choosing'].includes(state.status);
    const run = active ? state : {};
    const summary = run.runSystems?.summary ?? {};
    const won = run.status === 'won' && run.mode === 'campaign';
    const values = {
        kills: run.kills ?? 0, campaignStages: run.mode === 'campaign' ? summary.stages ?? 0 : 0,
        victory: won ? 1 : 0, victoryMedium: won && ['nightmare', 'inferno'].includes(run.difficulty) ? 1 : 0,
        victoryHard: won && run.difficulty === 'inferno' ? 1 : 0,
        endlessStages: run.mode === 'endless' ? Math.max(0, (summary.stages ?? 0) - (run.rankingMode === 'endless' ? 0 : 6)) : 0,
        level: run.player?.level ?? 0, gold: run.gold ?? 0, spent: summary.spent ?? 0,
        challenges: summary.challenges ?? 0, damage: Object.values(summary.damage ?? {}).reduce((a, b) => a + b, 0),
        boons: Object.values(run.boons ?? {}).reduce((a, b) => a + b, 0), death: run.status === 'dead' ? 1 : 0,
        relics: Object.keys(profile.codex ?? {}).length, embers: profile.lifetimeEmbers ?? 0,
        campRanks: Object.values(profile.camp ?? {}).reduce((a, b) => a + b, 0),
        warden: profile.unlocked?.warden ?? 0, sorcerer: profile.unlocked?.sorcerer ?? 0,
        victoriousClasses: Object.values(profile.victories ?? {}).filter(n => n > 0).length,
        victories: Object.values(profile.victories ?? {}).reduce((a, b) => a + b, 0)
    };
    for (const hero of ['knight', 'ranger', 'warden', 'sorcerer']) {
        values[`mastery_${hero}`] = profile.mastery?.[hero]?.level ?? 1;
        values[`victory_${hero}`] = (profile.victories?.[hero] ?? 0) > 0 || won && run.heroClass === hero ? 1 : 0;
    }
    if (values.victories > 0) values.victory = 1;
    for (const key of ['might', 'flask', 'purse', 'reroll']) values[`camp_${key}`] = profile.camp?.[key] ?? 0;
    return values;
}

export function evaluateAchievements(state, profile) {
    const metrics = achievementMetrics(state, profile);
    return ACHIEVEMENTS.filter(a => !profile.achievements?.[a.id] && metrics[a.metric] >= a.target).map(a => a.id);
}

// Acknowledgements are session-local so another device/Play Games player can receive existing unlocks.
export function createAchievementReporter(report) {
    const acknowledged = new Set();
    let busy = false, generation = 0;
    return {
        reset() { generation++; acknowledged.clear(); },
        async sync(unlocked) {
            if (busy) return;
            busy = true;
            const current = generation;
            try {
                for (const id of Object.keys(unlocked)) {
                    if (current !== generation) break;
                    if (!ACHIEVEMENT_IDS.has(id) || acknowledged.has(id)) continue;
                    try {
                        if (await report(id)) { if (current === generation) acknowledged.add(id); }
                        else break;
                    } catch { break; }
                }
            } finally { busy = false; }
        }
    };
}
