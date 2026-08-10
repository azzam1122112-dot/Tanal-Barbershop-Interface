import crypto from "crypto";
import type { AuditActorType, PrismaClient, UserRole } from "@prisma/client";
import { SESSION_LAST_USED_REFRESH_MS, getSessionExpiresAt } from "./config";
import { toSafeAdminUser, toSafeBarber } from "./sanitize";

export type AuthSession =
  | {
      type: "dashboard";
      id: string;
      role: "OWNER" | "ADMIN" | "SUPERVISOR";
      organizationId: string;
      // الفرع النشط (فلتر العرض). `null` = عرض مجمّع: كل الفروع للمالك/المدير،
      // وكل الفروع المسندة للمشرف. استخدم `salonScopeWhere` دائمًا للاستعلام.
      salonId: string | null;
      // نطاق الفروع المسموح بها: null = كل الفروع (مالك/مدير)، مصفوفة = فروع المشرف المسندة.
      scopedSalonIds: string[] | null;
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
      mfaVerified: boolean;
      mfaSetupRequired: boolean;
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
  mfaVerifiedAt,
  mfaSetupOnly,
}: {
  prisma: PrismaClient;
  actorType: AuditActorType;
  actorId: string;
  role?: UserRole | null;
  organizationId?: string | null;
  activeSalonId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  mfaVerifiedAt?: Date | null;
  mfaSetupOnly?: boolean;
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
      mfaVerifiedAt: mfaVerifiedAt ?? null,
      mfaSetupOnly: mfaSetupOnly ?? false,
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

  // `lastUsedAt` مؤشر نشاط للصيانة فقط، ولا يُقرأ في أي مسار تشغيلي.
  // تحديثه في كل طلب كان يعني كتابة في DB مع كل صفحة ونداء API — نُخفّفه لفاصل ثابت.
  const now = new Date();
  if (!session.lastUsedAt || now.getTime() - session.lastUsedAt.getTime() >= SESSION_LAST_USED_REFRESH_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });
  }

  if (session.platformAdmin && session.platformAdmin.isActive) {
    return {
      type: "platform",
      id: session.id,
      mfaVerified: Boolean(session.mfaVerifiedAt && session.platformAdmin.mfaEnabledAt && !session.mfaSetupOnly),
      mfaSetupRequired: !session.platformAdmin.mfaEnabledAt && session.mfaSetupOnly,
      admin: { id: session.platformAdmin.id, name: session.platformAdmin.name, email: session.platformAdmin.email },
    } satisfies AuthSession;
  }

  if (session.user && session.user.isActive) {
    const liveRole = session.user.role;
    if (liveRole !== "OWNER" && liveRole !== "ADMIN" && liveRole !== "SUPERVISOR") return null;

    const organizationId = session.user.organizationId;
    if (!organizationId || (session.organizationId && session.organizationId !== organizationId)) return null;
    const organization =
      session.organizationId === organizationId
        ? session.organization
        : await prisma.organization.findUnique({ where: { id: organizationId }, select: { status: true } });
    if (!organization || organization.status === "SUSPENDED") return null;

    // المالك والمدير على مستوى المؤسسة (كل الفروع). المشرف مقيّد بفروعه المسندة فقط.
    if (liveRole === "SUPERVISOR") {
      const assignments = await prisma.staffSalon.findMany({
        where: { userId: session.user.id, salon: { isActive: true, organizationId } },
        select: { salonId: true },
      });
      const scopedSalonIds = assignments.map((row) => row.salonId);
      // مشرف بلا فروع مسندة (أو حُذفت فروعه) لا يملك أي نطاق تشغيلي — امنع الوصول.
      if (scopedSalonIds.length === 0) return null;
      // الفرع النشط إما أحد فروعه المسندة، أو null بمعنى «كل فروعي مجتمعة».
      // القيد الحقيقي يبقى `scopedSalonIds` عبر `salonScopeWhere` — لا يتسرّب فرع خارجه أبدًا.
      const salonId =
        session.activeSalonId && scopedSalonIds.includes(session.activeSalonId) ? session.activeSalonId : null;
      return {
        type: "dashboard",
        id: session.id,
        role: liveRole,
        organizationId,
        salonId,
        scopedSalonIds,
        user: toSafeAdminUser(session.user),
      } satisfies AuthSession;
    }

    const activeSalon = session.activeSalonId
      ? await prisma.salon.findFirst({
          where: { id: session.activeSalonId, organizationId, isActive: true },
          select: { id: true },
        })
      : null;
    return {
      type: "dashboard",
      id: session.id,
      role: liveRole,
      organizationId,
      salonId: activeSalon?.id ?? null,
      scopedSalonIds: null,
      user: toSafeAdminUser(session.user),
    } satisfies AuthSession;
  }

  if (session.barber && session.barber.isActive && session.role === "BARBER") {
    const organizationId = session.barber.organizationId;
    const salonId = session.barber.salonId;
    if (!organizationId || !salonId || (session.organizationId && session.organizationId !== organizationId)) return null;
    const salon = await prisma.salon.findFirst({
      where: { id: salonId, organizationId, isActive: true },
      select: { id: true, organization: { select: { status: true } } },
    });
    if (!salon || salon.organization.status === "SUSPENDED") return null;
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

  return prisma.$transaction(async (tx) => {
    // الاشتراك يحمل بيانات مواعيد شخصية؛ يُحذف في نفس معاملة إلغاء الجلسة.
    await tx.barberPushSubscription.deleteMany({ where: { sessionId: session.id } });
    return tx.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  });
}
