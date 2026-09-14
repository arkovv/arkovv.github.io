#!/usr/bin/env python3
"""
Friends Cards - local table server.

Serves index.html and owns friends-cards.db, a real SQLite database sitting in
this same folder. Standard library only: no pip install, no virtualenv.

    python server.py            (or double-click start_table.bat on Windows)

Binds to 127.0.0.1 only. Nothing is exposed to the network.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import threading
import webbrowser
import time
import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from contextlib import closing
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / "friends-cards.db"
PORT = int(os.environ.get("FC_PORT", "8777"))
MAX_BODY = 32 * 1024 * 1024
ALLOWED_ORIGIN = os.environ.get('FC_ALLOWED_ORIGIN', '').rstrip('/')
ADMIN_USER = os.environ.get('FC_ADMIN_USER', 'arkov')
ADMIN_HASH = os.environ.get('FC_ADMIN_HASH', '')
AUTH_LOCK = threading.Lock()
SESSIONS = {}
LOGIN_ATTEMPTS = []


def password_hash(password):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), b'friends-cards-admin-v1', 600000).hex()

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS players(
    id      INTEGER PRIMARY KEY,
    name    TEXT    NOT NULL,
    credits INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS sets(
    id         INTEGER PRIMARY KEY,
    ordinal    INTEGER NOT NULL,
    name       TEXT    NOT NULL,
    state      TEXT    NOT NULL,
    config     TEXT    NOT NULL,
    created_at INTEGER);

CREATE TABLE IF NOT EXISTS set_participants(
    set_id    INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    position  INTEGER NOT NULL,
    PRIMARY KEY(set_id, player_id));

CREATE TABLE IF NOT EXISTS designs(
    id        INTEGER PRIMARY KEY,
    set_id    INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    title     TEXT    NOT NULL,
    meme      TEXT,
    request   TEXT,
    limits    TEXT,
    position  INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS bids(
    set_id    INTEGER NOT NULL,
    bidder_id INTEGER NOT NULL,
    design_id INTEGER NOT NULL,
    amount    INTEGER NOT NULL,
    PRIMARY KEY(set_id, bidder_id, design_id));

CREATE TABLE IF NOT EXISTS bid_locks(
    set_id    INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    locked    INTEGER NOT NULL,
    PRIMARY KEY(set_id, player_id));

CREATE TABLE IF NOT EXISTS defense(
    set_id    INTEGER NOT NULL,
    design_id INTEGER NOT NULL,
    amount    INTEGER NOT NULL,
    PRIMARY KEY(set_id, design_id));

CREATE TABLE IF NOT EXISTS defense_locks(
    set_id    INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    locked    INTEGER NOT NULL,
    PRIMARY KEY(set_id, player_id));

/* One row per finalized set: the frozen market header. */
CREATE TABLE IF NOT EXISTS snapshots(
    set_id        INTEGER PRIMARY KEY,
    total_demand  INTEGER,
    avg_card      REAL,
    avg_author    REAL,
    reward_pool   INTEGER,
    standard_hit  REAL,
    standard_fail REAL,
    fail_reward   INTEGER,
    config        TEXT,
    finalized_at  INTEGER);

/* Frozen per-card market maths. Never rewritten once the set is revealed. */
CREATE TABLE IF NOT EXISTS snapshot_cards(
    set_id               INTEGER NOT NULL,
    design_id            INTEGER NOT NULL,
    demand               INTEGER,
    scarcity             REAL,
    conditional          REAL,
    standard_probability REAL,
    PRIMARY KEY(set_id, design_id));

CREATE TABLE IF NOT EXISTS snapshot_authors(
    set_id     INTEGER NOT NULL,
    author_id  INTEGER NOT NULL,
    demand     INTEGER,
    reward     INTEGER,
    bidder_hit REAL,
    PRIMARY KEY(set_id, author_id));

CREATE TABLE IF NOT EXISTS instances(
    id             INTEGER PRIMARY KEY,
    design_id      INTEGER NOT NULL,
    set_id         INTEGER,
    owner_id       INTEGER,
    puller_id      INTEGER,
    float_value    INTEGER NOT NULL,
    catalog        INTEGER NOT NULL,
    state          TEXT    NOT NULL,
    source         TEXT,
    source_pack_id INTEGER,
    created_at     INTEGER,
    trade_count    INTEGER DEFAULT 0,
    note           TEXT);

CREATE TABLE IF NOT EXISTS packs(
    id               INTEGER PRIMARY KEY,
    type             TEXT NOT NULL,
    set_id           INTEGER,
    author_id        INTEGER,
    origin_bidder_id INTEGER,
    owner_id         INTEGER,
    hit              REAL,
    fail             REAL,
    fail_reward      INTEGER,
    opened           INTEGER DEFAULT 0,
    opened_at        INTEGER,
    created_at       INTEGER,
    trade_count      INTEGER DEFAULT 0);

/* The frozen outcome vector of a single pack, plus the bid profile that earned it. */
CREATE TABLE IF NOT EXISTS pack_cards(
    pack_id       INTEGER NOT NULL,
    design_id     INTEGER NOT NULL,
    conditional   REAL,
    absolute      REAL,
    raw_bid       INTEGER,
    defense       INTEGER,
    effective_bid INTEGER,
    PRIMARY KEY(pack_id, design_id));

CREATE TABLE IF NOT EXISTS ledger(
    id             INTEGER PRIMARY KEY,
    at             INTEGER,
    player_id      INTEGER,
    delta          INTEGER,
    balance_after  INTEGER,
    type           TEXT,
    note           TEXT);

CREATE TABLE IF NOT EXISTS log(
    ord  INTEGER PRIMARY KEY,
    at   INTEGER,
    text TEXT);

CREATE TABLE IF NOT EXISTS weekly(
    ord          INTEGER PRIMARY KEY,
    at           INTEGER,
    amount       INTEGER,
    player_count INTEGER);

CREATE INDEX IF NOT EXISTS ix_designs_set    ON designs(set_id);
CREATE INDEX IF NOT EXISTS ix_instances_own  ON instances(owner_id);
CREATE INDEX IF NOT EXISTS ix_instances_des  ON instances(design_id);
CREATE INDEX IF NOT EXISTS ix_packs_owner    ON packs(owner_id);
CREATE INDEX IF NOT EXISTS ix_ledger_player  ON ledger(player_id);
"""

