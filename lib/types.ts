import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

// ─── Session ─────────────────────────────────────────────────────────
// Stored in an encrypted iron-session cookie. Never includes passwords.
export interface SessionData {
  userId: string;
  username?: string;
  email: string;
  isLoggedIn: boolean;
  isPasskeyLoggedIn?: boolean;
  challenge?: string; // Current WebAuthn challenge (single-use, cleared after verification)
}

// ─── Server Action Form State ────────────────────────────────────────
// Returned by login/register server actions. Never includes passwords.
export interface AuthFormState {
  error?: string;
  email?: string;
}

// ─── Credential stored in localStorage ───────────────────────────────
// The public key and metadata saved client-side after passkey registration.
// In production, this would be stored in a database instead.
export interface StoredCredential {
  credentialId: string;
  publicKey: number[]; // Uint8Array serialized as number[] for JSON storage
  counter: number;
  createdAt: string; // ISO date string
}

// ─── API Params ──────────────────────────────────────────────────────

export type RegisterUserParams = {
  email: string;
  username: string;
  credential: RegistrationResponseJSON;
  challenge: string;
};

export type LoginUserParams = {
  email: string;
  credential: AuthenticationResponseJSON;
  challenge: string;
};
