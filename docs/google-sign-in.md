# Mobile accounts, cloud saves and rankings

# Google sign-in technical notes

For setup instructions, direct Console links, bundle location and release-signing steps, start with [Google Cloud and Google Play step-by-step guide](google-cloud-and-play-guide.md).

## Current behavior

- MAUI plays offline and stores one run in `offline-run.json` in the app-private data directory.
- Manual Save/Load and successful checkpoint saves use the existing game snapshot format and validation.
- The local save survives app restarts. Uninstalling or clearing app storage removes it.
- A newer save replaces the previous slot; loading replaces the current run only after confirmation and snapshot validation.
- Sign-in is a clearly marked future option. No Google tokens are requested or stored yet.
- Online rankings remain unavailable; local scores must not be represented as server-confirmed rankings.

## Registration supplied

Public values are recorded in `Path of Boredom.Maui/GoogleSignInConfiguration.cs`:

- Android package: `com.madbone.pathofboredom`
- Android OAuth client: `438780560503-fbflm3m2m0j59117194k1q0plb16t7hi.apps.googleusercontent.com`
- Google project number: `438780560503` (the textual project ID is separate)
- SHA-1: `60:D4:BF:BA:A5:0C:43:90:43:36:DE:A1:78:86:C5:E1:CD:44:EC:98`
- SHA-256: `EE:9A:5B:51:C1:94:50:37:53:68:C2:63:57:BF:88:3B:A0:0C:2C:C5:16:DA:E3:98:23:05:21:5A:2A:25:36:F6`

These values are identifiers, not passwords or client secrets. Confirm this OAuth client is the Android client type and that its package/certificate match the APK being installed. Debug, release and Google Play app-signing certificates can differ; register the appropriate certificates for each distribution.

## Still needed before enabling cloud features

1. A deployed HTTPS API URL and durable storage for saves and rankings. Google sign-in provides identity, not a game-save database or leaderboard.
2. A Google **Web application OAuth client ID** used as the backend/server audience for Android ID-token sign-in. Keep it separate from the Android client ID.
3. OAuth consent-screen configuration and permitted test accounts while the app is in testing.
4. Server-side verification of Google ID tokens: signature, trusted issuer, expiry and the configured audience. Use the verified `sub` as account identity; do not trust email or identity headers supplied by the phone.
5. A mobile authentication scheme on the API separate from the existing Web-to-API shared-secret scheme. Never put `SaveService:ApiKey` or OAuth client secrets in the APK.
6. Authenticated save/ranking endpoints, account-deletion support and a conflict/linking policy before uploading an offline save to an account. Do not silently replace an existing cloud save.

No API hosting provider or storage service has been selected by this configuration. A Google account is not a substitute for hosting the game's backend. Browser-reported scores remain vulnerable to cheating without server-side gameplay verification.
