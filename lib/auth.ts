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

// ─── Challenge Generation ─────────────────────────────────────────────
// Generates a cryptographic challenge for WebAuthn ceremonies.
//
// The challenge is a 32-byte random value encoded as base64url.
// It must be stored in the session cookie by the caller (server action)
// so it can be validated later by the API route that verifies the
// WebAuthn response.
//
// This approach works in serverless environments (e.g., Vercel) where
// in-memory state is not shared between function invocations.

export function createChallenge(): string {
  return crypto.randomBytes(32).toString("base64url");
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
 * The expectedChallenge is the challenge string previously stored in
 * the session cookie when `getChallenge()` was called. SimpleWebAuthn
 * extracts the challenge from clientDataJSON and compares it against
 * this value.
 */
export async function verifyRegistration(
  credential: RegistrationResponseJSON,
  expectedChallenge: string
): Promise<VerifiedRegistrationResponse> {
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge,
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
 * The expectedChallenge is the challenge string previously stored in
 * the session cookie when `getChallenge()` was called. SimpleWebAuthn
 * extracts the challenge from clientDataJSON and compares it against
 * this value.
 */
export async function verifyAuthentication(
  assertionCredential: AuthenticationResponseJSON,
  credential: WebAuthnCredential,
  expectedChallenge: string
): Promise<VerifiedAuthenticationResponse> {
  const verification = await verifyAuthenticationResponse({
    response: assertionCredential,
    expectedChallenge,
    credential,
    ...HOST_SETTINGS,
  });

  return verification;
}
