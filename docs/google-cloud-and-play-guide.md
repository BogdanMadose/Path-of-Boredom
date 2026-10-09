# Path of Boredom: Google Play and Google Cloud setup

## Update: API 36 / version 2 upload bundle is ready

**Do not generate another upload key or repeat A3 for this release.** The local upload key was created and the bundle was signed and verified. Your Play screenshot showed no upload certificate registered yet.

The latest bundle targets Android API **36**, uses version code **2**, and is signed with the same upload key as version 1. Target and version were checked inside the bundle, and signature and bundle validation passed. Use this file instead of the old version 1 bundle rejected for targeting API 35. This is a temporary manifest-target workaround using .NET 9 tooling, not a .NET 10 upgrade or proof of Android 16 runtime compatibility; test gameplay on Android 16 before wider rollout.

The original project, package versions, SDK pin and Android manifest are unchanged for VS 2022 development. This release used `Play-Release/API36-AndroidManifest.xml`, an isolated Android SDK under `Play-Release/android-sdk`, and a build-only version override. The project still contains version code 1; future Play uploads must explicitly use a code higher than 2, not publish its default unchanged.

1. In Google Play Console, leave the App signing screen. **Do not click Change key.**
2. Open **Test and release → Testing → Internal testing** in the left menu (some layouts show **Testing → Internal testing** directly).
3. Open the **Releases** tab and click **Create new release**. If an existing draft is shown instead, click **Edit release**.
4. In **App bundles**, click **Upload**.
5. In the Windows file picker, paste this full path into **File name**, then click **Open**:

```text
C:\Projects\Path of Boredom\Play-Release\Path-of-Boredom-Internal-Test-v2-API36.aab
```

6. If the draft still contains version 1, remove that old bundle from the draft before reviewing. Wait for the new upload to finish. Confirm version code **2** is displayed. Enter release name **Internal test 2** and release notes **API 36 target; offline mobile gameplay and local save/load testing** if requested.
7. Click **Next** (or **Review release**), resolve any blocking messages, then click **Save and publish**, **Start rollout to internal testing**, or the equivalent confirmation displayed. Review the summary before confirming. Additional account/policy checks can block rollout; do not bypass them or provide inaccurate answers.
8. In the **Testers** tab, select/create an email list, add tester Google accounts, and click **Save changes**.
9. Copy the opt-in link shown on the internal testing page. A listed tester opens it using the same Google account, accepts testing, and installs through Google Play once available.

The latest generated bundle has version code **2**. If Play says this code was already used, stop: a new build with a higher version code is required. If it says the upload certificate is wrong, stop and report the error; do not click Change key or regenerate a key.

