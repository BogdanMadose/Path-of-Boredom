const SETTINGS_KEY = "path-of-boredom.audio.v1";
export const DEFAULT_AUDIO_SETTINGS = Object.freeze({ muted: false, music: 0.25, effects: 0.35 });
const volume = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
export function audioSettings(value) {
    return {
        muted: typeof value?.muted === "boolean" ? value.muted : DEFAULT_AUDIO_SETTINGS.muted,
        music: volume(value?.music, DEFAULT_AUDIO_SETTINGS.music),
        effects: volume(value?.effects, DEFAULT_AUDIO_SETTINGS.effects)
    };
}

const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
// Player/UI effects are pitched down so they sit under the music instead of piercing over it.
const EFFECT_PITCH = 0.7;

// Each act has its own musical identity: mode, tempo, lead timbre, groove and a signature layer.
// Patterns are 16 eighth-note steps. Melody characters are scale degrees in base 36 ("." = rest),
// so "b" is degree 11 (an octave and change above the root). Bass "x" = note; drums k/s/h/t.
const STYLES = [
    { name: "hollow", bpm: 76, root: 50, scale: [0, 2, 3, 5, 7, 9, 10], chords: [0, 3, 6, 4],
        melody: ["4..3.2..0...1.2.", "4..5.7..6.4..2.."], lead: "triangle", leadLen: 0.9, leadLevel: 0.05,
        bass: "x.......x...x...", drums: "k.......k.....h.", signature: "pluck" },
    { name: "marsh", bpm: 64, root: 45, scale: [0, 1, 3, 5, 7, 8, 10], chords: [0, 1, 0, 6],
        melody: ["0...1..0....4.3.", "2...1..0...5.4.."], lead: "sine", leadLen: 1.6, leadLevel: 0.055, slide: 0.97,
        bass: "x...............", drums: "....k.......h...", signature: "drip" },
    { name: "citadel", bpm: 112, root: 45, scale: [0, 2, 3, 5, 7, 8, 11], chords: [0, 5, 3, 4],
        melody: ["0.0.2.3.4..3.2..", "4.4.5.6.7..6.4.."], lead: "sawtooth", leadLen: 0.32, leadLevel: 0.028,
        bass: "x.x.x.x.x.x.x.x.", drums: "k...s..kk...s.h.", signature: "anvil" },
    { name: "glacier", bpm: 70, root: 52, scale: [0, 2, 4, 6, 7, 9, 11], chords: [0, 4, 5, 3],
        melody: ["7...9...b...9.7.", "8...7...4.....5."], lead: "sine", leadLen: 2, leadLevel: 0.045,
        bass: "x...........x...", drums: "................", signature: "bell" },
    { name: "archive", bpm: 96, root: 49, scale: [0, 2, 4, 6, 8, 10], chords: [0, 2, 4, 1],
        melody: ["0.....3.....5...", "4.....2.....1..."], lead: "triangle", leadLen: 0.5, leadLevel: 0.045,
        bass: "x.......x.......", drums: "h.h.h.h.h.h.h.h.", signature: "arp" },
    { name: "rift", bpm: 88, root: 43, scale: [0, 1, 3, 5, 6, 8, 10], chords: [0, 1, 4, 0],
        melody: ["0..1..0..4..3...", "7..6..4..1..0..."], lead: "square", leadLen: 0.4, leadLevel: 0.022,
        bass: "x..x..x..x..x.x.", drums: "k..k..k.s..k..s.", signature: "swell" }
];
const MENU_STYLE = { name: "menu", bpm: 60, root: 50, scale: [0, 2, 4, 5, 7, 9, 11], chords: [0, 5, 3, 4],
    melody: ["4...2...0.....1.", "2...4...7...5..."], lead: "sine", leadLen: 2, leadLevel: 0.05,
    bass: "x.......", drums: "................", signature: "pluck" };
const degree = (scale, n) => scale[((n % scale.length) + scale.length) % scale.length] + 12 * Math.floor(n / scale.length);

