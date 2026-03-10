# CLAUDE.md — Project Guide for passkey-auth

## Project Overview

A WebAuthn/Passkey authentication demo built with Next.js 15, showcasing the full passkey registration and login lifecycle using the SimpleWebAuthn library.

## Tech Stack

- **Framework:** Next.js 15.1.11 (App Router, Turbopack)
- **Language:** TypeScript 5 (strict mode)
- **Runtime:** React 19
- **Styling:** Tailwind CSS 3.4
- **Database:** PostgreSQL (Supabase) via Prisma 6.3 (schema defined, DB integration pending)
- **Auth:** SimpleWebAuthn (browser + server), iron-session
- **Persistence:** localStorage for credentials (demo), iron-session for auth state
- **Package Manager:** pnpm

## Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Run ESLint
npx prisma generate   # Generate Prisma client
npx prisma db push    # Push schema to database
npx prisma migrate dev # Run migrations
```

## Project Structure

```
app/
├── actions/auth.ts        # Server actions (login, register, logout, getChallenge)
├── api/
│   ├── register/route.ts  # POST — verify registration + return credential for storage
│   ├── login/route.ts     # POST — verify authentication assertion
│   └── session/route.ts   # GET — retrieve current session (safe fields only)
├── dashboard/page.tsx     # Interactive passkey demo (main page)
├── login/page.tsx         # Login page
├── register/page.tsx      # Registration page
├── profile/page.tsx       # Profile page
├── logout/page.tsx        # Logout page
├── layout.tsx             # Root layout (includes Toaster)
└── page.tsx               # Home/navigation page

components/
├── RegisterForm.tsx       # Registration form (email/password)
├── LoginForm.tsx          # Login form (email/password)
├── LogoutButton.tsx       # Logout button
└── ui/button.tsx          # Reusable button (Radix UI + CVA)

lib/
├── auth.ts                # Server-side WebAuthn + in-memory challenge store
├── webauth.ts             # Client-side WebAuthn operations (SimpleWebAuthn browser)
├── credential-store.ts    # localStorage CRUD for passkey credentials
├── session.ts             # iron-session management
├── config.ts              # Session + RP config (env-validated)
├── database.ts            # Prisma client singleton (dev-safe)
├── types.ts               # All shared TypeScript types (single source of truth)
└── utils.ts               # Utility functions (cn)

prisma/
└── schema.prisma          # User + Credential models

middleware.ts              # Route protection (/dashboard, /profile, /logout)
```

## Key Architecture Decisions

- **Session-based auth:** Uses `iron-session` encrypted cookies (SESSION_SECRET from env), not JWT
- **Challenge replay protection:** In-memory `Map<string, { expiresAt }>` stores server-issued challenges with 5-minute TTL. Each challenge is consumed (deleted) after single use.
- **WebAuthn flow is in the dashboard:** The `/dashboard` page is an interactive step-by-step demo of all 6 passkey lifecycle steps
- **Challenges are server-generated:** `crypto.randomBytes(32).toString("base64url")`
- **Server extracts challenges from clientDataJSON:** API routes don't receive challenges from the client body — they parse `clientDataJSON` and validate against the server-side store
- **Credential storage (demo):** `localStorage` via `lib/credential-store.ts`. In production, use the Prisma `Credential` model
- **Two auth paths:** Traditional email/password (session-based demo) and passkey (dashboard demo)
- **No password in session:** The `SessionData` type has no `password` field. Passwords are never stored in cookies or returned in API responses.
- **Centralized types:** All shared types live in `lib/types.ts` — never redefined in components

## Environment Variables

```
DATABASE_URL        # Supabase pooled connection (pgbouncer)
DIRECT_URL          # Supabase direct connection (migrations)
NEXT_PUBLIC_SITE_ID # WebAuthn RP ID (e.g., localhost for dev)
NEXT_PUBLIC_URL     # WebAuthn expected origin (e.g., http://localhost:3000)
SESSION_SECRET      # iron-session encryption key (min 32 chars)
```

`SESSION_SECRET` is **required** — the app will throw at startup if it's missing. Generate with:
```bash
openssl rand -base64 32
```

## Conventions

- Use `"use client"` directive only where client-side APIs are needed
- Server actions go in `app/actions/`
- API routes use Next.js Route Handlers in `app/api/`
- All shared types live in `lib/types.ts` — import from there, never redefine
- RP config is centralized in `lib/config.ts` — both `lib/auth.ts` and `lib/webauth.ts` derive from it
- Components use Tailwind CSS with blue-500 as primary color
- Error handling uses try-catch with toast notifications (react-hot-toast)
- Loading states tracked per-action via `isLoading` Record pattern
- Protected routes enforced via middleware (checks both `isLoggedIn` and `isPasskeyLoggedIn`)
- API responses never expose raw session objects — only explicitly selected fields
- Cookie security: `httpOnly`, `sameSite: "lax"`, `maxAge: 24h`

## Security Notes

- **No hardcoded secrets** — session password comes from `SESSION_SECRET` env var
- **Challenge replay protection** — each challenge is stored server-side, validated on use, then deleted
- **No password leakage** — passwords never appear in session cookies, error responses, or API outputs
- **Cookie hardening** — httpOnly (XSS), sameSite: lax (CSRF), maxAge (expiry)
- **Middleware checks both auth methods** — `isLoggedIn` OR `isPasskeyLoggedIn`
