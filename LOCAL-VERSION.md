# Original local version reference

> Historical documentation for the original Python/SQLite app. The current browser frontend uses Firebase; follow [README.md](README.md) and [HOSTING.md](HOSTING.md) for current setup. Direct-file play and the original local saving behavior described below no longer apply to the current frontend.

A local version of the game for one host running everything on a shared screen. Use one active browser tab to edit a table at a time.

No accounts, no external services, no build step, and no Python packages to install. Python 3 is needed for database mode; direct-file mode needs only a browser.

---

## Running it

**Double-click `start_table.bat`.**

It starts a tiny Python server (standard library only — no pip, no virtualenv), opens your browser,
and keeps the whole game in **`friends-cards.db`**, a real SQLite file sitting right here in this
folder. Close the console window to stop.

On anything other than Windows, or from a terminal:

```
python server.py
```

Then open <http://127.0.0.1:8777>. Set `FC_PORT` if 8777 is busy.

There is no login. The host drives the whole table with the **Acting as** selector in the top bar:
switch to a player, do the thing they asked for, switch to the next one.

### Where the data lives

Every action writes straight into `friends-cards.db` — pack opens, bids, defense, trades, crafts,
the ledger, all of it. Writes are batched a few hundred milliseconds apart so dragging a slider
doesn't hammer the disk, and the footer shows `saved to friends-cards.db` once it lands.

Automatic backups are created in `backups/` using SQLite’s backup API, including committed WAL data. A backup is made before startup migration, before the first eligible write each hour, and before an import, wipe, demo replacement, restore, reveal, or close. Backup files are timestamped in UTC and retained until you remove them. A failed backup prevents that database write and the browser offers retry/export.

For a manual database copy, stop the server and confirm there is no remaining nonempty WAL; otherwise retain the `.db`, `-wal`, and `-shm` together. The automatic `.db` backups are standalone files. To move to another machine,
copy the whole folder. To look inside, open it in any SQLite browser — the schema is normalised and
meant to be read:

```sql
-- who the market made rich
SELECT p.name, sa.demand, sa.reward
FROM snapshot_authors sa JOIN players p ON p.id = sa.author_id
ORDER BY sa.reward DESC;

-- the scarcest requests and their real pack chance
SELECT p.name, d.title, sc.demand, sc.scarcity,
       ROUND(sc.standard_probability * 100, 4) AS pack_pct
FROM snapshot_cards sc
JOIN designs d ON d.id = sc.design_id
JOIN players p ON p.id = d.author_id
ORDER BY sc.demand DESC;

-- every card in play, in duplicate-collision order
SELECT i.id, d.title, i.float_value, i.catalog, i.state
FROM instances i JOIN designs d ON d.id = i.design_id
ORDER BY i.float_value, i.catalog;
```

`friends-cards.db-wal` and `-shm` next to it are SQLite's journal files. Leave them together with the database; abrupt shutdown can leave committed data in the WAL.

Tables: `players`, `sets`, `set_participants`, `designs`, `bids`, `bid_locks`, `defense`,
`defense_locks`, `snapshots`, `snapshot_cards`, `snapshot_authors`, `instances`, `packs`,
`pack_cards`, `ledger`, `log`, `weekly`, `meta`.

`snapshot_*` and `pack_cards` hold the frozen market — the demand, scarcity, per-card probability and
bid/defense/effective-bid profile that were locked in at reveal. Those rows are the historical record;
nothing rewrites them later.

### Opening index.html directly still works

If you double-click `index.html` instead of the launcher, the game runs exactly the same but falls
back to your browser's local storage, and Setup says so. The first time you then start the server,
you are offered a preview before moving your existing browser table into an empty `friends-cards.db`.

**Export backup** / **Import backup** in Setup write and read a plain `.json` file either way, so you
always have a portable copy that doesn't depend on Python or on a browser profile.

---

## The loop

