"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { createChallenge } from "@/lib/auth";
import type { AuthFormState } from "@/lib/types";

// ─── Login ───────────────────────────────────────────────────────────
// Validates email against session-stored email (demo-only approach).
// In production, look up the user from a database and use bcrypt.compare().

export async function login(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const session = await getSession();

  // Check if already logged in
  if (session.isLoggedIn) {
    return redirect("/dashboard");
  }

  // Demo: compare against session-stored email (set during registration).
  // SECURITY NOTE: In production, replace this with:
  //   const user = await prisma.user.findUnique({ where: { email } });
  //   const valid = await bcrypt.compare(password, user.passwordHash);
  if (email !== session.email) {
    return { error: "Invalid credentials", email };
  }

  session.isLoggedIn = true;
  await session.save();

  return redirect("/dashboard");
}

// ─── Register ────────────────────────────────────────────────────────
// Stores user info in session (demo-only approach).
// In production, create a User record in the database with a hashed password.

export async function register(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const session = await getSession();
  session.destroy();

  // Demo: store user info in session cookie.
  // SECURITY NOTE: In production, replace this with:
  //   const passwordHash = await bcrypt.hash(password, 12);
  //   const user = await prisma.user.create({ data: { email, passwordHash } });
  session.userId = crypto.randomUUID();
  session.username = email;
  session.email = email;
  // NOTE: Password is NOT stored in the session. This is a demo that only
  // validates email matching. In production, use a database with hashed passwords.
  session.isLoggedIn = false;
  await session.save();

  return redirect("/login");
}

// ─── Logout ──────────────────────────────────────────────────────────

export async function logout() {
  const session = await getSession();
  session.destroy();
  return redirect("/");
}

// ─── Challenge Generation ────────────────────────────────────────────
// Creates a server-side challenge for WebAuthn ceremonies.
// The challenge is stored in memory with a 5-minute TTL.

export async function getChallenge(): Promise<string> {
  return createChallenge();
}

// ─── Session Data ────────────────────────────────────────────────────
// Returns only safe session fields (never internal metadata).

export async function getUserSession() {
  const session = await getSession();
  return {
    userId: session.userId ?? "",
    username: session.username ?? "",
    email: session.email ?? "",
    isLoggedIn: session.isLoggedIn ?? false,
    isPasskeyLoggedIn: session.isPasskeyLoggedIn ?? false,
  };
}
