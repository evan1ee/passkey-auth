# Passkey Auth

A full-stack WebAuthn/Passkey authentication demo built with **Next.js 15**, **SimpleWebAuthn**, **Prisma**, and **iron-session**. This project demonstrates the complete passkey registration and login lifecycle with an interactive step-by-step dashboard.

## Features

- Passwordless authentication using WebAuthn/FIDO2 passkeys
- Interactive 6-step dashboard demonstrating the full passkey lifecycle
- Server-side credential verification with SimpleWebAuthn
- Server-side challenge store with replay protection (in-memory with TTL)
- Credential persistence via browser localStorage (database-ready Prisma schema included)
- Encrypted cookie sessions with iron-session (httpOnly, sameSite, maxAge)
- Route protection via Next.js middleware

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 (strict mode) |
| UI | React 19, Tailwind CSS 3.4 |
| WebAuthn | @simplewebauthn/browser + @simplewebauthn/server |
| Database | PostgreSQL (Supabase) via Prisma 6.3 (schema defined) |
| Sessions | iron-session (encrypted cookies) |
| Persistence | localStorage (demo) / Prisma (production-ready schema) |
| Package Manager | pnpm |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL database (optional — demo works without it using localStorage)

### Installation

```bash
git clone https://github.com/evan1ee/passkey-auth.git
cd passkey-auth
pnpm install
```

### Environment Variables

Create a `.env` file in the root:

```env
DATABASE_URL="postgresql://user:password@host:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/postgres"
NEXT_PUBLIC_SITE_ID=localhost
NEXT_PUBLIC_URL=http://localhost:3000
SESSION_SECRET=replace-me-with-a-random-string-at-least-32-chars
```

Generate a secure `SESSION_SECRET`:
```bash
openssl rand -base64 32
```

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Pooled database connection (used at runtime) |
| `DIRECT_URL` | Direct database connection (used for migrations) |
| `NEXT_PUBLIC_SITE_ID` | WebAuthn Relying Party ID — your domain (e.g., `localhost` for dev) |
| `NEXT_PUBLIC_URL` | WebAuthn expected origin — full URL including protocol |
| `SESSION_SECRET` | **Required.** iron-session encryption key (min 32 characters) |

### Database Setup (Optional)

```bash
npx prisma generate
npx prisma db push
```

### Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How Passkey Authentication Works

Passkeys use the **WebAuthn** (Web Authentication) standard to replace passwords with public-key cryptography. Instead of sending a shared secret (password) to the server, the user's device creates a **key pair** — the private key never leaves the device, and only the public key is stored server-side.

### Core Concepts

- **Relying Party (RP):** Your website/application that requests authentication
- **Authenticator:** The user's device (phone, laptop, security key) that creates and stores credentials
- **Challenge:** A random server-generated value stored server-side and consumed on use — prevents replay attacks
- **Attestation:** The authenticator's response during registration, containing the new public key
- **Assertion:** The authenticator's response during login, containing a signature proving possession of the private key

### The 6-Step Lifecycle

The passkey flow has two phases: **Registration** (steps 1-3) and **Authentication** (steps 4-6).

```
REGISTRATION                          AUTHENTICATION
┌──────────────────────┐              ┌──────────────────────┐
│ 1. Generate Challenge│              │ 4. Generate Challenge│
│    (Server)          │              │    (Server)          │
└──────────┬───────────┘              └──────────┬───────────┘
           │                                     │
           ▼                                     ▼
┌──────────────────────┐              ┌──────────────────────┐
│ 2. Create Credential │              │ 5. Get Assertion     │
│    (Browser/Device)  │              │    (Browser/Device)  │
└──────────┬───────────┘              └──────────┬───────────┘
           │                                     │
           ▼                                     ▼
┌──────────────────────┐              ┌──────────────────────┐
│ 3. Verify & Store    │              │ 6. Verify Signature  │
│    (Server)          │              │    (Server)          │
└──────────────────────┘              └──────────────────────┘
```

---

### Step 1 & 4: Generate Challenge (Server)

The server generates a cryptographically random challenge, stores it in an in-memory store with a 5-minute TTL, and returns it to the client. Each challenge can only be used once.

**`lib/auth.ts`** — Challenge generation and storage:

```typescript
import crypto from "crypto";

const challengeStore = new Map<string, { expiresAt: number }>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function createChallenge(): string {
  const challenge = crypto.randomBytes(32).toString("base64url");
  challengeStore.set(challenge, {
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return challenge;
}

export function consumeChallenge(value: string): boolean {
  const entry = challengeStore.get(value);
  if (!entry) return false;
  challengeStore.delete(value); // Single-use: delete after consumption
  return entry.expiresAt >= Date.now();
}
```

