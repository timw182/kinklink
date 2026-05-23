import os
import secrets
import logging
import httpx
import jwt
import resend
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from aiosqlite import Connection
from passlib.context import CryptContext
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db
from models import RegisterRequest, LoginRequest, UserOut, UserOutWithToken, UpdateProfileRequest, TokenResponse, RefreshRequest, validate_password
from ws import manager
from routers.deps import verify_session, resolve_user_id
from jwt_utils import create_access_token, create_refresh_token, decode_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS

SECRET_KEY = os.environ.get("SECRET_KEY", "")

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)

# Pre-computed dummy hash — ensures bcrypt always runs on login, preventing
# timing-based username enumeration (unknown user vs wrong password).
_DUMMY_HASH = pwd_ctx.hash("__dummy__")

AVATAR_COLORS = [
    "#C4754B", "#7B9E6F", "#D4B878", "#8E7BB5",
    "#5B9BB5", "#C47474", "#74A899", "#B5875B",
]


async def _get_user_out(db: Connection, user_id: int, session_token: str = None) -> UserOut:
    cur = await db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "User not found")

    partner_name = None
    if row["couple_id"]:
        cur = await db.execute(
            "SELECT user_a_id, user_b_id FROM couples WHERE id = ?",
            (row["couple_id"],)
        )
        couple = await cur.fetchone()
        if couple:
            partner_id = (
                couple["user_b_id"]
                if couple["user_a_id"] == user_id
                else couple["user_a_id"]
            )
            cur = await db.execute(
                "SELECT display_name FROM users WHERE id = ?", (partner_id,)
            )
            partner = await cur.fetchone()
            if partner:
                partner_name = partner["display_name"]

    base = dict(
        id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        avatar_color=row["avatar_color"],
        couple_id=row["couple_id"],
        partner_name=partner_name,
        is_admin=bool(row["is_admin"]),
        is_superadmin=bool(row["is_superadmin"]),
    )
    if session_token:
        return UserOutWithToken(**base, session_token=session_token)
    return UserOut(**base)


async def _session_user_id(request: Request, db: Connection = None) -> int:
    """Get user ID from cookie, Bearer JWT, or X-Session-Token."""
    uid = await resolve_user_id(request, db)
    if not uid:
        raise HTTPException(401, "Not authenticated")
    return uid


@router.post("/register", response_model=UserOutWithToken)
@limiter.limit("5/minute")
async def register(body: RegisterRequest, request: Request, db: Connection = Depends(get_db)):
    cur = await db.execute("SELECT id FROM users WHERE username = ?", (body.username,))
    existing = await cur.fetchone()
    if existing:
        raise HTTPException(400, "An account with this email already exists")

    color = AVATAR_COLORS[hash(body.username) % len(AVATAR_COLORS)]
    hashed = pwd_ctx.hash(body.password)

    token = secrets.token_hex(32)
    cursor = await db.execute(
        "INSERT INTO users (username, password_hash, display_name, avatar_color, session_token) VALUES (?,?,?,?,?)",
        (body.username.strip(), hashed, body.display_name, color, token),
    )
    await db.commit()

    request.session.clear()
    request.session["user_id"] = cursor.lastrowid
    request.session["session_token"] = token
    return await _get_user_out(db, cursor.lastrowid, session_token=token)


@router.post("/login", response_model=UserOutWithToken)
@limiter.limit("5/minute")
async def login(body: LoginRequest, request: Request, db: Connection = Depends(get_db)):
    cur = await db.execute("SELECT * FROM users WHERE username = ?", (body.username.strip(),))
    row = await cur.fetchone()
    # Always call verify so response time is constant regardless of whether
    # the username exists, preventing timing-based account enumeration.
    hash_to_check = row["password_hash"] if row else _DUMMY_HASH
    password_ok = pwd_ctx.verify(body.password, hash_to_check)
    if not row or not password_ok:
        raise HTTPException(401, "Invalid email or password")

    # Invalidate all other sessions (web cookie + mobile JWT)
    token = secrets.token_hex(32)
    await db.execute("UPDATE users SET session_token = ? WHERE id = ?", (token, row["id"]))
    await db.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (row["id"],))
    await db.commit()

    request.session.clear()
    request.session["user_id"] = row["id"]
    request.session["session_token"] = token
    return await _get_user_out(db, row["id"], session_token=token)


