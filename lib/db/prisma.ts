import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: configuredDatabaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function configuredDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    const connectionLimit = positiveInteger(process.env.DATABASE_CONNECTION_LIMIT);
    const poolTimeout = positiveInteger(process.env.DATABASE_POOL_TIMEOUT);
    if (connectionLimit) url.searchParams.set("connection_limit", String(connectionLimit));
    if (poolTimeout) url.searchParams.set("pool_timeout", String(poolTimeout));
    return url.toString();
  } catch {
    // Prisma سيعطي رسالة DATABASE_URL الأصلية الأكثر وضوحًا عند البدء.
    return raw;
  }
}

function positiveInteger(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
