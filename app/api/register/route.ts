import { NextResponse } from "next/server";
import { verifyRegistration } from "@/lib/auth";

// POST /api/register — Verify a WebAuthn registration (attestation) response.
//
// The client sends the attestation credential from the browser's
// navigator.credentials.create() call. The server:
//   1. Verifies the attestation signature, origin, RP ID, and challenge
//      (challenge is validated internally via the server-side store)
//   2. Returns the credential ID, public key, and counter for client-side storage
//
// In production, step 2 would save the credential to a database instead.

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

    // ── Verify the registration attestation ───────────────────────────
    // verifyRegistration() handles challenge validation internally:
    // it extracts the challenge from clientDataJSON and validates it
    // against the server-side store (single-use, 5-minute TTL).
    const verification = await verifyRegistration(credential);

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