TABLES = [
    "meta", "players", "sets", "set_participants", "designs", "bids", "bid_locks",
    "defense", "defense_locks", "snapshots", "snapshot_cards", "snapshot_authors",
    "instances", "packs", "pack_cards", "ledger", "log", "weekly",
]

write_lock = threading.Lock()
last_backup = 0.0


def backup_database(force=False):
    """Called under write_lock; SQLite backup includes committed WAL transactions."""
    global last_backup
    if not DB_PATH.exists() or (not force and time.monotonic() - last_backup < 3600):
        return
    folder = DB_PATH.parent / "backups"
    folder.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    target = folder / ("friends-cards-" + stamp + ".db")
    try:
        with closing(sqlite3.connect(str(DB_PATH))) as source, closing(sqlite3.connect(str(target))) as dest:
            source.backup(dest)
        last_backup = time.monotonic()
    except Exception:
        target.unlink(missing_ok=True)
        raise


def validate_state(state):
    if not isinstance(state, dict) or state.get("version") != 1:
        raise ValueError("Expected a version 1 table")
    for key in ("players", "sets", "instances", "packs", "ledger", "log", "weekly"):
        if not isinstance(state.get(key), list) or any(not isinstance(r, dict) for r in state[key]):
            raise ValueError(key + " must be an array of records")
    for key in ("config", "ids", "ui"):
        if not isinstance(state.get(key), dict):
            raise ValueError(key + " must be an object")
    # Reject NaN/Infinity before they can be silently coerced into SQLite values.
    json.dumps(state, allow_nan=False)


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db() -> None:
    with closing(connect()) as con, con:
        con.executescript(SCHEMA)
        for table, columns in {"ledger": {"set_id": "INTEGER"}, "log": {"set_id": "INTEGER", "player_id": "INTEGER", "type": "TEXT"}}.items():
            existing = {r[1] for r in con.execute("PRAGMA table_info(" + table + ")")}
            for name, kind in columns.items():
                if name not in existing:
                    con.execute("ALTER TABLE " + table + " ADD COLUMN " + name + " " + kind)


