import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dumpBrowserDom } from './browser-dom.mjs';
import { STARTER_SKILLS } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';

// Taps through the real campaign setup code (arpg.js) in a browser with the real markup and mobile CSS:
// Start without a skill explains itself, the first-run tutorial steps through, and later runs skip it.
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!fs.existsSync(edge)) {
    console.log('SKIP: setup click-through requires Microsoft Edge');
} else {
    const jsFolder = new URL('../../Path of Boredom.Game/wwwroot/js/', import.meta.url);
    const source = fs.readFileSync(new URL('arpg.js', jsFolder), 'utf8');
    const between = (start, end) => {
        const from = source.indexOf(start), to = source.indexOf(end, from);
        assert.ok(from >= 0 && to > from, `arpg.js marker missing: ${start}`);
        return source.slice(from, to);
    };
    const tutorialCode = between('    const tutorial = [', '    const rankingStatus');
    const setupCode = between('    function updateClassPreview()', '    on(setup, "keydown"');
    const home = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
    const setupMarkup = home.slice(home.indexOf('<div class="arena-overlay setup-overlay"'), home.indexOf('<div class="arena-caption"'))
        .replace(/@foreach \(var skill in StarterSkills\)\s*\{([\s\S]*?)\n\s*\}/g, (_, inner) => STARTER_SKILLS.map(skill => inner.replaceAll('@skill', skill)).join(''))
        .replace(/@for \(var slot = 0; slot < 1; slot\+\+\)\s*\{([\s\S]*?)\n\s*\}/, (_, inner) => inner.replaceAll('@slot', '0'))
        .replace(/@\w+/g, '');
    const css = ['../../Path of Boredom.Game/Components/Pages/Home.razor.css', '../wwwroot/css/mobile-shell.css', '../wwwroot/css/mobile-menu.css']
        .map(file => fs.readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('::deep ', '').replaceAll('@media (pointer: coarse)', '@media all')).join('\n');
    const harness = `
        let state = Object.assign(startRun(Math.random, "hard", "knight"), { status: "ready" });
        let saving = false, checkingUnlock = false, setupAction = null, setupStep = 0, setupFromMain = false, checkpointHandled = null, releaseRankings = false, last = 0;
        let activeSaveSlot = "slot-1", setupPreviousSaveSlot = null, saveSlotsCache = [{ exists: false, slot: "slot-1" }];
        const setup = root.querySelector("[data-setup]"), setupNext = root.querySelector("[data-setup-next]"), setupSkip = root.querySelector("[data-setup-skip]");
        const setupCancel = root.querySelector("[data-setup-cancel]"), setupLoadoutPanel = root.querySelector("[data-setup-loadout]");
        const classSelect = root.querySelector("[data-hero-class]"), difficultySelect = root.querySelector("[data-difficulty]"), classPreview = root.querySelector("[data-class-preview]");
        const setupSlots = [...root.querySelectorAll("[data-setup-slot]")], setupSkillButtons = [...root.querySelectorAll("[data-choose-starter-skill]")];
        const startButton = document.createElement("button"), endlessButton = document.createElement("button"), canvas = document.createElement("canvas");
        const on = (target, event, handler) => target.addEventListener(event, handler);
        const clearInput = () => {}, updateHud = () => {}, scheduleArenaLayout = () => {}, reportScore = async () => {}, showMainMenu = () => {};
        const clearTemporaryRun = () => {}, saveTemporaryRun = () => {};
        const togglePause = () => {}, enterEndless = () => true, resetToReleaseRankings = () => {};
        const openSaveSlotChooser = async () => "slot-1";
        const { classUnlocked, extraStarters, applyCampBonuses, rerollsPerRun, CLASS_UNLOCK_HINT, CLASS_ORDER, loadProfile, masteryStep, MASTERY_MAX, MASTERY_REWARDS, unlockedTrims, setTrim, creditProgress } = meta;
        const MAX_FLASKS = 5, RELIC_KEYS = relics.RELIC_KEYS;
        const skillTagline = skills.skillTagline ?? (() => "");
        ${tutorialCode}
        ${setupCode}
        return { openSetup, get state() { return state; }, get step() { return setupStep; }, tutorial };`;
    const page = `<html><head><style>html,body{margin:0}*{box-sizing:border-box}[hidden]{display:none!important}${css}
        .arena-overlay{position:fixed;inset:0;display:grid;place-items:center}</style></head>
        <body class="mobile-shell" data-result="pending"><div class="arpg" data-canvas-hud="on">${setupMarkup}</div>
        <script>window.addEventListener('error', event => document.body.dataset.result = 'script error: ' + event.message);</script>
        <script type="module">
        import * as skills from "/js/arpg-skills.js";
        import * as meta from "/js/arpg-meta.js";
        import * as relics from "/js/arpg-relics.js";
        import { HERO_CLASSES } from "/js/arpg-classes.js";
        import { DIFFICULTIES } from "/js/arpg-difficulty.js";
        import { LAST_WAVE } from "/js/arpg-campaign.js";
        import { startRun, startEndlessRun } from "/js/arpg-engine.js";
        const steps = [];
        const check = (ok, message) => { if (!ok) throw new Error(message); };
        try {
            const root = document.querySelector(".arpg");
            const game = new Function("root", "skills", "meta", "relics", "HERO_CLASSES", "DIFFICULTIES", "LAST_WAVE", "startRun", "startEndlessRun",
                "const { STARTER_SKILLS, validLoadout, skillName, skillIcon, combatSkillDefinition } = skills;" + ${JSON.stringify(harness)})
                (root, skills, meta, relics, HERO_CLASSES, DIFFICULTIES, LAST_WAVE, startRun, startEndlessRun);
            const setup = root.querySelector("[data-setup]"), next = root.querySelector("[data-setup-next]"), skip = root.querySelector("[data-setup-skip]");
            const setupLoadoutPanel = root.querySelector("[data-setup-loadout]");
            const visible = element => element.getBoundingClientRect().height > 0;
            const description = () => root.querySelector("[data-setup-description]").textContent;
            localStorage.clear();

            // 1. A new run opens on class/difficulty before showing starting skills.
            const original = game.state;
            game.openSetup("campaign");
            check(!setup.hidden, "setup opens");
            check(!next.disabled, "Start must be tappable before a skill is chosen");
            check(setupLoadoutPanel.hidden, "starting skills stay hidden on the class/difficulty step");
            check(!root.querySelector("[data-class-picker]").hidden, "class picker is the first setup step");
            check(next.textContent === "Start quick guide", "first-time campaign starts with the quick guide");
            next.click();
            check(game.state === original && game.step === 1, "New Run advances to the tutorial without opening skills");
            steps.push("class-difficulty");

            // 2. First run: tutorial steps lead to the loadout picker.
            for (let index = 0; index < game.tutorial.length; index++) {
                check(game.step === index + 1, "tutorial step " + (index + 1));
                check(setup.dataset.tutorial === "on", "tutorial mode on");
                check(description() === game.tutorial[index].touch, "touch text shown at step " + (index + 1));
                check(visible(root.querySelector("[data-setup-description]")), "tutorial text visible");
                check(visible(skip), "skip visible");
                check(next.textContent === (index === game.tutorial.length - 1 ? "Continue to skills" : "Next"), "button label at step " + (index + 1));
                check(game.state === original, "run must not start during the tutorial");
                next.click();
            }
            check(game.step === game.tutorial.length + 1, "tutorial advances to the loadout step");
            check(!setupLoadoutPanel.hidden, "starting skill choices appear after the tutorial");
            next.click();
            check(game.state === original && setup.dataset.skillPrompt === "on", "missing skill is explained at the loadout step");
            check(document.activeElement?.hasAttribute("data-choose-starter-skill"), "focus moves to the skill buttons");
            root.querySelector("[data-choose-starter-skill]").click();
            check(setup.dataset.needsSkill === "off" && setup.dataset.skillPrompt === "off", "choosing a skill clears the prompt");
            next.click();
            check(setup.hidden && game.state !== original, "run starts after the loadout is chosen");
            check(localStorage.getItem("pob-touch-tutorial-seen") === "1", "tutorial remembered");
            steps.push("tutorial-loadout");

            // 3. Returning players skip the tutorial but still choose a starting skill.
            let previous = game.state;
            game.openSetup("campaign");
            check(setupLoadoutPanel.hidden, "returning run still starts on class/difficulty");
            next.click();
            check(game.step === game.tutorial.length + 1, "returning players go straight to loadout");
            root.querySelector("[data-choose-starter-skill]").click();
            next.click();
            check(setup.hidden && game.state !== previous, "returning players start after choosing a skill");
            steps.push("returning");

            // 4. Skipping the tutorial goes to loadout, then starts after a skill is chosen.
            localStorage.clear();
            previous = game.state;
            game.openSetup("campaign");
            next.click();
            check(game.step === 1, "tutorial shown again after clearing storage");
            skip.click();
            check(!setup.hidden && game.step === game.tutorial.length + 1, "skip goes to loadout instead of starting early");
            root.querySelector("[data-choose-starter-skill]").click();
            next.click();
            check(setup.hidden && game.state !== previous, "skip then loadout starts the run");
            check(localStorage.getItem("pob-touch-tutorial-seen") === "1", "skip is remembered");
            steps.push("skip");
            document.body.dataset.result = "PASS";
        } catch (error) { document.body.dataset.result = error.message + " after " + steps.join(","); }
        </script></body></html>`;
    const jsRoot = fileURLToPath(jsFolder);
    const server = http.createServer((request, response) => {
        const url = decodeURIComponent(request.url.split('?')[0]);
        if (process.env.DEBUG_SETUP_TEST) console.log('GET', url);
        if (url.startsWith('/js/')) {
            const file = path.resolve(jsRoot, url.slice(4));
            if (file.startsWith(jsRoot) && fs.existsSync(file)) {
                response.setHeader('Content-Type', 'text/javascript');
                response.end(fs.readFileSync(file));
                return;
            }
            response.statusCode = 404;
            response.end();
            return;
        }
        response.setHeader('Content-Type', 'text/html');
        response.end(page);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const output = await dumpBrowserDom(edge, ['--virtual-time-budget=10000', '--run-all-compositor-stages-before-draw', '--window-size=664,452', `http://127.0.0.1:${server.address().port}/`]);
        assert.equal(output.match(/data-result="([^"]*)"/)?.[1], 'PASS', 'setup click-through');
        console.log('PASS: New Run starts at class/difficulty, then tutorial/loadout; skip and returning-player flows work');
    } finally { await new Promise(resolve => server.close(resolve)); }
}
