import type { PrismaClient } from "@prisma/client";
import webPush from "web-push";
import { BusinessError } from "@/lib/errors";
import { logger } from "@/lib/logger";

type PushPrisma = PrismaClient;

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  kind: "appointment" | "test";
};

export type BrowserPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const DEFAULT_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
]);

/** يمنع تحويل Web Push إلى HTTP client عام/SSRF. */
export function isTrustedPushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const configuredHosts = (process.env.WEB_PUSH_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);

  return (
    DEFAULT_PUSH_HOSTS.has(hostname) ||
    hostname.endsWith(".notify.windows.com") ||
    configuredHosts.includes(hostname)
  );
}

function getVapidConfig() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.WEB_PUSH_SUBJECT?.trim() ?? "";

  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** إعداد عام آمن للواجهة — المفتاح الخاص لا يغادر الخادم إطلاقًا. */
export function getBarberPushPublicConfig() {
  const config = getVapidConfig();
  return { enabled: Boolean(config), publicKey: config?.publicKey ?? null };
}

/**
 * اشتراك واحد لكل جلسة حلاق. عند دخول الحلاق من جهاز سبق أن اشترك، ننقل
 * نقطة النهاية بأمان إذا كانت الجلسة القديمة له أو كانت منتهية/ملغاة.
 * لا نسمح لجلسة حلاق بالاستيلاء على اشتراك نشط لحلاق آخر.
 */
export async function saveBarberPushSubscription(
  prisma: PushPrisma,
  input: {
    organizationId: string;
    barberId: string;
    sessionId: string;
    subscription: BrowserPushSubscription;
    userAgent?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const existingOwner = await tx.barberPushSubscription.findUnique({
      where: { endpoint: input.subscription.endpoint },
      select: {
        sessionId: true,
        organizationId: true,
        barberId: true,
        session: { select: { revokedAt: true, expiresAt: true } },
      },
    });
    if (existingOwner && existingOwner.sessionId !== input.sessionId) {
      const sameBarber =
        existingOwner.organizationId === input.organizationId && existingOwner.barberId === input.barberId;
      const oldSessionInactive = Boolean(existingOwner.session?.revokedAt) ||
        Boolean(existingOwner.session?.expiresAt && existingOwner.session.expiresAt <= new Date());
      if (!sameBarber && !oldSessionInactive) {
        throw new BusinessError("هذا الجهاز مرتبط بجلسة حلاق نشطة أخرى", 409);
      }
      await tx.barberPushSubscription.deleteMany({
        where: { endpoint: input.subscription.endpoint },
      });
    }

    await tx.barberPushSubscription.deleteMany({
      where: { sessionId: input.sessionId },
    });

    return tx.barberPushSubscription.create({
      data: {
        organizationId: input.organizationId,
        barberId: input.barberId,
        sessionId: input.sessionId,
        endpoint: input.subscription.endpoint,
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
        userAgent: input.userAgent?.slice(0, 500) || null,
      },
    });
  });
}

export async function deleteBarberPushSubscription(
  prisma: PushPrisma,
  input: { sessionId: string; endpoint?: string | null },
) {
  return prisma.barberPushSubscription.deleteMany({
    where: {
      sessionId: input.sessionId,
      ...(input.endpoint ? { endpoint: input.endpoint } : {}),
    },
  });
}

export async function hasBarberPushSubscription(prisma: PushPrisma, sessionId: string) {
  return Boolean(
    await prisma.barberPushSubscription.findUnique({
      where: { sessionId },
      select: { id: true },
    }),
  );
}

export async function sendBarberAppointmentPush(
  prisma: PushPrisma,
  input: {
    organizationId: string;
    barberId: string | null;
    appointmentId: string;
    customerName: string;
    startAt: Date;
  },
) {
  if (!input.barberId) return { sent: 0, stale: 0 };

  const date = new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(input.startAt);
  const time = new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(input.startAt);

  return sendToBarber(prisma, {
    organizationId: input.organizationId,
    barberId: input.barberId,
    payload: {
      title: "موعد جديد • XMANSX",
      body: `${input.customerName} — ${date}، ${time}`,
      url: "/barber#appointments",
      tag: `appointment-${input.appointmentId}`,
      kind: "appointment",
    },
  });
}

export async function sendBarberTestPush(
  prisma: PushPrisma,
  input: { organizationId: string; barberId: string },
) {
  return sendToBarber(prisma, {
    ...input,
    payload: {
      title: "تنبيهات XMANSX جاهزة",
      body: "ستصلك المواعيد الجديدة هنا فور تأكيدها.",
      url: "/barber#appointments",
      tag: "xmansx-push-test",
      kind: "test",
    },
  });
}

async function sendToBarber(
  prisma: PushPrisma,
  input: { organizationId: string; barberId: string; payload: PushPayload },
) {
  const config = getVapidConfig();
  if (!config) return { sent: 0, stale: 0 };

  const subscriptions = await prisma.barberPushSubscription.findMany({
    where: {
      organizationId: input.organizationId,
      barberId: input.barberId,
      session: { revokedAt: null, expiresAt: { gt: new Date() } },
    },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) {
    logger.info("barber_push_skipped_no_active_subscription", {
      barberId: input.barberId,
      kind: input.payload.kind,
    });
    return { sent: 0, stale: 0 };
  }

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(input.payload),
          {
            vapidDetails: config,
            TTL: input.payload.kind === "appointment" ? 86_400 : 300,
            urgency: "high",
            topic: input.payload.kind === "appointment" ? input.payload.tag.slice(0, 32) : input.payload.tag,
            timeout: 10_000,
          },
        );
        await prisma.barberPushSubscription.update({
          where: { id: subscription.id },
          data: { lastSuccessAt: new Date() },
        });
        return "sent" as const;
      } catch (error) {
        const statusCode = getPushStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          await prisma.barberPushSubscription.deleteMany({ where: { id: subscription.id } });
          return "stale" as const;
        }
        logger.warn("barber_push_delivery_failed", {
          barberId: input.barberId,
          subscriptionId: subscription.id,
          statusCode,
        });
        return "failed" as const;
      }
    }),
  );

  return {
    sent: results.filter((result) => result === "sent").length,
    stale: results.filter((result) => result === "stale").length,
  };
}

function getPushStatusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}
