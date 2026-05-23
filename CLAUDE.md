# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Venn is a couples intimacy app. Partners pair via short codes, independently swipe through a catalog of intimate activities, and discover mutual matches in real time via WebSocket.

Three independent apps share this repo (not a monorepo — no shared workspace):
- **backend/** — Python FastAPI + SQLite (raw SQL via aiosqlite, no ORM)
- **frontend/** — React 19 + Vite + react-router-dom (CSS custom properties, no Tailwind)
- **mobile/** — Expo 54 + React Native + React Navigation

## Commands

### Backend
```bash
cd backend
source ../.venv/bin/activate
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
Production: `pm2 restart venn-api`. The pm2 process runs the venv python (`/root/venn/.venv/bin/python`) — never the system `python3`, which is missing some deps (e.g. `app-store-server-library`). New backend deps must be installed with `/root/venn/.venv/bin/python -m pip install ...`.

**When adding new vars to `backend/.env`**: a plain `pm2 restart` does NOT re-read `ecosystem.config.js`, so new keys stay missing in the running process. Use:
```bash
pm2 delete venn-api && pm2 start /root/venn/ecosystem.config.js --only venn-api
```
Verify with `pm2 env <id> | grep <NEW_VAR>`.

### Frontend
```bash
cd frontend
npm run dev      # Vite dev server on port 81, proxies /api → localhost:8000
npm run build    # Production build
npm run lint     # ESLint
```
Production: `pm2 restart venn-frontend`

### Mobile
```bash
cd mobile
npm start        # Expo dev server
npm run android
npm run ios
```

## Architecture

### Backend (FastAPI)
- **main.py** — app factory, middleware stack (CORS, sessions, security headers, rate limiting)
- **database.py** — SQLite connection with WAL mode, schema migrations run on startup
- **routers/** — one file per domain: `auth`, `pairing`, `catalog`, `matches`, `mood`, `reset`, `admin`, `tickets`, `custom_items`
- **routers/deps.py** — shared dependency helpers (`require_couple`, etc.)
- **models.py** — Pydantic request/response schemas
- **ws.py** — WebSocket connection manager for real-time match notifications
- **seed.py** — catalog seed data (~200 items across 6 categories)

Session auth via secure httponly cookies (`vn_session`, 7-day TTL, domain `venn.lu`). No JWT.

Frontend: `https://venn.lu` — API: `https://api.venn.lu`

### Frontend (React/Vite)
- **src/App.jsx** — all routes + route guards (AuthGuard, PairGuard, AdminGuard)
- **src/context/** — AuthContext (login/register/pair/solo) and MatchContext (WebSocket)
- **src/api/client.js** — fetch wrapper with automatic 401 handling
- **src/pages/** — one component per route
- **src/components/** — organized by domain: `catalog/`, `matches/`, `pairing/`, `layout/`, `shared/`
- **src/styles/tokens.css** — design tokens as CSS variables (colors, typography, spacing)
- **src/lib/constants.js** — routes, categories, moods, storage keys (single source of truth)

### Database Tables
`users`, `couples`, `catalog_items`, `user_responses`, `match_seen`, `user_mood`, `reset_requests` — all in SQLite with foreign keys enabled.

### Key Patterns
- Pairing uses 6-char alphanumeric codes (no I/O/0) with 30-min TTL
- "Solo mode" lets users browse without a partner (localStorage flag `vn_solo`)
- Match detection: both partners respond "yes" to the same catalog item
- WebSocket at `/api/ws` pushes match notifications in real time
- Rate limiting via slowapi decorators on sensitive endpoints

### Environment Variables (backend)
- `SECRET_KEY` — session signing (required)
- `FRONTEND_ORIGIN` — CORS origin (default `https://venn.lu`)
- `EXTRA_ORIGINS` — additional CORS origins, comma-separated
- `DEBUG` — enables `/api/docs` and `/api/redoc`
- `DB_PATH` — SQLite path (default `venn.db`)
- `COOKIE_DOMAIN` — session cookie domain
- `APPLE_APP_ID` — numeric App Store Connect ID (only required once shipping to the production App Store; sandbox/TestFlight works without it)

### In-App Purchase
- iOS uses **expo-iap** with StoreKit 2 (no RevenueCat). Pairing code is a consumable: `lu.venn.pairingcode_v2`.
- Mobile sets `appAccountToken` on `requestPurchase` to the per-user UUID returned by `GET /pairing/status` (`iap_account_token`). The backend computes the same UUID via `uuid5(_IAP_TOKEN_NAMESPACE, str(uid))` and rejects any JWS whose `appAccountToken` doesn't match the requesting session — this prevents JWS replay across users.
- Mobile sends the JWS-signed transaction (`purchase.purchaseToken`) to `POST /pairing/verify-purchase`.
- Backend verifies the JWS signature locally via `app-store-server-library` against `apple_certs/AppleRootCA-G3.cer`, then idempotently records the transaction in `pairing_purchases` and increments `users.pairing_credits`.
- When `PAYMENT_REQUIRED=true` and a production verifier is loaded (`APPLE_APP_ID` set), sandbox JWS payloads are rejected so a TestFlight tester can't credit the production account.
- No "Restore" UI: credits are account-bound on the backend, so signing back in already restores them — and Apple's `restorePurchases` does not work for consumables.

## Design System

**Fonts:** Comfortaa (display/serif) and DM Sans (body) — loaded from Google Fonts. Never use Inter, Roboto, Arial, or system fonts.

**Colors:** Light lavender background (`#FAF7FC`), deep violet text (`#2D1F3D`), rose accent (`#C4547A`). Response semantics: yes=violet (`#9B80D4`), no=coral (`#F07A6A`), maybe=rose (`#E8A8C0`). All defined in `frontend/src/styles/tokens.css`.

**Breakpoints:** Mobile-first. 768px is the key tablet/desktop breakpoint where the shell goes fullscreen with overflow hidden. Defined in `frontend/src/styles/breakpoints.css` via PostCSS custom media.

**Animation:** framer-motion for React components. CSS keyframes for ambient effects (shimmer, float, pulse-glow). Duration tokens: fast 150ms, normal 250ms, slow 400ms.

## Frontend Aesthetics

Avoid generic "AI slop" design. Make creative, distinctive choices:
- Use distinctive typography — never default to Inter/Roboto/Arial/system fonts
- Commit to cohesive color themes with CSS variables; dominant colors + sharp accents
- Focus animations on high-impact moments (page load staggered reveals > scattered micro-interactions)
- Create atmospheric backgrounds with layered gradients and patterns, not flat solid colors
- Avoid clichéd purple gradients on white, predictable layouts, cookie-cutter components
- Vary aesthetics — don't converge on the same choices (e.g., Space Grotesk) every time
