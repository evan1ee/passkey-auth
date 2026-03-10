import { PrismaClient } from "@prisma/client";

// ─── Prisma Client Singleton ─────────────────────────────────────────
// In development, Next.js hot-reloads modules on every save, which would
// create a new PrismaClient instance each time and exhaust the database
// connection pool. This singleton pattern stores the client on `globalThis`
// so it's reused across hot reloads.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
