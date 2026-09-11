export const WAVES_PER_MAP = 5;
export const MAPS = [
    {
        id: "hollow", name: "The Ashen Hollow", chapter: "I / THE LAST EMBER", caption: "ASHBOUND SANCTUM",
        description: "Find the bell that woke the dead. Break the Warden's oath.",
        story: "The sun vanished when the king rang the Mourning Bell. You carry its last spark. Your sister's voice whispers from the lantern: find the six stolen dawns.",
        ending: "The Warden kneels. Inside his armor is the first dawn, and a letter in your sister's hand: I did not die. I followed the bell.",
        boss: "The Hollow Warden", tint: [27, 35, 35], accent: "#d4a56a", hazard: "none", hazards: []
    },
    {
        id: "marsh", name: "The Drowned Wilds", chapter: "II / BENEATH THE MIRE", caption: "THE SUNKEN CAUSEWAY",
        description: "Cross the drowned road. Mire pools slow your steps.",
        story: "A ferryman asks for a memory instead of gold. You give him the sound of summer rain. Beneath the water, the second dawn beats like a captive heart.",
        ending: "The Sovereign sinks and the drowned remember their names. The ferryman points to the furnace: your sister went there willingly.",
        boss: "The Mire Sovereign", tint: [22, 43, 33], accent: "#8dcb9d", hazard: "slow",
        hazards: [{ x: 310, y: 230, radius: 85 }, { x: 790, y: 430, radius: 85 }, { x: 550, y: 510, radius: 65 }]
    },
    {
        id: "citadel", name: "The Cinder Citadel", chapter: "III / HEART OF THE FURNACE", caption: "THE BROKEN THRONE",
        description: "Take back the third dawn. Fire seals warn before they ignite.",
        story: "The king's smith forged a cage for daylight. In his abandoned forge you learn the truth: the bell was built to keep something OUT, not summon the dead.",
        ending: "The Tyrant's crown cracks. Three dawns burn in your lantern. Beyond the mountains, a prison older than the sun is opening.",
        boss: "The Cinder Tyrant", tint: [44, 28, 31], accent: "#f3a06d", hazard: "fire",
        hazards: [{ x: 290, y: 325, radius: 75 }, { x: 810, y: 325, radius: 75 }, { x: 550, y: 175, radius: 70 }]
    },
    {
        id: "glacier", name: "The Glass Expanse", chapter: "IV / MEMORIES IN ICE", caption: "THE FROZEN PROCESSION",
        description: "Ice slows movement. Reavers charge along marked paths.",
        story: "The fourth dawn froze a battlefield mid-scream. Your reflection walks ahead of you. It wears your sister's face and begs you not to ring the bell again.",
        ending: "The Glass Regent shatters. Your reflection stays behind, holding the ice together while you run. It smiles like someone you once knew.",
        boss: "The Glass Regent", tint: [25, 39, 53], accent: "#93d9ee", hazard: "slow",
        hazards: [{ x: 300, y: 240, radius: 95 }, { x: 790, y: 410, radius: 95 }]
    },
    {
        id: "archive", name: "The Storm Archive", chapter: "V / THE NAME OF NIGHT", caption: "THE UNWRITTEN VAULT",
        description: "Silence summoners and healing cantors. Avoid charged storm circles.",
        story: "Books write themselves in lightning. The fifth dawn reveals the price: your sister became the bell's keeper. To free her, someone must stand watch in her place.",
        ending: "The Archivist burns its final page. You learn the prisoner's name: the Unmaking. You also learn a name it fears. Yours.",
        boss: "The Nameless Archivist", tint: [35, 29, 51], accent: "#c9a6ef", hazard: "storm",
        hazards: [{ x: 270, y: 190, radius: 70 }, { x: 830, y: 460, radius: 70 }, { x: 550, y: 325, radius: 80 }]
    },
    {
        id: "rift", name: "The Starless Gate", chapter: "VI / A DAWN OF OUR OWN", caption: "THE EDGE OF UNMAKING",
        description: "Gather the last dawn. Rift circles erupt; hexers cast radial volleys.",
        story: "Your sister waits beside the broken bell. Do not trade one cage for another, she says. Carry all six dawns into the dark. Teach it how morning begins.",
        ending: "You break the bell, not its keeper. Six dawns become a sunrise. Your sister goes home. Beyond the gate, endless echoes still hunger. You may choose to keep watch.",
        boss: "The Unmaking", tint: [31, 20, 35], accent: "#ec8eb3", hazard: "void",
        hazards: [{ x: 280, y: 325, radius: 85 }, { x: 820, y: 325, radius: 85 }, { x: 550, y: 150, radius: 65 }, { x: 550, y: 500, radius: 65 }]
    }
];
export const LAST_WAVE = MAPS.length * WAVES_PER_MAP;
export const ENEMY_KINDS = ["husk", "brute", "wisp", "runner", "spitter", "sentinel", "reaver", "bomber", "summoner", "cantor", "hexer", "boss"];
export const mapIndexForWave = wave => Math.max(0, Math.floor((wave - 1) / WAVES_PER_MAP)) % MAPS.length;
export const mapForWave = wave => MAPS[mapIndexForWave(wave)];
export const firePhase = time => time % 6;

