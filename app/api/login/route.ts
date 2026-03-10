import { NextResponse } from "next/server";
import { verifyAuthentication } from "@/lib/auth";
import { getSession } from "@/lib/session";

// POST /api/login — Verify a WebAuthn authentication (assertion) response.
//
// The client sends:
//   - assertionCredential: the browser's navigator.credentials.get() response
//   - credential: { id, publicKey, counter } from localStorage
//
// The server:
//   1. Reads the expected challenge from the session cookie
//   2. Verifies the assertion signature, origin, RP ID, and challenge
//   3. Creates an authenticated session
//
// In production, step 2 would look up the credential from a database
// by its ID, instead of trusting client-provided public key data.

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body?.assertionCredential || !body?.credential) {
      return NextResponse.json(
        { success: false, error: "Missing assertion credential or stored credential" },
        { status: 400 }
      );
    }

    const { assertionCredential, credential } = body;

    // Validate credential structure
    if (!credential?.id || !credential?.publicKey || credential?.counter == null) {
      return NextResponse.json(
        { success: false, error: "Invalid credential format" },
        { status: 400 }
      );
    }

    // ── Credential ID sanity check ──────────────────────────────────────
    // Ensure the assertion's credential ID matches the stored credential.
    // This prevents signature verification from silently failing when the
    // browser uses a different passkey than the one whose public key we have.
    if (assertionCredential.id !== credential.id) {
      console.error(
        "Credential ID mismatch:",
        `assertion=${assertionCredential.id}`,
        `stored=${credential.id}`
      );
      return NextResponse.json(
        {
          success: false,
          error: `Credential mismatch: the authenticator used a different passkey than the one stored. Clear your stored credentials and re-register.`,
        },
        { status: 400 }
      );
    }

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

    // ── Verify the authentication assertion ───────────────────────────
    // Reconstruct the public key as Uint8Array from the client-provided array.
    // In production, look up the credential from the database instead:
    //   const storedCredential = await prisma.credential.findUnique({
    //     where: { externalId: assertionCredential.id },
    //   });
    const publicKeyArray = new Uint8Array(credential.publicKey);

    const verificationResponse = await verifyAuthentication(
      assertionCredential,
      {
        id: credential.id,
        publicKey: publicKeyArray,
        counter: credential.counter,
      },
      expectedChallenge
    );

    if (!verificationResponse.verified) {
      return NextResponse.json(
        { success: false, error: "Signature verification failed — the stored public key may not match the authenticator's key. Try clearing credentials and re-registering." },
        { status: 401 }
      );
    }

    // ── Create authenticated session ──────────────────────────────────
    // Re-read session (challenge was already cleared above)
    const authSession = await getSession();
    authSession.isLoggedIn = true;
    authSession.isPasskeyLoggedIn = true;
    await authSession.save();

    return NextResponse.json(
      {
        success: true,
        data: {
          verified: true,
          newCounter: verificationResponse.authenticationInfo.newCounter,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Login error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: "Invalid request format" },
        { status: 400 }
      );
    }

    // Surface the actual error message for debugging (safe because
    // verifyAuthentication only throws known WebAuthn-related errors)
    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
