# Firebase migration audit

## Fixed

- Replaced the eager, permanently rejected Firebase startup promise with an on-demand connection that can be retried. Missing config now produces an actionable login message without an unhandled rejection.
- Removed the production `FC_FIREBASE_ADAPTER` testing override; tests substitute the network boundary themselves.
- Restored sessions tolerate unavailable sessionStorage, and a refresh correctly reveals the app after loading.
- Saves capture the exact state revision before awaiting the network. Changes made during a save remain dirty until a subsequent save succeeds.
- Reads require a server response. A cached/offline miss cannot silently initialize a new empty table.
- Player actions execute against the latest state inside Firestore transactions. Stable operation receipts make retries idempotent after lost responses, and deterministic random replay keeps transaction retries consistent.
- Admin saves merge independent field changes. Same-field conflicts preserve an exportable local recovery copy and load the latest cloud state.
- Live Firestore subscriptions update idle clients. Local UI preferences stay in session storage and no longer create shared writes.
- Firebase identities are isolated per browser tab where Web Locks are available, and account sessions are rechecked before writes and periodically while open.
- Trade offers record item fingerprints, so a used, transferred, or otherwise changed card cannot be exchanged under an older offer. Trade credit inputs survive inventory selection.
- Imports and configuration edits validate trade structure, operation receipts, and economy ranges.
- Store JSON in a single unindexed payload field instead of indexing the whole game's nested object structure. Reads still accept the previous object format for migration.
- Enforce a 900 KB UTF-8 payload ceiling below Firestore's document limit. Oversized imports are rejected before replacing the current table.
- Rules are limited to the one table document and check its envelope; delete and unrelated paths are denied.
- The Pages build uses a public asset allowlist, includes the new cloud module and art credits, and rejects missing Firebase configuration before deployment.
- Ignore local data, browser profiles, exports, screenshots, private-key patterns, and historical one-off migration scripts.
- Updated browser tests for Firebase and replaced the obsolete top-level README with current setup instructions. Preserved historical documentation separately.
- Added a read-only SQLite-to-JSON exporter for migrating existing local data without publishing it.

## Deliberate limitations

The earlier convenience-only gate has been replaced. Firestore rules now verify a submitted hash against privateAccounts, approve a session tied to the caller's Firebase UID, and require a protected accountProfiles admin or linked-player role for table reads/writes. Accepted hashes and real passwords are removed from publishable source and tests. The hash itself is a reusable credential and the lightweight scheme has no built-in guessing throttle, as accepted for this live test.

The player interface is restricted to the linked player's cards, packs, card use/inspection, and trades. The trusted group shares one JSON document, so Firestore authorizes the whole document after login and the client applies player action limits. This remains a trusted-group security model: an approved user who deliberately modifies the frontend could submit a broader table write. Automatic off-site backups are not included.

Legacy Python server/authentication code remains for local data maintenance and its tests, but no browser path depends on it and it is excluded from Pages output.

## Verification boundary

Core tests cover gameplay regression, JSON roundtrips, revision conflicts and merges, simultaneous actions, idempotent retries, trade races, oversize payloads, old-format migration, corrupt data, and failed-write retry. Browser tests cover admin and player login, reload, missing config, admin screens, player cards/packs/trades, desktop/mobile layout, export/import/restore, save failures, edits during saves, live shared-client updates, and session recovery.

Browser cloud calls are simulated with a shared transactional fixture, and the actual Firestore rules are separately tested in Google's local Firestore emulator. The complete Firebase web config is present. The live project needs the matching rules and private account/profile records from HOSTING.md.

Audit run results: gameplay regression, cloud-store tests, login and desktop/mobile suites, repository-subpath artifact loading, and legacy Python tests passed. The private SQLite export passed the frontend's import validator. The release build now has complete public configuration.

The rules emulator verifies: anonymous strangers and unauthenticated requests denied; private hash reads/listing denied; incorrect credentials denied; role injection and writes to another user's session denied; valid admin and linked-player table access succeeds; only an admin can provision player-only accounts; revoked and expired sessions denied; logout revokes access. Run `node tests/firestore-rules.test.mjs` against a local emulator started with `firestore.rules` and project `demo-friends-cards`.
