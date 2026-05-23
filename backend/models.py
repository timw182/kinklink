import re
from pydantic import BaseModel, field_validator
from typing import Optional

VALID_MOODS = {
    "passionate", "tender", "playful", "dominant", "submissive", "curious",
    "lazy", "wild", "romantic", "needy", "confident", "nervous", "cuddly", "flirty",
    "dreamy", "cheeky",
}

# Preset expressions a partner can send each other from the Mood tab.
# Server-authoritative — clients can only send keys in this set, no free text.
VALID_EXPRESSIONS = {
    "thinking", "love", "kiss", "miss", "hug", "proud",
    "good_morning", "goodnight", "on_my_way", "home_soon",
    "coffee", "dinner",
}


# ── Auth ──────────────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')


def validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r'[A-Z]', v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r'[a-z]', v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r'[0-9]', v):
        raise ValueError("Password must contain at least one number")
    return v


class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if len(v) > 254:
            raise ValueError("Email address is too long")
        if not _EMAIL_RE.match(v):
            raise ValueError("Please enter a valid email address")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        return validate_password(v)

    @field_validator("display_name")
    @classmethod
    def display_name_valid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Display name is required")
        if len(v) > 40:
            raise ValueError("Display name must be 40 characters or less")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_normalise(cls, v: str) -> str:
        return v.strip().lower()


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_color: str
    couple_id: Optional[int]
    partner_name: Optional[str] = None
    is_admin: bool = False
    is_superadmin: bool = False


class UserOutWithToken(UserOut):
    """Extended response that includes session_token — only for mobile clients."""
    session_token: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Pairing ───────────────────────────────────────────────────────────────────

class PairingCodeOut(BaseModel):
    code: str
    email_sent: Optional[bool] = None


_CODE_CHARS = set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")


class JoinRequest(BaseModel):
    code: str

    @field_validator("code")
    @classmethod
    def code_valid(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) not in (6, 8) or not all(c in _CODE_CHARS for c in v):
            raise ValueError("Invalid pairing code")
        return v


# ── Catalog ───────────────────────────────────────────────────────────────────

class CatalogItem(BaseModel):
    id: int
    title: str
    category: str
    description: str
    emoji: str
    tier: str


class RespondRequest(BaseModel):
    item_id: int
    response: str

    @field_validator("response")
    @classmethod
    def response_valid(cls, v: str) -> str:
        if v not in ("yes", "no", "maybe"):
            raise ValueError("Response must be yes, no, or maybe")
        return v


# ── Matches ───────────────────────────────────────────────────────────────────

class MatchItem(BaseModel):
    id: int
    title: str
    category: str
    description: str
    emoji: str
    tier: str
    matched_at: str
    seen: bool


# ── Mood ──────────────────────────────────────────────────────────────────────

class MoodRequest(BaseModel):
    mood: str
    expires_hours: int = 8

    @field_validator("mood")
    @classmethod
    def mood_valid(cls, v: str) -> str:
        if v not in VALID_MOODS:
            raise ValueError(f"mood must be one of: {', '.join(sorted(VALID_MOODS))}")
        return v

    @field_validator("expires_hours")
    @classmethod
    def expires_valid(cls, v: int) -> int:
        if v < 1 or v > 48:
            raise ValueError("expires_hours must be 1–48")
        return v


class CustomMessageRequest(BaseModel):
    message: str

    @field_validator("message")
    @classmethod
    def message_valid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message required")
        if len(v) > 120:
            raise ValueError("Max 120 characters")
        return v


class MoodOut(BaseModel):
    mine: Optional[str]
    partner: Optional[str]   # only set when both have active moods


class ExpressionRequest(BaseModel):
    key: str

    @field_validator("key")
    @classmethod
    def key_valid(cls, v: str) -> str:
        if v not in VALID_EXPRESSIONS:
            raise ValueError(f"key must be one of: {', '.join(sorted(VALID_EXPRESSIONS))}")
        return v


# ── Profile ───────────────────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    display_name: str

    @field_validator("display_name")
    @classmethod
    def display_name_valid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Display name is required")
        if len(v) > 40:
            raise ValueError("Display name must be 40 characters or less")
        return v