1. **Setup** — add the friends, then add three requests per person. Each request is a real, scoped
   promise that person has agreed to honour. (Three is the **Cards per player** knob under Economy;
   change it there and every formula follows along.)
2. **Auction** — every player gets 100 Desire Tokens and spends them on *other people's* requests.
   Hand the machine round; each allocation is locked and stays sealed.
3. **Defense** — each author spreads a defense budget across their own three cards, seeing only how
   much desire each attracted, never who bid. Or press **Skip defense entirely**.
4. **Reveal** — the market is computed once and frozen forever. Authors get paid, and every bidder
   who breached someone's defense gets one sealed pack for that author.
5. **Shop** — players spend Credits on packs. The reel lands on a result that was already rolled.
6. **Public Market** — the shared board: what the group wanted, what it did to scarcity, who got paid.
7. **Players** — press **Distribute weekly reward** once a week. Nothing runs on a timer.

Close a set when you are done with it. Closed sets become the source of Legacy Packs in later sets.

---

## What each screen does

| Screen | For |
| --- | --- |
| **Setup** | Roster, economy knobs, sets, and the three requests per person. Demo table, export/import, wipe. |
| **Auction** | Sealed 100-token bidding, then defense, then reveal. The chips at the top track who has locked in. |
| **Shop** | Buy a Standard Pack, open bidder/legacy/reclaimed packs, see exact frozen odds, watch the reel. |
| **Public Market** | Demand per card, scarcity, pack chance, author payouts, the breach board, and a trading post. |
| **Cards** | Every instance with its permanent float and catalog number, filters, inspection, and crafting. |
| **Players** | Wallets, the weekly reward button, Credit adjustments, card issuing, ledger and table log. |

### Where Credits come from

Every Credit movement is a row in the ledger on the **Players** screen, with a type saying why:

| Type | Meaning |
| --- | --- |
| `SET_MARKET_REWARD` | The reveal payout. Across all authors this totals exactly `N × 400`. |
| `WEEKLY_REWARD` | The weekly button. |
| `DEMO_BANKROLL` | Only from **Load 8-friend demo** — one set's expected budget (800 C) so the Shop has something to spend on straight away. Real tables start every player at 0. |
| `STANDARD_PACK_PURCHASE` / `STANDARD_FAIL_REFUND` | Buying and failing a pack. |
| `BIDDER_FAIL_REWARD` / `LEGACY_FAIL_REWARD` | A special pack that produced no card. |
| `TRADE_TRANSFER` | The trading post. |
| `HOST_GRANT` / `HOST_TAKE` | Manual corrections, with the reason you typed. |

If a balance ever looks wrong, the ledger says exactly where it came from — nothing changes a balance
without writing a row.

### Screen-sharing helpers

- **Blur bid amounts** (footer) hides allocation numbers behind a blur; hover to read them. Useful when
  the person bidding is standing next to a room that shouldn't see the totals.
- **Sound** toggles the reel ticks.
- Press **Escape** or click the reel to skip an animation.

---

## The maths it implements

All of it runs locally and is frozen into the set the moment you press reveal. Changing the economy
knobs later never moves a historical number.

Given bids `b_ic` from bidder *i* on card *c*:

```
D_c  = Σ_i b_ic                      desire on a card
D_a  = Σ_{c∈a} D_c                   desire on an author
D̄_c = ΣD / M      D̄_a = ΣD / N      averages over cards and players
```

**Author income** — from raw desire only. Defense never adds a Credit.

```
R_a = R_avg · D_a / D̄_a
```
integerised by largest remainder so the pool is exactly `N × R_avg` (8 × 400 = 3200).

**Scarcity** — continuous, no rarity tiers.

```
S_c = (1 + D_c / D̄_c) ^ −exponent          exponent = 2
```

**Standard Pack** — the hit rate is derived from the budget, never hard-coded.

