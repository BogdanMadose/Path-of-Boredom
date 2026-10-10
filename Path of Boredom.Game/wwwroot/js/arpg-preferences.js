export const PREFERENCE_KEY = 'path-of-boredom.controls.v1';
export const DEFAULT_PREFERENCES = Object.freeze({ joystickSize: 38, deadZone: 8, sensitivity: 1, textScale: 1, damageNumbers: 'reduced', shake: true, contrast: false, buttonSide: 'right' });
export function normalizePreferences(value) {
    const number = (key, min, max) => typeof value?.[key] === 'number' && Number.isFinite(value[key]) ? Math.max(min, Math.min(max, value[key])) : DEFAULT_PREFERENCES[key];
    return { joystickSize: number('joystickSize', 28, 64), deadZone: number('deadZone', 2, 18), sensitivity: number('sensitivity', 0.5, 1.5), textScale: number('textScale', 0.9, 1.3),
        damageNumbers: ['all', 'reduced', 'off'].includes(value?.damageNumbers) ? value.damageNumbers : DEFAULT_PREFERENCES.damageNumbers,
        shake: typeof value?.shake === 'boolean' ? value.shake : true, contrast: value?.contrast === true, buttonSide: value?.buttonSide === 'left' ? 'left' : 'right' };
}
export function bindPreferences(root, environment = globalThis) {
    const controller = new AbortController();
    let settings;
    try { settings = normalizePreferences(JSON.parse(environment.localStorage.getItem(PREFERENCE_KEY))); } catch { settings = normalizePreferences(null); }
    function apply() {
        root.style.setProperty('--game-text-scale', settings.textScale);
        root.style.setProperty('--joystick-radius', `${settings.joystickSize}px`);
        for (const key of ['joystickSize', 'deadZone', 'sensitivity', 'damageNumbers', 'shake', 'contrast', 'buttonSide']) root.dataset[key] = String(settings[key]);
        for (const control of root.querySelectorAll('[data-preference]')) {
            const key = control.dataset.preference;
            if (control.type === 'checkbox') control.checked = settings[key]; else control.value = settings[key];
        }
    }
    for (const control of root.querySelectorAll('[data-preference]')) control.addEventListener('input', () => {
        settings = normalizePreferences({ ...settings, [control.dataset.preference]: control.type === 'checkbox' ? control.checked : control.type === 'range' ? Number(control.value) : control.value });
        try { environment.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(settings)); } catch { /* Preferences work without storage. */ }
        apply();
    }, { signal: controller.signal });
    apply();
    return { get settings() { return { ...settings }; }, dispose() { controller.abort(); } };
}
