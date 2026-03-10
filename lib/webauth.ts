"use client";

import {
  browserSupportsWebAuthn,
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";

// ─── RP ID Resolution ────────────────────────────────────────────────
// Reads from NEXT_PUBLIC_SITE_ID. Falls back to "localhost" for dev.

function getRpId(): string {
  return process.env.NEXT_PUBLIC_SITE_ID || "localhost";
}

// ─── Registration ────────────────────────────────────────────────────
// Calls the browser's WebAuthn API to create a new credential (key pair).
// The private key stays on the device. The attestation response containing
// the public key is returned for server verification.

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
        id: getRpId(),
      },
      user: {
        id: crypto.randomUUID(),
        name: email,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256 (ECDSA w/ SHA-256)
        { alg: -257, type: "public-key" }, // RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)
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

// ─── Availability Check ──────────────────────────────────────────────

export const checkWebAuthnAvailability = () => {
  return browserSupportsWebAuthn();
};

// ─── Authentication ──────────────────────────────────────────────────
// Calls the browser's WebAuthn API to sign a challenge with an
// existing credential's private key. Returns an assertion response
// for server verification.
//
// When credentialId is provided, the browser is restricted to only
// that specific credential via allowCredentials. This prevents the
// user from accidentally selecting a different passkey than the one
// whose public key we have stored.

export const authenticateWithWebAuthn = async (
  challenge: string,
  credentialId?: string
) => {
  return await startAuthentication({
    optionsJSON: {
      challenge,
      timeout: 60000,
      userVerification: "required",
      rpId: getRpId(),
      allowCredentials: credentialId
        ? [{ id: credentialId, type: "public-key" }]
        : [],
    },
  });
};