```
B = R_avg + weekly × refills = 400 + 100×4 = 800
h = T(C − F) / (B − T·F) = 4(50 − 10) / (800 − 40) = 4/19 ≈ 21.0526%
q_c = S_c / Σ S_j                P(c) = h · q_c            P(fail) = 1 − h
```

**Defense and breaches** — equal values do *not* breach.

```
e_ic = b_ic   if b_ic > d_c
     = 0      otherwise
```

A blocked bid still counts toward `D_c`, toward author income, and toward the historical record.
It simply buys no personal weighting. This is what stops the "99 on the protected card, 1 on the
junk card" exploit: breaching the junk card still earns the pack, but the protected card falls back
to its baseline chance.

**Original Bidder Pack** — one per bidder per author, however many cards they breached.

```
h_a  = 1 / (1 + D_a / D̄_a)
M_ic = G ^ (e_ic / B_D)                    G = 6
W_ic = S_c · M_ic          q_ic = W_ic / Σ_j W_ij          P_i(c) = h_a · q_ic
```

Odds are frozen at creation. Moving a pack in the trading post never changes them.

**Legacy Packs** — only ever rolled on a *current* Standard failure, at 20%, and never recursively.

```
L_s = 1 / (k − s) ^ γ          γ = 1
```

The pack opens on its original set's frozen odds and refund.

**Crafting** — three identical ACTIVE copies become one card of strictly greater original desire,
drawn from the same historical scarcity weights restricted to the higher-demand pool. Three REDEEMED
cards of yourself from one set become a Reclaimed Pack with `M_c = 1` — the author hit rate with no
personal boost.

**Instances** — float is a `0…100000` integer shown at five decimals, catalog is `000…999`. Both come
from `crypto.getRandomValues` at creation and never change. When two copies of the same request
collide, lowest float wins, then lowest catalog.

---

## The pack animation

The outcome is rolled first, from the frozen probability vector, using the same crypto RNG as
everything else. Only then is the reel built: fifty-odd tiles **sampled from that same distribution**,
with the already-decided result dropped into the landing slot.

So the strip you watch really is a picture of the odds — a 21% hit rate means roughly one in five
tiles is a card — and the tile under the marker is the result that was always going to happen. The
animation cannot change it, and there is no way to re-roll a finished open. Tile colour is cosmetic
and ranked relative to the other cards in that pack: the most common card is dark blue, the
second-rarest is neon red, and the rarest is golden yellow, with a smooth blue-to-red transition
between the remaining cards. It does not change the frozen odds or create a gameplay rarity tier.

If the tab is backgrounded or the animation is interrupted, the result appears anyway.

---

## Deliberately not included

This build is the shared-screen core, not the full product. There is no login, no per-player device,
no sealed-envelope guarantee beyond the host's own discipline, and no dispute/vote workflow — when
a redemption is argued about, the room argues about it and the host presses the button. Redeeming is
a single **Mark the promise redeemed** action with a note that stays on the card forever.

Trades are recorded rather than negotiated: the table agrees out loud, the host moves the item.

---

## Files

```
local-only/
├─ start_table.bat    double-click this
├─ server.py          local HTTP server, SQLite persistence and backups
├─ index.html         page shell
├─ styles.css         shared-screen, mobile and accessibility styles
├─ state.js           configuration and state factories
├─ validation.js      backup validation
├─ persistence.js     serialized saves, retry and recovery
├─ engine.js          randomness, economy math and gameplay
├─ views.js           screens and pack animation
├─ actions.js         host actions and demo setup
├─ enhancements.js    guidance, history, previews and keyboard support
├─ app.js             event wiring and guarded startup
├─ tests/             regression checks and original source reference
├─ backups/           automatic standalone SQLite backups (created at runtime)
├─ friends-cards.db   your table (created on first run)
└─ README.md          this file
```

Nothing is written outside this folder, and nothing ever leaves the machine — the server binds to
`127.0.0.1` only.


## Reliability and host improvements