**How it works:**
1. `crypto.randomBytes(32)` generates 32 random bytes (256 bits of entropy)
2. `.toString("base64url")` encodes directly as Base64url (WebAuthn-compatible)
3. The challenge is stored server-side in a `Map` with a 5-minute expiry
4. On verification, `consumeChallenge()` checks validity and deletes it — preventing replay attacks

The challenge is exposed to the client via a server action:

```typescript
// app/actions/auth.ts
"use server";
import { createChallenge } from "@/lib/auth";

export async function getChallenge(): Promise<string> {
  return createChallenge();
}
```

---

### Step 2: Create Credential — Registration (Browser)

When the user clicks "Register Passkey", the browser prompts the authenticator (Touch ID, Face ID, Windows Hello, security key, etc.) to create a new key pair.

**`lib/webauth.ts`** — Client-side registration:

```typescript
"use client";
import { startRegistration } from "@simplewebauthn/browser";

export const registerWebAuthnCredential = async (
  challenge: string,
  username: string,
  email: string
) => {
  return await startRegistration({
    optionsJSON: {
      challenge,
      rp: {
        name: "Passkey Auth Demo",
        id: getRpId(), // From NEXT_PUBLIC_SITE_ID env var
      },
      user: {
        id: crypto.randomUUID(),
        name: email,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256 (ECDSA w/ SHA-256)
        { alg: -257, type: "public-key" },  // RS256 (RSASSA-PKCS1-v1_5)
      ],
      timeout: 60000,
      attestation: "direct",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    },
  });
};
```

**Key parameters explained:**

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `challenge` | Server-generated random string | Prevents replay attacks |
| `rp.id` | Your domain (e.g., `localhost`) | Binds the credential to your site |
| `rp.name` | Display name | Shown to user during prompt |
| `user.id` | Random UUID | Unique user handle (not the username) |
| `pubKeyCredParams` | ES256, RS256 | Supported signing algorithms |
| `attestation` | `"direct"` | Request attestation statement from authenticator |
| `residentKey` | `"required"` | Credential must be discoverable (stored on device) |
| `userVerification` | `"required"` | Biometric/PIN verification required |

**What happens under the hood:**
1. The browser calls the platform authenticator (Touch ID, Face ID, Windows Hello, etc.)
2. User performs biometric verification or enters a PIN
3. The authenticator generates a new **public/private key pair**
4. The **private key stays on the device** — it never leaves
5. The authenticator returns an **attestation response** containing the public key, credential ID, and a signature

---

### Step 3: Verify Registration & Store Credential (Server)

The attestation response is sent to the server. The server extracts the challenge from `clientDataJSON`, validates it against the server-side store, and verifies the attestation.

**`app/api/register/route.ts`** — Registration API endpoint:

```typescript
import { verifyRegistration, consumeChallenge } from "@/lib/auth";

export async function POST(request: Request) {
  const { credential } = await request.json();

  // 1. Extract challenge from the browser's clientDataJSON
  const clientDataJSON = JSON.parse(
    Buffer.from(credential.response.clientDataJSON, "base64url").toString()
  );

  // 2. Validate challenge was server-issued and unexpired
  if (!consumeChallenge(clientDataJSON.challenge)) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired challenge" },
      { status: 400 }
    );
  }

  // 3. Verify the attestation with SimpleWebAuthn
  const verification = await verifyRegistration(credential, clientDataJSON.challenge);

  // 4. Return credential data for client-side storage
  const { credential: regCredential } = verification.registrationInfo;
  return NextResponse.json({
    success: true,
    data: {
      credentialId: regCredential.id,
      publicKey: Array.from(regCredential.publicKey),
      counter: regCredential.counter,
    },
  });
}
```

**`lib/auth.ts`** — Server-side verification:

```typescript
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { rpConfig } from "./config";

export async function verifyRegistration(
  credential: RegistrationResponseJSON,
  expectedChallenge: string
) {
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge,
    requireUserVerification: true,
    expectedOrigin: rpConfig.expectedOrigin,
    expectedRPID: rpConfig.rpId,
  });

  if (!verification.verified) {
    throw new Error("Registration verification failed");
  }
  return verification;
}
```

**What the server checks:**
1. **Challenge valid** — extracted from clientDataJSON, validated against server-side store, consumed (single-use)
2. **Origin matches** — the request came from the expected domain (`NEXT_PUBLIC_URL`)
3. **RP ID matches** — the credential is bound to the correct relying party
4. **User verification** — the user performed biometric/PIN verification
5. **Attestation signature** — the attestation statement is cryptographically valid

**After verification**, the credential (ID, public key, counter) is saved to `localStorage` for persistence across page reloads. In production, this would be saved to the database:

