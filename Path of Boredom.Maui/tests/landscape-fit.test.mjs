import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { dumpBrowserDom } from './browser-dom.mjs';

// Every overlay must fit a landscape phone without scrolling.
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!fs.existsSync(edge)) {
    console.log('SKIP: landscape fit checks require Microsoft Edge');
} else {
    const home = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
    const menu = fs.readFileSync(new URL('../wwwroot/js/mobile-menu.js', import.meta.url), 'utf8');
    const engine = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
    assert.doesNotMatch(menu, /names:\s*\["skills", "forge", "challenges", "options"\]/, 'the pause menu does not open a second stage challenge picker');
    assert.match(menu, /data-stage-bargain/, 'the pause recap includes the chosen bargain');
    assert.match(menu, /data-stage-challenge/, 'the pause recap includes the chosen challenge');
    assert.match(engine, /restartButton\.hidden\s*=\s*[^;]*!endlessButton\.hidden/, 'intermission only shows one restart destination');
    const slice = (start, end) => home.slice(home.indexOf(start), home.indexOf(end));
    const expand = markup => markup
        .replace(/@foreach \(var skill in (CombatSkills|StarterSkills)\)\s*\{([\s\S]*?)\n\s*\}/g, (_, list, inner) =>
            (list === 'StarterSkills' ? ['a', 'b', 'c'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']).map(skill => inner.replaceAll('@skill', skill)).join(''))
        .replace(/@for \(var index = 0; index < 3; index\+\+\)\s*\{([\s\S]*?)\n\s*\}/, (_, inner) => inner.repeat(3))
        .replace(/@for \(var slot = 0; slot < 1; slot\+\+\)\s*\{([\s\S]*?)\n\s*\}/, (_, inner) => inner.replaceAll('@slot', '0'))
        .replace(/@\w+/g, '');
    const levelDraft = expand(slice('<section class="level-draft"', '<div class="overlay-card" data-run-menu>'));
    const skillChoice = expand(slice('<div class="arena-overlay skill-choice-overlay"', '<div class="arena-overlay setup-overlay"'));
    const setup = expand(slice('<div class="arena-overlay setup-overlay"', '<div class="arena-caption"'));
    const mainMenu = slice('<section class="main-menu"', '<button type="button" class="quiet-button main-menu-return"');
    const saveDialogStart = home.indexOf('<dialog class="save-slots-dialog"');
    const saveDialog = home.slice(saveDialogStart, home.indexOf('</dialog>', saveDialogStart) + '</dialog>'.length);
    const runMenuStart = home.indexOf('<div class="overlay-card" data-run-menu>');
    const runMenu = home.slice(runMenuStart, home.lastIndexOf('</div>', home.indexOf('<div class="arena-overlay skill-choice-overlay"')));
    const css = ['../../Path of Boredom.Game/Components/Pages/Home.razor.css', '../wwwroot/css/mobile-shell.css', '../wwwroot/css/mobile-menu.css']
        .map(file => fs.readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('::deep ', '').replaceAll('@media (pointer: coarse)', '@media all')).join('\n');
    const html = `<html><head><style>html,body{margin:0}*{box-sizing:border-box}[hidden]{display:none!important}${css}
        .arena-overlay{position:fixed;inset:0;display:grid;place-items:center}</style></head>
        <body class="mobile-shell"><div class="arpg" data-canvas-hud="on" data-main-menu="on" data-game-status="paused">
        <div class="skill-bar" data-test="combat-skills"><button>Skill one</button><button>Skill two</button></div>
        <div data-test="main">${mainMenu}</div>
        <div class="arena-overlay" data-test="level">${levelDraft}</div>
        <div class="arena-overlay" data-test="death">${runMenu}</div>
        <div class="arena-overlay" data-test="camp" style="display:none">${runMenu}</div>
        <div class="arena-overlay" data-test="run-summary" style="display:none">${runMenu}</div>
        <div class="arena-overlay" data-test="pause"><div class="mm-pause-card"><div class="mm-pause-side"><div class="mm-pause-emblem"></div><h2>The hollow can wait.</h2><p>Combat and game timers are paused.</p><button class="mm-resume">Return to battle</button><p class="mm-save-status mm-run-recap">Run so far: 2m 28s · 2 stages cleared · 185 kills · 0 flasks used · 195 gold spent · 0 challenges completed. Damage dealt: Cleave: 33406 · Cinder relay: 7610 · Blazing cross: 1060.</p><button class="mm-pause-option mm-pause-footer">Main menu</button></div><div class="mm-pause-groups"><section class="mm-menu-group"><h3>Character</h3><button class="mm-pause-option">Skills &amp; loadout</button><button class="mm-pause-option">Forge &amp; equipment</button><button class="mm-pause-option">Stage challenges — bonus gold</button><button class="mm-pause-option">Options</button></section><section class="mm-menu-group"><h3>Community</h3><button class="mm-pause-option">Rankings</button><button class="mm-pause-option">Chapter lore</button></section><section class="mm-menu-group mm-progress-group"><h3>Progress</h3><div class="mm-save-actions"><button class="mm-pause-option">Save to cloud</button><button class="mm-pause-option">Load cloud save</button></div><p class="mm-save-status">Level-up boon selected. Save to keep it, or continue to the next autosaved checkpoint.</p></section></div></div></div>${skillChoice}${setup}${saveDialog}</div><script>
        const report = [];
        const gameRoot = document.querySelector('.arpg');
        const saveDialog = document.querySelector('.save-slots-dialog');
        const stageRecap = document.createElement('div');
        stageRecap.className = 'mm-stage-recap';
        stageRecap.innerHTML = '<p class="mm-stage-recap-row"><strong>Bargain</strong><span>Lost pilgrim · accepted</span></p><p class="mm-stage-recap-row"><strong>Challenge</strong><span>Unscarred · stage 2 active</span></p>';
        document.querySelector('[data-test="pause"] .mm-pause-side').appendChild(stageRecap);
        const skillPanel = document.createElement('section');
        skillPanel.className = 'skills-panel mm-panel';
        skillPanel.dataset.layoutCheck = 'skills';
        skillPanel.innerHTML = '<div class="mm-head"><h2>Paths of power</h2><button class="mm-close">×</button></div><div class="mm-subtabs"></div><div class="skill-tree-grid"><section class="skill-tree"><h3>Life flask</h3><button class="tree-respec">Reset</button><div class="skill-tree-map"><div class="tree-node tree-node-root"><button><span class="tree-node-icon"></span><strong>Mineral draught</strong><small>0/3</small></button></div><div class="tree-node tree-node-left"><button><span class="tree-node-icon"></span><strong>Emergency repair</strong><small>0/2</small></button></div><div class="tree-node tree-node-right"><button><span class="tree-node-icon"></span><strong>Iron tonic</strong><small>0/1</small></button></div><div class="tree-node tree-node-capstone"><button><span class="tree-node-icon"></span><strong>Reconstruction</strong><small>0/1</small></button></div></div></section></div><aside class="mm-detail">Selected path detail</aside><div class="mm-help-view mm-hidden">Skills help</div>';
        const skillTabs = skillPanel.querySelector('.mm-subtabs');
        for (const label of ['Loadout', 'Knight', 'Ranger', 'Warden', 'Sorcerer', 'Warlock', 'Druid', 'Paladin', 'Assassin', 'Berserker', 'Monk', 'Archer', 'Reaper']) {
            const tab = document.createElement('button'); tab.className = 'mm-subtab';
            tab.innerHTML = '<span class="mm-subtab-icon">✦</span><span class="mm-subtab-label"></span>';
            tab.querySelector('.mm-subtab-label').textContent = label;
            skillTabs.appendChild(tab);
        }
        gameRoot.appendChild(skillPanel);
        const relicPanel = document.createElement('section');
        relicPanel.className = 'options-panel mm-panel';
        relicPanel.dataset.layoutCheck = 'relics';
        relicPanel.dataset.mobileOptionCount = '5';
        relicPanel.dataset.mobileSection = 'relics';
        relicPanel.innerHTML = '<div class="mm-head"><h2>Options</h2><button class="mm-close">×</button></div><div class="mm-subtabs"></div><div class="run-options"><h3 data-options-section="relics">Relic codex</h3><p data-codex-hint="" data-options-section="relics">2/6 found this run. Other relics stay unknown until recovered.</p><div class="ember-camp-codex" data-relic-codex data-options-section="relics"></div></div>';
        const optionTabs = relicPanel.querySelector('.mm-subtabs');
        for (const label of ['Sound', 'Controls', 'Lore', 'Relics', 'Account']) {
            const tab = document.createElement('button'); tab.className = 'mm-subtab';
            tab.innerHTML = '<span class="mm-subtab-icon">✦</span><span class="mm-subtab-label"></span>';
            tab.querySelector('.mm-subtab-label').textContent = label;
            optionTabs.appendChild(tab);
        }
        const relicCodex = relicPanel.querySelector('[data-relic-codex]');
        for (let i = 0; i < 6; i++) {
            const card = document.createElement('div'); card.className = 'camp-relic' + (i < 2 ? '' : ' is-unknown');
            card.innerHTML = '<b></b><small></small>';
            card.querySelector('b').textContent = i < 2 ? ['Cinder Heart', 'Phantom Quiver'][i] : 'Unknown relic';
            card.querySelector('small').textContent = i < 2 ? 'A run relic effect.' : 'Not found this run.';
            relicCodex.appendChild(card);
        }
        gameRoot.appendChild(relicPanel);
        saveDialog.querySelector('[data-save-slot-list]').innerHTML = Array.from({length:5}, (_, i) => '<button class="save-slot-card"><strong>Slot ' + (i + 1) + ' · Ember Knight</strong><span>Campaign · Dawn ' + (i + 1) + ' · Level 12</span><small>Hard · saved a few minutes ago</small></button>').join('');
        const fill = (selector, text) => document.querySelectorAll(selector).forEach(e => e.textContent = text);
        fill('[data-card-category]', 'CRITICAL CHANCE'); fill('[data-card-name]', 'A shattering dawn');
        fill('[data-card-description]', '+2% crit chance per rank (cap 75%).'); fill('[data-card-rank]', 'Rank 1 / 10');
        fill('[data-skill-name]', 'Arcane bloom'); fill('[data-skill-description]', 'Erupts a blooming ring of arcane light around you, damaging nearby enemies.');
        fill('[data-skill-choice-description]', 'New skill at levels 10 and 20. Locked for this run.');
        fill('[data-setup-description]', 'Locked for this run. Starting replaces your current character.');
        fill('[data-setup-unlock]', 'Pick a starter. More skills at levels 10 and 20.');
        fill('[data-setup-loadout-feedback]', 'Ember nova: Bursts fire around you, striking every nearby enemy.');
        document.querySelector('[data-skill-choice]').hidden = false;
        document.querySelector('[data-setup]').hidden = false;
        document.querySelector('[data-level-draft]').hidden = false;
        document.querySelector('[data-setup-loadout]').hidden = false;
        document.querySelector('[data-class-preview]').hidden = true;
        const death = document.querySelector('[data-test="death"]');
        death.querySelector('[data-overlay-kicker]').textContent = 'YOU HAVE FALLEN';
        death.querySelector('[data-overlay-title]').textContent = 'The ember fades.';
        death.querySelector('[data-overlay-description]').textContent = 'Wave 14 on Nightmare. Load your checkpoint or begin again.';
        death.querySelector('[data-killing-blow]').textContent = 'Killing blow: Ashbound Reaver charge for 84 damage.';
        death.querySelector('[data-damage-history]').innerHTML = Array.from({ length: 12 }, (_, i) => '<li>Ashbound Reaver charge — ' + (20 + i) + ' damage</li>').join('');
        death.querySelector('[data-death-report]').hidden = false;
        death.querySelector('[data-run-summary]').hidden = false;
        death.querySelector('[data-summary-overview]').innerHTML = '<li>14m 22s</li><li>6 stages</li><li>512 kills</li><li>3 flasks used</li><li>9,240 gold spent</li><li>4 challenges</li>';
        death.querySelector('[data-summary-damage]').innerHTML = Array.from({ length: 8 }, (_, i) => '<li>Ember nova: ' + (900 - i * 50) + '</li>').join('');
        death.querySelector('[data-build-synergy]').textContent = 'No active skill synergies this run.';
        death.querySelector('[data-boss-relics]').textContent = 'Warden’s oath +2 armor · Ferryman token +2 resist · Furnace heart +3% damage · Glass memory +2% speed · Unwritten page +3% recovery · Sixth dawn +3% damage, +2 resist.';
        death.querySelector('[data-run-relics]').replaceChildren(...['Cinder Heart', 'Phantom Quiver', 'Leech Fang', 'Bramble Crown', 'Gilded Tooth', 'Echo Vial'].map(label => { const chip = document.createElement('span'); chip.className = 'run-relic-chip'; chip.textContent = label; return chip; }));
        death.querySelector('.run-build-details').open = true;
        death.querySelector('[data-action="restart"]').hidden = false;
        death.querySelector('[data-action="start"]').textContent = 'Travel to The Drowned Wilds';
        death.querySelector('[data-action="endless"]').hidden = false;
        death.querySelector('[data-action="endless"]').textContent = 'New Endless Watch run';
        death.querySelector('[data-stat="checkpoint-save"]').textContent = 'Checkpoint saved at wave 13.';
        death.querySelector('[data-loading]').hidden = true;
        for (const label of ['Save on device', 'Load saved run']) {
            const button = document.createElement('button'); button.className = 'mm-pause-option'; button.textContent = label; death.querySelector('[data-run-menu]').appendChild(button);
        }
        const camp = document.querySelector('[data-test="camp"]');
        camp.querySelector('[data-death-report]').hidden = true;
        camp.querySelector('[data-camp-event]').hidden = false;
        camp.querySelector('[data-camp-event-detail]').textContent = 'The wanderer offers a small blessing in exchange for a few coins.';
        camp.querySelector('[data-camp-challenge]').hidden = false;
        camp.querySelector('[data-camp-challenge-status]').textContent = 'Tap one to accept. You can change it until you travel.';
        camp.querySelector('[data-run-summary]').hidden = false;
        camp.querySelector('.run-build-details').open = true;
        camp.querySelector('[data-build-synergy]').textContent = 'No active skill synergies this run.';
        camp.querySelector('[data-boss-relics]').textContent = 'Warden’s oath +2 armor · Ferryman token +2 resist · Furnace heart +3% damage.';
        camp.querySelector('[data-run-relics]').replaceChildren(...['Cinder Heart', 'Phantom Quiver', 'Leech Fang', 'Bramble Crown', 'Gilded Tooth', 'Echo Vial'].map(label => { const chip = document.createElement('span'); chip.className = 'run-relic-chip'; chip.textContent = label; return chip; }));
        camp.querySelector('[data-summary-overview]').innerHTML = '<li>14m 22s</li><li>6 stages</li><li>512 kills</li><li>3 flasks used</li><li>9,240 gold spent</li><li>4 challenges</li>';
        camp.querySelector('[data-summary-damage]').innerHTML = Array.from({ length: 8 }, (_, i) => '<li>Ember nova: ' + (900 - i * 50) + '</li>').join('');
        camp.querySelector('[data-action="endless"]').hidden = false;
        camp.querySelector('[data-action="restart"]').hidden = true;
        camp.querySelector('[data-loading]').hidden = true;
        const pauseSummary = document.querySelector('[data-test="run-summary"]');
        const pauseMenu = pauseSummary.querySelector('[data-run-menu]');
        pauseSummary.querySelector('[data-run-summary]').hidden = false;
        pauseSummary.querySelector('[data-summary-overview]').innerHTML = '<li>14m 22s</li><li>6 stages</li><li>512 kills</li><li>3 flasks used</li>';
        pauseSummary.querySelector('[data-summary-damage]').innerHTML = '<li>Ember nova: 900</li><li>Cinder relay: 850</li><li>Blazing cross: 700</li><li>Arcane bloom: 650</li>';
        pauseSummary.querySelector('[data-build-synergy]').textContent = 'Cinder relay and arcane bloom feed one another.';
        pauseSummary.querySelector('[data-boss-relics]').textContent = 'No boss relics earned this run yet.';
        const runRelics = pauseSummary.querySelector('[data-run-relics]');
        runRelics.replaceChildren(...['Cinder Heart', 'Phantom Quiver', 'Leech Fang', 'Bramble Crown', 'Gilded Tooth', 'Echo Vial'].map(label => {
            const chip = document.createElement('span'); chip.className = 'run-relic-chip'; chip.textContent = label; return chip;
        }));
        pauseSummary.querySelector('.run-build-details').open = true;
        const saveActions = document.createElement('div'); saveActions.className = 'mm-save-actions';
        for (const label of ['Save to cloud', 'Load cloud save']) { const button = document.createElement('button'); button.textContent = label; saveActions.appendChild(button); }
        pauseMenu.appendChild(saveActions);
        const saveStatus = document.createElement('p'); saveStatus.className = 'mm-save-status'; saveStatus.textContent = 'Last checkpoint saved a moment ago.'; pauseMenu.appendChild(saveStatus);
        const actions = document.querySelector('[data-main-menu-actions]');
        for (const label of ['Save on device', 'Options', 'Rankings']) {
            const button = document.createElement('button'); button.className = 'mm-pause-option'; button.textContent = label; actions.appendChild(button);
        }
        const overlays = { level: '[data-test="level"]', death: '[data-test="death"]', camp: '[data-test="camp"]', summary: '[data-test="run-summary"]', skill: '[data-skill-choice]', setup: '[data-setup]', tutorial: '[data-setup]', main: '.main-menu', pause: '[data-test="pause"]', save: '.save-slots-dialog' };
        window.measure = () => {
            for (const [name, selector] of Object.entries(overlays)) {
                gameRoot.dataset.mainMenu = name === 'main' ? 'on' : 'off';
                gameRoot.dataset.gameStatus = name === 'level' ? 'choosing' : name === 'death' ? 'dead' : name === 'camp' ? 'camp' : 'paused';
                if (name === 'level' && getComputedStyle(gameRoot.querySelector('[data-test="combat-skills"]')).display !== 'none') report.push('level: combat skill buttons overlap the boon selection card');
                const overlay = document.querySelector(selector);
                for (const other of new Set(Object.values(overlays))) document.querySelector(other).style.display = other === selector ? '' : 'none';
                if (name === 'save') saveDialog.showModal();
                else if (saveDialog.open) saveDialog.close();
                if (selector === '[data-setup]') {
                    const touring = name === 'tutorial';
                    overlay.dataset.tutorial = touring ? 'on' : 'off';
                    for (const hidden of ['[data-setup-loadout]', '[data-setup-difficulty]', '[data-class-picker]']) overlay.querySelector(hidden).hidden = touring;
                    overlay.querySelector('[data-setup-skip]').hidden = !touring;
                    if (touring) {
                        overlay.querySelector('[data-setup-title]').textContent = 'Read danger before it strikes';
                        overlay.querySelector('[data-setup-description]').textContent = 'Tap Dodge to roll and the flask to heal (max 5). Step out of marked circles and lanes.';
                        overlay.querySelector('[data-setup-step]').textContent = 'QUICK GUIDE 2 / 3';
                    }
                }
                const card = overlay.querySelector('[data-run-menu], .overlay-card, .level-draft, .main-menu-card, .mm-account-body, .mm-pause-card, .save-slots-card') ?? overlay;
                const noScroll = new Set([overlay, card, ...overlay.querySelectorAll('.mm-pause-card, .mm-pause-groups, .mm-run-recap, .mm-stage-recap, .death-report, .death-report ol, .run-summary, .run-build-details, .run-relic-list, .save-slots-card, .save-slot-list, .save-slot-card, .restart-mode-card')]);
                for (const element of noScroll) {
                    const overflow = getComputedStyle(element).overflowY;
                    if (overflow === 'auto' || overflow === 'scroll') report.push(name + ' has scrollable interactive content: ' + element.className + ' (' + overflow + ')');
                    if ((element === overlay || element === card) && element.scrollHeight > element.clientHeight + 1) report.push(name + ' ' + innerWidth + 'x' + innerHeight + ' ' + (element.className || element.tagName) + ' overflow ' + (element.scrollHeight - element.clientHeight) + 'px [' + [...card.children].map(c => c.tagName + ':' + Math.round(c.getBoundingClientRect().height)).join(',') + ']');
                }
                const bottom = Math.min(innerHeight, overlay.getBoundingClientRect().bottom);
                for (const button of overlay.querySelectorAll('button')) {
                    if (!button.getBoundingClientRect().height || button.children.length) continue;
                    const range = document.createRange(); range.selectNodeContents(button);
                    const text = range.getBoundingClientRect(), box = button.getBoundingClientRect();
                    if (text.width && (text.left < box.left - 1 || text.right > box.right + 1 || text.bottom > box.bottom + 1)) report.push(name + ' button label cut off: ' + button.textContent.trim().slice(0, 30));
                }
                if (name === 'death') {
                    const visible = [...overlay.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height);
                    const primary = visible.filter(b => b.classList.contains('ember-button'));
                    const secondary = visible.filter(b => !b.classList.contains('ember-button'));
                    const lowestPrimary = Math.max(...primary.map(b => b.getBoundingClientRect().bottom));
                    if (secondary.some(b => b.getBoundingClientRect().top < lowestPrimary - 1)) report.push('death: secondary buttons share a row with the main actions');
                    const widths = new Set(secondary.map(b => Math.round(b.getBoundingClientRect().width)));
                    if (widths.size > 1) report.push('death: secondary buttons have uneven widths ' + secondary.map(b => b.textContent.trim().slice(0, 12) + '=' + Math.round(b.getBoundingClientRect().width)).join('/'));
                }
                for (const button of overlay.querySelectorAll('button')) {
                    const rect = button.getBoundingClientRect();
                    if (rect.height && rect.bottom > bottom + 1) report.push(name + ' button off-screen: ' + button.textContent.trim().slice(0, 30));
                }
                if (name === 'summary') {
                    const details = overlay.querySelector('.run-build-details'), list = overlay.querySelector('.run-relic-list'), detailsBounds = details.getBoundingClientRect();
                    if (innerHeight <= 480) {
                        if (details.scrollHeight > details.clientHeight + 1) report.push('expanded run relic details do not fit');
                        if (list.children.length !== 6) report.push('pause summary omitted found run relics');
                        for (const relic of list.children) {
                            const box = relic.getBoundingClientRect();
                            if (!box.height || box.left < detailsBounds.left - 1 || box.right > detailsBounds.right + 1 || box.bottom > detailsBounds.bottom + 1) report.push('found relic hidden in pause summary');
                        }
                    }
                }
                if (name === 'pause') {
                    const recap = overlay.querySelector('.mm-stage-recap');
                    if (!recap || recap.querySelectorAll('.mm-stage-recap-row').length !== 2) report.push('pause menu is missing the bargain/challenge recap');
                    for (const row of recap.querySelectorAll('.mm-stage-recap-row')) {
                        const box = row.getBoundingClientRect();
                        if (!box.height || box.left < overlay.getBoundingClientRect().left || box.right > overlay.getBoundingClientRect().right || box.bottom > overlay.getBoundingClientRect().bottom) report.push('pause bargain/challenge recap is not visible');
                    }
                }
                if (name === 'camp') {
                    const choices = [...overlay.querySelectorAll('[data-action="start"], [data-action="endless"], [data-action="restart"]')].filter(button => !button.hidden);
                    if (choices.length !== 2) report.push('intermission shows duplicate restart actions (' + choices.length + ' actions)');
                    if (innerHeight <= 480) {
                        const challenge = overlay.querySelector('[data-camp-challenge]'), grid = challenge.querySelector('.camp-challenge-grid');
                        const event = overlay.querySelector('[data-camp-event]');
                        const buttons = [...grid.querySelectorAll('button')];
                        const columns = new Set(buttons.map(button => Math.round(button.getBoundingClientRect().left)));
                        const rows = new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top)));
                        if (buttons.length !== 7 || columns.size !== 4 || rows.size !== 2) report.push('intermission challenge choices are clipped or not arranged as a readable 4 by 2 grid');
                        const bounds = challenge.getBoundingClientRect();
                        const menuBounds = overlay.querySelector('[data-run-menu]').getBoundingClientRect(), eventBounds = event.getBoundingClientRect();
                        if (bounds.left < menuBounds.left - 1 || bounds.right > menuBounds.right + 1 || eventBounds.left < menuBounds.left - 1 || eventBounds.right > menuBounds.right + 1 || bounds.top < eventBounds.bottom - 1) report.push('intermission encounter and challenge panels do not use a full-width stacked layout');
                        for (const button of buttons) {
                            const box = button.getBoundingClientRect();
                            if (!box.height || box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) report.push('intermission challenge choice is hidden');
                            const range = document.createRange(); range.selectNodeContents(button);
                            const text = range.getBoundingClientRect();
                            if (text.width && (text.left < box.left - 1 || text.right > box.right + 1 || text.top < box.top - 1 || text.bottom > box.bottom + 1)) report.push('intermission challenge label clipped: ' + button.textContent.trim());
                        }
                        if (choices.length === 2) {
                            const first = choices[0].getBoundingClientRect(), second = choices[1].getBoundingClientRect();
                            if (first.left < menuBounds.left - 1 || second.right > menuBounds.right + 1 || first.right >= second.left || Math.abs(first.width - second.width) > 2) report.push('intermission actions do not use the full two-column row');
                        }
                    }
                    const buildDetails = overlay.querySelector('.run-build-details');
                    if (innerHeight <= 480 && buildDetails.open && buildDetails.scrollHeight > buildDetails.clientHeight + 1) report.push('expanded intermission run/relic details are clipped ' + buildDetails.scrollHeight + '/' + buildDetails.clientHeight + ' (' + [...buildDetails.children].map(child => child.tagName + ':' + Math.round(child.getBoundingClientRect().height)).join(',') + ')');
                    if (innerHeight <= 480 && buildDetails.open) {
                        const bounds = buildDetails.getBoundingClientRect();
                        for (const paragraph of buildDetails.querySelectorAll('p')) {
                            const box = paragraph.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(paragraph);
                            const text = range.getBoundingClientRect();
                            if (paragraph.scrollHeight > paragraph.clientHeight + 1 || text.width && (text.left < box.left - 1 || text.right > box.right + 1 || text.bottom > box.bottom + 1 || box.bottom > bounds.bottom + 1)) report.push('intermission run/relic text is clipped');
                        }
                    }
                }
                if (name === 'death') {
                    const buildDetails = overlay.querySelector('.run-build-details');
                    if (innerHeight <= 480 && buildDetails.open && buildDetails.scrollHeight > buildDetails.clientHeight + 1) report.push('expanded death-screen run/relic details are clipped');
                    if (innerHeight <= 480 && buildDetails.open) {
                        const list = buildDetails.querySelector('.run-relic-list'), bounds = buildDetails.getBoundingClientRect();
                        for (const paragraph of buildDetails.querySelectorAll('p')) {
                            const box = paragraph.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(paragraph);
                            const text = range.getBoundingClientRect();
                            if (paragraph.scrollHeight > paragraph.clientHeight + 1 || text.width && (text.left < box.left - 1 || text.right > box.right + 1 || text.bottom > box.bottom + 1 || box.bottom > bounds.bottom + 1)) report.push('death-screen run/relic text is clipped');
                        }
                        for (const relic of list.children) {
                            const box = relic.getBoundingClientRect();
                            if (!box.height || box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.bottom > bounds.bottom + 1) report.push('death-screen run relic is clipped');
                        }
                    }
                }
                if (name === 'death') {
                    const restartDialog = overlay.querySelector('.restart-mode-overlay');
                    const restartCard = restartDialog.querySelector('.restart-mode-card');
                    restartDialog.hidden = false;
                    restartDialog.setAttribute('open', '');
                    const restartBounds = restartCard.getBoundingClientRect();
                    if (getComputedStyle(restartCard).overflowY === 'auto' || getComputedStyle(restartCard).overflowY === 'scroll') report.push('restart chooser must not scroll');
                    if (restartCard.scrollHeight > restartCard.clientHeight + 1) report.push('restart chooser does not fit without scrolling');
                    if (restartBounds.top < -1 || restartBounds.bottom > innerHeight + 1 || restartBounds.left < -1 || restartBounds.right > innerWidth + 1) report.push('restart chooser outside viewport');
                    restartDialog.hidden = true;
                    restartDialog.removeAttribute('open');
                }
                if (name === 'tutorial') {
                    const text = overlay.querySelector('[data-setup-description]');
                    if (!text.getBoundingClientRect().height) report.push('tutorial text hidden at ' + innerWidth + 'x' + innerHeight);
                    if (!overlay.querySelector('[data-setup-skip]').getBoundingClientRect().height) report.push('tutorial skip hidden');
                }
            }
            skillPanel.classList.add('mm-open');
            const skillBounds = skillPanel.getBoundingClientRect(), skillTabsBounds = skillTabs.getBoundingClientRect();
            if (innerHeight <= 480) {
                if (skillPanel.scrollHeight > skillPanel.clientHeight + 1) report.push('skills panel overflows its landscape viewport');
                if (skillTabs.scrollWidth > skillTabs.clientWidth + 1 || skillTabs.scrollHeight > skillTabs.clientHeight + 1) report.push('skill tabs overflow their fitted two-row area');
                if (skillBounds.top < -1 || skillBounds.bottom > innerHeight + 1 || skillBounds.left < -1 || skillBounds.right > innerWidth + 1) report.push('skills panel outside viewport');
                const tabRows = new Set([...skillTabs.children].map(tab => Math.round(tab.getBoundingClientRect().top)));
                if (skillTabs.children.length !== 13 || tabRows.size !== 2) report.push('skill categories are clipped or not arranged into two landscape rows');
                for (const tab of skillTabs.children) {
                    const box = tab.getBoundingClientRect(), label = tab.querySelector('.mm-subtab-label').getBoundingClientRect();
                    if (!box.height || box.left < skillTabsBounds.left - 1 || box.right > skillTabsBounds.right + 1 || box.bottom > skillTabsBounds.bottom + 1) report.push('skill tab outside its tab area');
                    if (label.width && (label.left < box.left - 1 || label.right > box.right + 1 || label.bottom > box.bottom + 1)) report.push('skill tab label clipped: ' + tab.textContent.trim());
                }
                const treeMap = skillPanel.querySelector('.skill-tree-map'), mapBounds = treeMap.getBoundingClientRect();
                for (const node of treeMap.querySelectorAll('.tree-node')) {
                    const box = node.getBoundingClientRect(), button = node.querySelector('button'), buttonBounds = button.getBoundingClientRect();
                    if (!buttonBounds.height || box.left < mapBounds.left - 1 || box.right > mapBounds.right + 1 || box.top < mapBounds.top - 1 || box.bottom > mapBounds.bottom + 1) report.push('skill tree node is clipped by its map: ' + node.className);
                    const name = button.querySelector('strong').getBoundingClientRect();
                    if (name.width && (name.left < buttonBounds.left - 1 || name.right > buttonBounds.right + 1 || name.bottom > buttonBounds.bottom + 1)) report.push('skill tree node name is clipped: ' + button.textContent.trim());
                }
                skillPanel.classList.add('mm-help-shown');
                if (getComputedStyle(skillPanel.querySelector('.tree-respec')).display !== 'none') report.push('skill reset button bleeds through the Help view');
                skillPanel.classList.remove('mm-help-shown');
                skillTabs.querySelectorAll('.mm-subtab').forEach((tab, index) => { tab.hidden = index >= 5; });
                for (const tab of skillTabs.querySelectorAll('.mm-subtab:not([hidden])')) {
                    const box = tab.getBoundingClientRect(), label = tab.querySelector('.mm-subtab-label').getBoundingClientRect();
                    if (box.height < 29 || label.width && (label.top < box.top - 1 || label.bottom > box.bottom + 1)) report.push('short skill tab row clips a tab label');
                }
                skillTabs.querySelectorAll('.mm-subtab').forEach(tab => { tab.hidden = false; });
            }
            skillPanel.classList.remove('mm-open');
            relicPanel.classList.add('mm-open');
            const relicBounds = relicPanel.getBoundingClientRect(), codexBounds = relicCodex.getBoundingClientRect();
            if (innerHeight <= 480) {
                if (relicPanel.scrollHeight > relicPanel.clientHeight + 1) report.push('relic options panel overflows its landscape viewport');
                if (relicCodex.scrollWidth > relicCodex.clientWidth + 1 || relicCodex.scrollHeight > relicCodex.clientHeight + 1) report.push('relic codex scrolls instead of fitting');
                if (relicBounds.left < -1 || relicBounds.right > innerWidth + 1 || relicBounds.top < -1 || relicBounds.bottom > innerHeight + 1) report.push('relic options panel outside viewport');
                const optionTabsBounds = optionTabs.getBoundingClientRect();
                if (optionTabs.scrollWidth > optionTabs.clientWidth + 1 || optionTabs.children.length !== 5) report.push('options tabs overflow their landscape row');
                for (const tab of optionTabs.children) {
                    const box = tab.getBoundingClientRect(), label = tab.querySelector('.mm-subtab-label').getBoundingClientRect();
                    if (box.left < optionTabsBounds.left - 1 || box.right > optionTabsBounds.right + 1 || box.bottom > optionTabsBounds.bottom + 1) report.push('options tab outside its tab area');
                    if (label.width && (label.left < box.left - 1 || label.right > box.right + 1 || label.bottom > box.bottom + 1)) report.push('options tab label clipped: ' + tab.textContent.trim());
                }
                const relicRows = new Set([...relicCodex.children].map(card => Math.round(card.getBoundingClientRect().top)));
                if (relicCodex.children.length !== 6 || relicRows.size !== 2) report.push('all six relic cards must fit in a three by two grid');
                for (const card of relicCodex.children) {
                    const box = card.getBoundingClientRect();
                    if (!box.height || box.left < codexBounds.left - 1 || box.right > codexBounds.right + 1 || box.bottom > codexBounds.bottom + 1) report.push('relic card outside its visible grid');
                }
            }
            relicPanel.classList.remove('mm-open');
            document.body.dataset.result = report.length ? report.join(' | ') : 'PASS';
        };
        try { measure(); } catch (e) { document.body.dataset.result = 'ERR ' + e.message; }
        </script></body></html>`;
    const server = http.createServer((request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(html); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const failures = [];
    try {
        for (const [width, height] of [[640, 360], [740, 360], [844, 390], [915, 412], [1280, 720], [1366, 768], [1920, 1080]]) {
            // Headless Edge reserves 24px x 92px of window chrome; compensate so the page itself is phone-sized.
            const output = await dumpBrowserDom(edge, ['--virtual-time-budget=3000', `--window-size=${width + 24},${height + 92}`, `http://127.0.0.1:${server.address().port}/`]);
            const result = output.match(/data-result="([^"]*)"/)?.[1];
            if (result !== 'PASS') failures.push(`${width}x${height}: ${result}`);
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
    assert.deepEqual(failures, [], failures.join('\n'));
    console.log('PASS: menus and overlays fit landscape screens; short-landscape relics and skill tabs are visible without scrolling');
}