@router.post("/logout", status_code=204, dependencies=[Depends(verify_session)])
async def logout(request: Request, db: Connection = Depends(get_db)):
    uid = await resolve_user_id(request, db)
    if uid:
        await db.execute("UPDATE users SET session_token = NULL WHERE id = ?", (uid,))
        await db.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (uid,))
        await db.commit()
    request.session.clear()


@router.get("/me")
async def me(request: Request, db: Connection = Depends(get_db)):
    uid = await resolve_user_id(request, db)
    if not uid:
        return None  # 200 with null body — avoids noisy 401 in browser console
    # When auth came from the cookie session, confirm it hasn't been revoked
    # (e.g., a fresh login on another device cleared the user's session_token).
    # Without this, a kicked-out web client briefly renders the authed UI.
    if request.session.get("user_id") == uid:
        token = request.session.get("session_token")
        if token:
            cur = await db.execute("SELECT session_token FROM users WHERE id = ?", (uid,))
            row = await cur.fetchone()
            if not row or row["session_token"] != token:
                request.session.clear()
                return None
    return await _get_user_out(db, uid)



@router.post("/change-password", status_code=204, dependencies=[Depends(verify_session)])
@limiter.limit("5/minute")
async def change_password(request: Request, db: Connection = Depends(get_db)):
    uid = await _session_user_id(request, db)
    body = await request.json()
    current = body.get("current_password", "")
    new_pw = body.get("new_password", "")

    if not current or not new_pw:
        raise HTTPException(400, "Current and new password are required")
    try:
        validate_password(new_pw)
    except ValueError as e:
        raise HTTPException(400, str(e))

    cur = await db.execute("SELECT password_hash FROM users WHERE id = ?", (uid,))
    row = await cur.fetchone()
    if not row or not pwd_ctx.verify(current, row["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")

    hashed = pwd_ctx.hash(new_pw)
    await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hashed, uid))
    await db.commit()


@router.patch("/profile", response_model=UserOut, dependencies=[Depends(verify_session)])
@limiter.limit("10/minute")
async def update_profile(body: UpdateProfileRequest, request: Request, db: Connection = Depends(get_db)):
    uid = await _session_user_id(request, db)
    await db.execute("UPDATE users SET display_name = ? WHERE id = ?", (body.display_name, uid))
    await db.commit()
    return await _get_user_out(db, uid)

DISCONNECT_COOLDOWN_HOURS = 120  # 5 days

@router.post("/disconnect", status_code=204, dependencies=[Depends(verify_session)])
@limiter.limit("5/minute")
async def disconnect_partner(request: Request, db: Connection = Depends(get_db)):
    """Remove the current couple pairing. Rate-limited to once per 24 hours."""
    uid = await _session_user_id(request, db)

    cur = await db.execute("SELECT couple_id, last_disconnected_at FROM users WHERE id = ?", (uid,))
    row = await cur.fetchone()
    if not row or not row["couple_id"]:
        raise HTTPException(400, "Not paired")

    # Rate limit check
    if row["last_disconnected_at"]:
        last = datetime.fromisoformat(row["last_disconnected_at"])
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        elapsed_hours = (datetime.now(timezone.utc) - last).total_seconds() / 3600
        if elapsed_hours < DISCONNECT_COOLDOWN_HOURS:
            wait_h = int(DISCONNECT_COOLDOWN_HOURS - elapsed_hours) + 1
            raise HTTPException(429, f"You can disconnect again in {wait_h} hour(s).")

    couple_id = row["couple_id"]

    # Get both user IDs in the couple
    cur = await db.execute("SELECT user_a_id, user_b_id FROM couples WHERE id = ?", (couple_id,))
    couple = await cur.fetchone()
    partner_ids = [couple["user_a_id"], couple["user_b_id"]] if couple else [uid]

    # Purge couple-scoped data to prevent carryover to a new partner
    for pid in partner_ids:
        await db.execute("DELETE FROM user_responses WHERE user_id = ?", (pid,))
        await db.execute("DELETE FROM match_seen WHERE user_id = ?", (pid,))
        await db.execute("DELETE FROM user_mood WHERE user_id = ?", (pid,))
    await db.execute("DELETE FROM reset_requests WHERE couple_id = ?", (couple_id,))
    await db.execute("DELETE FROM swipe_pattern_alerts WHERE couple_id = ?", (couple_id,))
    await db.execute("DELETE FROM custom_catalog_items WHERE couple_id = ?", (couple_id,))
    await db.execute("DELETE FROM expressions WHERE couple_id = ?", (couple_id,))

    # Unpair both users
    await db.execute(
        "UPDATE users SET couple_id = NULL, last_disconnected_at = datetime('now') WHERE couple_id = ?",
        (couple_id,)
    )
    # Remove the couple record
    await db.execute("DELETE FROM couples WHERE id = ?", (couple_id,))
    await db.commit()


