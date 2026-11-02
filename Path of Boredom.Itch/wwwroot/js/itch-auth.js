// Browser sign-in for the itch.io build.
//
// Google: Google Identity Services renders its own button in a small in-game sheet and hands back an
// ID token (audience = the Web OAuth client), which the API already verifies. No popup/opener needed,
// so it keeps working inside itch.io's iframe.
// Apple: the API's browser flow runs in a popup and returns the 30-day game session to
// /signin-web/complete, which posts it back to this window.
(function () {
    "use strict";

    var gisLoading = null;

    function loadGis() {
        if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
        if (gisLoading) return gisLoading;
        gisLoading = new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            var timer = setTimeout(function () {
                script.remove();
                gisLoading = null;
                reject(new Error("Google sign-in timed out."));
            }, 15000);
            script.onload = function () { clearTimeout(timer); resolve(); };
            script.onerror = function () { clearTimeout(timer); gisLoading = null; reject(new Error("Google sign-in could not load.")); };
            document.head.appendChild(script);
        });
        return gisLoading;
    }

    function sheet(title) {
        var overlay = document.createElement("div");
        overlay.className = "itch-auth-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        var card = document.createElement("div");
        card.className = "itch-auth-card";
        var heading = document.createElement("h3");
        heading.textContent = title;
        var slot = document.createElement("div");
        slot.className = "itch-auth-slot";
        slot.setAttribute("role", "status");
        slot.setAttribute("aria-live", "polite");
        var cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "itch-auth-cancel";
        cancel.textContent = "Cancel";
        card.append(heading, slot, cancel);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        cancel.focus();
        return { overlay: overlay, heading: heading, slot: slot, cancel: cancel };
    }

    async function signInWithGoogle(clientId) {
        return new Promise(function (resolve) {
            var ui = sheet("Connecting to Google…");
            ui.slot.textContent = "Loading secure sign-in. Your game stays paused.";
            var done = false;
            function finish(result) {
                if (done) return;
                done = true;
                ui.overlay.remove();
                resolve(result);
            }
            ui.cancel.addEventListener("click", function () { finish({ error: "cancelled" }); });
            loadGis().then(function () {
                if (done) return;
                ui.heading.textContent = "Continue with Google";
                ui.slot.replaceChildren();
                google.accounts.id.initialize({
                    client_id: clientId,
                    callback: function (response) { finish(response && response.credential ? { token: response.credential } : { error: "cancelled" }); },
                    auto_select: false,
                    cancel_on_tap_outside: false,
                    itp_support: true,
                    use_fedcm_for_prompt: true
                });
                google.accounts.id.renderButton(ui.slot, { type: "standard", theme: "filled_black", size: "large", text: "continue_with", shape: "pill", width: 260 });
            }).catch(function () { finish({ error: "unavailable" }); });
        });
    }

    async function trySilentGoogle(clientId) {
        try { await loadGis(); }
        catch (error) { return null; }
        return new Promise(function (resolve) {
            var settled = false;
            function finish(token) { if (!settled) { settled = true; resolve(token); } }
            google.accounts.id.initialize({
                client_id: clientId,
                callback: function (response) { finish(response && response.credential || null); },
                auto_select: true,
                itp_support: true,
                use_fedcm_for_prompt: true
            });
            google.accounts.id.prompt(function (note) {
                if (note.isNotDisplayed && note.isNotDisplayed() || note.isSkippedMoment && note.isSkippedMoment()) finish(null);
            });
            setTimeout(function () { finish(null); }, 8000);
        });
    }

    function signInWithApple(apiBaseUrl, returnUrl) {
        var api = apiBaseUrl.replace(/\/+$/, "");
        var apiOrigin = new URL(api).origin;
        var popup = window.open(api + "/signin-apple/start?returnUrl=" + encodeURIComponent(returnUrl), "pob-apple", "width=520,height=680");
        if (!popup) return Promise.resolve({ error: "blocked" });
        return new Promise(function (resolve) {
            var ui = sheet("Signing in with Apple…");
            ui.slot.textContent = "Finish in the Apple window. Your game stays paused.";
            var done = false;
            function finish(result) {
                if (done) return;
                done = true;
                window.removeEventListener("message", onMessage);
                clearInterval(watch);
                clearTimeout(timeout);
                ui.overlay.remove();
                resolve(result);
            }
            function onMessage(event) {
                if (event.source !== popup || event.origin !== apiOrigin || !event.data || event.data.type !== "pob-auth") return;
                finish(event.data.token ? { token: event.data.token, expires: event.data.expires || 0 } : { error: event.data.error || "cancelled" });
            }
            window.addEventListener("message", onMessage);
            var watch = setInterval(function () { if (popup.closed) setTimeout(function () { finish({ error: "cancelled" }); }, 600); }, 500);
            var timeout = setTimeout(function () { popup.close(); finish({ error: "cancelled" }); }, 180000);
            ui.cancel.addEventListener("click", function () { popup.close(); finish({ error: "cancelled" }); });
        });
    }

    function signOutGoogle() {
        if (window.google && window.google.accounts && window.google.accounts.id) google.accounts.id.disableAutoSelect();
    }

    window.pobItchAuth = {
        signInWithGoogle: signInWithGoogle,
        trySilentGoogle: trySilentGoogle,
        signInWithApple: signInWithApple,
        signOutGoogle: signOutGoogle
    };
})();
