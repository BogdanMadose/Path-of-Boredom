// Mobile game shell — MAUI head only.
// Mobile shell — MAUI head only. Owns the on-screen movement control.
//
// The Skills/Forge menus used to be handled here as sliding sheets; that is now js/mobile-menu.js,
// which rebuilds them as a proper canvas-style menu layer. This file is just the joystick.
(function () {
    "use strict";

    // ---- Virtual joystick ----------------------------------------------------------------
    //
    // Sends continuous steering to arpg.js through the host input attributes.
    //
    // The stick FLOATS: it materialises wherever the thumb touches down in the left-hand zone and
    // vanishes on release, so the player never has to hunt for a fixed control.
    function buildJoystick(pad, aiming) {
        if (!pad || pad.querySelector(".joystick-base")) return !!pad;
        // The game root carries the host->engine input flags (data-face-angle, data-auto-attack).
        var root = document.querySelector(".arpg");
        if (!root) return false;

        var base = document.createElement("div");
        base.className = "joystick-base";
        var knob = document.createElement("div");
        knob.className = "joystick-knob";
        base.appendChild(knob);
        pad.appendChild(base);

        var RADIUS = 38;        // travel limit of the knob, in CSS px
        var DEAD_ZONE = 8;      // below this the stick reads as centred
        var active = null;      // pointerId currently driving the stick

        // Origin of the current gesture, in client coordinates. The stick is FLOATING: it springs
        // into existence wherever the thumb lands rather than living at a fixed spot, so the
        // player never has to look down to find it.
        var originX = 0, originY = 0;
        // Other fingers resting on the pad while one drives the stick. When the driving finger
        // lifts, the most recent of these becomes the new stick at its current position.
        var waiting = new Map();

        function place(x, y) {
            originX = x;
            originY = y;
            var host = pad.getBoundingClientRect();
            base.style.left = (x - host.left) + "px";
            base.style.top = (y - host.top) + "px";
        }

        function move(event) {
            if (event.pointerId !== active) return;
            if (root.dataset.gameStatus !== "playing" || root.dataset.menuOpen === "on") {
                end();
                return;
            }
            var dx = event.clientX - originX;
            var dy = event.clientY - originY;
            var radius = Number(root.dataset.joystickSize || RADIUS);
            var deadZone = Number(root.dataset.deadZone || DEAD_ZONE);
            var sensitivity = Number(root.dataset.sensitivity || 1);
            var length = Math.hypot(dx, dy);
            if (length > radius) { dx = dx / length * radius; dy = dy / length * radius; }
            knob.style.transform = "translate(" + dx + "px," + dy + "px)";
            if (Math.hypot(dx, dy) >= deadZone) {
                if (aiming) {
                    root.dataset.faceAngle = String(Math.atan2(dy, dx));
                } else {
                    root.dataset.stickX = String(Math.max(-1, Math.min(1, dx / radius * sensitivity)));
                    root.dataset.stickY = String(Math.max(-1, Math.min(1, dy / radius * sensitivity)));
                }
            } else if (!aiming) {
                delete root.dataset.stickX;
                delete root.dataset.stickY;
            }
        }

        function end(event) {
            if (event && event.pointerId !== active) { waiting.delete(event.pointerId); return; }
            if (active === null) return;
            var pointer = active;
            active = null;
            knob.style.transform = "";
            pad.classList.remove("joystick-visible");
            // Leave the last angle in place: the character keeps facing where it was last aimed,
            // which is what auto-attack should use while standing still.
            if (!aiming) {
                delete root.dataset.stickX;
                delete root.dataset.stickY;
            }
            if (pad.hasPointerCapture(pointer)) pad.releasePointerCapture(pointer);
            if (!event || event.type !== "lostpointercapture") adoptWaiting();
        }

        function start(id, x, y) {
            active = id;
            waiting.delete(id);
            place(x, y);
            pad.classList.add("joystick-visible");
            try { pad.setPointerCapture(id); } catch (error) { /* non-fatal */ }
            move({ pointerId: id, clientX: x, clientY: y });
        }

        function adoptWaiting() {
            if (root.dataset.gameStatus !== "playing" || root.dataset.menuOpen === "on") { waiting.clear(); return; }
            var next = null;
            waiting.forEach(function (position, id) { next = { id: id, x: position.x, y: position.y }; });
            if (next) start(next.id, next.x, next.y);
        }

        // Listen on the pad
        // not exist until the thumb lands.
        pad.addEventListener("pointerdown", function (event) {
            if (root.dataset.gameStatus !== "playing" || root.dataset.menuOpen === "on") return;
            if (active !== null) { waiting.set(event.pointerId, { x: event.clientX, y: event.clientY }); return; }
            event.preventDefault();
            // Capture on the pad so the gesture keeps tracking even if the thumb slides outside
            // it — without this, dragging past the zone edge would silently drop movement.
            start(event.pointerId, event.clientX, event.clientY);
        });
        pad.addEventListener("pointermove", function (event) {
            if (waiting.has(event.pointerId)) waiting.set(event.pointerId, { x: event.clientX, y: event.clientY });
            move(event);
        });
        pad.addEventListener("pointerup", end);
        pad.addEventListener("pointercancel", end);
        pad.addEventListener("lostpointercapture", end);
        window.addEventListener("blur", function () { end(); });
        document.addEventListener("visibilitychange", function () { if (document.hidden) end(); });
        var statusObserver = new MutationObserver(function () {
            if (root.dataset.gameStatus !== "playing" || root.dataset.menuOpen === "on") end();
        });
        statusObserver.observe(root, { attributes: true, attributeFilter: ["data-game-status", "data-menu-open"] });

        return true;
    }

    function init() {
        var root = document.querySelector(".arpg");
        var movement = root?.querySelector(".touch-movement");
        var host = root?.querySelector("[data-combat-view]");
        if (!movement || !host) return false;
        root.dataset.autoAttack = "on";
        delete root.dataset.faceAngle;
        movement.setAttribute("aria-label", "Touch anywhere on the arena to move. Attacks and skills target automatically. Dodge and flask keep their own buttons.");
        return buildJoystick(movement, false);
    }

    if (!init()) {
        var joystickObserver = new MutationObserver(function () {
            if (init()) joystickObserver.disconnect();
        });
        joystickObserver.observe(document.body, { childList: true, subtree: true });
    }
})();
