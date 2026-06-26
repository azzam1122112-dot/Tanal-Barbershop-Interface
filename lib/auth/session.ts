import crypto from "crypto";
import type { AuditActorType, PrismaClient, UserRole } from "@prisma/client";
import { getSessionExpiresAt } from "./config";
import { toSafeAdminUser, toSafeBarber } from "./sanitize";

export type AuthSession =
  | {
      type: "dashboard";
      id: string;
      role: "OWNER" | "ADMIN" | "SUPERVISOR";
      organizationId: string;
      salonId: string | null;
      user: ReturnType<typeof toSafeAdminUser>;
    }
  | {
      type: "barber";
      id: string;
      role: "BARBER";
      organizationId: string;
      salonId: string;
      barber: ReturnType<typeof toSafeBarber>;
    }
  | {
      type: "platform";
      id: string;
      admin: { id: string; name: string; email: string };
    };

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const USER_ACTOR_TYPES: AuditActorType[] = ["OWNER", "ADMIN", "SUPERVISOR"];

export async function createStoredSession({
  prisma,
  actorType,
  actorId,
  role,
  organizationId,
  activeSalonId,
  userAgent,
  ipAddress,
}: {
  prisma: PrismaClient;
  actorType: AuditActorType;
  actorId: string;
  role?: UserRole | null;
  organizationId?: string | null;
  activeSalonId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const isPlatform = actorType === "PLATFORM_ADMIN";

  const session = await prisma.session.create({
    data: {
      tokenHash,
      actorType,
      organizationId: organizationId ?? null,
      activeSalonId: activeSalonId ?? null,
      userId: USER_ACTOR_TYPES.includes(actorType) ? actorId : null,
      barberId: actorType === "BARBER" ? actorId : null,
      platformAdminId: isPlatform ? actorId : null,
      role: role ?? null,
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
      organization: true,
      platformAdmin: true,
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  });

  if (session.platformAdmin && session.platformAdmin.isActive) {
    return {
      type: "platform",
      id: session.id,
      admin: { id: session.platformAdmin.id, name: session.platformAdmin.name, email: session.platformAdmin.email },
    } satisfies AuthSession;
  }

  // امنع وصول مستأجري مؤسسة موقوفة.
  if (session.organization && session.organization.status === "SUSPENDED") {
    return null;
  }

  if (
    session.user &&
    session.user.isActive &&
    (session.role === "OWNER" || session.role === "ADMIN" || session.role === "SUPERVISOR")
  ) {
    const organizationId = session.organizationId ?? session.user.organizationId;
    if (!organizationId) return null;
    return {
      type: "dashboard",
      id: session.id,
      role: session.role,
      organizationId,
      salonId: session.activeSalonId ?? null,
      user: toSafeAdminUser(session.user),
    } satisfies AuthSession;
  }

  if (session.barber && session.barber.isActive && session.role === "BARBER") {
    const organizationId = session.organizationId ?? session.barber.organizationId;
    const salonId = session.activeSalonId ?? session.barber.salonId;
    if (!organizationId || !salonId) return null;
    return {
      type: "barber",
      id: session.id,
      role: "BARBER",
      organizationId,
      salonId,
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
