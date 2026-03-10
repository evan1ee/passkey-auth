import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
  WebAuthnCredential,
} from "@simplewebauthn/server";
import crypto from "crypto";
import { rpConfig } from "./config";

// ─── In-Memory Challenge Store ───────────────────────────────────────
// Stores server-issued challenges with TTL to prevent replay attacks.
// In production, replace this with a database-backed store (e.g. Prisma).
//
// IMPORTANT: We attach the Map to `globalThis` so it survives module
// re-evaluations in Next.js dev mode. Without this, server actions and
// API route handlers may get separate module instances (separate Maps),
// causing consumeChallenge() to fail because the challenge was stored
// in a different Map instance.

interface ChallengeEntry {
  expiresAt: number; // Unix timestamp in ms
}

const globalForChallenge = globalThis as unknown as {
  __challengeStore: Map<string, ChallengeEntry> | undefined;
};

const challengeStore =
  globalForChallenge.__challengeStore ?? new Map<string, ChallengeEntry>();
globalForChallenge.__challengeStore = challengeStore;

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of expired challenges (runs every 60 seconds)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of challengeStore) {
      if (entry.expiresAt < now) {
        challengeStore.delete(key);
      }
    }
  }, 60_000);
}

/**
 * Generate a cryptographic challenge and store it server-side.
 *
 * The challenge is a 32-byte random value encoded as base64url.
 * It is stored in memory with a 5-minute TTL. The client must use it
 * within that window, and it can only be consumed once.
 */
export function createChallenge(): string {
  const challenge = crypto.randomBytes(32).toString("base64url");

  challengeStore.set(challenge, {
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });

  return challenge;
}

/**
 * Validate and consume a challenge (single-use).
 *
 * Returns true if the challenge was issued by this server and hasn't expired.
 * The challenge is deleted after consumption to prevent replay attacks.
 */
export function consumeChallenge(value: string): boolean {
  const entry = challengeStore.get(value);

  if (!entry) {
    return false; // Challenge was never issued or already consumed
  }

  // Always delete — whether valid or expired
  challengeStore.delete(value);

  if (entry.expiresAt < Date.now()) {
    return false; // Challenge has expired
  }

  return true;
}

// ─── WebAuthn Host Settings ──────────────────────────────────────────
// Derived from centralized rpConfig. Used by both verification functions.

const HOST_SETTINGS = {
  expectedOrigin: rpConfig.expectedOrigin,
  expectedRPID: rpConfig.rpId,
};

// ─── Registration Verification ───────────────────────────────────────

/**
 * Verify a WebAuthn registration (attestation) response.
 *
 * Uses `expectedChallenge` as a validator function — SimpleWebAuthn extracts
 * the challenge from clientDataJSON internally and passes it to our function,
 * which validates it against the server-side challenge store (single-use).
 */
export async function verifyRegistration(
  credential: RegistrationResponseJSON
): Promise<VerifiedRegistrationResponse> {
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: (challenge: string) => consumeChallenge(challenge),
    requireUserVerification: true,
    ...HOST_SETTINGS,
  });

  if (!verification.verified) {
    throw new Error("Registration verification failed");
  }

  return verification;
}

// ─── Authentication Verification ─────────────────────────────────────

/**
 * Verify a WebAuthn authentication (assertion) response.
 *
 * Uses `expectedChallenge` as a validator function — SimpleWebAuthn extracts
 * the challenge from clientDataJSON internally and passes it to our function,
 * which validates it against the server-side challenge store (single-use).
 */
export async function verifyAuthentication(
  assertionCredential: AuthenticationResponseJSON,
  credential: WebAuthnCredential
): Promise<VerifiedAuthenticationResponse> {
  const verification = await verifyAuthenticationResponse({
    response: assertionCredential,
    expectedChallenge: (challenge: string) => consumeChallenge(challenge),
    credential,
    ...HOST_SETTINGS,
  });

  return verification;
}