@router.delete("/account", status_code=204, dependencies=[Depends(verify_session)])
async def delete_account(request: Request, db: Connection = Depends(get_db)):
    """Permanently delete the current user's account and all associated data."""
    uid = await _session_user_id(request, db)
    cur = await db.execute("SELECT couple_id FROM users WHERE id = ?", (uid,))
    row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "User not found")

    couple_id = row["couple_id"]

    if couple_id:
        cur = await db.execute("SELECT user_a_id, user_b_id FROM couples WHERE id = ?", (couple_id,))
        couple = await cur.fetchone()
        partner_id = couple["user_b_id"] if couple["user_a_id"] == uid else couple["user_a_id"]

        # FK-safe order: delete referencing rows first
        await db.execute("DELETE FROM reset_requests WHERE couple_id = ?", (couple_id,))
        await db.execute("DELETE FROM swipe_pattern_alerts WHERE couple_id = ?", (couple_id,))
        await db.execute("DELETE FROM custom_catalog_items WHERE couple_id = ?", (couple_id,))
        await db.execute("DELETE FROM expressions WHERE couple_id = ?", (couple_id,))
        for pid in [uid, partner_id]:
            await db.execute("DELETE FROM user_responses WHERE user_id = ?", (pid,))
            await db.execute("DELETE FROM match_seen WHERE user_id = ?", (pid,))
            await db.execute("DELETE FROM user_mood WHERE user_id = ?", (pid,))

        # Unpair both, then delete couple
        await db.execute("UPDATE users SET couple_id = NULL WHERE couple_id = ?", (couple_id,))
        await db.execute("DELETE FROM couples WHERE id = ?", (couple_id,))

        # Notify partner via WS
        await manager.broadcast(couple_id, {"type": "partner_deleted"})
    else:
        await db.execute("DELETE FROM user_responses WHERE user_id = ?", (uid,))
        await db.execute("DELETE FROM match_seen WHERE user_id = ?", (uid,))
        await db.execute("DELETE FROM user_mood WHERE user_id = ?", (uid,))
        await db.execute("DELETE FROM swipe_pattern_alerts WHERE about_user_id = ?", (uid,))

    await db.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (uid,))
    await db.execute("DELETE FROM tickets WHERE user_id = ?", (uid,))
    await db.execute("DELETE FROM users WHERE id = ?", (uid,))
    await db.commit()
    request.session.clear()


# ── Password Reset ───────────────────────────────────────────────────────────

log = logging.getLogger("venn.auth")
resend.api_key = os.environ.get("RESEND_API_KEY", "")
RESET_CODE_TTL_MINUTES = 15