```prisma
model Credential {
  id         Int      @id @default(autoincrement())
  user       User     @relation(fields: [userId], references: [id])
  userId     Int
  externalId String   @unique    // credential ID from WebAuthn
  publicKey  Bytes    @unique    // public key stored as binary
  signCount  Int      @default(0) // counter for clone detection

  @@index([externalId])
}
```

**Why `signCount` matters:** Each time the authenticator signs an assertion, it increments its internal counter. The server stores this counter and checks that it always increases. If the counter goes backwards, it indicates the credential may have been cloned.

---

### Step 5: Get Assertion — Authentication (Browser)

When the user clicks "Login with Passkey", the browser asks the authenticator to sign the challenge with the stored private key.

**`lib/webauth.ts`** — Client-side authentication:

```typescript
import { startAuthentication } from "@simplewebauthn/browser";

export const authenticateWithWebAuthn = async (challenge: string) => {
  return await startAuthentication({
    optionsJSON: {
      challenge,
      timeout: 60000,
      userVerification: "required",
      rpId: getRpId(),
    },
  });
};
```

**What happens:**
1. The browser shows available passkeys for the current domain
2. User selects a credential and performs biometric verification
3. The authenticator signs the challenge with the **private key**
4. Returns an **assertion response** containing the signature, credential ID, authenticator data, and updated sign count

**Key difference from registration:** No new key pair is created. The authenticator finds the existing credential for this RP and uses the stored private key to produce a signature.

---

### Step 6: Verify Authentication (Server)

The server extracts the challenge from the assertion's `clientDataJSON`, validates it, then verifies the signature using the stored public key.

**`app/api/login/route.ts`** — Login API endpoint:

```typescript
import { verifyAuthentication, consumeChallenge } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const { assertionCredential, credential } = await request.json();

  // 1. Extract and validate challenge from clientDataJSON
  const clientDataJSON = JSON.parse(
    Buffer.from(assertionCredential.response.clientDataJSON, "base64url").toString()
  );
  if (!consumeChallenge(clientDataJSON.challenge)) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired challenge" },
      { status: 400 }
    );
  }

  // 2. Verify signature using stored public key
  const publicKeyArray = new Uint8Array(credential.publicKey);
  const verification = await verifyAuthentication(
    assertionCredential,
    clientDataJSON.challenge,
    { id: credential.id, publicKey: publicKeyArray, counter: credential.counter }
  );

  // 3. Create authenticated session
  if (verification.verified) {
    const session = await getSession();
    session.isLoggedIn = true;
    session.isPasskeyLoggedIn = true;
    await session.save();
  }

  return NextResponse.json({
    success: true,
    data: { verified: true, newCounter: verification.authenticationInfo.newCounter },
  });
}
```

**What the server checks:**
1. **Challenge valid** — extracted from clientDataJSON, validated and consumed server-side
2. **Signature is valid** — produced by the private key matching the stored public key
3. **Origin and RP ID match** — credential was used on the correct domain
4. **Sign count incremented** — counter is greater than previously stored value (clone detection)

**On successful verification**, the session is updated with `isLoggedIn = true` and `isPasskeyLoggedIn = true`, and the counter is updated in localStorage.

---

### Full Sequence Diagram

```
┌────────┐                    ┌────────┐                    ┌───────────────┐
│ Browser │                    │ Server │                    │ Authenticator │
└───┬────┘                    └───┬────┘                    └──────┬────────┘
    │                             │                                │
    │  ══════ REGISTRATION ══════ │                                │
    │                             │                                │
    │  1. Request challenge       │                                │
    │  ────────────────────────►  │                                │
    │                             │  Generate + store challenge    │
    │  ◄────────────────────────  │                                │
    │       challenge             │                                │
    │                             │                                │
    │  2. startRegistration()     │                                │
    │  ──────────────────────────────────────────────────────────► │
    │                             │         Create key pair        │
    │                             │         User verification      │
    │  ◄────────────────────────────────────────────────────────── │
    │    attestation (public key, credential ID, signature)        │
    │                             │                                │
    │  3. POST /api/register      │                                │
    │  ────────────────────────►  │                                │
    │                             │  Extract + consume challenge   │
    │                             │  Verify attestation            │
    │  ◄────────────────────────  │                                │
    │       { credentialId,       │                                │
    │         publicKey, counter }│                                │
    │                             │                                │
    │  Save to localStorage       │                                │
    │                             │                                │
    │  ══════ AUTHENTICATION ════ │                                │
    │                             │                                │
    │  4. Request challenge       │                                │
    │  ────────────────────────►  │                                │
    │                             │  Generate + store challenge    │
    │  ◄────────────────────────  │                                │
    │       new challenge         │                                │
    │                             │                                │
    │  5. startAuthentication()   │                                │
    │  ──────────────────────────────────────────────────────────► │
    │                             │         Sign challenge         │
    │                             │         User verification      │
    │  ◄────────────────────────────────────────────────────────── │
    │    assertion (signature, credential ID, authenticator data)  │
    │                             │                                │
    │  6. POST /api/login         │                                │
    │  (assertion + credential    │                                │
    │   from localStorage)        │                                │
    │  ────────────────────────►  │                                │
    │                             │  Extract + consume challenge   │
    │                             │  Verify signature with         │
    │                             │  stored public key             │
    │                             │  Create session                │
    │  ◄────────────────────────  │                                │
    │       verified: true        │                                │
    │       session created       │                                │
    │                             │                                │
    │  Update counter in          │                                │
    │  localStorage               │                                │
```

