// Mobile menu shell — MAUI head only.
//
// WHAT THIS REPLACES
// The desktop build exposes Skills and Forge as long page sections below the arena, reached by
// scrolling. mobile-shell.js previously turned them into sliding sheets, but they were still
// desktop forms: a wall of prose, six 300px skill trees stacked vertically, and controls you had
// to hunt for. This builds a proper game menu over the canvas instead: a bottom tab bar, one
// screen-sized panel at a time, and sub-tabs so a single skill tree fills the screen.
//
// THE CENTRAL DESIGN RULE: NEVER RE-PARENT ANYTHING BLAZOR RENDERED
// arpg.js binds its handlers to specific element instances at startup and writes into those same
// instances every HUD update, so the live nodes must be reused rather than cloned.
//
// But they must also stay exactly where Blazor put them. Two separate mechanisms punish moving
// them, and both were hit during development:
//   1. Blazor's renderer keeps its own model of the DOM it owns. Re-parenting a node it rendered
//      makes the next diff operate somewhere unexpected and throws.
//   2. arpg.js runs `new MutationObserver(() => { if (!root.isConnected) dispose(); })` against
//      document.body with subtree:true. Any structural edit inside the game root fires it, and
//      moving nodes around during teardown/startup can trip the disposal path.
// Either way the symptom is the same: the "connection was interrupted" banner and a reset run.
//
// So this file moves NOTHING. The Skills and Forge sections stay where Blazor rendered them, and
// the menu "panels" are produced purely with CSS — position:fixed lifts each section over the
// canvas when its tab is active (see mobile-menu.css). The script only toggles classes and
// injects its own brand-new nodes (tab bar, close buttons), which Blazor neither owns nor diffs.
(function () {
    "use strict";

    if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) return;

    var layer = null;
    var panels = {};
    var openName = null;
    var resumeAfterMenu = false;

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function treeArt(tree) {
        if (tree.dataset.skillIcon) return tree.dataset.skillIcon;
        var skill = tree.dataset.treeSkill;
        return ["dodge", "potion"].includes(skill) ? "/_content/PathOfBoredom.Game/images/skills/" + skill + ".svg"
            : "/_content/PathOfBoredom.Game/images/skills/" + (tree.dataset.heroClass || "knight") + "/" + skill + ".svg";
    }

    // ---- Panel construction ------------------------------------------------------------
    //
    // A "panel" is the existing Blazor section, tagged with .mm-panel so CSS can lift it over the
    // canvas. The header (title/close) is appended INSIDE it as new nodes, which is safe: Blazor
    // only diffs nodes it rendered, and appending at the end never reorders them.
    function makePanel(name, title, section) {
        section.classList.add("mm-panel");
        section.dataset.mmPanel = name;

        var head = el("div", "mm-head");
        var heading = el("h2", null, title);
        var meta = el("span", "mm-meta");
        meta.dataset.mmMeta = name;
        var close = el("button", "mm-close", "\u2715");
        close.type = "button";
        var information = name !== "pause";
        close.textContent = information ? "\u2190" : "\u2715";
        close.setAttribute("aria-label", information ? "Back to pause menu" : "Close");
        close.addEventListener("click", function () {
            if (name === "account" && ["ready", "dead", "won"].includes(document.querySelector(".arpg").dataset.gameStatus)) closePanel(false);
            else if (information) openPanel("pause");
            else closePanel();
        });

        head.appendChild(heading);
        head.appendChild(meta);
        head.appendChild(close);
        // Prepending would reorder Blazor's children, so the header is appended and CSS uses
        // `order: -1` to float it to the top.
        section.appendChild(head);

        panels[name] = { root: section, body: section, meta: meta };
        return panels[name];
    }

    // Wraps the long explanatory paragraphs in a collapsed <details> IN PLACE. The paragraphs are
    // not re-parented into a new element (see the header note); instead they are marked with a
    // class and CSS collapses them behind a toggle, so Blazor's tree is untouched.
    function markHelp(section, selectors) {
        selectors.forEach(function (selector) {
            Array.prototype.forEach.call(section.querySelectorAll(selector), function (node) {
                node.classList.add("mm-help-text");
            });
        });
    }

    // Adds a "Help" toggle that shows/hides everything marked above. Appending our OWN button is
    // safe — Blazor only diffs the nodes it rendered, and additions it never saw are left alone
    // as long as we do not reorder its children. We append at the end for that reason.
    function addHelpToggle(host, label) {
        if (!host.querySelector(".mm-help-toggle")) {
            var toggle = el("button", "mm-help-toggle", "?");
            var help = el("div", "mm-help-view mm-hidden");
            toggle.type = "button";
            toggle.title = label;
            toggle.setAttribute("aria-label", label);
            toggle.setAttribute("aria-pressed", "false");
            toggle.addEventListener("click", function () {
                var shown = host.classList.toggle("mm-help-shown");
                toggle.setAttribute("aria-pressed", String(shown));
                toggle.textContent = shown ? "\u00d7" : "?";
                toggle.setAttribute("aria-label", shown ? "Back to controls" : label);
                help.classList.toggle("mm-hidden", !shown);
                help.replaceChildren();
                if (shown) {
                    Array.prototype.forEach.call(host.querySelectorAll(".mm-help-text"), function (text) {
                        var tree = text.closest("[data-tree-skill]");
                        if (tree && tree.hidden) return;
                        help.appendChild(el("p", null, text.textContent));
                    });
                }
            });
            host.appendChild(help);
            var head = host.querySelector(".mm-head");
            head.insertBefore(toggle, head.querySelector(".mm-close"));
        }
    }

    function buildSkills(source) {
        var panel = makePanel("skills", "Paths of power", source);

        markHelp(source, [":scope > p:not([data-skill-feedback]):not(.skill-unlock-status)", ".skill-tree > p"]);
        addHelpToggle(panel.body, "How skills work");

        // Sub-tabs: Loadout first, then one tab per skill tree — the fix for the "scroooollll"
        // problem, since six trees were stacked. Appended (never inserted before Blazor's
        // children) and ordered into place with CSS.
        var subtabs = el("div", "mm-subtabs");
        source.appendChild(subtabs);

        var tabs = [];
        var loadout = source.querySelector(".loadout-grid");
        var trees = Array.prototype.slice.call(source.querySelectorAll("[data-tree-skill]"));
        var treeGrid = source.querySelector(".skill-tree-grid");
        var detail = el("aside", "mm-detail mm-hidden");
        detail.setAttribute("aria-live", "polite");
        source.appendChild(detail);
        var loadoutNote = el("div", "mm-loadout-note");
        loadoutNote.setAttribute("role", "status");
        source.appendChild(loadoutNote);

        function describe(node) {
            if (!node) return;
            detail.replaceChildren();
            detail.appendChild(el("h3", null, node.querySelector("[data-tree-name]").textContent));
            detail.appendChild(el("p", null, node.querySelector("[data-tree-detail]").textContent));
            detail.appendChild(el("strong", null, node.querySelector("[data-tree-status]").textContent));
            detail.appendChild(el("p", null, "Tap a node to inspect. Tap it again to learn when available."));
        }

        source.addEventListener("click", function (event) {
            var node = event.target.closest(".tree-node");
            if (node) requestAnimationFrame(function () { describe(node); });
        });

        function select(index) {
            if (index > 0 && trees[index - 1].hidden) index = 0;
            source.classList.remove("mm-help-shown");
            source.querySelector(".mm-help-view").classList.add("mm-hidden");
            var helpToggle = source.querySelector(".mm-help-toggle");
            helpToggle.setAttribute("aria-pressed", "false");
            helpToggle.textContent = "?";
            source.dataset.mobileSection = index === 0 ? "loadout" : "tree";
            detail.classList.toggle("mm-hidden", index === 0);
            loadoutNote.classList.toggle("mm-hidden", index !== 0);
            tabs.forEach(function (tab, i) { tab.setAttribute("aria-selected", String(i === index)); });
            if (loadout) loadout.classList.toggle("mm-hidden", index !== 0);
            if (treeGrid) treeGrid.classList.toggle("mm-hidden", index === 0);
            trees.forEach(function (tree, i) { tree.classList.toggle("mm-hidden", index !== i + 1); });
            if (index > 0) describe(trees[index - 1].querySelector(".tree-node"));
            source.scrollTop = 0;
        }

        function addTab(label, index) {
            var tab = el("button", "mm-subtab");
            tab.appendChild(el("span", "mm-subtab-label", label));
            if (index > 0) {
                var image = el("img", "mm-skill-art");
                image.src = treeArt(trees[index - 1]);
                image.alt = "";
                tab.prepend(image);
            }
            tab.type = "button";
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", String(index === 0));
            tab.addEventListener("click", function () { select(index); });
            subtabs.appendChild(tab);
            tabs.push(tab);
        }

        addTab("Loadout", 0);
        trees.forEach(function (tree, i) {
            var name = tree.dataset.treeSkill || "Tree";
            addTab(name.charAt(0).toUpperCase() + name.slice(1), i + 1);
        });
        subtabs.setAttribute("role", "tablist");
        subtabs.setAttribute("aria-label", "Skill categories");
        select(0);
        panel.syncTabs = function () {
            trees.forEach(function (tree, index) {
                var tab = tabs[index + 1];
                var heading = tree.querySelector("[data-skill-name]");
                var name = heading ? heading.textContent : tree.dataset.treeSkill;
                var label = tab.querySelector(".mm-subtab-label");
                if (label.textContent !== name) label.textContent = name;
                var image = tab.querySelector(".mm-skill-art"), art = treeArt(tree);
                if (image && image.getAttribute("src") !== art) image.src = art;
                tree.style.setProperty("--skill-art", "url('" + art + "')");
                tab.setAttribute("aria-label", name + " skill tree");
                tab.hidden = tree.hidden;
                tab.classList.toggle("mm-hidden", tree.hidden);
                if (tree.hidden && tab.getAttribute("aria-selected") === "true") select(0);
            });
        };
        panel.syncTabs();

        return panel;
    }

    function buildForge(source) {
        var panel = makePanel("forge", "The traveling forge", source);
        markHelp(source, [".forge-hint", ".mastery-panel > p"]);
        addHelpToggle(panel.body, "How the forge works");
        var tabs = el("div", "mm-subtabs");
        ["Upgrades", "Mastery", "Run options"].forEach(function (name, index) {
            var button = el("button", "mm-subtab", name);
            button.type = "button";
            button.setAttribute("aria-selected", String(index === 0));
            button.addEventListener("click", function () {
                source.dataset.mobileSection = ["upgrades", "training", "systems"][index];
                Array.prototype.forEach.call(tabs.children, function (tab) {
                    tab.setAttribute("aria-selected", String(tab === button));
                });
            });
            tabs.appendChild(button);
        });
        source.dataset.mobileSection = "upgrades";
        source.appendChild(tabs);
        return panel;
    }

    // ---- Open / close ------------------------------------------------------------------

    function closePanel(resume = true) {
        if (!openName) return;
        var root = document.querySelector(".arpg");
        if (root.dataset.saveBusy === "on") return;
        panels[openName].root.classList.remove("mm-open");
        if (["rankings", "account"].includes(openName)) panels[openName].root.hidden = true;
        var tab = layer.querySelector('[data-mm-tab="' + openName + '"]');
        if (tab) tab.setAttribute("aria-expanded", "false");
        openName = null;
        document.body.classList.remove("mm-panel-open");
        root.dispatchEvent(new CustomEvent("mobile-menu", { detail: { open: false, resume: resume && resumeAfterMenu } }));
        resumeAfterMenu = false;
        // Returning to combat: the engine's own "resume" control is the authority on unpausing,
        // so we only restore focus and let the player decide.
        var canvas = document.querySelector(".arena-viewport canvas");
        if (canvas) canvas.focus({ preventScroll: true });
    }

    function openPanel(name) {
        if (!panels[name]) return;
        var root = document.querySelector(".arpg");
        if (root.dataset.saveBusy === "on") return;
        if (openName === name) { closePanel(); return; }
        var idleAccount = name === "account" && ["ready", "dead", "won"].includes(root.dataset.gameStatus);
        if (!idleAccount && !["playing", "paused", "camp"].includes(root.dataset.gameStatus)) return;
        var shouldResume = openName ? resumeAfterMenu : root.dataset.gameStatus === "playing";
        if (openName) {
            panels[openName].root.classList.remove("mm-open");
            if (["rankings", "account"].includes(openName)) panels[openName].root.hidden = true;
            var previousTab = layer.querySelector('[data-mm-tab="' + openName + '"]');
            if (previousTab) previousTab.setAttribute("aria-expanded", "false");
        }
        root.dispatchEvent(new CustomEvent("mobile-menu", { detail: { open: true, panel: name, information: name === "account" } }));
        if (root.dataset.menuOpen !== "on") return;
        resumeAfterMenu = shouldResume;

        openName = name;
        panels[name].root.hidden = false;
        syncBadges();
        if (panels[name].syncTabs) panels[name].syncTabs();
        panels[name].root.classList.add("mm-open");
        var tab = layer.querySelector('[data-mm-tab="' + name + '"]');
        if (tab) tab.setAttribute("aria-expanded", "true");
        document.body.classList.add("mm-panel-open");
        if (name === "rankings") {
            var refresh = panels.rankings.root.querySelector("[data-rankings-refresh]");
            if (refresh && !refresh.disabled) refresh.click();
        }
    }

    // ---- Tab bar -----------------------------------------------------------------------

    var TABS = [
        { name: "skills", glyph: "\u2726", label: "Skills" },
        { name: "forge", glyph: "\u2692", label: "Forge" }
    ];

    function buildBar() {
        var bar = el("div", "mm-bar");

        TABS.forEach(function (entry) {
            var tab = el("button", "mm-tab");
            tab.type = "button";
            tab.dataset.mmTab = entry.name;
            tab.setAttribute("aria-expanded", "false");
            tab.appendChild(el("span", "mm-glyph", entry.glyph));
            tab.appendChild(el("span", null, entry.label));
            var badge = el("span", "mm-badge");
            badge.dataset.mmBadge = entry.name;
            badge.hidden = true;
            tab.appendChild(badge);
            tab.addEventListener("click", function () { openPanel(entry.name); });
            bar.appendChild(tab);
        });

        // Pause/Resume stays on the bar so the player always has a way back without hunting.
        var pause = el("button", "mm-tab mm-pause-tab");
        pause.type = "button";
        pause.dataset.mmTab = "pause";
        pause.setAttribute("aria-label", "Pause game");
        pause.appendChild(el("span", "mm-pause-glyph"));
        pause.appendChild(el("span", null, "Pause"));
        pause.addEventListener("click", function () {
            openPanel("pause");
        });
        bar.appendChild(pause);

        layer.appendChild(bar);
    }

    function buildPause(root) {
        var section = el("section", "mm-pause-screen");
        section.setAttribute("role", "dialog");
        section.setAttribute("aria-modal", "true");
        section.setAttribute("aria-label", "Game paused");
        root.appendChild(section);
        makePanel("pause", "A moment of respite", section);
        var card = el("div", "mm-pause-card");
        card.appendChild(el("div", "mm-pause-emblem"));
        card.appendChild(el("h2", null, "The hollow can wait."));
        card.appendChild(el("p", null, "Combat and game timers are paused."));
        var resume = el("button", "mm-resume", "Return to battle");
        resume.type = "button";
        resume.addEventListener("click", function () {
            resumeAfterMenu = true;
            closePanel(true);
        });
        card.appendChild(resume);
        var labels = { skills: "Skills & loadout", forge: "Forge & training", rankings: "Rankings", notes: "Patch notes - Coming soon" };
        [{ title: "Character", names: ["skills", "forge"] }, { title: "Community", names: ["rankings", "notes"] }].forEach(function (group) {
            var section = el("section", "mm-menu-group");
            section.appendChild(el("h3", null, group.title));
            group.names.forEach(function (name) {
                var button = el("button", "mm-pause-option", labels[name]);
                button.type = "button";
                if (name === "notes") button.disabled = true;
                else button.addEventListener("click", function () { openPanel(name); });
                section.appendChild(button);
            });
            card.appendChild(section);
        });
        addSaveActions(card, root);
        ["training", "exit-training"].forEach(function (action) {
            var button = el("button", "mm-pause-option", action === "training" ? "Training arena (keeps your run)" : "Exit training & return to run");
            button.type = "button";
            button.dataset.practiceProxy = action;
            button.addEventListener("click", function () {
                var original = root.querySelector("[data-" + action + "]");
                if (!original || original.disabled || original.hidden) return;
                closePanel(false);
                original.click();
            });
            card.appendChild(button);
        });
        var summary = el("p", "mm-save-status");
        summary.dataset.mobileRunSummary = "";
        card.appendChild(summary);
        section.appendChild(card);
    }

    function addSaveActions(host, root) {
        var actions = el("div", "mm-save-actions");
        ["save", "load"].forEach(function (action) {
            var button = el("button", "mm-pause-option", action === "save" ? "Save on device" : "Load saved run");
            button.type = "button";
            button.dataset.mobileSaveAction = action;
            button.disabled = true;
            button.addEventListener("click", function () {
                var original = root.querySelector('[data-action="' + action + '"]');
                if (original && !original.disabled) original.click();
            });
            actions.appendChild(button);
        });
        var signIn = el("button", "mm-pause-option", "Account & cloud");
        signIn.type = "button";
        signIn.addEventListener("click", function () { openPanel("account"); });
        actions.appendChild(signIn);
        host.appendChild(actions);
        var status = el("p", "mm-save-status");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        host.appendChild(status);
    }

    function buildAccount(root) {
        var section = root.querySelector("[data-game-account]");
        if (!section) return;
        makePanel("account", "Account & cloud saves", section);
    }

    function buildInformation(root) {
        var rankings = root.querySelector("[data-game-rankings]");
        makePanel("rankings", "Hall of Embers", rankings);
        rankings.classList.add("mm-info-panel");
    }

    // ---- Live badges -------------------------------------------------------------------

    // The engine already maintains these readouts; we mirror them onto the tabs so the player can
    // see there is something to spend without opening anything. Polled rather than hooked,
    // because the engine does not expose an update event and we are not modifying it.
    function syncBadges() {
        var root = document.querySelector(".arpg");
        if (!root || !root.isConnected) return;
        Array.prototype.forEach.call(root.querySelectorAll("[data-mobile-save-action]"), function (button) {
            var original = root.querySelector('[data-action="' + button.dataset.mobileSaveAction + '"]');
            button.disabled = !original || original.disabled;
            button.textContent = button.dataset.mobileSaveAction === "save"
                ? root.dataset.cloudSignedIn === "on" ? "Save to cloud" : "Save on device"
                : root.dataset.cloudSignedIn === "on" ? "Load cloud save" : "Load device save";
        });
        var saveStatus = root.querySelector("[data-save-status]");
        Array.prototype.forEach.call(root.querySelectorAll(".mm-save-status"), function (status) {
            if (status.hasAttribute("data-mobile-run-summary")) return;
            var text = saveStatus?.textContent || "Offline play · saves stay on this device.";
            if (status.textContent !== text) status.textContent = text;
        });
        Array.prototype.forEach.call(root.querySelectorAll("[data-practice-proxy]"), function (button) {
            var original = root.querySelector("[data-" + button.dataset.practiceProxy + "]");
            button.hidden = !original || original.hidden;
            button.disabled = !original || original.disabled || root.dataset.saveBusy === "on";
        });
        var summary = root.querySelector("[data-summary-text]");
        Array.prototype.forEach.call(root.querySelectorAll("[data-mobile-run-summary]"), function (status) {
            var text = summary?.textContent || "";
            if (status.textContent !== text) status.textContent = text;
            status.hidden = !text;
        });
        var resume = root.querySelector(".mm-resume");
        if (resume) resume.disabled = root.dataset.saveBusy === "on";
        Array.prototype.forEach.call(layer.querySelectorAll(".mm-tab"), function (tab) {
            tab.disabled = root.dataset.saveBusy === "on" || !["playing", "paused", "camp"].includes(root.dataset.gameStatus);
        });
        var points = document.querySelector("[data-stat='skill-points']");
        panels.skills.syncTabs();
        var loadoutNote = panels.skills.root.querySelector(".mm-loadout-note");
        var feedback = panels.skills.root.querySelector("[data-skill-feedback]");
        var unlock = panels.skills.root.querySelector(".skill-unlock-status");
        if (loadoutNote && feedback) loadoutNote.textContent = feedback.textContent + (unlock ? " " + unlock.textContent : "");
        var badge = layer.querySelector("[data-mm-badge='skills']");
        if (points && badge) {
            var count = (points.textContent.match(/\d+/) || ["0"])[0];
            badge.hidden = count === "0";
            badge.textContent = count;
        }
        var forgeBadge = layer.querySelector("[data-mm-badge='forge']");
        forgeBadge.hidden = root.dataset.forgeAvailable !== "on";
        forgeBadge.textContent = "!";

        var gold = document.querySelector("[data-stat='forge-gold']");
        var training = panels.forge.root.querySelector("[data-mastery]");
        var trainingTab = panels.forge.root.querySelector(".mm-subtabs").children[1];
        trainingTab.hidden = !training || training.hidden;
        if (trainingTab.hidden && panels.forge.root.dataset.mobileSection === "training") {
            panels.forge.root.querySelector(".mm-subtabs").children[0].click();
        }
        var meta = panels.forge.meta;
        if (gold && meta) meta.textContent = gold.textContent;

        var skillMeta = panels.skills.meta;
        if (points && skillMeta) skillMeta.textContent = points.textContent;
    }

    // ---- Init --------------------------------------------------------------------------

    function init() {
        var skills = document.querySelector("[data-skills]");
        var forge = document.querySelector("[data-forge]");
        var root = document.querySelector(".arpg");
        if (!skills || !forge || !root || layer) return !!layer;
        if (!root.querySelector("[data-game-rankings]") || !root.querySelector("[data-game-account]")) return false;

        // Tells arpg.js to auto-fire the regular attack along the character's facing (no mouse to
        // aim with on a phone) and to draw the HUD into the canvas instead of as DOM over it.
        // Both are read by arpg.js; desktop leaves them unset and is unaffected.
        root.dataset.autoAttack = "on";
        root.dataset.canvasHud = "on";
        root.dataset.localSaves = "on";

        layer = el("div", "mm-layer");
        root.appendChild(layer);

        buildSkills(skills);
        buildForge(forge);
        buildInformation(root);
        buildAccount(root);
        buildPause(root);
        addSaveActions(root.querySelector("[data-run-menu]"), root);
        buildBar();
        Array.prototype.forEach.call(root.querySelectorAll(".skill-bar [data-skill]"), function (button) {
            var art = button.dataset.skillIcon || treeArt(root.querySelector('[data-tree-skill="' + button.dataset.skill + '"]'));
            button.querySelector(".skill-icon").style.backgroundImage = "url('" + art + "')";
        });
        Array.prototype.forEach.call(root.querySelectorAll("[data-tree-skill]"), function (tree) {
            tree.style.setProperty("--skill-art", "url('" + treeArt(tree) + "')");
        });

        setInterval(syncBadges, 500);
        syncBadges();
        root.addEventListener("mobile-save-result", function (event) {
            if (event.detail?.success && event.detail.loadingSave && openName) closePanel(false);
            syncBadges();
        });
        root.addEventListener("mobile-account-deleted", function () {
            if (openName === "account") root.dataset.menuOpen = "on";
            else {
                closePanel(false);
                openPanel("account");
            }
            syncBadges();
        });

        // Android back closes an open panel first.
        window.addEventListener("popstate", function () {
            if (openName === "rankings") openPanel("pause");
            else closePanel(false);
        });
        return true;
    }

    if (!init()) {
        var observer = new MutationObserver(function () {
            if (init()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();