@router.post("/forgot-password", status_code=204)
@limiter.limit("3/minute")
async def forgot_password(request: Request, db: Connection = Depends(get_db)):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "Email is required")

    cur = await db.execute("SELECT id FROM users WHERE username = ?", (email,))
    row = await cur.fetchone()
    if not row:
        # Don't reveal whether email exists
        return

    code = secrets.token_urlsafe(24)
    expires = (datetime.now(timezone.utc) + timedelta(minutes=RESET_CODE_TTL_MINUTES)).isoformat()
    await db.execute(
        "UPDATE users SET reset_code = ?, reset_code_expires_at = ? WHERE id = ?",
        (code, expires, row["id"]),
    )
    await db.commit()

    if resend.api_key:
        try:
            resend.Emails.send({
                "from": "Password Reset <password@venn.lu>",
                "to": [email],
                "subject": "Your Venn password reset code",
                "html": f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>@import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=DM+Sans:wght@300;400;500&display=swap');body{{margin:0;padding:0;background:#EDE8F4;}}</style></head>
<body style="margin:0;padding:0;background:#EDE8F4;">
<table role="presentation" width="100%" style="background:#EDE8F4;"><tr><td style="padding:48px 16px;" align="center">
<table role="presentation" width="520" style="max-width:520px;background:#FAF7FC;border-radius:24px;overflow:hidden;box-shadow:0 4px 40px rgba(45,31,61,0.10);">
<tr><td height="4" style="background:linear-gradient(90deg,#C4547A 0%,#9B80D4 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:36px 40px 0;text-align:center;">
<span style="font-family:'Comfortaa',cursive;font-size:21px;font-weight:700;color:#2D1F3D;">venn</span></td></tr>
<tr><td style="padding:28px 40px 0;text-align:center;">
<h1 style="font-family:'Comfortaa',cursive;font-size:24px;font-weight:700;color:#2D1F3D;margin:0;">Password reset</h1></td></tr>
<tr><td style="padding:14px 40px 0;text-align:center;">
<p style="font-family:'DM Sans',Helvetica;font-size:15px;font-weight:300;color:#5C4A72;margin:0;line-height:1.65;">Enter this code in the app to set a new password.</p></td></tr>
<tr><td style="padding:28px 40px 0;">
<table role="presentation" width="100%"><tr><td style="background:#fff;border:1.5px solid #E4D8EE;border-radius:16px;padding:28px 24px;text-align:center;">
<p style="font-family:'DM Sans',Helvetica;font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#9B80D4;margin:0 0 16px;">your reset code</p>
<p style="font-family:'Comfortaa',cursive,monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:#2D1F3D;margin:0 0 16px;word-break:break-all;">{code}</p>
<p style="font-family:'DM Sans',Helvetica;font-size:12px;color:#B0A0C0;margin:0;">Valid for {RESET_CODE_TTL_MINUTES} minutes</p>
</td></tr></table></td></tr>
<tr><td style="padding:20px 40px 36px;text-align:center;">
<p style="font-family:'DM Sans',Helvetica;font-size:13px;font-weight:300;color:#7A6490;margin:0;line-height:1.65;">If you didn't request this, you can safely ignore this email.</p></td></tr>
<tr><td style="border-top:1px solid #E4D8EE;padding:20px 40px;text-align:center;">
<p style="font-family:'DM Sans',Helvetica;font-size:11px;color:#C4B8D4;margin:0;">Venn &middot; <a href="https://venn.lu" style="color:#C4B8D4;text-decoration:none;">venn.lu</a></p></td></tr>
</table></td></tr></table></body></html>""",
            })
        except Exception as e:
            log.error("Failed to send reset email to %s: %s", email, e)
    else:
        log.warning("RESEND_API_KEY not set — could not send reset email to %s", email)


@router.post("/reset-password", status_code=204)
@limiter.limit("5/minute")
async def reset_password(request: Request, db: Connection = Depends(get_db)):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    new_password = body.get("new_password", "")

    if not email or not code or not new_password:
        raise HTTPException(400, "Email, code, and new password are required")
    try:
        validate_password(new_password)
    except ValueError as e:
        raise HTTPException(400, str(e))

    cur = await db.execute(
        "SELECT id, reset_code, reset_code_expires_at FROM users WHERE username = ?",
        (email,),
    )
    row = await cur.fetchone()
    import hmac
    if not row or not row["reset_code"] or not hmac.compare_digest(row["reset_code"], code):
        raise HTTPException(400, "Invalid or expired reset code")

    expires = datetime.fromisoformat(row["reset_code_expires_at"])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(400, "Invalid or expired reset code")

    hashed = pwd_ctx.hash(new_password)
    await db.execute(
        "UPDATE users SET password_hash = ?, reset_code = NULL, reset_code_expires_at = NULL, session_token = NULL WHERE id = ?",
        (hashed, row["id"]),
    )
    # Invalidate all refresh tokens so old sessions can't persist
    await db.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (row["id"],))
    await db.commit()


# ── JWT Token Auth (mobile) ──────────────────────────────────────────────────

async def _issue_tokens(db: Connection, user_id: int) -> tuple[str, str]:
    """Create access + refresh token pair, store refresh hash in DB."""
    access = create_access_token(user_id, SECRET_KEY)
    raw_refresh, refresh_hash = create_refresh_token()
    expires_at = (datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()
    await db.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
        (user_id, refresh_hash, expires_at),
    )
    await db.commit()
    return access, raw_refresh


@router.post("/token", response_model=TokenResponse)
@limiter.limit("5/minute")
async def token_login(body: LoginRequest, request: Request, db: Connection = Depends(get_db)):
    """Login and receive JWT access + refresh tokens (for mobile clients)."""
    cur = await db.execute("SELECT * FROM users WHERE username = ?", (body.username.strip(),))
    row = await cur.fetchone()
    hash_to_check = row["password_hash"] if row else _DUMMY_HASH
    password_ok = pwd_ctx.verify(body.password, hash_to_check)
    if not row or not password_ok:
        raise HTTPException(401, "Invalid email or password")

    # Invalidate all other sessions (web cookie + existing refresh tokens)
    await db.execute("UPDATE users SET session_token = NULL WHERE id = ?", (row["id"],))
    await db.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (row["id"],))
    access, refresh = await _issue_tokens(db, row["id"])
    user = await _get_user_out(db, row["id"])
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user,
    )


@router.post("/token/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def token_refresh(body: RefreshRequest, request: Request, db: Connection = Depends(get_db)):
    """Exchange a refresh token for a new access + refresh token pair."""
    import hashlib
    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()
    cur = await db.execute(
        "SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = ?",
        (token_hash,),
    )
    row = await cur.fetchone()
    if not row:
        raise HTTPException(401, "Invalid refresh token")

    expires_at = datetime.fromisoformat(row["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await db.execute("DELETE FROM refresh_tokens WHERE id = ?", (row["id"],))
        await db.commit()
        raise HTTPException(401, "Refresh token expired")

    # Rotate: delete old, issue new
    await db.execute("DELETE FROM refresh_tokens WHERE id = ?", (row["id"],))
    access, refresh = await _issue_tokens(db, row["user_id"])
    user = await _get_user_out(db, row["user_id"])
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user,
    )


# ── Apple Sign In ────────────────────────────────────────────────────────────

_apple_keys_cache: dict = {}
_apple_keys_fetched_at: float = 0
APPLE_KEYS_TTL = 3600  # re-fetch every hour

APPLE_BUNDLE_ID = "net.amoreapp.venn"
APPLE_WEB_SERVICE_ID = os.environ.get("APPLE_WEB_SERVICE_ID", "")
APPLE_ALLOWED_AUDIENCES = [aud for aud in [APPLE_BUNDLE_ID, "host.exp.Exponent", APPLE_WEB_SERVICE_ID] if aud]


async def _get_apple_public_keys() -> list[dict]:
    """Fetch Apple's public keys for verifying identity tokens (cached)."""
    import time
    global _apple_keys_cache, _apple_keys_fetched_at
    now = time.time()
    if _apple_keys_cache and (now - _apple_keys_fetched_at) < APPLE_KEYS_TTL:
        return _apple_keys_cache.get("keys", [])
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get("https://appleid.apple.com/auth/keys")
        resp.raise_for_status()
        _apple_keys_cache = resp.json()
        _apple_keys_fetched_at = now
    return _apple_keys_cache.get("keys", [])


async def _verify_apple_token(id_token: str) -> dict:
    """Verify an Apple identity token and return claims (sub, email)."""
    header = jwt.get_unverified_header(id_token)
    kid = header.get("kid")
    if not kid:
        raise ValueError("Missing kid in token header")

    apple_keys = await _get_apple_public_keys()
    matching_key = next((k for k in apple_keys if k["kid"] == kid), None)
    if not matching_key:
        raise ValueError("No matching Apple public key")

    from jwt.algorithms import RSAAlgorithm
    public_key = RSAAlgorithm.from_jwk(matching_key)

    claims = jwt.decode(
        id_token,
        public_key,
        algorithms=["RS256"],
        audience=APPLE_ALLOWED_AUDIENCES,
        issuer="https://appleid.apple.com",
    )
    return claims


GOOGLE_WEB_CLIENT_ID = os.environ.get("GOOGLE_WEB_CLIENT_ID", "")
GOOGLE_IOS_CLIENT_ID = os.environ.get("GOOGLE_IOS_CLIENT_ID", "")
GOOGLE_MOBILE_WEB_CLIENT_ID = os.environ.get("GOOGLE_MOBILE_WEB_CLIENT_ID", "")
FACEBOOK_APP_ID = os.environ.get("FACEBOOK_APP_ID", "")
FACEBOOK_APP_SECRET = os.environ.get("FACEBOOK_APP_SECRET", "")


async def _verify_google_token(id_token: str) -> dict:
    """Verify a Google ID token and return claims (sub, email, name)."""
    async with httpx.AsyncClient(timeout=10) as c:
        resp = await c.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
        )
        if resp.status_code != 200:
            raise ValueError(f"Google token verification failed: {resp.text}")
        claims = resp.json()

    aud = claims.get("aud", "")
    if aud not in (GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_MOBILE_WEB_CLIENT_ID):
        raise ValueError(f"Google token audience mismatch: {aud}")
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("Google token issuer mismatch")
    return claims


async def _verify_facebook_token(access_token: str) -> dict:
    """Verify a Facebook access token and return user profile."""
    async with httpx.AsyncClient(timeout=10) as c:
        # Debug the token first
        resp = await c.get(
            "https://graph.facebook.com/debug_token",
            params={
                "input_token": access_token,
                "access_token": f"{FACEBOOK_APP_ID}|{FACEBOOK_APP_SECRET}",
            },
        )
        if resp.status_code != 200:
            raise ValueError(f"Facebook token debug failed: {resp.text}")
        debug_data = resp.json().get("data", {})
        if not debug_data.get("is_valid"):
            raise ValueError("Facebook token is not valid")
        if str(debug_data.get("app_id")) != FACEBOOK_APP_ID:
            raise ValueError("Facebook token app_id mismatch")

        # Fetch user profile
        resp = await c.get(
            "https://graph.facebook.com/me",
            params={"fields": "id,name,email", "access_token": access_token},
        )
        if resp.status_code != 200:
            raise ValueError(f"Facebook profile fetch failed: {resp.text}")
        return resp.json()


async def _find_or_create_social_user(
    db: Connection,
    provider: str,
    provider_id: str,
    email: str,
    display_name: str,
    email_verified: bool,
) -> int:
    """Look up or create a user for the given social provider. Returns user_id."""
    cur = await db.execute(
        "SELECT id FROM users WHERE auth_provider = ? AND auth_provider_id = ?",
        (provider, provider_id),
    )
    row = await cur.fetchone()
    if row:
        return row["id"]

    # Cross-provider auto-linking is gated: we only trust the email as proof of
    # ownership when the IdP has verified it. Facebook is excluded entirely
    # because the /me email is not reliably verified.
    can_link_by_email = bool(email and email_verified and provider != "facebook")

    if email:
        cur = await db.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (email,)
        )
        existing = await cur.fetchone()
        if existing:
            if not can_link_by_email or existing["password_hash"]:
                raise HTTPException(
                    409,
                    "An account with this email already exists. "
                    "Sign in with your original method, then link this provider from Settings.",
                )
            await db.execute(
                "UPDATE users SET auth_provider = ?, auth_provider_id = ? WHERE id = ?",
                (provider, provider_id, existing["id"]),
            )
            await db.commit()
            return existing["id"]

    # New user. Use the email as username only if the IdP verified it; otherwise
    # mint a placeholder so an unverified email never becomes the canonical
    # account identifier.
    if email and email_verified:
        username = email
    else:
        username = f"{provider}_{provider_id[:12]}@noreply.venn.lu"
    color = AVATAR_COLORS[hash(username) % len(AVATAR_COLORS)]
    name = display_name or (email.split("@")[0] if (email and email_verified) else "Venn User")
    cursor = await db.execute(
        "INSERT INTO users (username, password_hash, display_name, avatar_color, auth_provider, auth_provider_id) VALUES (?,?,?,?,?,?)",
        (username, "", name, color, provider, provider_id),
    )
    await db.commit()
    return cursor.lastrowid


