import crypto from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CUSTOMER_SESSION_LAST_USED_REFRESH_MS,
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
} from "@/lib/customers/account-config";

type SessionPrisma = PrismaClient | Prisma.TransactionClient;

/**
 * كوكي العميل باسم مستقل تمامًا عن `tanal_session`.
 *
 * `middleware` يحرس `/dashboard` و`/barber` و`/platform` و`/receipt` بوجود
 * `tanal_session` وحدها. اسم مستقل يعني أن حيازة جلسة عميل **لا تفتح شيئًا** من
 * مسارات الموظفين ولو حاول صاحبها — الفصل بنيوي لا شرطيّ.
 *
 * الاسم نفسه معرَّف في `account-config.ts` بلا اعتماديات ليقرأه Edge Runtime.
 */
export {
  CUSTOMER_SESSION_COOKIE_NAME,
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
  CUSTOMER_SESSION_LAST_USED_REFRESH_MS,
} from "@/lib/customers/account-config";

export function createCustomerSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashCustomerSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getCustomerSessionExpiresAt(now = new Date()) {
  return new Date(now.getTime() + CUSTOMER_SESSION_MAX_AGE_SECONDS * 1000);
}

/** الرمز الخام يُعاد للمتصل مرة واحدة ولا يُخزَّن — القاعدة تحفظ تجزئته فقط. */
export async function createCustomerSession(
  prisma: SessionPrisma,
  input: { customerAccountId: string; ipAddress?: string | null; userAgent?: string | null },
) {
  const token = createCustomerSessionToken();
  const session = await prisma.customerSession.create({
    data: {
      customerAccountId: input.customerAccountId,
      tokenHash: hashCustomerSessionToken(token),
      expiresAt: getCustomerSessionExpiresAt(),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
  return { token, session };
}

export type CustomerAuthSession = {
  sessionId: string;
  account: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    emailVerifiedAt: Date | null;
  };
};

/**
 * يحلّ جلسة العميل من رمزها.
 *
 * يرفض المنتهية والملغاة والحساب المعطّل و**الحساب غير الموثّق بريده**: التحقق
 * شرط دخول لا لافتة، فلو مُنحت الجلسة قبله لكفى إنشاء حساب ببريد شخص آخر.
 */
export async function getCustomerAuthSession(
  prisma: PrismaClient,
  token?: string | null,
): Promise<CustomerAuthSession | null> {
  if (!token) return null;

  const session = await prisma.customerSession.findUnique({
    where: { tokenHash: hashCustomerSessionToken(token) },
    include: { account: true },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.account.status !== "ACTIVE") return null;
  if (!session.account.emailVerifiedAt) return null;

  if (Date.now() - session.lastUsedAt.getTime() > CUSTOMER_SESSION_LAST_USED_REFRESH_MS) {
    await prisma.customerSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  }

  return {
    sessionId: session.id,
    account: {
      id: session.account.id,
      name: session.account.name,
      phone: session.account.phone,
      email: session.account.email,
      emailVerifiedAt: session.account.emailVerifiedAt,
    },
  };
}

export async function revokeCustomerSession(prisma: SessionPrisma, token?: string | null) {
  if (!token) return;
  await prisma.customerSession.updateMany({
    where: { tokenHash: hashCustomerSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** تُستدعى بعد تغيير كلمة المرور: جلسة سُرقت قبل التغيير يجب أن تموت معه. */
export async function revokeAllCustomerSessions(prisma: SessionPrisma, customerAccountId: string) {
  await prisma.customerSession.updateMany({
    where: { customerAccountId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
