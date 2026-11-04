import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACHIEVEMENTS } from '../Path of Boredom.Game/wwwroot/js/arpg-achievements.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const version = '1.0.2';
for (const name of ['ApiService', 'AppHost', 'Contracts', 'Game', 'Itch', 'Maui', 'ServiceDefaults', 'Web']) {
    const project = read(`Path of Boredom.${name}/Path of Boredom.${name}.csproj`);
    assert.equal(project.match(/<Version>([^<]+)<\/Version>/)?.[1], version, `${name} release version`);
}
const maui = read('Path of Boredom.Maui/Path of Boredom.Maui.csproj');
assert.ok(maui.includes('<ApplicationDisplayVersion>$(Version)</ApplicationDisplayVersion>'));
assert.ok(maui.includes('<ApplicationVersion>3</ApplicationVersion>'));
const home = read('Path of Boredom.Game/Components/Pages/Home.razor');
assert.ok(home.includes(`Patch Notes · ${version}`));
assert.ok(home.includes('href="patch-notes#version-1-0-2"'));
const notes = read('Path of Boredom.Game/Components/Pages/PatchNotes.razor');
assert.ok(notes.includes(`<PageTitle>Version ${version} · Path of Boredom</PageTitle>`));
assert.ok(notes.includes(`<span>Version ${version} · Path of Boredom</span>`));
const articles = [...notes.matchAll(/<article id="([^"]+)">([\s\S]*?)<\/article>/g)];
assert.equal(articles[0][1], 'version-1-0-2');
assert.equal(articles[1][1], 'version-1-0-1', 'previous release notes remain linked');
assert.ok(articles[0][2].includes('badge latest'));
assert.ok(!articles[1][2].includes('badge latest'));
assert.ok(articles[0][2].includes(`${ACHIEVEMENTS.length} in-game achievements`));
const sectionIds = [...notes.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(sectionIds).size, sectionIds.length, 'patch-note anchors must be unique');
assert.ok(read('Path of Boredom.Game/wwwroot/js/arpg.js').includes('path-of-boredom.patch-1.0.2:'));
console.log('PASS: eight project versions, MAUI release metadata, release links, announcement key, catalogue count and historical patch notes');
