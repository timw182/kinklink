from contextlib import asynccontextmanager
import aiosqlite
import os

DB_PATH = os.environ.get("DB_PATH", "venn.db")


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")
        yield db
    finally:
        await db.close()


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")

        await db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                username     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT,
                display_name TEXT    NOT NULL,
                avatar_color TEXT    NOT NULL DEFAULT '#C4754B',
                email        TEXT,
                couple_id    INTEGER REFERENCES couples(id),
                last_disconnected_at TEXT,
                pairing_code TEXT    UNIQUE,
                pairing_code_expires_at TEXT,
                is_admin     INTEGER NOT NULL DEFAULT 0,
                is_superadmin INTEGER NOT NULL DEFAULT 0,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS couples (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                user_a_id INTEGER NOT NULL REFERENCES users(id),
                user_b_id INTEGER NOT NULL REFERENCES users(id),
                paired_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS catalog_items (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL,
                category    TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                emoji       TEXT NOT NULL DEFAULT '',
                tier        TEXT NOT NULL DEFAULT 'standard',
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS user_responses (
                user_id      INTEGER NOT NULL REFERENCES users(id),
                item_id      INTEGER NOT NULL REFERENCES catalog_items(id),
                response     TEXT    NOT NULL CHECK(response IN ('yes','no','maybe')),
                responded_at TEXT    NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, item_id)
            );

            CREATE TABLE IF NOT EXISTS match_seen (
                user_id  INTEGER NOT NULL REFERENCES users(id),
                item_id  INTEGER NOT NULL REFERENCES catalog_items(id),
                seen_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, item_id)
            );

            CREATE TABLE IF NOT EXISTS user_mood (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id        INTEGER NOT NULL UNIQUE REFERENCES users(id),
                mood           TEXT    NOT NULL DEFAULT '',
                custom_message TEXT,
                expires_at     TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS reset_requests (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                couple_id    INTEGER NOT NULL REFERENCES couples(id),
                requested_by INTEGER NOT NULL REFERENCES users(id),
                status       TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','declined')),
                created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS swipe_pattern_alerts (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                couple_id     INTEGER NOT NULL REFERENCES couples(id),
                about_user_id INTEGER NOT NULL REFERENCES users(id),
                pattern       TEXT    NOT NULL CHECK(pattern IN ('yes','no')),
                dismissed     INTEGER NOT NULL DEFAULT 0,
                alerted_at    TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS tickets (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                message    TEXT    NOT NULL,
                status     TEXT    NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','closed')),
                created_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS custom_catalog_items (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                couple_id  INTEGER NOT NULL REFERENCES couples(id),
                created_by INTEGER NOT NULL REFERENCES users(id),
                title      TEXT    NOT NULL,
                emoji      TEXT    NOT NULL DEFAULT '✨',
                created_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT    NOT NULL UNIQUE,
                expires_at TEXT    NOT NULL,
                created_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS pairing_purchases (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id               INTEGER NOT NULL,
                store_transaction_id  TEXT    NOT NULL UNIQUE,
                product_id            TEXT    NOT NULL,
                purchased_at          TEXT    NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS expressions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                couple_id  INTEGER NOT NULL REFERENCES couples(id),
                sender_id  INTEGER NOT NULL REFERENCES users(id),
                key        TEXT    NOT NULL,
                sent_at    TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_expressions_couple_id
                ON expressions(couple_id, id DESC);

            CREATE INDEX IF NOT EXISTS idx_users_couple_id
                ON users(couple_id);

            CREATE INDEX IF NOT EXISTS idx_catalog_items_category
                ON catalog_items(category);
        """)
        await db.commit()

        # Migrations — add columns that may be missing from older databases
        import sqlite3, logging
        _mig_log = logging.getLogger("venn.migrations")
        for table, col, definition in [
            ("users",     "is_admin",       "INTEGER NOT NULL DEFAULT 0"),
            ("users",     "is_superadmin",  "INTEGER NOT NULL DEFAULT 0"),
            ("users",     "session_token",  "TEXT"),
            ("users",     "email",          "TEXT"),
            ("users",     "is_paid",        "INTEGER NOT NULL DEFAULT 0"),
            ("users",     "pairing_credits", "INTEGER NOT NULL DEFAULT 0"),
            ("user_mood", "custom_message", "TEXT"),
            ("tickets",   "admin_note",     "TEXT"),
            ("tickets",   "resolved_at",    "TEXT"),
            ("users",     "reset_code",     "TEXT"),
            ("users",     "reset_code_expires_at", "TEXT"),
            ("users",     "auth_provider",    "TEXT"),
            ("users",     "auth_provider_id", "TEXT"),
        ]:
            try:
                await db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
                await db.commit()
            except (sqlite3.OperationalError, Exception) as e:
                if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                    pass  # column already exists
                else:
                    _mig_log.warning("Migration failed for %s.%s: %s", table, col, e)

        # ── Catalog title renames (Apple App Store compliance) ────────────
        _CATALOG_RENAMES = [
            ("Warm-Up Spanking",       "Warm-Up Taps"),
            ("Hair Pulling",           "Hair Play"),
            ("Worship from Below",     "Devotion"),
            ("Over the Knee",          "Across the Lap"),
            ("Going Down",             "Oral Focus"),
            ("Over the Lap",           "Draped Across"),
            ("From Behind with Hair Pull", "From Behind with Hair Play"),
            ("Filmed for Later",       "Recorded for Later"),
            ("Owned for a Night",      "Yours for a Night"),
            ("Innocence Lost",         "New Experience"),
            ("Obedient",               "Follow the Lead"),
            ("Punishment Game",        "Consequence Game"),
            ("Pet & Owner",            "Pet Play"),
            ("Soft Restraints",        "Soft Ties"),
            ("Gag",                    "Hush"),
            ("Flogger",                "Sensation Tails"),
            ("Bondage Tape",           "Body Tape"),
            ("Under-Bed Restraints",   "Under-Bed Ties"),
            ("Shibari Rope",           "Japanese Rope Art"),
            ("Light Bondage",          "Light Restraint"),
            ("Read Erotica Together",  "Read Stories Together"),
            ("Blindfold + Restraints", "Blindfold + Ties"),
            ("Full Day Dynamic",       "Full Day Exchange"),
            ("Denial Game",            "Anticipation Game"),
            ("Full Bondage Scene",     "Full Restraint Scene"),
            ("Impact Play",            "Intensity Play"),
            ("Full Shibari Tie",       "Full Rope Tie"),
            ("Humiliation Walk",       "Trust Walk"),
            ("Collaring Moment",       "Ceremony Moment"),
            ("Contract Night",         "Agreement Night"),
        ]
        _CATALOG_DESC_UPDATES = [
            ("Devotion",              "Show complete devotion. Every touch an offering."),
            ("From Behind with Hair Play", "One hand in their hair. Controlled and primal."),
            ("Yours for a Night",     "One belongs to the other. Given tasks, shown off."),
            ("New Experience",        "One character slowly drawn into something new and exciting."),
            ("Follow the Lead",       "They don't speak unless told to. Complete trust."),
            ("Consequence Game",      "They break the rules on purpose. You decide what happens."),
            ("Pet Play",              "One takes a playful role. Collar, commands, rewards."),
            ("Soft Ties",             "Scarves, ribbons, or proper cuffs. Trust and surrender."),
            ("Sensation Tails",       "Multiple tails, wide sensation. Warm the skin gradually."),
            ("Japanese Rope Art",     "Traditional Japanese rope technique. The ritual is the point."),
            ("Interrogation",         "One questions, one resists — until they give in. Intense."),
            ("Service Role",          "In uniform (or not). Every request followed without question."),
            ("Read Stories Together",  "Pick a steamy story. Read it aloud. See where it leads."),
            ("Anticipation Game",     "You decide when — and if — things reach the finish."),
            ("Full Restraint Scene",  "Planned, rope or ties, full immobility. Learn safety first."),
            ("Intensity Play",        "Taps, paddles — escalating intensity, with check-ins."),
            ("Trust Walk",            "Led around the home. Guided and trusting."),
            ("Ceremony Moment",       "Formal gesture of commitment. Words, meaning, intention."),
            ("Agreement Night",       "Write and sign a play agreement together. Limits, rules, trust."),
            ("Sensation Play",        "Wax, ice, scratching — mix contrasts carefully."),
            ("Marathon Session",      "Clear the whole afternoon. No phone, no plans."),
        ]
        try:
            for old_title, new_title in _CATALOG_RENAMES:
                await db.execute(
                    "UPDATE catalog_items SET title = ? WHERE title = ?",
                    (new_title, old_title),
                )
            for title, new_desc in _CATALOG_DESC_UPDATES:
                await db.execute(
                    "UPDATE catalog_items SET description = ? WHERE title = ?",
                    (new_desc, title),
                )
            await db.commit()
        except Exception as e:
            _mig_log.warning("Catalog rename migration: %s", e)


@asynccontextmanager
async def get_db_ctx():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")
        yield db
    finally:
        await db.close()