def _coerce_email_verified(value) -> bool:
    """IdPs return email_verified as bool, 'true'/'false' string, or missing."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() == "true"
    return False


@router.post("/social", response_model=TokenResponse)
@limiter.limit("10/minute")
async def social_login(request: Request, db: Connection = Depends(get_db)):
    """Authenticate via Apple, Google, or Facebook. Creates account on first login."""
    body = await request.json()
    provider = (body.get("provider") or "").strip().lower()
    id_token = body.get("id_token", "")
    given_name = (body.get("display_name") or "").strip()

    if provider not in ("apple", "google", "facebook"):
        raise HTTPException(400, "Unsupported provider")
    if not id_token:
        raise HTTPException(400, "id_token is required")

    provider_id, email, email_verified, given_name = await _resolve_social_identity(
        provider, id_token, given_name
    )

    if not provider_id:
        raise HTTPException(401, "Invalid token: missing subject")

    user_id = await _find_or_create_social_user(
        db, provider, provider_id, email, given_name, email_verified
    )

    # Invalidate all other sessions (web cookie + existing refresh tokens)
    await db.execute("UPDATE users SET session_token = NULL WHERE id = ?", (user_id,))
    await db.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (user_id,))
    access, refresh = await _issue_tokens(db, user_id)
    user = await _get_user_out(db, user_id)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user,
    )


async def _resolve_social_identity(provider: str, id_token: str, given_name: str):
    """Verify an IdP token and return (provider_id, email, email_verified, display_name)."""
    if provider == "apple":
        try:
            claims = await _verify_apple_token(id_token)
        except Exception as e:
            log.warning("Apple token verification failed: %s", e)
            raise HTTPException(401, "Invalid Apple identity token")
        return (
            claims.get("sub", ""),
            claims.get("email", ""),
            _coerce_email_verified(claims.get("email_verified")),
            given_name,
        )

    if provider == "google":
        try:
            claims = await _verify_google_token(id_token)
        except Exception as e:
            log.warning("Google token verification failed: %s", e)
            raise HTTPException(401, "Invalid Google identity token")
        return (
            claims.get("sub", ""),
            claims.get("email", ""),
            _coerce_email_verified(claims.get("email_verified")),
            given_name or claims.get("name", ""),
        )

    if provider == "facebook":
        try:
            profile = await _verify_facebook_token(id_token)
        except Exception as e:
            log.warning("Facebook token verification failed: %s", e)
            raise HTTPException(401, "Invalid Facebook access token")
        # Facebook does NOT verify email ownership reliably for OAuth — never
        # trust it for cross-provider linking.
        return (
            profile.get("id", ""),
            profile.get("email", ""),
            False,
            given_name or profile.get("name", ""),
        )

    raise HTTPException(400, "Unsupported provider")


@router.post("/social-web", response_model=UserOutWithToken)
@limiter.limit("10/minute")
async def social_login_web(request: Request, db: Connection = Depends(get_db)):
    """Web social login — same token verification as /social but sets a session cookie."""
    body = await request.json()
    provider = (body.get("provider") or "").strip().lower()
    id_token = body.get("id_token", "")
    given_name = (body.get("display_name") or "").strip()

    if provider not in ("apple", "google", "facebook"):
        raise HTTPException(400, "Unsupported provider")
    if not id_token:
        raise HTTPException(400, "id_token is required")

    provider_id, email, email_verified, given_name = await _resolve_social_identity(
        provider, id_token, given_name
    )

    if not provider_id:
        raise HTTPException(401, "Invalid token: missing subject")

    user_id = await _find_or_create_social_user(
        db, provider, provider_id, email, given_name, email_verified
    )

    token = secrets.token_hex(32)
    await db.execute("UPDATE users SET session_token = ? WHERE id = ?", (token, user_id))
    await db.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (user_id,))
    await db.commit()

    request.session.clear()
    request.session["user_id"] = user_id
    request.session["session_token"] = token

    return await _get_user_out(db, user_id, session_token=token)
