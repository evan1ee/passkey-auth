import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionConfig } from "./config";
import type { SessionData } from "./types";

// Re-export the type so consumers can import from either location
export type { SessionData };

export const getSession = async () => {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionConfig
  );

  // Initialize session defaults
  if (!session.isLoggedIn) {
    session.isLoggedIn = false;
  }

  return session;
};
