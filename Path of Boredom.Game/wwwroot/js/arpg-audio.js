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

const melodies = [
    [0, 7, 10, 7, 3, 7, 5, 2], [0, 3, 7, 10, 5, 3, 2, 7],
    [0, 7, 12, 10, 7, 5, 3, 2], [0, 10, 7, 3, 5, 7, 2, 3],
    [0, 3, 10, 14, 7, 5, 10, 7], [0, 2, 7, 10, 5, 3, 2, 0]
];
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export function createGameAudio(environment = globalThis) {
    let settings = { ...DEFAULT_AUDIO_SETTINGS };
    try { settings = audioSettings(JSON.parse(environment.localStorage?.getItem(SETTINGS_KEY) ?? "null")); } catch { /* Audio preferences are optional. */ }
    let context, musicGain, effectsGain, master, noise;
    let disposed = false, failed = false, background = false, active = false, boss = false, area = 0, menu = false;
    let effectWindow = 0, effectCount = 0;
    let timer = null, nextNote = 0, beat = 0, previous = null, previousState = null;
    const voices = new Set();
    const lastCue = new Map();

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
        if (timer !== null) environment.clearInterval(timer);
        timer = null;
        nextNote = 0;
        beat = 0;
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
    function voice(channel, start, duration, pitch, endPitch, level, type = "sine") {
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
        gain.connect(channel === "music" ? musicGain : effectsGain);
        const entry = { source, gain, channel };
        voices.add(entry);
        source.onended = () => { source.disconnect(); gain.disconnect(); voices.delete(entry); };
        source.start(start);
        source.stop(start + duration + 0.02);
    }
    function scheduleMusic() {
        if (!context || context.state !== "running") return;
        const now = context.currentTime;
        if (nextNote < now) nextNote = now + 0.04;
        const spacing = boss ? 0.38 : menu ? 0.8 : 0.62 + area * 0.025;
        while (nextNote < now + 0.25) {
            const progression = menu ? [0, 5, 3, 7] : [0, 3, 5, -2];
            const root = (menu ? 48 : 45 + area) + progression[Math.floor(beat / 16) % 4];
            const melody = boss ? [0, 7, 3, 10, 0, 5, 2, 7] : menu ? [0, 7, 12, 14, 10, 7, 5, 3] : melodies[area];
            const note = frequency(root + 12 + melody[(beat + Math.floor(beat / 32) * 2) % melody.length]);
            voice("music", nextNote, boss ? 0.24 : 1.4, note, note, boss ? 0.075 : 0.055, boss ? "triangle" : "sine");
            if (beat % 4 === 0) {
                const bass = frequency(root - 12);
                voice("music", nextNote, boss ? 0.8 : 2.4, bass, bass, 0.08, "triangle");
                if (!boss) {
                    const harmony = frequency(root + 7);
                    voice("music", nextNote, 2.2, harmony, harmony, 0.03);
                }
            }
            if (boss && beat % 2 === 0) voice("music", nextNote, 0.12, 110, 35, 0.1);
            if (beat % 8 === 6) {
                const counter = frequency(root + 24 + melody[(beat + 3) % melody.length]);
                voice("music", nextNote + spacing / 2, 0.9, counter, counter, 0.018);
            }
            nextNote += spacing;
            beat++;
        }
    }
    function syncMusic() {
        if (!context || context.state !== "running" || !active || background || settings.muted || settings.music === 0 || disposed || failed) {
            stopMusic();
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
                effectsGain.connect(master);
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
            const tone = (pitch, end, duration, level = 0.1, type = "sine", delay = 0) => voice("effects", now + delay, duration, pitch, end, level, type);
            if (cue === "button") tone(620, 880, 0.055, 0.045, "sine");
            else if (cue === "attack") {
                if (hero === "ranger") tone(1100, 240, 0.09, 0.055, "triangle");
                else if (hero === "warden") { tone(130, 40, 0.16, 0.16); tone(0, 0, 0.07, 0.04, "noise"); }
                else { tone(420, 90, 0.12, 0.08, "triangle"); tone(0, 0, 0.08, 0.035, "noise"); }
            } else if (cue === "skill") {
                const index = ["nova", "burst", "guard", "chain", "frost", "reap", "meteor", "siphon", "nullwave"].indexOf(skill);
                const base = (hero === "ranger" ? 520 : hero === "warden" ? 150 : 310) + Math.max(0, index) * 25;
                tone(base, base * 0.5, 0.28, 0.1, "triangle");
                tone(base * 1.5, base * 2, 0.2, 0.045, "sine", 0.04);
            } else if (cue === "hit") tone(0, 0, 0.06, 0.045, "noise");
            else if (cue === "hurt") { tone(180, 55, 0.18, 0.14, "triangle"); tone(0, 0, 0.09, 0.06, "noise"); }
            else if (cue === "dodge") tone(0, 0, 0.15, 0.055, "noise");
            else if (cue === "heal" || cue === "loot") {
                tone(cue === "heal" ? 440 : 880, cue === "heal" ? 660 : 1320, 0.17, 0.065);
                if (cue === "heal") tone(880, 880, 0.22, 0.04, "sine", 0.1);
            } else if (cue === "forge") { tone(740, 370, 0.16, 0.1, "triangle"); tone(1100, 740, 0.2, 0.05, "sine", 0.07); }
            else if (cue === "warning") { tone(220, 220, 0.18, 0.13, "triangle"); tone(330, 220, 0.2, 0.11, "triangle", 0.2); }
            else if (cue === "death") tone(220, 35, 0.8, 0.13, "triangle");
            else if (["level", "choice", "victory"].includes(cue)) {
                for (const [i, offset] of [0, 3, 7, 12].entries()) {
                    const pitch = frequency(60 + offset);
                    tone(pitch, pitch, 0.3, 0.06, "sine", i * 0.09);
                }
            }
        } catch { /* A failed sound must not interrupt combat. */ }
    }
    function update(state, mapIndex = 0, blocked = false, mainMenu = false) {
        if (disposed) return;
        const nextBoss = !mainMenu && state.enemies.some(enemy => enemy.kind === "boss" && enemy.health > 0);
        const nextArea = Math.max(0, Math.min(5, mapIndex));
        if (nextBoss !== boss || nextArea !== area || menu !== mainMenu) stopMusic();
        menu = mainMenu;
        boss = nextBoss;
        area = nextArea;
        active = !blocked && (mainMenu || state.status === "ready" || state.status === "playing" && !state.resumeDelay || state.status === "paused");
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
