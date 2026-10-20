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
        melody: ["0.0.2.3.4..3.2..", "4.4.5.6.7..6.4.."], lead: "triangle", leadLen: 0.32, leadLevel: 0.034,
        bass: "x.x.x.x.x.x.x.x.", drums: "k...s..kk...s.h.", signature: "anvil" },
    { name: "glacier", bpm: 70, root: 52, scale: [0, 2, 4, 6, 7, 9, 11], chords: [0, 4, 5, 3],
        melody: ["7...9...b...9.7.", "8...7...4.....5."], lead: "sine", leadLen: 2, leadLevel: 0.045,
        bass: "x...........x...", drums: "................", signature: "bell" },
    { name: "archive", bpm: 96, root: 49, scale: [0, 2, 4, 6, 8, 10], chords: [0, 2, 4, 1],
        melody: ["0.....3.....5...", "4.....2.....1..."], lead: "triangle", leadLen: 0.5, leadLevel: 0.045,
        bass: "x.......x.......", drums: "h.h.h.h.h.h.h.h.", signature: "arp" },
    { name: "rift", bpm: 88, root: 43, scale: [0, 1, 3, 5, 6, 8, 10], chords: [0, 1, 4, 0],
        melody: ["0..1..0..4..3...", "7..6..4..1..0..."], lead: "triangle", leadLen: 0.4, leadLevel: 0.03,
        bass: "x..x..x..x..x.x.", drums: "k..k..k.s..k..s.", signature: "swell" }
];
const MENU_STYLE = { name: "menu", bpm: 60, root: 50, scale: [0, 2, 4, 5, 7, 9, 11], chords: [0, 5, 3, 4],
    melody: ["4...2...0.....1.", "2...4...7...5..."], lead: "sine", leadLen: 2, leadLevel: 0.05,
    bass: "x.......", drums: "................", signature: "pluck" };
const degree = (scale, n) => scale[((n % scale.length) + scale.length) % scale.length] + 12 * Math.floor(n / scale.length);