export function createGameAudio(environment = globalThis) {
    let settings = { ...DEFAULT_AUDIO_SETTINGS };
    try { settings = audioSettings(JSON.parse(environment.localStorage?.getItem(SETTINGS_KEY) ?? "null")); } catch { /* Audio preferences are optional. */ }
    let context, musicGain, effectsGain, master, noise;
    let disposed = false, failed = false, background = false, active = false, boss = false, area = 0, menu = false;
    let effectWindow = 0, effectCount = 0;
    let timer = null, nextNote = 0, beat = 0, previous = null, previousState = null;
    const voices = new Set();
    const lastCue = new Map();
    const introducedBosses = new WeakSet();

    function stopVoices(channel = null) {
        for (const voice of [...voices]) {
            if (channel && voice.channel !== channel) continue;
            try { voice.source.stop(); } catch { /* A source may already have ended. */ }
            voice.source.disconnect();
            voice.gain.disconnect();
            voices.delete(voice);
        }
    }
    function stopMusic() {
        pauseMusic();
        beat = 0;
    }
    // Holds the song where it is (menus, level-up cards, pause) so it continues instead of restarting.
    function pauseMusic() {
        if (timer !== null) environment.clearInterval(timer);
        timer = null;
        nextNote = 0;
        stopVoices("music");
    }
    function applySettings() {
        if (!context) return;
        master.gain.setValueAtTime(settings.muted || background ? 0 : 0.65, context.currentTime);
        musicGain.gain.setTargetAtTime(settings.music, context.currentTime, 0.025);
        effectsGain.gain.setTargetAtTime(settings.effects, context.currentTime, 0.025);
        if (settings.muted) stopVoices();
        syncMusic();
    }
    function voice(channel, start, duration, pitch, endPitch, level, type = "sine", filter = null) {
        if (!context || context.state !== "running" || disposed || failed || background || settings.muted
            || settings[channel] <= 0 || voices.size >= 40
            || (channel === "effects" && [...voices].filter(item => item.channel === channel).length >= 16)) return;
        const source = type === "noise" ? context.createBufferSource() : context.createOscillator();
        const gain = context.createGain();
        if (type === "noise") source.buffer = noise;
        else {
            source.type = type;
            source.frequency.setValueAtTime(pitch, start);
            source.frequency.exponentialRampToValueAtTime(Math.max(20, endPitch), start + duration);
        }
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(level, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        source.connect(gain);
        let shaper = null;
        if (filter && typeof context.createBiquadFilter === "function") {
            shaper = context.createBiquadFilter();
            shaper.type = filter.type;
            shaper.Q.value = filter.q ?? 1;
            shaper.frequency.setValueAtTime(filter.from, start);
            shaper.frequency.exponentialRampToValueAtTime(Math.max(20, filter.to ?? filter.from), start + duration);
            source.disconnect();
            source.connect(shaper);
            shaper.connect(gain);
        }
        gain.connect(channel === "music" ? musicGain : effectsGain);
        const entry = { source, gain, channel };
        voices.add(entry);
        source.onended = () => { source.disconnect(); gain.disconnect(); shaper?.disconnect(); voices.delete(entry); };
        source.start(start);
        source.stop(start + duration + 0.02);
    }
    function scheduleMusic() {
        if (!context || context.state !== "running") return;
        const now = context.currentTime;
        if (nextNote < now) nextNote = now + 0.04;
        const style = menu ? MENU_STYLE : STYLES[area];
        if (boss) { scheduleBoss(style, now); return; }
        const spacing = 60 / style.bpm / 2;
        const note = (midi, at, length, level, type = "sine", slide = 1) => {
            const pitch = frequency(midi);
            voice("music", at, length, pitch, pitch * slide, level, type);
        };
        while (nextNote < now + 0.25) {
            const step = beat % 16, bar = Math.floor(beat / 16);
            const chord = style.chords[bar % style.chords.length];
            const chordRoot = style.root + degree(style.scale, chord);
            // Bar 3 of every 4 breathes: melody rests so the groove and signature layer can speak.
            const symbol = bar % 4 === 2 && !boss ? "." : style.melody[bar % 2][step];
            if (symbol !== ".") {
                const pitch = style.root + 12 + degree(style.scale, parseInt(symbol, 36));
                note(pitch, nextNote, boss ? Math.min(style.leadLen, 0.3) : style.leadLen, boss ? style.leadLevel * 1.35 : style.leadLevel,
                    boss && style.lead === "sine" ? "triangle" : style.lead, style.slide ?? 1);
            }
            if (style.bass[step % style.bass.length] === "x") note(chordRoot - 12, nextNote, boss ? 0.5 : spacing * 6, 0.075, "triangle");
            if (step === 0) {
                note(chordRoot, nextNote, spacing * 15, 0.024);
                note(style.root + degree(style.scale, chord + 2), nextNote, spacing * 15, 0.018);
            }
            const drum = boss && step % 4 === 0 ? "k" : style.drums[step];
            if (drum === "k") note(38, nextNote, 0.18, boss ? 0.12 : 0.085, "sine", 0.3);
            else if (drum === "s") { voice("music", nextNote, 0.11, 0, 0, 0.035, "noise"); note(55, nextNote, 0.09, 0.03, "triangle", 0.7); }
            else if (drum === "h") voice("music", nextNote, 0.03, 0, 0, boss ? 0.02 : 0.012, "noise");
            if (!boss) {
                if (style.signature === "pluck" && step % 4 === 2) note(style.root + 12 + degree(style.scale, chord + [0, 2, 4, 2][(step >> 2) % 4]), nextNote, 0.35, 0.02, "triangle");
                else if (style.signature === "drip" && step === 11 && bar % 2 === 1) note(style.root + 36 + degree(style.scale, bar % 5), nextNote, 0.12, 0.025, "sine", 1.5);
                else if (style.signature === "anvil" && step === 15 && bar % 2 === 1) note(style.root + 31, nextNote, 0.5, 0.025, "square", 0.995);
                else if (style.signature === "bell" && step % 8 === 4) note(style.root + 24 + degree(style.scale, chord + (step === 4 ? 4 : 6)), nextNote, 2.4, 0.022);
                else if (style.signature === "arp" && step % 2 === 1) note(style.root + 12 + degree(style.scale, chord + [0, 2, 4, 2][(step >> 1) % 4]), nextNote, 0.18, 0.016, "triangle");
                else if (style.signature === "swell" && step === 8 && bar % 2 === 0) note(style.root + 6, nextNote, spacing * 8, 0.03, "sawtooth", 0.94);
            }
            nextNote += spacing;
            beat++;
        }
    }
    // Boss fights get their own driving rock/epic track built on the act's key and scale, so each
    // boss still sounds like it belongs to its act: power chords, a pumping eighth-note bass,
    // a kick/snare backbeat, a soaring doubled lead, a choir-like pad and tom fills every 4 bars.
    function scheduleBoss(style, now) {
        const spacing = 60 / (132 + area * 4) / 2;
        const note = (midi, at, length, level, type = "sine", slide = 1) => {
            const pitch = frequency(midi);
            voice("music", at, length, pitch, pitch * slide, level, type);
        };
        const leads = ["0.2.4...4.5.4.2.", "4.5.7...9.7.5.4.", "7...6.4.5...4.2.", "2.4.5.7.9...7..."];
        while (nextNote < now + 0.25) {
            const step = beat % 16, bar = Math.floor(beat / 16);
            const chord = [0, 5, 3, 4][bar % 4];
            const chordRoot = style.root + degree(style.scale, chord);
            if (step === 0 || step === 8) {
                note(chordRoot - 12, nextNote, spacing * 7, 0.032, "sawtooth");
                note(chordRoot - 5, nextNote, spacing * 7, 0.026, "sawtooth");
                note(chordRoot, nextNote, spacing * 7, 0.02, "sawtooth");
            }
            note(chordRoot - 24, nextNote, spacing * 0.9, 0.085, "triangle");
            if (step === 0) {
                note(chordRoot + 12, nextNote, spacing * 16, 0.02);
                note(style.root + 12 + degree(style.scale, chord + 2), nextNote, spacing * 16, 0.016);
            }
            const symbol = bar % 8 < 2 ? "." : leads[bar % 4][step];
            if (symbol !== ".") {
                const pitch = style.root + 12 + degree(style.scale, parseInt(symbol, 36));
                note(pitch, nextNote, spacing * 1.8, 0.03, "sawtooth");
                note(pitch + 12, nextNote, spacing * 1.8, 0.014, "triangle");
            }
            const fill = bar % 4 === 3 && step >= 12;
            if (fill) note(52 - (step - 12) * 3, nextNote, 0.2, 0.07, "sine", 0.5);
            else {
                const drum = "k.k.s..kk.k.s..k"[step];
                if (drum === "k") note(40, nextNote, 0.16, 0.12, "sine", 0.3);
                else if (drum === "s") { voice("music", nextNote, 0.14, 0, 0, 0.05, "noise"); note(58, nextNote, 0.1, 0.035, "triangle", 0.6); }
            }
            voice("music", nextNote, 0.03, 0, 0, step % 2 ? 0.01 : 0.018, "noise");
            if (bar % 4 === 0 && step === 0 && beat > 0) voice("music", nextNote, 1.2, 0, 0, 0.03, "noise");
            nextNote += spacing;
            beat++;
        }
    }
    function syncMusic() {
        if (!context || context.state !== "running" || !active || background || settings.muted || settings.music === 0 || disposed || failed) {
            pauseMusic();
            return;
        }
        if (timer === null) {
            try {
                scheduleMusic();
                timer = environment.setInterval(() => {
                    try { scheduleMusic(); } catch { failed = true; stopMusic(); stopVoices(); }
                }, 100);
            } catch { failed = true; stopMusic(); stopVoices(); }
        }
    }
    async function unlock() {
        if (disposed || failed || background) return;
        try {
            if (!context) {
                const AudioContext = environment.AudioContext || environment.webkitAudioContext;
                if (!AudioContext) return;
                context = new AudioContext();
                master = context.createGain();
                musicGain = context.createGain();
                effectsGain = context.createGain();
                const limiter = context.createDynamicsCompressor();
                limiter.threshold.value = -18;
                limiter.ratio.value = 8;
                musicGain.connect(master);
                if (typeof context.createBiquadFilter === "function") {
                    const warmth = context.createBiquadFilter();
                    warmth.type = "lowpass";
                    warmth.frequency.value = 2400;
                    musicGain.disconnect();
                    musicGain.connect(warmth);
                    warmth.connect(master);
                }
                effectsGain.connect(master);
                if (typeof context.createBiquadFilter === "function") {
                    const soften = context.createBiquadFilter();
                    soften.type = "lowpass";
                    soften.frequency.value = 3200;
                    effectsGain.disconnect();
                    effectsGain.connect(soften);
                    soften.connect(master);
                }
                master.connect(limiter);
                limiter.connect(context.destination);
                noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
                const samples = noise.getChannelData(0);
                for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
                applySettings();
            }
            if (context.state !== "running") await context.resume();
            if (!disposed && !background) { applySettings(); syncMusic(); }
        } catch { /* Unsupported or blocked audio must not interrupt the game. */ }
    }
    function play(cue, hero = "knight", skill = "nova") {
        if (!context || context.state !== "running" || background || settings.muted || disposed || failed) return;
        const now = context.currentTime;
        const key = cue === "skill" ? `${cue}:${skill}` : cue;
        const interval = cue === "attack" ? 0.55 : cue === "hit" ? 0.4 : cue === "loot" ? 0.65 : cue === "skill" ? 0.35 : 0.12;
        if (now - (lastCue.get(key) ?? -Infinity) < interval) return;
        if (now - effectWindow >= 1) { effectWindow = now; effectCount = 0; }
        if (["attack", "hit", "loot", "skill"].includes(cue) && effectCount++ >= 6) return;
        lastCue.set(key, now);
        try {
            const tone = (pitch, end, duration, level = 0.1, type = "sine", delay = 0, filter = null) => voice("effects", now + delay, duration, pitch * EFFECT_PITCH, end * EFFECT_PITCH, level, type, filter);
            // Small random detune so repeated swings and hits don't sound machine-identical.
            const vary = 0.94 + Math.random() * 0.12;
            const band = (from, to, q = 1.2) => ({ type: "bandpass", from: from * 0.6, to: to * 0.6, q });
            const low = (from, to = from) => ({ type: "lowpass", from: from * 0.6, to: to * 0.6, q: 0.8 });
            if (cue === "button") tone(1250, 900, 0.045, 0.035, "triangle", 0, low(3000));
            else if (cue === "attack") {
                if (hero === "ranger") {
                    // Muted bow "thup": low string thump and a faint, dark air puff. No twang.
                    tone(190, 110, 0.07, 0.05, "sine");
                    tone(0, 0, 0.06, 0.012, "noise", 0, low(900 * vary, 350));
                } else if (hero === "sorcerer") {
                    // Arcane bolt: soft detuned pair rising a fifth, with a breathy shimmer.
                    tone(330 * vary, 495, 0.16, 0.025, "sine");
                    tone(334 * vary, 500, 0.16, 0.02, "sine", 0.01);
                    tone(0, 0, 0.14, 0.012, "noise", 0.02, band(1800 * vary, 2600, 4));
                } else if (hero === "warden") {
                    // Heavy mace
                    tone(130, 42, 0.2, 0.17, "sine");
                    tone(0, 0, 0.1, 0.06, "noise", 0, low(900 * vary, 250));
                } else {
                    // Blade: tonal body + bright airy swoosh sweeping down.
                    tone(420, 150, 0.1, 0.04, "triangle", 0, low(1600, 600));
                    tone(0, 0, 0.12, 0.045, "noise", 0, band(2200 * vary, 600, 1.4));
                }
            } else if (cue === "skill") {
                const index = ["nova", "burst", "guard", "chain", "frost", "reap", "meteor", "siphon", "nullwave"].indexOf(skill);
                const base = (hero === "ranger" ? 260 : hero === "warden" ? 110 : 180) + Math.max(0, index) * 8;
                // Soft magical whoomp: low sine drop plus a muffled air puff, no bright tones.
                tone(base, base * 0.6, 0.22, 0.07, "sine");
                tone(0, 0, 0.18, 0.035, "noise", 0, low(1400 * vary, 400));
                if (hero === "sorcerer") {
                    // Arcane bloom: quiet minor chord swelling upward, slightly detuned for shimmer.
                    for (const [ratio, delay] of [[1, 0], [1.2, 0.04], [1.5, 0.08]]) {
                        tone(base * 1.6 * ratio, base * 2 * ratio, 0.4, 0.018, "sine", delay);
                        tone(base * 1.61 * ratio, base * 2.01 * ratio, 0.4, 0.012, "sine", delay);
                    }
                }
            } else if (cue === "hit") tone(0, 0, 0.07, 0.055, "noise", 0, band(1700 * vary, 500, 1.4));
            else if (cue === "hurt") { tone(190, 60, 0.2, 0.12, "triangle", 0, low(1200, 300)); tone(0, 0, 0.1, 0.05, "noise", 0, low(1500, 300)); }
            else if (cue === "dodge") tone(0, 0, 0.2, 0.06, "noise", 0, band(600, 3500 * vary, 2.2));
            else if (cue === "heal") {
                tone(523, 523, 0.25, 0.045, "sine");
                tone(784, 784, 0.3, 0.04, "sine", 0.08);
                tone(1047, 1047, 0.35, 0.03, "triangle", 0.16, low(3000));
            } else if (cue === "loot") {
                // Coin: two bright pings.
                tone(1568, 1568, 0.1, 0.04, "triangle");
                tone(2093, 2093, 0.18, 0.035, "triangle", 0.06);
            } else if (cue === "forge") {
                // Anvil: metallic clang (inharmonic partials) + spark hiss.
                tone(740, 700, 0.35, 0.07, "triangle");
                tone(1863, 1800, 0.25, 0.03, "sine");
                tone(0, 0, 0.12, 0.03, "noise", 0.01, band(5000, 2000, 1.5));
            }
            else if (cue === "warning") { tone(220, 220, 0.18, 0.13, "triangle"); tone(330, 220, 0.2, 0.11, "triangle", 0.2); }
            else if (cue === "death") {
                tone(220, 35, 1, 0.12, "sawtooth", 0, low(1500, 120));
                tone(0, 0, 0.6, 0.05, "noise", 0, low(800, 80));
            }
            else if (["level", "choice", "victory"].includes(cue)) {
                for (const [i, offset] of [0, 4, 7, 12].entries()) {
                    const pitch = frequency(60 + offset);
                    tone(pitch, pitch, 0.35, 0.05, "triangle", i * 0.08, low(3500));
                }
                tone(frequency(84), frequency(84), 0.5, 0.025, "sine", 0.32);
            }
        } catch { /* A failed sound must not interrupt combat. */ }
    }
    function update(state, mapIndex = 0, blocked = false, mainMenu = false) {
        if (disposed) return;
        const nextBoss = !mainMenu && state.enemies.some(enemy => enemy.kind === "boss" && enemy.health > 0);
        const nextArea = Math.max(0, Math.min(5, mapIndex));
        if (nextBoss !== boss || nextArea !== area || menu !== mainMenu) stopMusic();
        const newBoss = state.enemies.find(enemy => enemy.kind === 'boss' && enemy.health > 0);
        if (newBoss && !blocked && !background && state.status === 'playing' && !state.resumeDelay
            && !introducedBosses.has(newBoss)) {
            const motifs = [[0, 7, 3], [0, 2, 10], [0, 6, 7], [12, 7, 14], [3, 2, 7], [0, 1, 6]];
            if (context && !settings.muted && context.state === 'running') for (const [i, note] of motifs[nextArea].entries()) {
                const pitch = frequency(48 + note);
                voice('music', context.currentTime + i * 0.16, 0.35, pitch, pitch, 0.055, 'triangle');
            }
            if (context && context.state === 'running') introducedBosses.add(newBoss);
        }
        menu = mainMenu;
        boss = nextBoss;
        area = nextArea;
        active = !blocked && (mainMenu || state.status === "ready" || state.status === "playing");
        syncMusic();
        const current = {
            status: state.status, health: state.player.health, level: state.player.level, gold: state.gold,
            weapon: state.player.weaponBonus, armor: state.player.armorBonus,
            cooldowns: Object.fromEntries(["attack", "dodge", "potion", ...state.loadout.auto.filter(key => key !== "none")].map(key => [key, state.player[key] || 0])),
            damage: Object.values(state.runSystems?.summary.damage ?? {}).reduce((sum, value) => sum + value, 0),
            upgrades: Object.values(state.upgrades).reduce((sum, value) => sum + value, 0) + Object.values(state.mastery).reduce((sum, value) => sum + value, 0),
            boons: Object.values(state.boons).reduce((sum, value) => sum + value, 0),
            selected: state.loadout.auto.filter(key => key !== "none").length,
            training: Object.values(state.skillTree).reduce((sum, tree) => sum + Object.values(tree).reduce((points, rank) => points + rank, 0), 0),
            warnings: new Map(state.enemies.filter(enemy => enemy.kind === "boss").map(enemy => [enemy, { warning: enemy.winding > 0, phase: enemy.combat?.phase ?? 1 }]))
        };
        if (previous && previousState === state && !blocked && !background) {
            if (state.status === "dead" && previous.status !== "dead") play("death");
            else if (state.status === "won" && previous.status !== "won") play("victory");
            if (current.health < previous.health) play("hurt");
            if (current.level > previous.level) play("level");
            if (current.boons > previous.boons || current.selected > previous.selected || current.training > previous.training) play("choice");
            if (current.upgrades > previous.upgrades) play("forge");
            if (current.gold > previous.gold || current.weapon > previous.weapon || current.armor > previous.armor) play("loot");
            if (current.damage > previous.damage) play("hit");
            for (const [key, cooldown] of Object.entries(current.cooldowns)) {
                if (cooldown > (previous.cooldowns[key] ?? 0) + 0.01) play(key === "attack" ? "attack" : key === "dodge" ? "dodge" : key === "potion" ? "heal" : "skill", state.heroClass, key);
            }
            for (const [enemy, warning] of current.warnings) {
                const before = previous.warnings.get(enemy);
                if (before && ((!before.warning && warning.warning) || warning.phase > before.phase)) play("warning");
            }
        }
        previous = current;
        previousState = state;
    }
    function setBackground(value) {
        background = value;
        if (background) {
            stopMusic();
            stopVoices();
            if (context) {
                master.gain.setValueAtTime(0, context.currentTime);
                void context.suspend().catch(() => {});
            }
        } else applySettings();
    }
    return {
        unlock, play, update, setBackground,
        get settings() { return { ...settings }; },
        setSettings(value) {
            settings = audioSettings({ ...settings, ...value });
            try { environment.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Audio works without storage. */ }
            applySettings();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            stopMusic();
            stopVoices();
            if (context) void context.close().catch(() => {});
        }
    };
}
