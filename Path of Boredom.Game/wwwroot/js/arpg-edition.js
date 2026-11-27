// The host chooses the edition before creating a run. Full is the default for existing hosts.
let demo = false;
export const DEMO_WAVES = 10;
export function configureEdition(edition) { demo = edition === 'demo'; }
export const isDemo = () => demo;
export const editionStorageKey = key => demo ? `${key}:demo` : key;
export const classAvailable = hero => !demo || ['knight', 'ranger'].includes(hero);
export const campaignWaveLimit = () => demo ? DEMO_WAVES : 30;
export const demoComplete = state => demo && state.mode === 'campaign' && state.wave === DEMO_WAVES && state.status === 'camp';
export function requireEditionState(state) {
    if (demo && (state.mode !== 'campaign' || !classAvailable(state.heroClass)
        || !Number.isInteger(state.wave) || state.wave < 0 || state.wave > DEMO_WAVES
        || state.campaignComplete !== 0 || state.status === 'won'
        || state.wave === DEMO_WAVES && state.travelPending)) {
        throw new Error('This run requires the full game. The demo includes 10 campaign waves, Ember Knight and Dawn Ranger only. Your save is unchanged.');
    }
}
