# Firebase and GitHub Pages setup

Complete these steps for Firebase project **cardgame-bfa88**. Stay on the **Spark** plan. The hosted app supports the existing administrator controls plus restricted player screens for cards, packs, card use, and trading.

## 1. Register the web app and copy its public config

Open [Firebase Console](https://console.firebase.google.com/project/cardgame-bfa88/settings/general), then **Project settings → General → Your apps**. Select the existing Web app, or click the **Web (`</>`)** icon to register one. Give it a name such as **Friends Cards**. Do not enable Firebase Hosting; GitHub Pages will host the files.

Under **SDK setup and configuration**, select **Config**. The complete configuration you supplied is now stored in `window.FC_FIREBASE_CONFIG` in `site-config.js`. Check that it matches this project. These identifiers belong in public browser code; no service-account credentials are needed.

## 2. Enable anonymous sessions

Open **Build → Authentication → Get started** (if not initialized), then **Sign-in method → Anonymous → Enable → Save**. Leave email and other sign-in providers disabled. There is no need to create `arkov` manually in Authentication's Users list. The app creates an anonymous Firebase identity, then submits its credential hash to Firestore to obtain an approved session.

## 3. Create Firestore

Open **Build → Firestore Database → Create database**. Use **Standard edition**, the **(default)** database, and choose a suitable region. Start in **Production mode**, then replace its deny-all rules in the next step. If the default database already exists, use it; do not create another database or manually create game documents.

## 4. Publish the supplied rules

Open **Firestore Database → Rules**, replace the entire editor with `firestore.rules`, and click **Publish**. This replaces the broader starter rules that allowed all collections.

These rules require a valid credential-approved session and an admin or linked-player profile to read or save `tables/main`. Anonymous strangers cannot access the table. Browsers cannot read the private account whitelist or list/read other people's sessions. A signed-in administrator can provision player credentials and player-only profiles, but cannot replace their own credential or create another administrator.

In **Firestore → Data**, create these two documents using the console (console administrators can create them even though browser writes are denied):

| Document path | Fields |
|---|---|
| `privateAccounts/arkov` | `enabled`: boolean `true`; `passwordHash`: string copied from the private setup file |
| `accountProfiles/arkov` | `role`: string `admin` |

The matching hash for your requested testing credentials is prepared in **`private-exports/firebase-arkov.json`** on your computer. Copy only its field values into the documents above. Do not upload that file to GitHub. If `privateAccounts/arkov` already has a `role` field, it may remain, but the app uses the separate `accountProfiles/arkov` document for its role.

For a new credential, run `python scripts/account_record.py`. It asks for a username and password and writes an ignored setup file. It does not print or store the password. The exact algorithm is SHA-256 of lowercase/trimmed username, a newline, and the unchanged password. Never place accepted hashes in `site-config.js` or the rules file.

Do not manually create session documents. The app creates them after successful rule verification. Sessions last 12 hours. Sign out deletes the session; disabling the account or changing its hash revokes access on the next database request.

Each player login needs `privateAccounts/<username>` with `enabled: true` and its 64-character password hash, plus `accountProfiles/<username>` with `role: "player"` and `playerId` set to that player's numeric ID in the table. Keep the hash out of Git. The included ignored provisioning utility shows the exact record format. The current trusted-group design stores the game in one shared JSON document, so Firestore authorizes approved members at the document level and the app limits which actions appear in player mode.

For the optional index optimization, open **Indexes → Single field → Add exemption**: collection ID `tables`, field path `stateJson`, disable all indexes for that field. The app reads that document directly and never queries the JSON field. Alternatively, if you already use Firebase CLI, the included `.firebaserc`, `firebase.json`, and `firestore.indexes.json` support:

```text
firebase deploy --only firestore --project cardgame-bfa88
```

The manual console steps are enough; installing Firebase CLI is optional. No Functions, Cloud Storage, billing upgrade, or GitHub secrets are needed.

## 5. Push the repository and enable Pages

Create a public GitHub repository and push this folder on branch **main**. Use Git so `.gitignore` is respected; do not manually upload the entire folder through the website. Databases, backups, exports, screenshots, temporary browser profiles, and known private-key files are ignored.

The local folder is already initialized as a Git repository on `main`. After filling in the web config, create an **empty** GitHub repository (without an additional README), then run these commands from this folder, replacing the remote URL with the one GitHub gives you:

```text
git add .
git commit -m "Prepare Friends Cards for Firebase and GitHub Pages"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

No remote, commit, or push has been created automatically.

In the GitHub repository, choose **Settings → Pages → Build and deployment → Source → GitHub Actions**. Push a change or run **Publish frontend to GitHub Pages** from the Actions tab. The workflow runs the core tests, verifies that the Firebase placeholders are replaced, builds an explicit asset list into `_site/`, and deploys it. The workflow fails clearly if the config is incomplete.

Open the Pages URL shown by the successful workflow, normally `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`. Assets and modules work under that repository subpath. Sign in as **arkov** with the testing password you requested.

## 6. Import your current table and check saving

Run `python scripts/export_legacy.py` locally to make a read-only export of `friends-cards.db`. It prints a JSON path inside ignored `private-exports/`. On the hosted site, choose **Setup → Import backup**, select that file, and confirm the preview. Import changes the shared table only after you confirm. Wait for **Saved online**, refresh, and check that your players and cards remain.

For a new empty table, add a player instead. The document is created on the **first successful save**, not merely by signing in. Back up through **Export backup** periodically. The existing SQLite database and backups remain on your computer.

## If something fails

- **Firebase setup is incomplete:** replace both config placeholders, push, and redeploy.
- **Authentication operation not allowed:** enable Anonymous sign-in in the same project as the config.
- **Missing or insufficient permissions:** publish this repository's rules to the default Firestore database.
- **Network/CDN error:** check the connection and retry login; the Firebase SDK is loaded from Google's CDN.
- **Another tab saved a newer table:** export the unsaved copy, reload to load the latest table, then reconcile. Use one active editing tab.
- **Table size limit:** export the table and ask for the multi-document storage upgrade; the app refuses JSON above 900 KB to stay below Firestore's 1 MiB document limit.

The public web config is complete. The rules have been tested in a local Firestore emulator. A real login on your Firebase project still requires the same rules and matching private account/profile records in the live default database; local emulator tests do not change your live project.

References: [Anonymous Authentication](https://firebase.google.com/docs/auth/web/anonymous-auth), [Firestore rules](https://firebase.google.com/docs/firestore/security/get-started), [Firestore limits](https://firebase.google.com/docs/firestore/quotas), [GitHub Pages configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
