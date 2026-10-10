import { WAVES_PER_MAP, enemyKindForWave } from "./arpg-campaign.js";

const ENCOUNTERS = [
    { key: "swarm", name: "Swarm", count: 1.15 },
    { key: "elites", name: "Elite pressure", count: 0.8 },
    { key: "ranged", name: "Ranged pressure", count: 0.9 },
    { key: "mixed", name: "Mixed assault", count: 1 }
];
const BOSS = { key: "boss", name: "Boss encounter", count: 1 };

export const ELITE_FORMATIONS = [
    { name: 'Shield and shot', kinds: ['sentinel', 'spitter', 'runner'], detail: 'A slow shield anchors ranged fire; fragile runners punish standing still.', minimum: 11 },
    { name: 'Choir escort', kinds: ['brute', 'cantor', 'hexer'], detail: 'A brute screens the supporting cantor and hexer. Break the back line first.', minimum: 24 },
    { name: 'Hammer and fuse', kinds: ['reaver', 'artillerist', 'husk'], detail: 'A charging reaver pressures movement while artillery marks the destination.', minimum: 18 }
];
export function encounterFormation(wave) {
    if (!['elites', 'mixed'].includes(encounterForWave(wave).key)) return null;
    const available = ELITE_FORMATIONS.filter(formation => wave >= formation.minimum);
    return available.length ? available[Math.floor(wave / WAVES_PER_MAP) % available.length] : null;
}

export const encounterForWave = wave => wave > 0 && wave % WAVES_PER_MAP === 0 ? BOSS : ENCOUNTERS[(Math.max(1, wave) - 1) % WAVES_PER_MAP];

export function encounterKind(wave, index) {
    const encounter = encounterForWave(wave);
    const formation = encounterFormation(wave);
    if (formation && index < 6) return formation.kinds[index % formation.kinds.length];
    if (encounter.key === "ranged" && index % 3 !== 0)
        return wave >= 13 && index % 5 === 1 ? "artillerist" : wave >= 6 ? "spitter" : "wisp";
    if (encounter.key === "elites" && index % 2 === 0) return wave >= 11 ? "sentinel" : "brute";
    if (encounter.key === "swarm" && index % 3 !== 0) return wave >= 3 && index % 2 ? "runner" : "husk";
    if (encounter.key === "mixed" && wave >= 24 && index % 6 === 0) return "cantor";
    if (encounter.key === "mixed" && wave >= 21 && index % 6 === 1) return "summoner";
    if (encounter.key === "mixed" && wave >= 11 && index % 6 === 2) return "sentinel";
    return enemyKindForWave(wave, index);
}

export const encounterElite = (wave, index, depth = 0) => encounterFormation(wave) && index < 6
    ? index === 0 || index === 3 ? 1 : 0
    : wave >= 6 && index % (encounterForWave(wave).key === "elites" ? 2 : depth ? 3 : 5) === 0 ? 1 : 0;
