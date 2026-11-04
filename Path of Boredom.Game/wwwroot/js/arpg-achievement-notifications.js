import { ACHIEVEMENTS } from './arpg-achievements.js';

const catalogue = new Map(ACHIEVEMENTS.map(achievement => [achievement.id, achievement]));
const DISPLAY_MS = 5000;
const GAP_MS = 250;

export function createAchievementNotifications(root) {
    const document = root.ownerDocument;
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.hidden = true;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    // A manual popover stays visible over dialogs without taking focus or pausing combat.
    const usePopover = typeof toast.showPopover === 'function';
    if (usePopover) toast.setAttribute('popover', 'manual');
    const icon = document.createElement('span');
    icon.className = 'achievement-toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '★';
    const copy = document.createElement('div');
    const label = document.createElement('small');
    label.textContent = 'ACHIEVEMENT UNLOCKED';
    const name = document.createElement('strong');
    const detail = document.createElement('span');
    copy.append(label, name, detail);
    toast.append(icon, copy);
    root.append(toast);

    const queue = [], seen = new Set();
    let active = null, timer = null, disposed = false;

    function hide() {
        if (usePopover && toast.matches(':popover-open')) toast.hidePopover();
        toast.hidden = true;
        name.textContent = '';
        detail.textContent = '';
    }

    function showNext() {
        if (disposed || active || timer !== null || document.hidden || !root.isConnected || !queue.length) return;
        active = queue.shift();
        toast.hidden = false;
        if (usePopover) toast.showPopover();
        name.textContent = active.name;
        detail.textContent = active.description;
        timer = setTimeout(() => {
            timer = null;
            hide();
            active = null;
            timer = setTimeout(() => { timer = null; showNext(); }, GAP_MS);
        }, DISPLAY_MS);
    }

    function visibilityChanged() {
        if (document.hidden) {
            clearTimeout(timer);
            timer = null;
            if (active) queue.unshift(active);
            active = null;
            hide();
        } else showNext();
    }
    document.addEventListener('visibilitychange', visibilityChanged);

    function clear() {
        clearTimeout(timer);
        timer = null;
        active = null;
        queue.length = 0;
        seen.clear();
        hide();
    }

    return {
        enqueue(ids) {
            if (disposed) return;
            for (const id of ids) {
                if (seen.has(id) || !catalogue.has(id)) continue;
                seen.add(id);
                queue.push(catalogue.get(id));
            }
            showNext();
        },
        clear,
        dispose() {
            if (disposed) return;
            disposed = true;
            clear();
            document.removeEventListener('visibilitychange', visibilityChanged);
            toast.remove();
        }
    };
}