The footer reports the actual save state. Database writes run one at a time and failed writes retry with a delay increasing to 30 seconds. **Retry save** retries immediately; **Export unsaved table** downloads the current state. Closing with unacknowledged changes triggers the browser’s unsaved-changes warning. A browser recovery copy is kept while database saves are pending; the next startup offers to download or restore it. If the database cannot be loaded, editing stays paused rather than switching to an unrelated browser table.

**Import backup** checks version, record types, IDs, references, serial ranges, and frozen probabilities before showing the incoming roster and counts. Cancellation or invalid input leaves the table intact. **Restore previous table** swaps back to the browser copy kept before a replacement. In database mode, the server also makes a standalone backup before replacement. Browser recovery depends on available browser storage; automatic SQLite backups are independent of browser storage.

To restore an automatic SQLite backup, stop the server, move the current database and any companion WAL/SHM files into a separate folder for safekeeping, and copy the chosen backup here as `friends-cards.db`. Then restart the server. Do not combine a restored database with a WAL from a different database.

Each screen has stage guidance without revealing sealed bid amounts. Reveal previews list author payouts and the number of bidder packs before applying the original rules. The Players screen filters all retained ledger and log entries by player, set, action, local date, and note text. CSV exports use those filters and neutralize spreadsheet formulas in text. New log entries identify the acting player and host action; old logs lack this metadata, so use text search for them. Set filtering can recognize old notes containing “Set N”. Existing retention limits remain 2,000 ledger entries and 600 log entries.

Keyboard users can skip to the main content, operate card tiles, and navigate dialogs with focus contained inside them. Escape settles an active reel first and closes details on the next press. System reduced-motion preferences show the already-rolled result immediately. Wide tables scroll horizontally within their panels on small screens.

## Verification

All test databases, browser profiles, and test outputs stay under `tests/`. Tests never open the live database for writing.

```
node tests/regression.cjs
python -B -m unittest discover -s tests -p test_server.py -v
node tests/browser.cjs
```

Run the regression script first to generate the demo fixture used by the other tests. Browser checks need Playwright and Chrome; `PLAYWRIGHT_PATH` and `CHROME_PATH` can point to existing installations. They are test tools only, not game dependencies. The original HTML is retained at `tests/original-index.html` for deterministic comparisons of market results and pack rolls.

The HTTP server serves only the app assets and state endpoint. Database files, backups, source references, and test artifacts cannot be downloaded through it. This remains a trusted, single-host local app with no account system.

## Celestial card finishes

Existing cards now receive deterministic constellation engravings, author emblems, and foil colors. `card-visuals.js` derives the artwork from the set, design, instance, float, and catalog identifiers; author IDs determine the shared emblem, palette, and pattern family. The visual algorithm is versioned as `card-v1` / `author-v1`. Renaming players, trading cards, and changing redemption notes do not change their artwork. Colors and patterns indicate neither rarity nor gameplay strength.

No visual fields are added to saved state or the database. A separate seeded generator draws the decorative details without calling the game's random functions. Database and JSON backups already contain everything needed to reproduce the appearance with this visual version.

Open **Cards**, then select a card to inspect it. Move the pointer or drag horizontally across the surface for foil and tilt. **Flip to details** shows the existing request, limits, market odds, provenance, and redemption controls; flip back for the art. Keyboard users can operate the flip and close buttons, and reduced-motion preferences disable tilt and animated turns. All graphics are local SVG/CSS with no downloaded assets.

After updating, restart the Python server so it can serve the new `card-visuals.js` asset, then refresh the page. Direct-file mode continues to work.

Azat's local author ID (`2`) has an Itachi / Amaterasu override in `authorSignature()`: a Mangekyō Sharingan emblem, crimson foil, and seeded black flames with violet edges. It applies to cards **authored** by Azat, including traded copies, without altering database records. Other authors retain their existing finishes. Flames respond to pointer interaction and remain still under reduced-motion preferences. Emblem attribution and licensing are in [ART-CREDITS.md](ART-CREDITS.md).


