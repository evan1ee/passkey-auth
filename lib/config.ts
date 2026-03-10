// ─── Environment Validation ──────────────────────────────────────────
// Throws at startup if a required env var is missing, instead of
// silently falling back to insecure defaults.

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Check your .env file or deployment configuration.`
    );
  }
  return value;
}

// ─── Session Configuration ───────────────────────────────────────────
// iron-session encrypted cookie settings.
// SESSION_SECRET must be at least 32 characters.

export const sessionConfig = {
  cookieName: "next-iron-session",
  password: requiredEnv("SESSION_SECRET"),
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true, // Prevent XSS from reading the cookie
    sameSite: "lax" as const, // CSRF protection
    maxAge: 60 * 60 * 24, // 24 hours
  },
};

// ─── WebAuthn Relying Party Configuration ────────────────────────────
// Centralized RP settings used by both server verification (lib/auth.ts)
// and referenced by client WebAuthn calls (lib/webauth.ts).

export const rpConfig = {
  rpName: "Passkey Auth Demo",
  rpId: process.env.NEXT_PUBLIC_SITE_ID || "localhost",
  expectedOrigin: process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
};
