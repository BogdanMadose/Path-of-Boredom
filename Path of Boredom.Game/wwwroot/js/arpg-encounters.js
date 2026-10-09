import { WAVES_PER_MAP, enemyKindForWave } from "./arpg-campaign.js";

const ENCOUNTERS = [
    { key: "swarm", name: "Swarm", count: 1.15 },
    { key: "elites", name: "Elite pressure", count: 0.8 },
    { key: "ranged", name: "Ranged pressure", count: 0.9 },
    { key: "mixed", name: "Mixed assault", count: 1 }
];
const BOSS = { key: "boss", name: "Boss encounter", count: 1 };

export const encounterForWave = wave => wave > 0 && wave % WAVES_PER_MAP === 0 ? BOSS : ENCOUNTERS[(Math.max(1, wave) - 1) % WAVES_PER_MAP];

export function encounterKind(wave, index) {
    const encounter = encounterForWave(wave);
    if (encounter.key === "ranged" && index % 3 !== 0)
        return wave >= 13 && index % 5 === 1 ? "artillerist" : wave >= 6 ? "spitter" : "wisp";
    if (encounter.key === "elites" && index % 2 === 0) return wave >= 11 ? "sentinel" : "brute";
    if (encounter.key === "swarm" && index % 3 !== 0) return wave >= 3 && index % 2 ? "runner" : "husk";
    return enemyKindForWave(wave, index);
}

export const encounterElite = (wave, index, depth = 0) => wave >= 6
    && index % (encounterForWave(wave).key === "elites" ? 2 : depth ? 3 : 5) === 0 ? 1 : 0;
