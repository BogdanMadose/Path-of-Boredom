export function bindButtonFeedback(root, environment = globalThis) {
    const controller = new AbortController();
    const pointers = new Map();
    const keyboard = new Map();
    const on = (target, name, handler) => target.addEventListener(name, handler, { signal: controller.signal });
    const buttonFor = target => {
        const button = target?.closest?.("button");
        return button && root.contains(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true" ? button : null;
    };
    function refresh(button) {
        button.classList.toggle("button-pressed", [...pointers.values(), ...keyboard.values()].includes(button));
    }
    function release(map, key) {
        const button = map.get(key);
        map.delete(key);
        if (button) refresh(button);
    }
    function clear() {
        const buttons = new Set([...pointers.values(), ...keyboard.values()]);
        pointers.clear();
        keyboard.clear();
        for (const button of buttons) button.classList.remove("button-pressed");
    }
    on(root, "pointerdown", event => {
        if (event.button !== 0) return;
        const button = buttonFor(event.target);
        if (button) { pointers.set(event.pointerId, button); refresh(button); }
    });
    on(environment, "pointerup", event => release(pointers, event.pointerId));
    on(environment, "pointercancel", event => release(pointers, event.pointerId));
    on(root, "lostpointercapture", event => release(pointers, event.pointerId));
    on(root, "pointerout", event => {
        const button = pointers.get(event.pointerId);
        if (button && !button.contains(event.relatedTarget)) release(pointers, event.pointerId);
    });
    on(root, "keydown", event => {
        if (!["Enter", "Space"].includes(event.code) || event.repeat) return;
        const button = buttonFor(event.target);
        if (button) { keyboard.set(event.code, button); refresh(button); }
    });
    on(environment, "keyup", event => release(keyboard, event.code));
    on(root, "focusout", clear);
    on(environment, "blur", clear);
    on(environment, "pagehide", clear);
    on(environment, "game-background", clear);
    return { dispose() { controller.abort(); clear(); } };
}
