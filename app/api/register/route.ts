import { NextResponse } from "next/server";
import { verifyRegistration } from "@/lib/auth";
import { getSession } from "@/lib/session";

// POST /api/register — Verify a WebAuthn registration (attestation) response.
//
// The client sends the attestation credential from the browser's
// navigator.credentials.create() call. The server:
//   1. Reads the expected challenge from the session cookie
//   2. Verifies the attestation signature, origin, RP ID, and challenge
//   3. Returns the credential ID, public key, and counter for client-side storage
//
// In production, step 3 would save the credential to a database instead.

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body?.credential || typeof body.credential !== "object") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid credential" },
        { status: 400 }
      );
    }

    const { credential } = body;

    // ── Read and consume the challenge from the session cookie ─────────
    // The challenge was stored when the client called getChallenge().
    // We read it here and immediately clear it (single-use).
    const session = await getSession();
    const expectedChallenge = session.challenge;

    if (!expectedChallenge) {
      return NextResponse.json(
        { success: false, error: "No challenge found in session — generate a challenge first" },
        { status: 400 }
      );
    }

    // Clear the challenge (single-use: prevents replay attacks)
    session.challenge = undefined;
    await session.save();

    // ── Verify the registration attestation ───────────────────────────
    const verification = await verifyRegistration(credential, expectedChallenge);

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { success: false, error: "Registration verification failed" },
        { status: 400 }
      );
    }

    // ── Return credential data for client-side storage ────────────────
    // In production, save this to the database:
    //   await prisma.credential.create({
    //     data: {
    //       userId,
    //       externalId: regCredential.id,
    //       publicKey: Buffer.from(regCredential.publicKey),
    //       signCount: regCredential.counter,
    //     },
    //   });
    const { credential: regCredential } = verification.registrationInfo;

    return NextResponse.json(
      {
        success: true,
        data: {
          credentialId: regCredential.id,
          publicKey: Array.from(regCredential.publicKey), // Uint8Array → number[]
          counter: regCredential.counter,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Registration error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: "Invalid request format" },
        { status: 400 }
      );
    }

    // Surface the actual error message for debugging (safe because
    // verifyRegistration only throws known WebAuthn-related errors)
    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