def as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def as_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# --------------------------------------------------------------------------
# state  ->  database
# --------------------------------------------------------------------------

def write_state(state: dict, force_backup=False) -> None:
    """Replace the stored table with `state`, atomically."""
    validate_state(state)
    with write_lock:
        backup_database(force_backup)
        _write_state(state)


def _write_state(state):
    with closing(connect()) as con, con:
        con.execute("BEGIN IMMEDIATE")
        for table in TABLES:
            con.execute("DELETE FROM " + table)

        for key in ("config", "ids", "ui"):
            con.execute(
                "INSERT INTO meta(key, value) VALUES(?,?)",
                (key, json.dumps(state.get(key) or {})),
            )
        con.execute(
            "INSERT INTO meta(key, value) VALUES(?,?)",
            ("version", json.dumps(state.get("version", 1))),
        )

        con.executemany(
            "INSERT INTO players(id, name, credits) VALUES(?,?,?)",
            [(as_int(p.get("id")), str(p.get("name", "")), as_int(p.get("credits")))
             for p in state.get("players") or []],
        )

        for game_set in state.get("sets") or []:
            set_id = as_int(game_set.get("id"))
            con.execute(
                "INSERT INTO sets(id, ordinal, name, state, config, created_at) VALUES(?,?,?,?,?,?)",
                (set_id, as_int(game_set.get("ordinal")), str(game_set.get("name", "")),
                 str(game_set.get("state", "DRAFT")), json.dumps(game_set.get("config") or {}),
                 as_int(game_set.get("createdAt"))),
            )
            con.executemany(
                "INSERT INTO set_participants(set_id, player_id, position) VALUES(?,?,?)",
                [(set_id, as_int(pid), i) for i, pid in enumerate(game_set.get("participants") or [])],
            )
            con.executemany(
                "INSERT INTO designs(id, set_id, author_id, title, meme, request, limits, position)"
                " VALUES(?,?,?,?,?,?,?,?)",
                [(as_int(d.get("id")), set_id, as_int(d.get("authorId")), str(d.get("title", "")),
                  str(d.get("meme", "")), str(d.get("request", "")), str(d.get("limits", "")), i)
                 for i, d in enumerate(game_set.get("designs") or [])],
            )

            bid_rows, lock_rows = [], []
            for bidder_id, row in (game_set.get("bids") or {}).items():
                for design_id, amount in (row or {}).items():
                    bid_rows.append((set_id, as_int(bidder_id), as_int(design_id), as_int(amount)))
            for player_id, locked in (game_set.get("locked") or {}).items():
                lock_rows.append((set_id, as_int(player_id), 1 if locked else 0))
            con.executemany(
                "INSERT OR REPLACE INTO bids(set_id, bidder_id, design_id, amount) VALUES(?,?,?,?)", bid_rows)
            con.executemany(
                "INSERT OR REPLACE INTO bid_locks(set_id, player_id, locked) VALUES(?,?,?)", lock_rows)

            con.executemany(
                "INSERT OR REPLACE INTO defense(set_id, design_id, amount) VALUES(?,?,?)",
                [(set_id, as_int(k), as_int(v)) for k, v in (game_set.get("defense") or {}).items()],
            )
            con.executemany(
                "INSERT OR REPLACE INTO defense_locks(set_id, player_id, locked) VALUES(?,?,?)",
                [(set_id, as_int(k), 1 if v else 0) for k, v in (game_set.get("defLocked") or {}).items()],
            )

            snap = game_set.get("snapshot")
            if snap:
                standard = snap.get("standard") or {}
                con.execute(
                    "INSERT INTO snapshots(set_id, total_demand, avg_card, avg_author, reward_pool,"
                    " standard_hit, standard_fail, fail_reward, config, finalized_at)"
                    " VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (set_id, as_int(snap.get("totalDemand")), as_float(snap.get("avgCard")),
                     as_float(snap.get("avgAuthor")), as_int(snap.get("rewardPool")),
                     as_float(standard.get("hit")), as_float(standard.get("fail")),
                     as_int(standard.get("failReward")), json.dumps(snap.get("config") or {}),
                     as_int(snap.get("finalizedAt"))),
                )
                demand = snap.get("demand") or {}
                scarcity = snap.get("scarcity") or {}
                conditional = standard.get("conditional") or {}
                cards = standard.get("cards") or {}
                design_ids = set(demand) | set(scarcity) | set(conditional) | set(cards)
                con.executemany(
                    "INSERT OR REPLACE INTO snapshot_cards(set_id, design_id, demand, scarcity,"
                    " conditional, standard_probability) VALUES(?,?,?,?,?,?)",
                    [(set_id, as_int(did), as_int(demand.get(did)), as_float(scarcity.get(did)),
                      as_float(conditional.get(did)), as_float(cards.get(did))) for did in design_ids],
                )
                author_demand = snap.get("authorDemand") or {}
                rewards = snap.get("rewards") or {}
                author_hit = snap.get("authorHit") or {}
                author_ids = set(author_demand) | set(rewards) | set(author_hit)
                con.executemany(
                    "INSERT OR REPLACE INTO snapshot_authors(set_id, author_id, demand, reward, bidder_hit)"
                    " VALUES(?,?,?,?,?)",
                    [(set_id, as_int(aid), as_int(author_demand.get(aid)), as_int(rewards.get(aid)),
                      as_float(author_hit.get(aid))) for aid in author_ids],
                )

        con.executemany(
            "INSERT INTO instances(id, design_id, set_id, owner_id, puller_id, float_value, catalog,"
            " state, source, source_pack_id, created_at, trade_count, note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(as_int(i.get("id")), as_int(i.get("designId")), as_int(i.get("setId")),
              as_int(i.get("ownerId")), as_int(i.get("pullerId")), as_int(i.get("floatValue")),
              as_int(i.get("catalog")), str(i.get("state", "ACTIVE")), str(i.get("source", "")),
              i.get("sourcePackId") if i.get("sourcePackId") is None else as_int(i.get("sourcePackId")),
              as_int(i.get("createdAt")), as_int(i.get("tradeCount")), str(i.get("note", "")))
             for i in state.get("instances") or []],
        )

        for pack in state.get("packs") or []:
            pack_id = as_int(pack.get("id"))
            odds = pack.get("odds") or {}
            con.execute(
                "INSERT INTO packs(id, type, set_id, author_id, origin_bidder_id, owner_id, hit, fail,"
                " fail_reward, opened, opened_at, created_at, trade_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (pack_id, str(pack.get("type", "")), as_int(pack.get("setId")),
                 None if pack.get("authorId") in (None, "") else as_int(pack.get("authorId")),
                 None if pack.get("originBidderId") in (None, "") else as_int(pack.get("originBidderId")),
                 as_int(pack.get("ownerId")), as_float(odds.get("hit")), as_float(odds.get("fail")),
                 as_int(odds.get("failReward")), 1 if pack.get("opened") else 0,
                 as_int(pack.get("openedAt")) or None, as_int(pack.get("createdAt")),
                 as_int(pack.get("tradeCount"))),
            )
            conditional = odds.get("conditional") or {}
            cards = odds.get("cards") or {}
            raw = pack.get("raw") or {}
            defense = pack.get("defense") or {}
            effective = pack.get("effective") or {}
            design_ids = set(conditional) | set(cards) | set(raw)
            con.executemany(
                "INSERT OR REPLACE INTO pack_cards(pack_id, design_id, conditional, absolute,"
                " raw_bid, defense, effective_bid) VALUES(?,?,?,?,?,?,?)",
                [(pack_id, as_int(did), as_float(conditional.get(did)), as_float(cards.get(did)),
                  as_int(raw.get(did)), as_int(defense.get(did)), as_int(effective.get(did)))
                 for did in design_ids],
            )

        con.executemany(
            "INSERT INTO ledger(id, at, player_id, delta, balance_after, type, note, set_id) VALUES(?,?,?,?,?,?,?,?)",
            [(as_int(l.get("id")), as_int(l.get("at")), as_int(l.get("playerId")), as_int(l.get("delta")),
              as_int(l.get("after")), str(l.get("type", "")), str(l.get("note", "")), l.get("setId"))
             for l in state.get("ledger") or []],
        )
        con.executemany(
            "INSERT INTO log(ord, at, text, set_id, player_id, type) VALUES(?,?,?,?,?,?)",
            [(i, as_int(e.get("at")), str(e.get("text", "")), e.get("setId"), e.get("playerId"), e.get("type")) for i, e in enumerate(state.get("log") or [])],
        )
        con.executemany(
            "INSERT INTO weekly(ord, at, amount, player_count) VALUES(?,?,?,?)",
            [(i, as_int(w.get("at")), as_int(w.get("amount")), as_int(w.get("count")))
             for i, w in enumerate(state.get("weekly") or [])],
        )


