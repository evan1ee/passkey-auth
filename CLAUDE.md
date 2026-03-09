# CLAUDE.md — Project Guide for passkey-auth

## Project Overview

A WebAuthn/Passkey authentication demo built with Next.js 15, showcasing the full passkey registration and login lifecycle using the SimpleWebAuthn library.

## Tech Stack

- **Framework:** Next.js 15.1.11 (App Router, Turbopack)
- **Language:** TypeScript 5 (strict mode)
- **Runtime:** React 19
- **Styling:** Tailwind CSS 3.4
- **Database:** PostgreSQL (Supabase) via Prisma 6.3
- **Auth:** SimpleWebAuthn (browser + server), iron-session
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
│   ├── register/route.ts  # POST - verify WebAuthn registration
│   ├── login/route.ts     # POST - verify WebAuthn authentication
│   └── session/route.ts   # GET - retrieve current session
├── dashboard/page.tsx     # Interactive passkey demo (main page)
├── login/page.tsx         # Login page
├── register/page.tsx      # Registration page
├── profile/page.tsx       # Profile page
├── logout/page.tsx        # Logout page
├── layout.tsx             # Root layout
└── page.tsx               # Home/navigation page

components/
├── RegisterForm.tsx       # Registration form (email/password)
├── LoginForm.tsx          # Login form (email/password)
├── LogoutButton.tsx       # Logout button
└── ui/button.tsx          # Reusable button (Radix UI + CVA)

lib/
├── auth.ts                # Server-side WebAuthn verification (SimpleWebAuthn server)
├── webauth.ts             # Client-side WebAuthn operations (SimpleWebAuthn browser)
├── session.ts             # iron-session management + SessionData type
├── config.ts              # Session cookie config
├── database.ts            # Prisma client singleton
├── types.ts               # Shared TypeScript types
└── utils.ts               # Utility functions (cn)

prisma/
└── schema.prisma          # User + Credential models

middleware.ts              # Route protection (/dashboard, /profile, /logout)
```

## Key Architecture Decisions

- **Session-based auth:** Uses `iron-session` encrypted cookies, not JWT
- **WebAuthn flow is in the dashboard:** The `/dashboard` page is an interactive step-by-step demo of all 6 passkey lifecycle steps
- **Challenges are server-generated:** `crypto.randomBytes(32)` → Base64url encoded
- **Credential storage:** `Credential` model stores `externalId`, `publicKey` (Bytes), and `signCount`
- **Two auth paths:** Traditional email/password (RegisterForm/LoginForm) and passkey (dashboard demo)

## Environment Variables

```
DATABASE_URL        # Supabase pooled connection (pgbouncer)
DIRECT_URL          # Supabase direct connection (migrations)
NEXT_PUBLIC_SITE_ID # WebAuthn RP ID (e.g., yourdomain.com or localhost)
NEXT_PUBLIC_URL     # WebAuthn expected origin (e.g., https://yourdomain.com)
```

## Conventions

- Use `"use client"` directive only where client-side APIs are needed
- Server actions go in `app/actions/`
- API routes use Next.js Route Handlers in `app/api/`
- Components use Tailwind CSS with blue-500 as primary color
- Error handling uses try-catch with toast notifications (react-hot-toast)
- Loading states tracked per-action via `isLoading` object pattern
- Protected routes enforced via middleware, not layout-level checks