### Azat’s float-dependent backgrounds

The author emblem is fixed independently of a card’s finish. All of Azat’s cards keep the same central Itachi eye. `cardFinish()` selects only the background from the existing integer float:

| Displayed float | Background |
| --- | --- |
| 0.50000–1.00000 | Falling leaves |
| 0.20000–0.49999 | Akatsuki red clouds |
| 0.00000–0.19999 | Amaterasu black flames |

This includes floats below 0.001 in Amaterasu. Exact boundary values of 0.5 and 0.2 belong to Falling leaves and Akatsuki respectively.

The cosmetic blindness intensity is `1 - sqrt(float)`, increasing continuously as the float decreases. Inky blackening darkens the artwork and eye; saturated violet, magenta, and teal foil moves across the black surface. The title, serials, promise details and controls stay readable. Falling leaves replace the earlier fireball finish. Reduced-motion settings retain the static finish but disable falling leaves, moving blackening, and foil drift. No float, probability, database field, or author emblem is changed. Other authors keep their existing visuals; this finish selection is separate from author identity for future customizations.

Reflection patterns are now seeded independently per card and grouped by finish: falling leaves use green/teal directional streaks, Akatsuki uses crimson/plum cloud contours, and Amaterasu uses violet/cyan fractured facets. Angle, placement, spacing, scale, animation duration, and phase vary deterministically with the existing card identifiers. The same card keeps its reflection after reloads and trades. Falling leaves use only dark-green shades.

Alik (local author ID `1`) uses the exact user-provided `alik-emblem.png` as his permanent central emblem, with a black/red cyberpunk base and cyan frame details. The original image is copied without pixel edits. Restart the server after this update so the new local image is served.

### Alik’s terminal, pixel foil and secret 999

Alik keeps one 92px central emblem in the same position on every card. Catalogs 000–998 increase terminal rows, symbols and typing speed. Seeded pixel numerals fade beneath cyan, violet, magenta and amber holography. Float 0.5 and above is the baseline; below 0.5, saturation, contrast, pixel visibility and glow increase continuously to float 0. The numeric foil covers the full card behind the emblem and typography. Pointer movement or touch dragging moves a shared light source: pixel numbers brighten near it and fade away from it while the holographic spectrum shifts with the same coordinates. Essential text retains dark contrast shadows.

Alik’s catalog 999 retains its central emblem, author, title, float, catalog and state on a borderless black surface, with no terminal, hologram, glow or hover tilt. A huge monospace `silence is deafening?` fills the top half and types once per rendered card, with uneven character delays and pauses between words. Flip still exposes the promise, limits, history and controls. Reduced motion shows the complete phrase immediately and freezes decorative animation. All variation uses existing card data; database records and gameplay RNG remain unchanged.

### Kadyr’s Doppler finish

Author ID 5 keeps his original central emblem. Catalogue 000–998 determines green coverage as catalogue / 20 percent; 999 is the all-green Emerald exception. The remaining finish is predominantly blue, with indigo shadows. A seeded marble field allocates the green share across 8,000 equal surface cells before smoothing and lighting. Coverage describes the underlying finish, before the emblem and text overlay it. The catalogue alone seeds the pattern; float, owner, instance ID and trades do not affect it. Pointer/touch foil highlights share the existing interaction and reduced-motion behavior. No database or gameplay changes.

Doppler lighting follows a browser approximation of the colored candy coat over chrome described in [Valve’s finish guide](https://www.counter-strike.net/workshop/workshopfinishes). A dark pigment pass and a brighter, identically patterned reflection pass simulate tinted metallic reflections, with broad environment light, narrow highlights and stronger reflection at grazing angles. These respond only to pointer/touch input. Kadyr’s cards have no hover tilt or idle animation. This is a CSS/SVG approximation, not the Source 2 renderer.
