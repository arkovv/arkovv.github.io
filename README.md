# Friends Cards

A shared card game for a small group of friends. GitHub Pages hosts the interface; Firebase's Spark plan supplies anonymous sessions and Firestore storage. The deployed app needs no Python server.

This version has a simple admin username/password screen and the existing Setup, Auction, Shop, Public Market, Cards, and Players screens. Player accounts and the reduced player interface have **not** been implemented yet.

## Finish setup

Follow [HOSTING.md](HOSTING.md). The public Firebase configuration is filled in. Before deployment, publish `firestore.rules` and create the two admin records described in the guide.

The admin username is `arkov`; use the password provided when setting up this project. No emails or Firebase admin keys are involved. The browser hashes the normalized username, a newline, and the password. Firestore rules check that hash against a private account record before approving the browser session. Rules also enforce the account's admin role for table access. Anonymous authentication alone grants no game access.

Account hashes are credentials: they belong only in protected Firestore documents and ignored local setup files. A session expires after 12 hours; signing out deletes it. Disabling an account or changing its hash revokes its existing sessions on their next request. This lightweight login has no built-in password-guess throttling.

## Saving and backups

The table is stored at `tables/main` as JSON with a revision number. Saves use a transaction: if another tab has saved since this tab loaded, editing pauses instead of replacing that newer table. Export the unsaved copy and reload to reconcile the changes. Use one active editing tab.

The frontend limits table JSON to 900 KB, below Firestore's 1 MiB document limit. There is no automatic online backup service. Export JSON backups periodically; the browser also retains pending changes and a previous-table copy for replacement operations.

To migrate the existing local SQLite table, run `python scripts/export_legacy.py`, then import the generated file through Setup on the hosted app. Exports stay in the ignored `private-exports/` folder. This migration is never run automatically on the hosted site.

## Development and verification

Node.js 22 or newer is sufficient for the build and core tests; there are no production npm dependencies.

```text
npm test
npm run build
npm run build:pages
```

`build` permits placeholder configuration for local inspection. `build:pages` requires complete Firebase configuration. Both use an explicit asset list; only `_site/` is deployed. Python, databases, exports, tests, and browser profiles never enter that output.

Preview the output locally with `python -m http.server 8777 --bind 127.0.0.1 --directory _site`, then open `http://localhost:8777`. Opening the HTML directly from disk is unsupported.

Optional browser tests: install Playwright separately and set `PLAYWRIGHT_PATH` to its module path; set `CHROME_PATH` to your browser executable if needed. Run `npm run test:browser`. These tests simulate the cloud boundary, while the cloud-store unit tests cover serialization, stale writes, limits, and retries. Live Firebase verification requires the completed configuration and deployed rules.

`server.py`, `start_table.bat`, and the Python tests are retained for legacy SQLite maintenance. The old server requires `FC_ADMIN_HASH` if its legacy API is used; it has no default credential. It is not part of the online deployment. See [LOCAL-VERSION.md](LOCAL-VERSION.md) for historical game documentation and [ART-CREDITS.md](ART-CREDITS.md) for artwork attribution.