Private signing material is in `C:\Projects\Path of Boredom\.local-signing\`: `pob-upload.jks` and `upload-password.txt`, alias `pob-upload`. The password file is plaintext but the directory's Windows permissions restrict access to your current account and SYSTEM. Both private material and generated bundles are excluded from Git by directory-local ignore files. **Back up the key and password securely; do not upload them or send them in chat.** Future releases must reuse this key unless an upload-key reset is deliberately performed.

`Play-Release/pob-upload-certificate.pem` is only the public upload certificate, not the private key. Upload only the `.aab` for this release. Google Play's delivered-app certificate can differ from this upload certificate; use the Play app-signing certificate for Android Google sign-in configuration.

---

Follow this guide in order. You do not need AWS, and you do not need to enable cloud saves before testing the offline game through Google Play.

## Start here: two separate jobs

| Job | What it gives you | Can you do it now? |
| --- | --- | --- |
| Google Play internal testing | A link from which testers install the Android game | Yes, after release-signing the bundle |
| Google Cloud setup | An account, database and hosting configuration for future online features | Yes, but the game/backend integration still needs coding |

**Creating a database does not enable saving in the game. Creating an OAuth client does not implement sign-in.** The current app saves locally and shows sign-in as coming soon.

Recommended order:

1. Complete Part A to get the offline app into internal testing.
2. Complete Part B to prepare Google Cloud and the Google sign-in client.
3. Stop at Part C and provide the non-secret information listed there so the backend integration can be implemented.

---

## Part A — Find the bundle, sign it, and publish an internal test

### A1. Find the files in Windows, not Google Cloud

1. Press **Windows + E** to open File Explorer.
2. Click the address bar at the top (or press **Ctrl + L**).
3. Paste this entire folder path and press Enter:

```text
C:\Projects\Path of Boredom\Path of Boredom.Maui\bin\Release\net9.0-android\publish
```

4. If extensions are hidden, enable **View → Show → File name extensions**.

The following files were confirmed on disk when this guide was created:

| File | Approximate size | What it is |
| --- | --- | --- |
| `com.madbone.pathofboredom.aab` | 28.6 MB | Unsigned app bundle; use this as the input for release signing |
| `com.madbone.pathofboredom-Signed.aab` | 28.8 MB | Debug-signed app bundle; **do not upload this file to Google Play** |

These are generated build files, so they might not appear in Visual Studio's Solution Explorer. Look in File Explorer instead. An `.aab` is for Google Play; unlike an `.apk`, it is not installed directly by tapping it on a phone.

**Important correction:** the word `Signed` in the filename does not mean release-signed. The certificate was inspected and its owner is `CN=Android Debug`. Google Play requires an appropriate release/upload key.

### A2. Decide whether you already have an upload key

1. Open [Google Play Console](https://play.google.com/console/).
2. Open your app, if it already exists.
3. Find **App integrity → App signing**. Depending on the current menu layout, App integrity may be under **Test and release → Setup**.
4. If an **upload key certificate** is already registered, use the existing keystore matching it. **Do not create a different key and expect Play to accept it.** If that key is lost, follow Google's upload-key reset process.
5. If this is your first release and no upload key is registered, create an upload key in the next step.

Google Play normally signs delivered apps using its **app-signing key**. You sign the uploaded bundle using your **upload key**. They can be different keys.

Official help: [Play App Signing and upload-key resets](https://support.google.com/googleplay/android-developer/answer/9842756).

### A3. Sign the existing bundle — no Visual Studio Publish button required

You do not need to rebuild just to sign the existing unsigned bundle. The following steps use the Java signing tools already available on this development machine. They are short, separate commands; passwords are entered interactively, not included in commands.

#### If you need a NEW upload key

**Skip this subsection if your app already has an upload key.**

1. In File Explorer, open your Windows user folder by entering `%USERPROFILE%` in its address bar.
2. Create a folder named `AndroidSigningKeys`. Keep it outside the Git repository.
3. Open a PowerShell terminal and run this single command:

```powershell
keytool -genkeypair -v -storetype JKS -keystore "$env:USERPROFILE\AndroidSigningKeys\pob-upload.jks" -alias pob-upload -keyalg RSA -keysize 2048 -validity 10000
```

4. Choose a strong password and complete the certificate questions. The password will not be displayed while typing.
5. If asked for a separate key password, pressing Enter uses the keystore password.
6. Store the password in a password manager. Back up the `pob-upload.jks` file securely, separately from the password.

**Never commit the keystore or passwords. Do not paste passwords into chat.** Losing the key can require an upload-key reset. The `.jks` is not the app bundle and is not the file uploaded as your release.

#### Create the Play upload bundle

1. In PowerShell, switch to the folder containing the unsigned bundle:

```powershell
Set-Location "C:\Projects\Path of Boredom\Path of Boredom.Maui\bin\Release\net9.0-android\publish"
```

2. If you created the key above, run:

```powershell
jarsigner -keystore "$env:USERPROFILE\AndroidSigningKeys\pob-upload.jks" -signedjar com.madbone.pathofboredom-Play.aab com.madbone.pathofboredom.aab pob-upload
```

If using an existing keystore, replace the keystore path and `pob-upload` alias with your actual path and alias. Do not use a debug keystore. Type passwords only when prompted.

3. Verify the bundle's signature:

```powershell
jarsigner -verify com.madbone.pathofboredom-Play.aab
```

Look for `jar verified`. A self-signed-certificate warning can be normal for an Android upload key; actual verification failures are not.

4. Inspect the signing certificate:

```powershell
keytool -printcert -jarfile com.madbone.pathofboredom-Play.aab
```

Its owner should match the release/upload certificate you selected, **not Android Debug**. For an existing Play app, the fingerprints must match Play Console's registered **upload key certificate**.

5. In File Explorer, refresh the publish folder. The file to upload is now:

```text
com.madbone.pathofboredom-Play.aab
```

This file does **not** exist until you complete the signing command. Future publishes may replace build outputs; retain a copy of each submitted release somewhere safe.

If `keytool` or `jarsigner` is not recognized, the Java tools on this machine were found under `C:\Program Files (x86)\Android\openjdk\jdk-17.0.14\bin`. Use the executable's full path with PowerShell's `&` invocation operator, or ask for help with that exact error. Do not install a second JDK unnecessarily.

Official references: [Android manual signing](https://developer.android.com/studio/publish/app-signing#sign-manually) and [MAUI Android publishing](https://learn.microsoft.com/dotnet/maui/android/deployment/publish-cli?view=net-maui-9.0).

### A4. Create the internal testing release

1. Open [Google Play Console](https://play.google.com/console/).
2. If necessary, create the app listing and complete the required developer/account setup. The Android package is `com.madbone.pathofboredom`; do not change it for an existing listing.
3. Open your app → **Testing → Internal testing** (possibly under **Test and release**).
4. In the **Testers** tab, add an email list or Google Group and save it. Testers must use those Google accounts on their phones.
5. In the **Releases** tab, choose **Create new release**.
6. Follow the Play App Signing setup if requested. For a new app, using a Google-generated app-signing key is normally appropriate; do not change an existing app's signing arrangement without understanding the consequences.
7. Upload `com.madbone.pathofboredom-Play.aab` from A3, not the debug-signed file.
8. Add a release name and short release notes, for example: "First offline mobile test: gameplay, touch controls, local saves."
9. Resolve any blocking messages shown by Play Console. Complete any required app-content, policy or account checks accurately.
10. Review and roll out the internal testing release.
11. Copy the testing **opt-in link** from the internal testing page and send it to testers. They opt in with a listed account, then install through Google Play once the release is available.

The existing bundle uses version code **1**. If Play says that version code was already used, a new build with a higher `ApplicationVersion` in `Path of Boredom.Maui/Path of Boredom.Maui.csproj` is needed. Renaming or re-signing the file does not change its version code.

**Success check:** a tester can install through Play and play/save offline. Google sign-in and online rankings are not expected to work yet.

Official help: [Set up internal, closed or open testing](https://support.google.com/googleplay/android-developer/answer/9845334).

---

## Part B — Prepare Google Cloud

### B1. Confirm the project first

Your screenshots show a project named **GameDevelopment-PoB**, with project ID `gamedevelopment-pob` in the browser address. The following links target that project.

1. Open [Project dashboard](https://console.cloud.google.com/home/dashboard?project=gamedevelopment-pob).
2. Check **Project info** and record the project ID and project number.
3. Verify that this is the project containing your existing Android OAuth client. The number previously supplied was `438780560503`; do not assume it belongs to the screenshot project without checking.
4. If it is a different project, choose which project will own the backend and OAuth clients before continuing. Do not accidentally configure credentials in two unrelated projects.

A **project name**, **project ID** and **project number** are different values. The `438780560503` value is a project number, not a textual project ID.

### B2. Billing and a budget alert

1. Open [Billing](https://console.cloud.google.com/billing?project=gamedevelopment-pob).
2. Select/link a billing account if required. Cloud Run normally requires billing enabled.
3. In the billing account, open **Budgets & alerts → Create budget**.
4. Scope it to this project and choose a small monthly amount you are comfortable with, for example an alert budget of 10 EUR or your local equivalent.
5. Enable email alerts at several thresholds and save.

**A budget sends alerts; it does not stop spending.** Free allowances do not guarantee a zero bill. Leave resources uncreated until needed and monitor usage.

Help: [Create a Cloud Billing budget](https://cloud.google.com/billing/docs/how-to/budgets).

### B3. Enable the relevant APIs

Open each link and choose **Enable** if it is not enabled already:

- [Cloud Firestore API](https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=gamedevelopment-pob)
- [Cloud Run Admin API](https://console.cloud.google.com/apis/library/run.googleapis.com?project=gamedevelopment-pob)
- [Artifact Registry API](https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com?project=gamedevelopment-pob)
- [Cloud Build API](https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=gamedevelopment-pob) — needed if Google builds the backend container from source.

Your Cloud Run screenshot already reports that its API has been enabled. That does not mean an API service has been deployed.

### B4. Create Firestore — this is the screen in your first screenshot

1. Open [Firestore databases](https://console.cloud.google.com/firestore/databases?project=gamedevelopment-pob).
2. Click the blue **Create a Firestore Database** button shown in your screenshot.
3. If asked for edition, choose **Standard**, not the MongoDB-compatible Enterprise option.
4. Choose **Firestore Native mode**, if a mode selector appears. Do not choose Datastore mode or MongoDB compatibility for this plan.
5. Use database ID **`(default)`**. If it is preselected, leave it that way.
6. Choose a location near your players. For mainly European players, **`europe-west1` (Belgium)** is one reasonable example. Plan to use the same region for Cloud Run. Database location cannot simply be changed later, so choose deliberately.
7. If prompted for Security Rules, choose the restrictive/production option, **not public test access**. Do not grant anonymous clients read/write access.
8. Keep Google-managed encryption unless you have a specific requirement for your own encryption keys.
9. Click **Create**, wait, then confirm the database appears in the list.

**Success check:** you see a `(default)` database with the intended location. It can be empty; do not manually add player saves, collections or indexes yet. Their structure will be defined by the backend implementation.

For this architecture the phone calls the .NET API, and the API calls Firestore using IAM. Firestore Security Rules govern client SDK access, not server access; the backend still needs careful IAM permissions and its own authorization checks.

Help: [Create a Firestore database](https://cloud.google.com/firestore/native/docs/create-database).

### B5. Configure the Google consent screen

1. Open [Google Auth Platform overview](https://console.cloud.google.com/auth/overview?project=gamedevelopment-pob).
2. If shown, select **Get started** and complete the setup wizard.
3. Open [Branding](https://console.cloud.google.com/auth/branding?project=gamedevelopment-pob):
   - App name: **Path of Boredom**.
   - User support email: an address you monitor.
   - Developer contact email: an address you monitor.
   - Add app website/privacy links when required; do not invent URLs.
4. Open [Audience](https://console.cloud.google.com/auth/audience?project=gamedevelopment-pob).
5. Choose **External** if players are outside a single Google Workspace organization.
6. Keep the app in **Testing** while developing sign-in, and add your own Google account and the accounts of sign-in testers under **Test users**, if that section is available.
7. For basic sign-in, request only identity scopes such as `openid`, email and profile. Do not add Drive, Gmail or other unrelated permissions.

Google Play's tester list and OAuth's test-user list are **separate**. Adding someone to one does not automatically add them to the other. Testing behavior and verification requirements depend on the scopes and app configuration.

Help: [Configure OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent).

### B6. Create the WEB OAuth client

This is an additional client. Do not delete your Android client.

1. Open [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients?project=gamedevelopment-pob).
2. Click **Create client**.
3. Select application type **Web application**.
4. Give it a name such as **Path of Boredom backend**.
5. For the planned Android ID-token verification flow, JavaScript origins and redirect URIs are not required just to obtain this server-audience client ID. Leave them blank unless a specific browser-based flow is later implemented; do not invent an Android redirect URI here.
6. Click **Create**.
7. Copy the **Client ID**, ending in `.apps.googleusercontent.com`, into the worksheet below.

The client ID is a public identifier and can be shared for configuration. The client secret is private; **do not paste it into chat or put it in the app**. Server-side ID-token verification does not require shipping that secret to Android.

Help: [Verify Google ID tokens on a backend](https://developers.google.com/identity/sign-in/web/backend-auth).

### B7. Check the Android OAuth registration for Play-installed apps

1. In [OAuth Clients](https://console.cloud.google.com/auth/clients?project=gamedevelopment-pob), locate the Android client you already created.
2. Confirm its package is `com.madbone.pathofboredom`.
3. In [Play Console](https://play.google.com/console/), open your app → **App integrity → App signing**.
4. Under **App-signing key certificate**, copy the **SHA-1** fingerprint. Record SHA-256 too.
5. Ensure an Android OAuth client exists for this package and this **app-signing SHA-1**. Create an additional Android client if the existing one uses a different signing certificate.
6. Keep separate registrations where needed for debug builds, directly distributed release builds and Play-signed builds.

The app-signing certificate is the certificate on apps Google Play delivers. The **upload certificate** belongs to the key used in A3. Do not confuse them.

The previously supplied SHA values have not been confirmed as the Play app-signing certificate. The generated debug bundle was inspected and uses SHA-1 `50:48:01:D8:1B:BF:66:18:B6:49:07:98:0F:82:E3:78:65:4B:C1:E8`, which differs from the supplied SHA-1. Never overwrite release configuration with a debug fingerprint by accident.

### B8. Prepare a backend service account without downloading a private key

1. Open [IAM → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=gamedevelopment-pob).
2. Click **Create service account**.
3. Name it **pob-api-runtime**.
4. Grant the role **Cloud Datastore User** (`roles/datastore.user`) in the project containing the Firestore database. This role is also used for Firestore server data access.
5. Finish creation. Do not grant Owner or Editor just to make access work.
6. Record the service account email. Do **not** create or download a JSON private key for the phone.

Later, this account will be selected as Cloud Run's runtime identity. Google supplies credentials to the running backend automatically. Database permissions belong to the backend, not the APK. Build/deployment accounts have separate permissions; do not solve build permission errors by making the runtime account an administrator.

Help: [Cloud Run service identity](https://cloud.google.com/run/docs/configuring/services/service-identity).

### B9. Cloud Run — stop before deploying the current API

Open [Cloud Run](https://console.cloud.google.com/run/overview?project=gamedevelopment-pob), which matches your second screenshot.

**Do not click the .NET tile under "Write a function" for this application.** We need to deploy the existing ASP.NET Core API as a web service, not create an unrelated function.

**Stop here for now.** The current API needs programming changes before it is suitable for mobile cloud saves:

- Replace local JSON-file storage with Firestore. Cloud Run's local filesystem is temporary.
- Verify Google-issued ID tokens, including signature, issuer, audience and expiry.
- Use verified `sub` for player identity; do not trust caller-supplied identity headers.
- Add mobile authorization for saves, ranking submissions and account deletion.
- Define explicit local/cloud save-conflict handling.
- Prepare a deployable Linux container and configure its port correctly.

Once those changes are ready, deployment will use **Deploy container** (or a properly configured source build) in the web-service section:

1. Select the prepared backend container image; do not deploy a random sample image or select the whole MAUI solution as a .NET function.
2. Use a service name such as **pob-api** and the chosen region.
3. Set runtime identity to the **pob-api-runtime** account.
4. Configure the verified Web OAuth client ID as the backend's expected audience using the setting name defined by the implementation.
5. For early testing, set minimum instances to **0** and a small maximum instance count, for example **1**, to reduce cost exposure. This is not a spending cap.
6. Public transport access may be required for mobile clients, but enable it **only after the API enforces token authentication and authorization on every protected route**. Cloud Run IAM login and Google sign-in for game users are different systems.
7. Deploy and copy the generated **Service URL**, beginning with `https://` and commonly ending in `.run.app`.
8. Test that missing/invalid tokens cannot read or overwrite saves before connecting the mobile app.

