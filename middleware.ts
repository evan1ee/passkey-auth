import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import type { NextRequest } from "next/server";

// ─── Route Protection Middleware ─────────────────────────────────────
// Redirects unauthenticated users to /login when accessing protected routes.
// Checks both traditional login (isLoggedIn) and passkey login (isPasskeyLoggedIn).

const protectedRoutes = ["/dashboard", "/profile", "/logout"];

export async function middleware(req: NextRequest) {
  const session = await getSession();

  const isProtectedRoute = protectedRoutes.some((route) =>
    req.nextUrl.pathname.startsWith(route)
  );

  // Allow access if the user is authenticated via either method
  if (isProtectedRoute && !session.isLoggedIn && !session.isPasskeyLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/profile", "/logout"],
};
