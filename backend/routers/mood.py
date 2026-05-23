from ws import manager
from fastapi import APIRouter, Depends, HTTPException, Request
from aiosqlite import Connection
from datetime import datetime, timedelta, timezone
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db
from models import MoodRequest, MoodOut, CustomMessageRequest, ExpressionRequest
from routers.auth import _session_user_id
from routers.deps import require_couple, get_partner_id

router = APIRouter(prefix="/mood", tags=["mood"])
limiter = Limiter(key_func=get_remote_address)


def _active_mood(row) -> str | None:
    if not row:
        return None
    expires = datetime.fromisoformat(row["expires_at"])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        return None
    return row["mood"]


@router.put("", response_model=MoodOut)
async def set_mood(body: MoodRequest, request: Request, db: Connection = Depends(get_db)):
    uid = await _session_user_id(request, db)
    couple_id = await require_couple(db, uid)
    partner_id = await get_partner_id(db, uid, couple_id)

    expires_at = (
        datetime.now(timezone.utc) + timedelta(hours=body.expires_hours)
    ).isoformat()

    # Rate-limit: only allow change every 60 seconds
    cur = await db.execute(
        "SELECT updated_at FROM user_mood WHERE user_id = ?", (uid,)
    )
    existing = await cur.fetchone()
    if existing and existing["updated_at"]:
        last_update = datetime.fromisoformat(existing["updated_at"])
        if last_update.tzinfo is None:
            last_update = last_update.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last_update).total_seconds()
        if elapsed < 60:
            wait = int(60 - elapsed)
            raise HTTPException(429, f"Wait {wait} seconds before changing your mood again.")

    await db.execute(
        """INSERT INTO user_mood (user_id, mood, expires_at)
           VALUES (?,?,?)
           ON CONFLICT(user_id) DO UPDATE SET mood=excluded.mood, expires_at=excluded.expires_at, updated_at=datetime('now')""",
        (uid, body.mood, expires_at),
    )
    await db.commit()

    # Broadcast mood update to couple room
    await manager.broadcast(couple_id, {
        "type": "mood_update",
        "mood": body.mood,
        "from_user_id": uid,
    })

    cur = await db.execute(
        "SELECT mood, expires_at FROM user_mood WHERE user_id = ?", (partner_id,)
    )
    partner_row = await cur.fetchone()
    partner_mood = _active_mood(partner_row)

    return MoodOut(
        mine=body.mood,
        partner=partner_mood,
    )


@router.get("", response_model=MoodOut)
async def get_mood(request: Request, db: Connection = Depends(get_db)):
    uid = await _session_user_id(request, db)
    couple_id = await require_couple(db, uid)
    partner_id = await get_partner_id(db, uid, couple_id)

    cur = await db.execute(
        "SELECT mood, expires_at FROM user_mood WHERE user_id = ?", (uid,)
    )
    my_row = await cur.fetchone()
    cur = await db.execute(
        "SELECT mood, expires_at FROM user_mood WHERE user_id = ?", (partner_id,)
    )
    partner_row = await cur.fetchone()

    my_mood = _active_mood(my_row)
    partner_mood = _active_mood(partner_row)

    return MoodOut(
        mine=my_mood,
        partner=partner_mood,
    )


@router.delete("", status_code=204)
async def clear_mood(request: Request, db: Connection = Depends(get_db)):
    uid = await _session_user_id(request, db)
    couple_id = await require_couple(db, uid)
    await db.execute("DELETE FROM user_mood WHERE user_id = ?", (uid,))
    await db.commit()
    await manager.broadcast(couple_id, {
        "type": "mood_cleared",
        "from_user_id": uid,
    })


@router.put("/message")
@limiter.limit("10/minute")
async def set_custom_message(body: CustomMessageRequest, request: Request, db: Connection = Depends(get_db)):
    """Set a free-text message visible to partner (separate from mood emoji)."""
    message = body.message
    uid = await _session_user_id(request, db)
    couple_id = await require_couple(db, uid)

    # Upsert into user_mood keeping existing mood — do NOT touch updated_at
    # (updated_at is used for mood rate-limiting; custom_message is separate)
    await db.execute(
        """INSERT INTO user_mood (user_id, custom_message, expires_at)
           VALUES (?, ?, datetime('now', '+24 hours'))
           ON CONFLICT(user_id) DO UPDATE SET custom_message=excluded.custom_message""",
        (uid, message)
    )
    await db.commit()

    # Broadcast to partner
    await manager.broadcast(couple_id, {
        "type": "custom_message",
        "message": message,
        "from_user_id": uid,
    })

    return {"ok": True}


@router.post("/expression")
@limiter.limit("20/minute")
async def send_expression(body: ExpressionRequest, request: Request, db: Connection = Depends(get_db)):
    """Send a preset expression to the partner and persist it as a chat message.

    Server validates ``body.key`` against ``VALID_EXPRESSIONS`` so the chat
    can never carry arbitrary text — only the closed set of preset keys.
    Returns the created message so the sender can render it optimistically.
    """
    uid = await _session_user_id(request, db)
    couple_id = await require_couple(db, uid)

    cursor = await db.execute(
        "INSERT INTO expressions (couple_id, sender_id, key) VALUES (?, ?, ?)",
        (couple_id, uid, body.key),
    )
    msg_id = cursor.lastrowid
    cur = await db.execute("SELECT sent_at FROM expressions WHERE id = ?", (msg_id,))
    row = await cur.fetchone()
    sent_at = row["sent_at"]
    await db.commit()

    await manager.broadcast(couple_id, {
        "type": "expression",
        "id": msg_id,
        "key": body.key,
        "from_user_id": uid,
        "sent_at": sent_at,
    })

    return {
        "id": msg_id,
        "sender_id": uid,
        "key": body.key,
        "sent_at": sent_at,
    }


@router.get("/expressions")
async def list_expressions(request: Request, db: Connection = Depends(get_db)):
    """Return the couple's most recent expressions, chronological (oldest first)."""
    uid = await _session_user_id(request, db)
    couple_id = await require_couple(db, uid)
    cur = await db.execute(
        "SELECT id, sender_id, key, sent_at FROM expressions "
        "WHERE couple_id = ? ORDER BY id DESC LIMIT 80",
        (couple_id,),
    )
    rows = await cur.fetchall()
    return [
        {"id": r["id"], "sender_id": r["sender_id"], "key": r["key"], "sent_at": r["sent_at"]}
        for r in reversed(rows)
    ]


@router.get("/message")
async def get_partner_message(request: Request, db: Connection = Depends(get_db)):
    uid = await _session_user_id(request, db)
    couple_id = await require_couple(db, uid)
    partner_id = await get_partner_id(db, uid, couple_id)

    cur = await db.execute(
        "SELECT custom_message FROM user_mood WHERE user_id=?", (partner_id,)
    )
    row = await cur.fetchone()
    return {"message": row["custom_message"] if row else None}