# --------------------------------------------------------------------------
# database  ->  state
# --------------------------------------------------------------------------

def read_state() -> dict:
    with closing(connect()) as con, con:
        con.execute("BEGIN")
        meta = {row["key"]: json.loads(row["value"]) for row in con.execute("SELECT key, value FROM meta")}
        state = {
            "version": meta.get("version", 1),
            "config": meta.get("config") or {},
            "ids": meta.get("ids") or {},
            "ui": meta.get("ui") or {},
            "players": [], "sets": [], "instances": [], "packs": [],
            "ledger": [], "log": [], "weekly": [],
        }

        state["players"] = [
            {"id": r["id"], "name": r["name"], "credits": r["credits"]}
            for r in con.execute("SELECT * FROM players ORDER BY id")
        ]

        for r in con.execute("SELECT * FROM sets ORDER BY ordinal"):
            set_id = r["id"]
            game_set = {
                "id": set_id, "ordinal": r["ordinal"], "name": r["name"], "state": r["state"],
                "config": json.loads(r["config"]), "createdAt": r["created_at"],
                "participants": [], "designs": [], "bids": {}, "locked": {},
                "defense": {}, "defLocked": {}, "snapshot": None,
            }
            game_set["participants"] = [
                row["player_id"] for row in con.execute(
                    "SELECT player_id FROM set_participants WHERE set_id=? ORDER BY position", (set_id,))
            ]
            game_set["designs"] = [
                {"id": d["id"], "authorId": d["author_id"], "title": d["title"],
                 "meme": d["meme"] or "", "request": d["request"] or "", "limits": d["limits"] or ""}
                for d in con.execute("SELECT * FROM designs WHERE set_id=? ORDER BY position", (set_id,))
            ]
            for b in con.execute("SELECT * FROM bids WHERE set_id=?", (set_id,)):
                game_set["bids"].setdefault(str(b["bidder_id"]), {})[str(b["design_id"])] = b["amount"]
            for pid in game_set["participants"]:
                game_set["bids"].setdefault(str(pid), {})
            for row in con.execute("SELECT * FROM bid_locks WHERE set_id=?", (set_id,)):
                game_set["locked"][str(row["player_id"])] = bool(row["locked"])
            for row in con.execute("SELECT * FROM defense WHERE set_id=?", (set_id,)):
                game_set["defense"][str(row["design_id"])] = row["amount"]
            for row in con.execute("SELECT * FROM defense_locks WHERE set_id=?", (set_id,)):
                game_set["defLocked"][str(row["player_id"])] = bool(row["locked"])

            snap_row = con.execute("SELECT * FROM snapshots WHERE set_id=?", (set_id,)).fetchone()
            if snap_row:
                demand, scarcity, conditional, cards = {}, {}, {}, {}
                for row in con.execute("SELECT * FROM snapshot_cards WHERE set_id=?", (set_id,)):
                    key = str(row["design_id"])
                    demand[key] = row["demand"]
                    scarcity[key] = row["scarcity"]
                    conditional[key] = row["conditional"]
                    cards[key] = row["standard_probability"]
                author_demand, rewards, author_hit = {}, {}, {}
                for row in con.execute("SELECT * FROM snapshot_authors WHERE set_id=?", (set_id,)):
                    key = str(row["author_id"])
                    author_demand[key] = row["demand"]
                    rewards[key] = row["reward"]
                    author_hit[key] = row["bidder_hit"]
                game_set["snapshot"] = {
                    "totalDemand": snap_row["total_demand"],
                    "avgCard": snap_row["avg_card"],
                    "avgAuthor": snap_row["avg_author"],
                    "rewardPool": snap_row["reward_pool"],
                    "demand": demand, "scarcity": scarcity,
                    "authorDemand": author_demand, "rewards": rewards, "authorHit": author_hit,
                    "standard": {
                        "hit": snap_row["standard_hit"], "fail": snap_row["standard_fail"],
                        "conditional": conditional, "cards": cards,
                        "failReward": snap_row["fail_reward"],
                    },
                    "config": json.loads(snap_row["config"]),
                    "finalizedAt": snap_row["finalized_at"],
                }
            state["sets"].append(game_set)

        state["instances"] = [
            {"id": r["id"], "designId": r["design_id"], "setId": r["set_id"], "ownerId": r["owner_id"],
             "pullerId": r["puller_id"], "floatValue": r["float_value"], "catalog": r["catalog"],
             "state": r["state"], "source": r["source"], "sourcePackId": r["source_pack_id"],
             "createdAt": r["created_at"], "tradeCount": r["trade_count"], "note": r["note"] or ""}
            for r in con.execute("SELECT * FROM instances ORDER BY id")
        ]

        for r in con.execute("SELECT * FROM packs ORDER BY id"):
            conditional, cards, raw, defense, effective = {}, {}, {}, {}, {}
            for row in con.execute("SELECT * FROM pack_cards WHERE pack_id=?", (r["id"],)):
                key = str(row["design_id"])
                conditional[key] = row["conditional"]
                cards[key] = row["absolute"]
                if r["type"] == "BIDDER":
                    raw[key] = row["raw_bid"]
                    defense[key] = row["defense"]
                    effective[key] = row["effective_bid"]
            state["packs"].append({
                "id": r["id"], "type": r["type"], "setId": r["set_id"], "authorId": r["author_id"],
                "originBidderId": r["origin_bidder_id"], "ownerId": r["owner_id"],
                "odds": {"hit": r["hit"], "fail": r["fail"], "conditional": conditional,
                         "cards": cards, "failReward": r["fail_reward"]},
                "raw": raw, "defense": defense, "effective": effective,
                "opened": bool(r["opened"]), "openedAt": r["opened_at"],
                "createdAt": r["created_at"], "tradeCount": r["trade_count"],
            })

        state["ledger"] = [
            {"id": r["id"], "at": r["at"], "playerId": r["player_id"], "delta": r["delta"],
             "after": r["balance_after"], "type": r["type"], "note": r["note"] or ""}
            for r in con.execute("SELECT * FROM ledger ORDER BY id DESC")
        ]
        state["log"] = [
            {"at": r["at"], "text": r["text"]}
            for r in con.execute("SELECT * FROM log ORDER BY ord")
        ]
        state["weekly"] = [
            {"at": r["at"], "amount": r["amount"], "count": r["player_count"]}
            for r in con.execute("SELECT * FROM weekly ORDER BY ord")
        ]
        for item, row in zip(state["ledger"], con.execute("SELECT set_id FROM ledger ORDER BY id DESC")):
            if row[0] is not None:
                item["setId"] = row[0]
        for item, row in zip(state["log"], con.execute("SELECT set_id, player_id, type FROM log ORDER BY ord")):
            for key, value in zip(("setId", "playerId", "type"), row):
                if value is not None:
                    item[key] = value
        return state


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Handler(SimpleHTTPRequestHandler):
    server_version = "FriendsCardsLocal/1.0"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        if ALLOWED_ORIGIN and self.headers.get('Origin') == ALLOWED_ORIGIN:
            self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
            self.send_header('Vary', 'Origin')
        super().end_headers()

    def do_OPTIONS(self):
        if not ALLOWED_ORIGIN or self.headers.get('Origin') != ALLOWED_ORIGIN:
            self._json({'error': 'Origin not allowed'}, 403)
            return
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Backup-Before-Save')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def authenticated(self):
        authorization = self.headers.get('Authorization', '')
        token = authorization[7:] if authorization.startswith('Bearer ') else ''
        with AUTH_LOCK:
            now = time.monotonic()
            for expired in [key for key, expiry in SESSIONS.items() if expiry <= now]:
                del SESSIONS[expired]
            valid = token in SESSIONS
        if not valid:
            self._json({'error': 'Admin sign in required'}, 401)
        return valid

    def login(self):
        length = as_int(self.headers.get('Content-Length'), -1)
        if length < 0 or length > 4096:
            self._json({'error': 'Invalid login request'}, 400)
            return
        with AUTH_LOCK:
            now = time.monotonic()
            LOGIN_ATTEMPTS[:] = [stamp for stamp in LOGIN_ATTEMPTS if stamp > now - 60]
            if len(LOGIN_ATTEMPTS) >= 10:
                self._json({'error': 'Try again in a minute'}, 429)
                return
            LOGIN_ATTEMPTS.append(now)
        try:
            credentials = json.loads(self.rfile.read(length))
            username, password = credentials['username'], credentials['password']
            if not isinstance(username, str) or not isinstance(password, str):
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            self._json({'error': 'Invalid login request'}, 400)
            return
        correct_password = hmac.compare_digest(password_hash(password), ADMIN_HASH)
        if username != ADMIN_USER or not correct_password:
            self._json({'error': 'Invalid credentials'}, 401)
            return
        token = secrets.token_urlsafe(32)
        with AUTH_LOCK:
            SESSIONS[token] = time.monotonic() + 12 * 60 * 60
        self._json({'token': token, 'role': 'admin'})

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = self.path.split("?")[0]
        if route == "/api/state":
            if not self.authenticated():
                return
            try:
                self._json(read_state())
            except Exception as exc:                      # noqa: BLE001
                self._json({"error": str(exc)}, 500)
            return
        if route == "/favicon.ico":
            # Browsers ask for this unprompted; answer quietly instead of 404ing.
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        # Serve only application assets; database backups and test files stay private.
        assets = {"/", "/index.html", "/styles.css", "/state.js", "/validation.js", "/persistence.js", "/engine.js", "/views.js", "/actions.js", "/enhancements.js", "/app.js", "/card-visuals.js", "/alik-emblem.png"}
        assets.update({'/auth.js', '/site-config.js', '/firebase-client.js', '/cloud-store.mjs', '/session-client.mjs'})
        if route not in assets:
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        route = self.path.split('?')[0]
        if route == '/api/login':
            self.login()
            return
        if route == '/api/logout':
            if not self.authenticated():
                return
            with AUTH_LOCK:
                SESSIONS.pop(self.headers.get('Authorization', '')[7:], None)
            self._json({'ok': True})
            return
        if self.path.split("?")[0] != "/api/state":
            self.send_error(404)
            return
        if not self.authenticated():
            return
        length = as_int(self.headers.get("Content-Length"), -1)
        if length < 0 or length > MAX_BODY:
            self._json({"error": "bad content length"}, 400)
            return
        try:
            state = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(state, dict):
                raise ValueError("state must be an object")
            write_state(state, self.headers.get("X-Backup-Before-Save") == "yes")
            self._json({"ok": True})
        except Exception as exc:                          # noqa: BLE001
            self._json({"error": str(exc)}, 400)

    def log_message(self, fmt, *args):
        # args[0] is a request line for access logs but an HTTPStatus for errors,
        # so everything gets stringified before it is inspected.
        first = str(args[0]) if args else ""
        if "/api/state" in first:
            return                                        # keep the console readable
        super().log_message(fmt, *args)


def main() -> int:
    with write_lock:
        backup_database(force=True)
    init_db()
    handler = partial(Handler, directory=str(HERE))
    try:
        httpd = ThreadingHTTPServer((os.environ.get('FC_HOST', '127.0.0.1'), PORT), handler)
    except OSError as exc:
        print("\n[ERROR] Could not bind port %d: %s" % (PORT, exc))
        print("Another copy may already be running. Close it, or set FC_PORT to a free port.\n")
        return 1

    url = "http://127.0.0.1:%d/index.html" % PORT
    print("")
    print("  Friends Cards - local table")
    print("  ---------------------------")
    print("  Table:    %s" % url)
    print("  Database: %s" % DB_PATH)
    print("")
    print("  Everything saves straight into that .db file.")
    print("  Close this window (or press Ctrl+C) to stop.")
    print("")
    sys.stdout.flush()   # visible even when the console output is redirected
    if os.environ.get('FC_NO_BROWSER') != '1':
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped. Your table is saved in %s\n" % DB_PATH.name)
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