---

### Why Passkeys Are More Secure Than Passwords

| Threat | Passwords | Passkeys |
|--------|-----------|----------|
| **Phishing** | User can be tricked into entering password on fake site | Credential is bound to the RP ID (domain) — won't work on a different domain |
| **Data breach** | Stolen password hashes can be cracked | Server only stores public key — useless without private key |
| **Replay attack** | Intercepted password can be reused | Each authentication uses a unique server-stored challenge (consumed after use) |
| **Credential stuffing** | Reused passwords across sites are exploited | Each credential is unique per site |
| **Brute force** | Weak passwords can be guessed | Private keys are cryptographic (256-bit) |
| **Man-in-the-middle** | Password can be intercepted in transit | Challenge-response with origin binding prevents MITM |

---

## Security Architecture

### Session Security
- **No hardcoded secrets:** Session encryption key from `SESSION_SECRET` env var
- **Cookie hardening:** `httpOnly: true` (XSS), `sameSite: "lax"` (CSRF), `maxAge: 24h` (expiry)
- **No password in session:** The `SessionData` type has no `password` field — passwords are never stored in cookies

### Challenge Replay Protection
- Challenges stored server-side in an in-memory `Map` with 5-minute TTL
- Each challenge consumed (deleted) after single use
- Server extracts challenges from `clientDataJSON` — never trusts client-supplied challenge values

### API Safety
- `/api/session` returns only explicitly selected safe fields — never the raw session object
- `/api/register` returns only `credentialId`, `publicKey`, `counter` — never full verification internals
- `/api/login` validates challenge before verification — rejects expired/reused challenges

### Route Protection
- Middleware checks **both** `isLoggedIn` and `isPasskeyLoggedIn` for protected routes
- Protected routes: `/dashboard`, `/profile`, `/logout`

---

## Session Management

Sessions use `iron-session` for encrypted cookie-based storage:

```typescript
// lib/types.ts
export interface SessionData {
  userId: string;
  username?: string;
  email: string;
  isLoggedIn: boolean;
  isPasskeyLoggedIn?: boolean;
}
```

The session tracks both traditional login (`isLoggedIn`) and passkey login (`isPasskeyLoggedIn`).

---

## Project Structure

```
app/
├── actions/auth.ts        # Server actions (login, register, logout, getChallenge)
├── api/
│   ├── register/route.ts  # POST — verify registration, return credential data
│   ├── login/route.ts     # POST — verify authentication assertion
│   └── session/route.ts   # GET — retrieve current session (safe fields)
├── dashboard/page.tsx     # Interactive passkey demo page
├── login/page.tsx
├── register/page.tsx
├── profile/page.tsx
└── layout.tsx             # Root layout (includes Toaster)

components/
├── RegisterForm.tsx       # Email/password registration form
├── LoginForm.tsx          # Email/password login form
├── LogoutButton.tsx
└── ui/button.tsx          # Radix UI button component

lib/
├── auth.ts                # WebAuthn verification + in-memory challenge store
├── webauth.ts             # Client-side WebAuthn (SimpleWebAuthn browser)
├── credential-store.ts    # localStorage CRUD for passkey credentials
├── session.ts             # iron-session management
├── config.ts              # Session + RP configuration (env-validated)
├── database.ts            # Prisma client singleton (dev-safe)
├── types.ts               # All shared TypeScript types
└── utils.ts               # Utility functions

prisma/
└── schema.prisma          # User + Credential models (DB-ready)
```

## Learn More

- [WebAuthn Guide](https://webauthn.guide/) — Introduction to WebAuthn
- [SimpleWebAuthn Docs](https://simplewebauthn.dev/docs/) — Library documentation
- [FIDO Alliance](https://fidoalliance.org/) — Passkey standards organization
- [Next.js Documentation](https://nextjs.org/docs) — Framework documentation
- [Prisma Documentation](https://www.prisma.io/docs) — ORM documentation

## License

MIT
