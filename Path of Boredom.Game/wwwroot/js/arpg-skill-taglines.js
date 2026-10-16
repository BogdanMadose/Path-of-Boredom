// One-line summaries for compact choice cards (level 10/20 skill choice). Full mechanics live in
// the skill descriptions and tree tooltips; these must stay short enough to fit on one line.
const TAGLINES = {
    knight: {
        nova: "Fire burst around you", burst: "Fire beam through a line", guard: "Burning pulse + 40% ward",
        chain: "Fire jumps across 3 enemies", frost: "Four fire lanes in a cross", reap: "Wide melee sweep",
        meteor: "Beam pierces to the farthest foe", siphon: "Brands a foe for bonus damage", nullwave: "Fire cone that burns shots"
    },
    ranger: {
        nova: "Arrow volley around you", burst: "Seven piercing arrows", guard: "Slowing vines + 40% ward",
        chain: "Shot that rebounds to a 2nd foe", frost: "Vines slow enemies by 55%", reap: "Precise shot at the farthest foe",
        meteor: "Five-arrow fan", siphon: "Finishes wounded enemies", nullwave: "Knockback blast + speed boost"
    },
    warden: {
        nova: "Ground quake around you", burst: "Heavy cone of force", guard: "Shockwave + 40% ward",
        chain: "Crushes and pulls enemies in", frost: "Ice wedge slows, blocks shots", reap: "Breaks armored enemies",
        meteor: "Three stone eruptions ahead", siphon: "Hits, heals and hardens you", nullwave: "Ring shockwave knockback"
    },
    sorcerer: {
        nova: "Arcane pulse around you", burst: "Comet beam through a line", guard: "Arcane pulse + 40% ward",
        chain: "Lightning jumps 3 enemies", frost: "Icy blast slows by 35%", reap: "Strong single-target spell",
        meteor: "Star bursts on the farthest foe", siphon: "Drains a foe to heal you", nullwave: "Pulse that destroys shots"
    }
};

export const skillTagline = (heroClass, skill) => TAGLINES[heroClass]?.[skill] ?? TAGLINES.knight[skill] ?? "";
export const TAGLINE_CLASSES = Object.keys(TAGLINES);
