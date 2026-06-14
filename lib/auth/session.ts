import crypto from "crypto";
import type { AuditActorType, PrismaClient, UserRole } from "@prisma/client";
import { getSessionExpiresAt } from "./config";
import { toSafeAdminUser, toSafeBarber } from "./sanitize";

export type AuthSession =
  | {
      type: "dashboard";
      id: string;
      role: "ADMIN" | "SUPERVISOR";
      user: ReturnType<typeof toSafeAdminUser>;
    }
  | {
      type: "barber";
      id: string;
      role: "BARBER";
      barber: ReturnType<typeof toSafeBarber>;
    };

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createStoredSession({
  prisma,
  actorType,
  actorId,
  role,
  userAgent,
  ipAddress,
}: {
  prisma: PrismaClient;
  actorType: AuditActorType;
  actorId: string;
  role: UserRole;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);

  const session = await prisma.session.create({
    data: {
      tokenHash,
      actorType,
      userId: actorType === "ADMIN" || actorType === "SUPERVISOR" ? actorId : null,
      barberId: actorType === "BARBER" ? actorId : null,
      role,
      expiresAt: getSessionExpiresAt(),
      userAgent,
      ipAddress,
    },
  });

  return { token, session };
}

export async function getAuthSession(prisma: PrismaClient, token?: string | null) {
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: true,
      barber: true,
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  });

  if (session.user && session.user.isActive && (session.role === "ADMIN" || session.role === "SUPERVISOR")) {
    return {
      type: "dashboard",
      id: session.id,
      role: session.role,
      user: toSafeAdminUser(session.user),
    } satisfies AuthSession;
  }

  if (session.barber && session.barber.isActive && session.role === "BARBER") {
    return {
      type: "barber",
      id: session.id,
      role: "BARBER",
      barber: toSafeBarber(session.barber),
    } satisfies AuthSession;
  }

  return null;
}

export async function revokeSession(prisma: PrismaClient, token?: string | null) {
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({ where: { tokenHash } });

  if (!session || session.revokedAt) {
    return null;
  }

  return prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });
}