No custom domain is necessary for the first test. Do not put `SaveService:ApiKey`, service-account private keys or OAuth client secrets into the APK.

Help: [Deploy a Cloud Run container](https://cloud.google.com/run/docs/deploying) and [Firestore server authentication](https://cloud.google.com/firestore/native/docs/authentication).

---

## Part C — What to provide after setup

Fill in this worksheet. These identifiers are not passwords, but do not include personal tester email lists in a public repository.

| Item | Value |
| --- | --- |
| Google Cloud project ID | `gamedevelopment-pob` shown in screenshots; verify |
| Project number | Verify against previously supplied `438780560503` |
| Firestore database ID | `(default)` if created as instructed |
| Firestore location / planned Cloud Run region | Fill in |
| Web OAuth client ID | Fill in; ends in `.apps.googleusercontent.com` |
| Android package | `com.madbone.pathofboredom` |
| Play app-signing SHA-1 | Fill in from Play Console |
| Play app-signing SHA-256 | Fill in from Play Console |
| Runtime service account email | Fill in |
| Cloud Run HTTPS URL | Leave blank until the backend is implemented and deployed |

For signing assistance, provide only whether this is the first Play release, the local keystore path and its alias. **Do not provide passwords, private keys or the OAuth client secret.**

Items such as token verification, authenticated save endpoints and account deletion are code we still need to implement. There is no Google Console checkbox that implements them for this game. Online rankings also need validation/abuse controls; client-reported scores are not inherently cheat-proof.

Before opening online features to players, also prepare an accurate privacy policy, account-deletion flow (including any required web link), and Play Console Data safety answers reflecting the actual implementation.

## Today's short checklist

- [ ] Open the publish folder in File Explorer.
- [ ] Find/use the existing upload key, or create one only if appropriate for a first release.
- [ ] Sign the unsigned bundle and upload the resulting `-Play.aab` to internal testing.
- [ ] Confirm the correct Google Cloud project and billing budget alerts.
- [ ] Create Standard / Native Firestore `(default)` in the chosen location.
- [ ] Configure Google Auth Platform and create the Web OAuth client ID.
- [ ] Verify Android registration against the Play app-signing certificate.
- [ ] Provide the worksheet identifiers, without secrets.
- [ ] Wait for backend/auth integration before deploying the API or promising cloud saves.

Companion technical notes: [Existing save/sign-in notes](google-sign-in.md).
