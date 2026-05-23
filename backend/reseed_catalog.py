"""Wipe and reseed the catalog.

Deletes all catalog items along with all responses, matches-seen, and
swipe-pattern alerts that reference them, then re-runs the catalog seed.

Usage:
    python reseed_catalog.py            # prompts for confirmation
    python reseed_catalog.py --force    # skip confirmation
"""
import asyncio
import sys
import aiosqlite

from database import DB_PATH, init_db
from seed import CATALOG


async def reseed(force: bool) -> None:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA foreign_keys = ON")

        counts = {}
        for table in ("catalog_items", "user_responses", "match_seen", "swipe_pattern_alerts"):
            cur = await db.execute(f"SELECT COUNT(*) FROM {table}")
            row = await cur.fetchone()
            counts[table] = row[0] if row else 0

        print("Current row counts:")
        for table, n in counts.items():
            print(f"  {table}: {n}")
        print(f"About to wipe and replace with {len(CATALOG)} fresh catalog items.")

        if not force:
            confirm = input("Type 'WIPE' to proceed: ")
            if confirm.strip() != "WIPE":
                print("Aborted.")
                return

        await db.execute("BEGIN")
        try:
            await db.execute("DELETE FROM swipe_pattern_alerts")
            await db.execute("DELETE FROM match_seen")
            await db.execute("DELETE FROM user_responses")
            await db.execute("DELETE FROM catalog_items")
            await db.execute("DELETE FROM sqlite_sequence WHERE name = 'catalog_items'")

            await db.executemany(
                "INSERT INTO catalog_items (title, category, description, emoji, tier) VALUES (?,?,?,?,?)",
                CATALOG,
            )
            await db.commit()
        except Exception:
            await db.rollback()
            raise

        cur = await db.execute("SELECT COUNT(*) FROM catalog_items")
        row = await cur.fetchone()
        print(f"Reseed complete. Catalog now has {row[0]} items.")


if __name__ == "__main__":
    force = "--force" in sys.argv
    asyncio.run(reseed(force))
