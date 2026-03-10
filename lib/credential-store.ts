"use client";

import type { StoredCredential } from "./types";

// ─── localStorage-based Credential Store ─────────────────────────────
// Persists WebAuthn credentials in the browser's localStorage.
// This is a demo-only approach. In production, credentials should be
// stored in a server-side database (e.g., Prisma Credential model).
//
// The public key is stored as number[] (serialized Uint8Array) because
// localStorage only supports JSON-serializable values.

const STORAGE_KEY = "passkey-credentials";

/**
 * Save a credential to localStorage after successful registration.
 */
export function saveCredential(credential: StoredCredential): void {
  const credentials = getAllCredentials();

  // Replace existing credential with same ID, or add new one
  const index = credentials.findIndex(
    (c) => c.credentialId === credential.credentialId
  );
  if (index >= 0) {
    credentials[index] = credential;
  } else {
    credentials.push(credential);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

/**
 * Retrieve all stored credentials.
 */
export function getAllCredentials(): StoredCredential[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredCredential[];
  } catch {
    return [];
  }
}

/**
 * Retrieve a specific credential by its ID.
 */
export function getCredential(
  credentialId: string
): StoredCredential | undefined {
  return getAllCredentials().find((c) => c.credentialId === credentialId);
}

/**
 * Update a credential's counter after successful authentication.
 * Returns true if the credential was found and updated.
 */
export function updateCredentialCounter(
  credentialId: string,
  newCounter: number
): boolean {
  const credentials = getAllCredentials();
  const credential = credentials.find((c) => c.credentialId === credentialId);

  if (!credential) return false;

  credential.counter = newCounter;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  return true;
}

/**
 * Remove a credential by its ID.
 */
export function removeCredential(credentialId: string): void {
  const credentials = getAllCredentials().filter(
    (c) => c.credentialId !== credentialId
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

/**
 * Clear all stored credentials.
 */
export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
}
