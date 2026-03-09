# Passkey Auth

A full-stack WebAuthn/Passkey authentication demo built with **Next.js 15**, **SimpleWebAuthn**, **Prisma**, and **PostgreSQL**. This project demonstrates the complete passkey registration and login lifecycle with an interactive step-by-step dashboard.

## Features

- Passwordless authentication using WebAuthn/FIDO2 passkeys
- Interactive 6-step dashboard demonstrating the full passkey lifecycle
- Server-side credential verification with SimpleWebAuthn
- PostgreSQL credential storage via Prisma ORM
- Encrypted cookie sessions with iron-session
- Route protection via Next.js middleware

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 3.4 |
| WebAuthn | @simplewebauthn/browser + @simplewebauthn/server |
| Database | PostgreSQL (Supabase) via Prisma 6.3 |
| Sessions | iron-session |
| Package Manager | pnpm |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL database (or Supabase account)

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
```

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Pooled database connection (used at runtime) |
| `DIRECT_URL` | Direct database connection (used for migrations) |
| `NEXT_PUBLIC_SITE_ID` | WebAuthn Relying Party ID — your domain (e.g., `localhost` for dev) |
| `NEXT_PUBLIC_URL` | WebAuthn expected origin — full URL including protocol |

### Database Setup

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

Passkeys use the **WebAuthn** (Web Authentication) standard to replace passwords with public-key cryptography. Instead of sending a shared secret (password) to the server, the user's device creates a **key pair** — the private key never leaves the device, and only the public key is stored on the server.

### Core Concepts

- **Relying Party (RP):** Your website/application that requests authentication
- **Authenticator:** The user's device (phone, laptop, security key) that creates and stores credentials
- **Challenge:** A random server-generated value used to prevent replay attacks
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

The server generates a cryptographically random challenge to prevent replay attacks. The same function is used for both registration and authentication.

**`lib/auth.ts`** — Challenge generation:

```typescript
import crypto from "crypto";

// Helper to clean strings (Base64url encoding)
function clean(str: string) {
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Generate a challenge for registration or login
export function generateChallenge() {
  return clean(crypto.randomBytes(32).toString("base64"));
}
```

**How it works:**
1. `crypto.randomBytes(32)` generates 32 random bytes (256 bits of entropy)
2. Converts to Base64 string
3. `clean()` converts standard Base64 to **Base64url** format (replacing `+` with `-`, `/` with `_`, and stripping `=` padding) — required by the WebAuthn spec

The challenge is exposed to the client via a server action:

**`app/actions/auth.ts`**:

```typescript
"use server"
import { generateChallenge } from "@/lib/auth";

export async function getChallenge() {
  const challenge = generateChallenge();
  return challenge;
}
```

---

### Step 2: Create Credential — Registration (Browser)

When the user clicks "Register Passkey", the browser prompts the authenticator (device biometric, security key, etc.) to create a new key pair.

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
      challenge: challenge,
      rp: {
        name: "Passkey-authn",
        id: process.env.NEXT_PUBLIC_SITE_ID || "localhost",
      },
      user: {
        id: window.crypto.randomUUID(),
        name: email,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256 (ECDSA w/ SHA-256)
        { alg: -257, type: "public-key" },  // RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)
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
| `rp.name` | `"Passkey-authn"` | Display name shown to user |
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

The attestation response is sent to the server for verification, then the credential is stored in the database.

**`app/api/register/route.ts`** — Registration API endpoint:

```typescript
import { verifyRegistration } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const { credential, challenge } = body;

  // Verify the registration with SimpleWebAuthn
  const verificationResponse = await verifyRegistration(credential, challenge);

  return NextResponse.json({
    success: true,
    data: { verificationResponse },
  });
}
```

**`lib/auth.ts`** — Server-side verification:

```typescript
import { verifyRegistrationResponse } from "@simplewebauthn/server";