export const POWER_UPS = [
    { key: "fury", name: "Bloodsun", duration: 15, color: "#ff9677", detail: "+50% weapon damage" },
    { key: "haste", name: "Windwake", duration: 12, color: "#8be0ed", detail: "+35% movement and +40% cooldown recovery" },
    { key: "ward", name: "Dawn aegis", duration: 10, color: "#b5c6ff", detail: "Halves damage after armor" },
    { key: "magnet", name: "Gravetide", duration: 20, color: "#ecd28b", detail: "Greatly increases loot pickup range" }
];

export const UPGRADES = {
    weapon: { name: "Sunsteel edge", max: 50, base: 45, detail: "+6 base damage and +8% total damage per rank" },
    armor: { name: "Dawnplate", max: 12, base: 40, detail: "+5 armor and +12 max health per rank" },
    cleave: { name: "Wide awakening", max: 8, base: 55, detail: "Wider, faster cleaves with improved damage" },
    nova: { name: "Solar heart", max: 8, base: 65, detail: "Larger, stronger novas with shorter cooldowns" },
    dodge: { name: "Ghoststep", max: 8, base: 40, detail: "Faster dodge recovery and longer invulnerability" },
    flask: { name: "Living ember", max: 5, base: 35, detail: "Stronger healing; refill all flask charges on purchase" }
};

export function threatForWave(wave) {
    if (wave > LAST_WAVE) return "Endless echoes: mixed armies, more elites, escalating strength. Every fifth echo has a boss.";
    if (wave >= 26) return "Hexers cast radial volleys. Dodge between bolts; take them down before the gate opens.";
    if (wave >= 24) return "Cantors heal nearby enemies. Their violet aura marks a priority target.";
    if (wave >= 21) return "Summoners raise fresh husks. Break their ritual before their army grows.";
    if (wave >= 19) return "Bombers detonate after a warning. Their final blast can be dodged.";
    if (wave >= 16) return "Reavers mark a charge lane, then rush it. Step sideways when the lane appears.";
    if (wave >= 11) return "Sentinels resist cleave damage. Ember nova bypasses their shields.";
    if (wave >= 6) return "Spitters fire three-bolt fans. Keep moving and dodge through the gaps.";
    if (wave >= 3) return "Runners are fast but fragile. Turn and cleave before they surround you.";
    return "Husks swarm, brutes strike hard, and wisps attack at range. Gold fuels the forge.";
}

export function enemyKindForWave(wave, index) {
    if (wave >= 26 && index % 7 === 2) return "hexer";
    if (wave >= 24 && index % 11 === 4) return "cantor";
    if (wave >= 21 && index % 9 === 3) return "summoner";
    if (wave >= 19 && index % 6 === 1) return "bomber";
    if (wave >= 16 && index % 5 === 2) return "reaver";
    if (wave >= 11 && index % 5 === 0) return "sentinel";
    if (wave >= 6 && index % 4 === 1) return "spitter";
    if (wave >= 3 && index % 4 === 0) return "runner";
    return index % 4 === 3 ? "wisp" : index % 3 === 2 ? "brute" : "husk";
}