export function createGameAudio(environment = globalThis) {
    let settings = { ...DEFAULT_AUDIO_SETTINGS };
    try { settings = audioSettings(JSON.parse(environment.localStorage?.getItem(SETTINGS_KEY) ?? "null")); } catch { /* Audio preferences are optional. */ }
    let context, musicGain, effectsGain, master, noise, musicReverb, effectsReverb, musicEcho, echoDelay;
    let disposed = false, failed = false, background = false, active = false, boss = false, area = 0, menu = false;
    let effectWindow = 0, effectCount = 0;
    let timer = null, nextNote = 0, beat = 0, previous = null, previousState = null;
    const voices = new Set();
    const lastCue = new Map();
    const introducedBosses = new WeakSet();

    function stopVoices(channel = null) {
        for (const voice of [...voices]) {
            if (channel && voice.channel !== channel) continue;
            for (const source of voice.sources) { try { source.stop(); } catch { /* A source may already have ended. */ } }
            for (const node of voice.nodes) node.disconnect();
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
        master.gain.setValueAtTime(settings.muted || background ? 0 : 0.8, context.currentTime);
        musicGain.gain.setTargetAtTime(settings.music, context.currentTime, 0.025);
        effectsGain.gain.setTargetAtTime(settings.effects, context.currentTime, 0.025);
        if (settings.muted) stopVoices();
        syncMusic();
    }
    // A single synth voice. Music voices are filtered, can be detuned in unison for warmth, are
    // panned, and feed shared reverb/echo buses so nothing sounds like a dry, raw oscillator.
    function voice(channel, start, duration, pitch, endPitch, level, type = "sine", filter = null, options = {}) {
        if (!context || context.state !== "running" || disposed || failed || background || settings.muted
            || settings[channel] <= 0 || voices.size >= 48
            || (channel === "effects" && [...voices].filter(item => item.channel === channel).length >= 16)) return;
        const music = channel === "music";
        const { attack = music ? 0.02 : 0.008, sustain = 0, reverb = music ? 0.3 : 0.12, echo = 0,
            pan = music ? 0 : (Math.random() - 0.5) * 0.25 } = options;
        const unison = type === "noise" ? 1 : Math.max(1, options.unison ?? 1), spread = options.spread ?? 8;
        const nodes = [], sources = [];
        const gain = context.createGain();
        nodes.push(gain);
        if (!filter && music && (type === "sawtooth" || type === "square")) {
            const cutoff = Math.min(3200, Math.max(500, pitch * 3.5));
            filter = { type: "lowpass", from: cutoff, to: cutoff * 0.6, q: 0.7 };
        }
        let input = gain;
        if (filter && typeof context.createBiquadFilter === "function") {
            const shaper = context.createBiquadFilter();
            shaper.type = filter.type;
            shaper.Q.value = filter.q ?? 1;
            shaper.frequency.setValueAtTime(filter.from, start);
            shaper.frequency.exponentialRampToValueAtTime(Math.max(20, filter.to ?? filter.from), start + duration);
            shaper.connect(gain);
            nodes.push(shaper);
            input = shaper;
        }
        for (let i = 0; i < unison; i++) {
            const source = type === "noise" ? context.createBufferSource() : context.createOscillator();
            if (type === "noise") source.buffer = noise;
            else {
                source.type = type;
                source.frequency.setValueAtTime(Math.max(20, pitch), start);
                source.frequency.exponentialRampToValueAtTime(Math.max(20, endPitch), start + duration);
                if (unison > 1) source.detune?.setValueAtTime((i / (unison - 1) - 0.5) * 2 * spread, start);
            }
            source.connect(input);
            sources.push(source);
            nodes.push(source);
        }
        const peak = level / Math.sqrt(unison);
        const rise = Math.min(attack, duration * 0.5);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(peak, start + rise);
        if (sustain > 0) gain.gain.setValueAtTime(peak, start + Math.max(rise, duration * sustain));
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        let out = gain;
        if (pan && typeof context.createStereoPanner === "function") {
            const panner = context.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, pan));
            gain.connect(panner);
            nodes.push(panner);
            out = panner;
        }
        out.connect(music ? musicGain : effectsGain);
        const send = (amount, bus) => {
            if (!amount || !bus) return;
            const level = context.createGain();
            level.gain.value = amount;
            out.connect(level);
            level.connect(bus);
            nodes.push(level);
        };
        send(reverb, music ? musicReverb : effectsReverb);
        if (music) send(echo, musicEcho);
        const entry = { sources, nodes, channel };
        voices.add(entry);
        sources[0].onended = () => { for (const node of nodes) node.disconnect(); voices.delete(entry); };
        for (const source of sources) { source.start(start); source.stop(start + duration + 0.02); }
    }
    const tone = (midi, at, length, level, type = "sine", slide = 1, options = {}) => {
        const pitch = frequency(midi);
        voice("music", at, length, pitch, pitch * slide, level, type, null, options);
    };
    // Drum kit: pitched-down sine kick with a click, band-passed snare with body, airy hats.
    const kick = (at, level) => {
        voice("music", at, 0.34, 150, 42, level, "sine", null, { attack: 0.003, reverb: 0.05 });
        voice("music", at, 0.02, 0, 0, level * 0.1, "noise", { type: "lowpass", from: 1800, to: 600, q: 0.5 }, { attack: 0.002, reverb: 0 });
    };
    const snare = (at, level) => {
        // Darker, rounder snare: lower noise band, gentle Q, short room tail instead of a hall.
        voice("music", at, 0.16, 0, 0, level * 0.6, "noise", { type: "bandpass", from: 1500, to: 900, q: 0.6 }, { attack: 0.004, reverb: 0.15 });
        voice("music", at, 0.14, 190, 140, level * 0.6, "sine", null, { attack: 0.003, reverb: 0.1 });
    };
    const hat = (at, level, pan = 0) => voice("music", at, 0.035, 0, 0, level * 0.55, "noise", { type: "bandpass", from: 6500, to: 5500, q: 0.8 }, { attack: 0.002, reverb: 0.05, pan });
    const tom = (at, midi, level) => tone(midi, at, 0.3, level * 0.8, "sine", 0.6, { attack: 0.004, reverb: 0.2 });
    const cymbal = (at, level) => voice("music", at, 1.2, 0, 0, level * 0.5, "noise", { type: "bandpass", from: 5000, to: 3000, q: 0.5 }, { attack: 0.01, reverb: 0.3 });
    // Lush pad: three chord tones, each a 3-voice detuned saw through a soft low-pass, slow swell.
    const pad = (at, length, notes, level, brightness = 900) => notes.forEach((midi, index) => {
        const pitch = frequency(midi);
        voice("music", at, length, pitch, pitch, level, "sawtooth", { type: "lowpass", from: brightness, to: brightness * 0.7, q: 0.6 },
            { attack: Math.min(0.8, length * 0.3), sustain: 0.75, unison: 3, spread: 14, reverb: 0.7, pan: (index - 1) * 0.35 });
    });
    function scheduleMusic() {
        if (!context || context.state !== "running") return;
        const now = context.currentTime;
        if (nextNote < now) nextNote = now + 0.02;
        const style = menu ? MENU_STYLE : STYLES[area];
        if (boss) { scheduleBoss(style, now); return; }
        const spacing = 60 / style.bpm / 2;
        echoDelay?.delayTime.setTargetAtTime(spacing * 3, now, 0.1);
        while (nextNote < now + 0.25) {
            const step = beat % 16, bar = Math.floor(beat / 16);
            const chord = style.chords[bar % style.chords.length];
            const chordRoot = style.root + degree(style.scale, chord);
            // Bar 3 of every 4 breathes: melody rests so the pad and signature layer can speak.
            const symbol = bar % 4 === 2 ? "." : style.melody[bar % 2][step];
            // The very first beat of any track lands a clear note so music is heard right away.
            if (beat === 0) tone(style.root + 12 + degree(style.scale, 4), nextNote, 1.6, style.leadLevel * 0.8, "sine", 1, { attack: 0.02, reverb: 0.5, echo: 0.2 });
            if (symbol !== ".") {
                const pitch = style.root + 12 + degree(style.scale, parseInt(symbol, 36));
                tone(pitch, nextNote, Math.max(0.4, style.leadLen * 1.4), style.leadLevel * 0.9, style.lead, style.slide ?? 1,
                    { attack: Math.min(0.08, style.leadLen * 0.12), unison: 2, spread: 6, echo: 0.3, reverb: 0.45, pan: ((step % 4) - 1.5) * 0.1 });
            }
            if (style.bass[step % style.bass.length] === "x") {
                tone(chordRoot - 12, nextNote, spacing * 6, 0.055, "triangle", 1, { attack: 0.015, reverb: 0.08 });
                tone(chordRoot - 24, nextNote, spacing * 6, 0.04, "sine", 1, { attack: 0.02, reverb: 0 });
            }
            if (step === 0) pad(nextNote, spacing * 17, [chordRoot, style.root + degree(style.scale, chord + 2), style.root + degree(style.scale, chord + 4)], 0.013);
            const drum = style.drums[step];
            if (drum === "k") kick(nextNote, 0.12);
            else if (drum === "s") snare(nextNote, 0.04);
            else if (drum === "h") hat(nextNote, 0.016, step % 4 ? 0.25 : -0.25);
            const sparkle = { attack: 0.005, reverb: 0.55, echo: 0.25 };
            if (style.signature === "pluck" && step % 4 === 2) tone(style.root + 12 + degree(style.scale, chord + [0, 2, 4, 2][(step >> 2) % 4]), nextNote, 0.6, 0.018, "triangle", 1, { ...sparkle, pan: 0.3 });
            else if (style.signature === "drip" && step === 11 && bar % 2 === 1) tone(style.root + 36 + degree(style.scale, bar % 5), nextNote, 0.25, 0.02, "sine", 1.4, { ...sparkle, reverb: 0.8, pan: -0.4 });
            else if (style.signature === "anvil" && step === 15 && bar % 2 === 1) tone(style.root + 19, nextNote, 0.45, 0.012, "sine", 1, { attack: 0.006, reverb: 0.35, pan: 0.3 });
            else if (style.signature === "bell" && step % 8 === 4) {
                const bell = style.root + 24 + degree(style.scale, chord + (step === 4 ? 4 : 6));
                tone(bell, nextNote, 3, 0.018, "sine", 1, { ...sparkle, reverb: 0.8, pan: step === 4 ? -0.3 : 0.3 });
                tone(bell + 19, nextNote, 1.2, 0.005, "sine", 1, { attack: 0.005, reverb: 0.8 });
            } else if (style.signature === "arp" && step % 2 === 1) tone(style.root + 12 + degree(style.scale, chord + [0, 2, 4, 2][(step >> 1) % 4]), nextNote, 0.3, 0.014, "triangle", 1, { ...sparkle, pan: ((step >> 1) % 2 ? 0.35 : -0.35) });
            else if (style.signature === "swell" && step === 8 && bar % 2 === 0) tone(style.root + 6, nextNote, spacing * 8, 0.022, "sawtooth", 0.94, { attack: spacing * 4, unison: 3, spread: 18, reverb: 0.7 });
            nextNote += spacing;
            beat++;
        }
    }
    // Boss fights get their own driving epic track built on the act's key and scale: filtered power
    // chords, a pumping bass, a backbeat, a doubled lead with echo, a choir-like pad and tom fills.
    function scheduleBoss(style, now) {
        const spacing = 60 / (132 + area * 4) / 2;
        echoDelay?.delayTime.setTargetAtTime(spacing * 3, now, 0.1);
        const leads = ["0.2.4...4.5.4.2.", "4.5.7...9.7.5.4.", "7...6.4.5...4.2.", "2.4.5.7.9...7..."];
        while (nextNote < now + 0.25) {
            const step = beat % 16, bar = Math.floor(beat / 16);
            const chord = [0, 5, 3, 4][bar % 4];
            const chordRoot = style.root + degree(style.scale, chord);
            if (step === 0 || step === 8) {
                for (const [offset, level, pan] of [[-12, 0.03, -0.3], [-5, 0.024, 0.3], [0, 0.018, 0]])
                    tone(chordRoot + offset, nextNote, spacing * 7.5, level, "sawtooth", 1, { attack: 0.01, sustain: 0.6, unison: 2, spread: 10, reverb: 0.3, pan });
            }
            tone(chordRoot - 24, nextNote, spacing * 0.95, 0.07, "triangle", 1, { attack: 0.006, reverb: 0.05 });
            if (step === 0) pad(nextNote, spacing * 17, [chordRoot + 12, style.root + 12 + degree(style.scale, chord + 2), style.root + 12 + degree(style.scale, chord + 4)], 0.011, 1300);
            const symbol = bar % 8 < 2 ? "." : leads[bar % 4][step];
            if (symbol !== ".") {
                const pitch = style.root + 12 + degree(style.scale, parseInt(symbol, 36));
                tone(pitch, nextNote, spacing * 2.2, 0.026, "sawtooth", 1, { attack: 0.012, unison: 2, spread: 8, echo: 0.3, reverb: 0.4 });
                tone(pitch + 12, nextNote, spacing * 2.2, 0.01, "triangle", 1, { attack: 0.012, echo: 0.3, reverb: 0.5 });
            }
            const fill = bar % 4 === 3 && step >= 12;
            if (fill) tom(nextNote, 52 - (step - 12) * 3, 0.07);
            else {
                const drum = "k.k.s..kk.k.s..k"[step];
                if (drum === "k") kick(nextNote, 0.11);
                else if (drum === "s") snare(nextNote, 0.04);
            }
            if (step % 2 === 0) hat(nextNote, 0.012, step % 4 ? 0.3 : -0.3);
            if (bar % 4 === 0 && step === 0 && beat > 0) cymbal(nextNote, 0.015);
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
                // Gentle glue compression then a brick-wall-ish limiter: smooth, consistent loudness.
                const set = (param, value) => { if (param) param.value = value; };
                const glue = context.createDynamicsCompressor();
                set(glue.threshold, -24); set(glue.knee, 18); set(glue.ratio, 3); set(glue.attack, 0.02); set(glue.release, 0.25);
                const limiter = context.createDynamicsCompressor();
                set(limiter.threshold, -6); set(limiter.knee, 0); set(limiter.ratio, 20); set(limiter.attack, 0.002); set(limiter.release, 0.1);
                const canFilter = typeof context.createBiquadFilter === "function";
                const filterNode = (type, cutoff, q) => {
                    if (!canFilter) return context.createGain();
                    const f = context.createBiquadFilter(); f.type = type; set(f.frequency, cutoff); set(f.Q, q); return f;
                };
                const lowpass = (cutoff, q = 0.5) => filterNode("lowpass", cutoff, q);
                const highpass = cutoff => filterNode("highpass", cutoff, 0.5);
                // Music: low-cut the mud, soft high roll-off for warmth.
                const musicLow = highpass(35), musicWarm = lowpass(6500, 0.4);
                musicGain.connect(musicLow); musicLow.connect(musicWarm); musicWarm.connect(master);
                const effectsWarm = lowpass(7000, 0.4);
                effectsGain.connect(effectsWarm); effectsWarm.connect(master);
                // Algorithmic hall reverb: decaying stereo noise impulse convolved with sends.
                const impulse = (seconds, decay) => {
                    const length = Math.floor(context.sampleRate * seconds);
                    const buffer = context.createBuffer(2, length, context.sampleRate);
                    for (let channel = 0; channel < 2; channel++) {
                        const data = buffer.getChannelData(channel);
                        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
                    }
                    return buffer;
                };
                const makeReverb = (seconds, decay, level, output) => {
                    const input = context.createGain();
                    if (typeof context.createConvolver !== "function") return input;
                    const convolver = context.createConvolver(), tail = context.createGain(), damp = lowpass(4200), clean = highpass(180);
                    convolver.buffer = impulse(seconds, decay);
                    tail.gain.value = level;
                    input.connect(clean); clean.connect(convolver); convolver.connect(damp); damp.connect(tail); tail.connect(output);
                    return input;
                };
                musicReverb = makeReverb(3.2, 2.6, 0.55, musicGain);
                effectsReverb = makeReverb(1.3, 3, 0.45, effectsGain);
                // Tempo-synced ping-pong-ish echo with darkening feedback.
                musicEcho = context.createGain();
                if (typeof context.createDelay === "function") {
                    echoDelay = context.createDelay(2);
                    echoDelay.delayTime.value = 0.4;
                    const feedback = context.createGain(), echoTone = lowpass(2200), echoOut = context.createGain();
                    feedback.gain.value = 0.32; echoOut.gain.value = 0.5;
                    musicEcho.connect(echoDelay); echoDelay.connect(echoTone); echoTone.connect(feedback); feedback.connect(echoDelay);
                    echoTone.connect(echoOut); echoOut.connect(musicGain); echoOut.connect(musicReverb);
                }
                master.connect(glue);
                glue.connect(limiter);
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
            const tone = (pitch, end, duration, level = 0.1, type = "sine", delay = 0, filter = null, options = {}) => voice("effects", now + delay, duration, pitch * EFFECT_PITCH, end * EFFECT_PITCH, level, type, filter, options);
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
                tone(base, base * 0.6, 0.3, 0.07, "sine", 0, null, { attack: 0.005, reverb: 0.3 });
                tone(0, 0, 0.3, 0.035, "noise", 0, low(1400 * vary, 400), { attack: 0.01, reverb: 0.35 });
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
                tone(523, 523, 0.6, 0.035, "sine", 0, null, { attack: 0.03, reverb: 0.5 });
                tone(784, 784, 0.7, 0.03, "sine", 0.08, null, { attack: 0.03, reverb: 0.5 });
                tone(1047, 1047, 0.8, 0.02, "triangle", 0.16, low(3000), { attack: 0.03, reverb: 0.6 });
            } else if (cue === "loot") {
                // Coin: soft chime pair with a bell overtone and a short shimmer tail.
                tone(1568, 1568, 0.35, 0.03, "sine", 0, null, { attack: 0.003, reverb: 0.35 });
                tone(2093, 2093, 0.5, 0.025, "sine", 0.07, null, { attack: 0.003, reverb: 0.4 });
                tone(5230, 5230, 0.2, 0.004, "sine", 0.07, null, { attack: 0.002, reverb: 0.4 });
            } else if (cue === "forge") {
                // Anvil: warm, rounded clink with a soft spark breath (no piercing partials).
                tone(620, 600, 0.4, 0.04, "sine", 0, null, { attack: 0.004, reverb: 0.35 });
                tone(1240, 1220, 0.25, 0.012, "sine", 0, null, { attack: 0.004, reverb: 0.35 });
                tone(0, 0, 0.1, 0.012, "noise", 0.01, band(3000, 1500, 0.8));
            }
            else if (cue === "warning") { tone(220, 220, 0.25, 0.08, "sine", 0, null, { attack: 0.01, reverb: 0.3 }); tone(330, 220, 0.3, 0.06, "sine", 0.2, null, { attack: 0.01, reverb: 0.3 }); }
            else if (cue === "death") {
                tone(220, 35, 1, 0.12, "sawtooth", 0, low(1500, 120));
                tone(0, 0, 0.6, 0.05, "noise", 0, low(800, 80));
            }
            else if (cue === "level") {
                // Gentle rising chime: two soft sine notes with a quiet octave shimmer.
                for (const [i, offset] of [0, 7].entries()) {
                    const pitch = frequency(64 + offset);
                    tone(pitch, pitch, 0.9, 0.022, "sine", i * 0.11, null, { attack: 0.02, reverb: 0.55 });
                }
                tone(frequency(83), frequency(83), 1, 0.006, "sine", 0.11, null, { attack: 0.03, reverb: 0.6 });
            } else if (cue === "choice") {
                // Picking a card or learning a node: a short, muted confirm "tock".
                tone(frequency(67), frequency(67), 0.25, 0.022, "sine", 0, null, { attack: 0.004, reverb: 0.25 });
                tone(frequency(74), frequency(74), 0.3, 0.012, "sine", 0.05, null, { attack: 0.004, reverb: 0.3 });
            } else if (cue === "victory") {
                for (const [i, offset] of [0, 4, 7, 12].entries()) {
                    const pitch = frequency(60 + offset);
                    tone(pitch, pitch, 0.8, 0.035, "sawtooth", i * 0.09, low(2600, 1400), { attack: 0.01, unison: 3, spread: 9, reverb: 0.45 });
                    tone(pitch, pitch, 0.6, 0.02, "sine", i * 0.09, null, { attack: 0.005, reverb: 0.4 });
                }
                tone(frequency(84), frequency(84), 1.4, 0.018, "sine", 0.36, null, { attack: 0.01, reverb: 0.6 });
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
            if (context && !settings.muted && context.state === 'running') {
                const at = context.currentTime;
                cymbal(at, 0.03);
                kick(at, 0.14);
                for (const [i, note] of motifs[nextArea].entries()) tone(48 + note, at + i * 0.22, 0.9, 0.035, 'sawtooth', 1, { attack: 0.02, unison: 3, spread: 10, reverb: 0.6, echo: 0.3 });
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
