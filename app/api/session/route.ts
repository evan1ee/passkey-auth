import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// GET /api/session — Return the current user's session data.
// Only safe, explicitly selected fields are returned.
// Never exposes the raw iron-session object or internal metadata.

export async function GET() {
  const session = await getSession();

  return NextResponse.json({
    session: {
      userId: session.userId ?? "",
      username: session.username ?? "",
      email: session.email ?? "",
      isLoggedIn: session.isLoggedIn ?? false,
      isPasskeyLoggedIn: session.isPasskeyLoggedIn ?? false,
    },
  });
}
