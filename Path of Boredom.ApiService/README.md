# Path of Boredom.ApiService

The API is still meant to be boring, just not file-backed anymore. It handles saves, rankings, and game accounts. Firestore keeps the data; the Android app supplies a Google ID token; the server decides whether that token and the submitted data are actually acceptable.

It can run on Cloud Run without depending on files surviving inside a container. That's the important difference from the old `App_Data` setup.

## Startup and configuration

`Program.cs` registers `FirestorePersistence`, `GameSaveStore`, and `RankingStore`, wires authentication and rate limiting, then maps the save, ranking, and account endpoints. Cloud Run's `PORT` is honoured, with the listener bound to all interfaces.

The settings you need are:

- `Firestore:ProjectId` — the Firestore project, or `Firestore__ProjectId` as an environment variable.
- `Firestore:DatabaseId` — optional; defaults to `(default)`.
- `GoogleIdentity:Audience` — the **Web OAuth client ID** used as the audience for Android's ID tokens. Not the Android OAuth client ID.
- Application Default Credentials with access to the database, or a configured Firestore emulator for local development.

The checked-in `appsettings.json` doesn't supply those deployment settings. A missing audience or Firestore project is a configuration problem, not a save-format bug.

The old Windows forwarding scheme is only registered when both the environment is Development and `Authentication:EnableLegacyWindows` is true. That path also needs `SaveService:ApiKey`. Don't enable it as a production workaround: the mobile app must never contain that shared secret.

## Identity: two doors, only one for production mobile

`GoogleTokenAuthenticationHandler.cs` verifies the provider-issued token and builds the player identity from its subject. The API doesn't accept a Google-looking name or an owner ID sent in the request body as proof of ownership.

`SaveServiceAuthenticationHandler.cs` is the legacy development door for the Windows Web host. It checks the service secret before trusting `X-Windows-User` and `X-Windows-Sid`. Keep the distinction clear when debugging a 401: a correctly signed-in Windows browser doesn't make its relay request a valid Google request.

Authenticated player requests share a rate limit of 60 requests per minute per identity. `/health` and `/alive` come from ServiceDefaults and are only mapped in Development.

## `FirestorePersistence.cs` — the storage seam

Player document IDs are SHA-256 hashes of the owner identity. The main collections are `saves`, `rankings`, and `accounts`; `displayNames` holds nickname reservations. Save and ranking envelopes are stored as JSON strings so Firestore's map/number conversions don't quietly reshape the JS save contract.

Mutations read the account marker inside their transaction. That serializes writes against deletion and prevents a token issued before deletion from recreating the old account's data. Deletion leaves a minimal hashed-ID marker with a timestamp; it doesn't keep the deleted run or ranking profile.

## Saves: validation first, transaction second

`GameSaveEndpoints.cs` is still the validation wall. `PUT /game/save` reads at most 64 KiB, checks the envelope, then walks the version-specific state shape before anything reaches storage. The current format is **18**; older supported formats remain accepted. Format 17 adds equipment styles, stage challenges, run summaries, and chosen-skill cards; format 18 adds the six newer Forge tracks. Deploy this validator before expecting format 18 app saves to upload successfully.

`GET /game/save` returns the caller's save and a quoted revision in `ETag`. Google-authenticated writes must send that revision in `If-Match`; revision zero means "create only if there isn't a save yet." A missing revision gets 428, and a stale revision gets 409 with `SaveConflict`. There is no client-clock guessing and no blind last-writer-wins overwrite.

`GameSaveStore.cs` performs the write transactionally, increments the revision, and preserves the permanent Endless unlock if either the existing save or incoming run has completed the campaign.

The structured validation errors are worth keeping: `UnsupportedSaveVersion`, `InvalidSaveState`, and `InvalidSaveJson` tell the client more than a bare 400. Some responses include a trace reference for matching a report to server logs. The old disk-store `.corrupt` recovery flow is not the current cloud persistence mechanism; damaged-device-save backups belong to the MAUI host.

If you change persisted game state, update this validator and `Path of Boredom.Game/wwwroot/js/arpg-save.js` together, including migrations. Check the device version gate in `OfflineGameSession.cs` too. An Android version-code bump is not a save-version bump.

## Rankings and player names

`RankingEndpoints.cs` registers profiles, reads boards, and accepts score/build submissions. `RankingStore.cs` keeps a best record under `patch:difficulty:mode:class`, replacing it only when the submitted score is higher. A tie doesn't rewrite the recorded build.

New build snapshots include weapon/armor names, ratings, and equipment styles alongside skills and upgrades. These describe the equipment at the achieved score, not the player's later gear; older records without equipment details remain older snapshots rather than being reconstructed from a current save.

Mobile uses the `release` board; desktop uses `004`, with historical tags kept separate. Older unprefixed board keys are migrated lazily into `pre004`. Scores are client-reported, so these are community rankings, not an anti-cheat system.

`PlayerAccountEndpoints.cs` provides the profile, nickname change, and deletion routes under `/game/account`. Names follow `PlayerDisplayNameRules`: 3–24 letters, numbers, spaces, dots, hyphens, or underscores. A missing custom name falls back to an `Ember-...` alias rather than exposing the Google account's personal name.

Nickname changes reserve a case-insensitive name transactionally and check profiles created before reservations existed. Another player's name returns 409. Renaming releases the previous reservation; account deletion releases the reservation owned by that account. These checks only reach players after this API source is deployed — putting a new AAB on Play doesn't update them.

## Deployment and debugging

`deployment/Prepare-CloudSource.ps1`, run from the repository, creates `Play-Release/pob-cloud-source.zip` with the backend projects and container inputs. It doesn't deploy the archive, and it deliberately excludes Android bundles, signing keys, passwords, and local data. `docs/google-cloud-and-play-guide.md` covers the cloud/Play setup.

Deploy updated source or an updated image to the same Cloud Run service to create a new revision. Restarting a container that still uses the old image won't install the new code. Firestore stays outside the container lifecycle, so a normal backend redeploy doesn't need a new Android version code or reset player saves.

For failures, start with the service logs, the response code, and any trace reference. Then separate token/audience problems, Firestore access problems, revision conflicts, and save-validator drift. They're four different problems that can all look like "Save didn't work" from a phone.