const HOST_SETTINGS = {
  expectedOrigin: process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
  expectedRPID: process.env.NEXT_PUBLIC_SITE_ID || "localhost",
};

export async function verifyRegistration(credential: any, challenge: string) {
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: challenge,
    requireUserVerification: true,
    ...HOST_SETTINGS,
  });

  if (!verification.verified) {
    throw new Error("Registration verification failed");
  }
  return verification;
}
```

**What the server checks:**
1. **Challenge matches** — the response contains the same challenge the server issued
2. **Origin matches** — the request came from the expected domain (`NEXT_PUBLIC_URL`)
3. **RP ID matches** — the credential is bound to the correct relying party (`NEXT_PUBLIC_SITE_ID`)
4. **User verification** — the user performed biometric/PIN verification
5. **Attestation signature** — the attestation statement is cryptographically valid

**After verification**, the credential data (ID, public key, counter) is extracted and stored:

**`prisma/schema.prisma`** — Database schema:

```prisma
model User {
  id          Int          @id @default(autoincrement())
  email       String       @unique
  username    String       @unique
  credentials Credential[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model Credential {
  id         Int      @id @default(autoincrement())
  user       User     @relation(fields: [userId], references: [id])
  userId     Int
  name       String?
  externalId String   @unique    // credential ID from WebAuthn
  publicKey  Bytes    @unique    // public key stored as binary
  signCount  Int      @default(0) // counter for clone detection
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([externalId])
}
```

**Why `signCount` matters:** Each time the authenticator signs an assertion, it increments its internal counter. The server stores this counter and checks that it always increases. If the counter ever goes backwards or doesn't increment, it could indicate the credential has been cloned — this is a security mechanism to detect credential duplication.

---

### Step 4: Generate Challenge (Server)

Same as Step 1 — a fresh random challenge is generated for the authentication ceremony. **A new challenge must be generated for every authentication attempt.**

---

### Step 5: Get Assertion — Authentication (Browser)

When the user clicks "Login with Passkey", the browser asks the authenticator to sign the challenge with the stored private key.

**`lib/webauth.ts`** — Client-side authentication:

```typescript
import { startAuthentication } from "@simplewebauthn/browser";

export const authenticateWithWebAuthn = async (challenge: string) => {
  return await startAuthentication({
    optionsJSON: {
      challenge: challenge,
      timeout: 60000,
      userVerification: "required",
      rpId: process.env.NEXT_PUBLIC_SITE_ID || "localhost",
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

The server verifies the assertion signature using the stored public key.

**`app/api/login/route.ts`** — Login API endpoint:

```typescript
import { verifyAuthentication } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json();
  const { assertionCredential, challenge, credential } = body;

  // Convert publicKey from JSON to Uint8Array
  const publicKeyArray = new Uint8Array(Object.values(credential.publicKey));

  // Verify the authentication signature
  const verificationResponse = await verifyAuthentication(
    assertionCredential,
    challenge,
    {
      id: credential.id,
      publicKey: publicKeyArray,
      counter: credential.counter,
    }
  );

  // On success, create an authenticated session
  if (verificationResponse.verified) {
    const session = await getSession();
    session.isPasskeyLoggedIn = true;
    await session.save();
  }

  return NextResponse.json({
    success: true,
    data: { verificationResponse },
  });
}
```

**`lib/auth.ts`** — Server-side authentication verification:

```typescript
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

export async function verifyAuthentication(
  assertionCredential: any,
  challenge: string,
  credential: WebAuthnCredential
) {
  const verification = await verifyAuthenticationResponse({
    response: assertionCredential,
    expectedChallenge: challenge,
    credential: credential,
    ...HOST_SETTINGS,
  });
  return verification;
}
```

**What the server checks:**
1. **Signature is valid** — the assertion signature was produced by the private key matching the stored public key
2. **Challenge matches** — prevents replay of old authentication responses
3. **Origin and RP ID match** — credential was used on the correct domain
4. **Sign count incremented** — counter is greater than previously stored value (clone detection)

**On successful verification**, the session is updated with `isPasskeyLoggedIn = true`, and the user is authenticated.

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
    │                             │  Generate random bytes         │
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
    │                             │  Verify attestation            │
    │                             │  Store public key + ID in DB   │
    │  ◄────────────────────────  │                                │
    │       verified: true        │                                │
    │                             │                                │
    │  ══════ AUTHENTICATION ════ │                                │
    │                             │                                │
    │  4. Request challenge       │                                │
    │  ────────────────────────►  │                                │
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
    │  ────────────────────────►  │                                │
    │                             │  Verify signature with         │
    │                             │  stored public key             │
    │                             │  Check sign count              │
    │                             │  Create session                │
    │  ◄────────────────────────  │                                │
    │       verified: true        │                                │
    │       session created       │                                │
```

---

### Why Passkeys Are More Secure Than Passwords

| Threat | Passwords | Passkeys |
|--------|-----------|----------|
| **Phishing** | User can be tricked into entering password on fake site | Credential is bound to the RP ID (domain) — won't work on a different domain |
| **Data breach** | Stolen password hashes can be cracked | Server only stores public key — useless without private key |
| **Replay attack** | Intercepted password can be reused | Each authentication uses a unique challenge |
| **Credential stuffing** | Reused passwords across sites are exploited | Each credential is unique per site |
| **Brute force** | Weak passwords can be guessed | Private keys are cryptographic (256-bit) |
| **Man-in-the-middle** | Password can be intercepted in transit | Challenge-response with origin binding prevents MITM |

---

## Session Management

Sessions use `iron-session` for encrypted cookie-based storage:

**`lib/session.ts`**:

```typescript
export interface SessionData {
  userId: string;
  username?: string;
  email: string;
  password?: string;
  isLoggedIn: boolean;
  isPasskeyLoggedIn?: boolean;
}
```

The session tracks both traditional login (`isLoggedIn`) and passkey login (`isPasskeyLoggedIn`) separately.

## Route Protection

**`middleware.ts`** protects routes by checking `session.isLoggedIn`:

```typescript
const protectedRoutes = ["/dashboard", "/profile", "/logout"];

if (isProtectedRoute && !session.isLoggedIn) {
  return NextResponse.redirect(new URL("/login", req.url));
}
```

---

## Project Structure

```
app/
├── actions/auth.ts        # Server actions (login, register, logout, getChallenge)
├── api/
│   ├── register/route.ts  # POST — verify WebAuthn registration
│   ├── login/route.ts     # POST — verify WebAuthn authentication
│   └── session/route.ts   # GET — retrieve current session
├── dashboard/page.tsx     # Interactive passkey demo page
├── login/page.tsx
├── register/page.tsx
├── profile/page.tsx
└── layout.tsx

components/
├── RegisterForm.tsx       # Email/password registration form
├── LoginForm.tsx          # Email/password login form
├── LogoutButton.tsx
└── ui/button.tsx          # Radix UI button component

lib/
├── auth.ts                # Server-side WebAuthn (SimpleWebAuthn server)
├── webauth.ts             # Client-side WebAuthn (SimpleWebAuthn browser)
├── session.ts             # iron-session management
├── config.ts              # Session cookie configuration
├── database.ts            # Prisma client singleton
├── types.ts               # Shared TypeScript types
└── utils.ts               # Utility functions

prisma/
└── schema.prisma          # User + Credential models
```

## Learn More

- [WebAuthn Guide](https://webauthn.guide/) — Introduction to WebAuthn
- [SimpleWebAuthn Docs](https://simplewebauthn.dev/docs/) — Library documentation
- [FIDO Alliance](https://fidoalliance.org/) — Passkey standards organization
- [Next.js Documentation](https://nextjs.org/docs) — Framework documentation
- [Prisma Documentation](https://www.prisma.io/docs) — ORM documentation

## License

MIT
