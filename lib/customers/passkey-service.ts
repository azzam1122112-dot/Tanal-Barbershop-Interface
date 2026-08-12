import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { BusinessError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { getWebAuthnConfig, isSecureWebAuthnOrigin } from "@/lib/auth/webauthn-config";
import { createCustomerSession } from "@/lib/customers/account-session";

/**
 * مفاتيح المرور — مصادقة العميل الأساسية.
 *
 * **لا بيانات بيومترية تصل الخادم إطلاقًا.** الجهاز يتحقق من صاحبه ببصمة أو وجه
 * أو رمز قفل، ثم يوقّع تحديًا بمفتاح خاص لا يغادره. ما نخزّنه مفتاح عام وعدّاد،
 * وكلاهما عديم القيمة بلا المفتاح الخاص.
 *
 * **التحقق كله بالمكتبة** (`@simplewebauthn/server`) — لا فكّ CBOR ولا تحقق
 * توقيع يدوي: هذا موضع لا يُكتب فيه تشفير بيد.
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function hashChallenge(challenge: string) {
  return crypto.createHash("sha256").update(challenge).digest("hex");
}

/** يرفض العمل على أصل غير آمن بدل إنتاج مفتاح لا يعمل أو يُعترض. */
function requireSecureConfig() {
  const config = getWebAuthnConfig();
  if (!config.expectedOrigins.some(isSecureWebAuthnOrigin)) {
    throw new BusinessError("الدخول السريع يتطلب اتصالًا آمنًا (HTTPS).", 503);
  }
  return config;
}

/**
 * يخزّن التحدي بتجزئته لا خامًا، ويُبطل تحديات الحساب السابقة لنفس الغرض.
 * تحديات المصادقة مجهولة الحساب فلا تُبطل شيئًا — سيّاق مختلف.
 */
async function storeChallenge(
  prisma: PrismaClient,
  input: { challenge: string; purpose: "PASSKEY_REGISTRATION" | "PASSKEY_AUTHENTICATION"; customerAccountId?: string | null },
) {
  if (input.customerAccountId) {
    await prisma.customerWebAuthnChallenge.updateMany({
      where: { customerAccountId: input.customerAccountId, purpose: input.purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  await prisma.customerWebAuthnChallenge.create({
    data: {
      customerAccountId: input.customerAccountId ?? null,
      purpose: input.purpose,
      challengeHash: hashChallenge(input.challenge),
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

/**
 * يستهلك التحدي **ذرّيًا**: `updateMany` بشرط `consumedAt = null`، والنجاح هو
 * `count === 1` وحده. طلبا تحقق متزامنان بنفس التحدي لا يمرّان معًا — وهو ما
 * يمنع إعادة التشغيل (replay) على مستوى التحدي نفسه.
 */
async function consumeChallenge(
  prisma: PrismaClient,
  input: { challenge: string; purpose: "PASSKEY_REGISTRATION" | "PASSKEY_AUTHENTICATION"; customerAccountId?: string | null },
) {
  const stored = await prisma.customerWebAuthnChallenge.findUnique({
    where: { challengeHash: hashChallenge(input.challenge) },
    select: { id: true, purpose: true, expiresAt: true, consumedAt: true, customerAccountId: true },
  });

  if (!stored) return false;
  if (stored.purpose !== input.purpose) return false;
  if (stored.consumedAt || stored.expiresAt <= new Date()) return false;
  // تحدي تسجيل صادر لحساب لا يُقبل من حساب آخر.
  if (input.customerAccountId && stored.customerAccountId && stored.customerAccountId !== input.customerAccountId) return false;

  const consumed = await prisma.customerWebAuthnChallenge.updateMany({
    where: { id: stored.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return consumed.count === 1;
}

// ————————————————————————— التسجيل —————————————————————————

/**
 * خيارات تسجيل مفتاح جديد، **مقيّدة بالحساب الحالي**.
 *
 * `userID` هو معرّف الحساب لا البريد ولا الجوال: البريد يتغيّر والجوال ليس هوية
 * هنا، والمعرّف ثابت. و`excludeCredentials` يمنع تسجيل مفتاح مسجَّل مسبقًا فيردّ
 * المتصفح مباشرةً بدل أن نكتشف التكرار بعد رحلة كاملة.
 */
export async function buildPasskeyRegistrationOptions(prisma: PrismaClient, accountId: string) {
  const config = requireSecureConfig();
  const account = await prisma.customerAccount.findUnique({
    where: { id: accountId },
    select: { id: true, name: true, email: true, status: true, emailVerifiedAt: true },
  });
  if (!account || account.status !== "ACTIVE") throw new BusinessError("الحساب غير نشط", 403);
  // لا مفتاح لحساب لم يُثبت بريده: البريد هو مسار الاستعادة الوحيد.
  if (!account.emailVerifiedAt) throw new BusinessError("فعّل بريدك قبل تفعيل الدخول السريع", 403);

  const existing = await prisma.customerPasskey.findMany({
    where: { customerAccountId: account.id, revokedAt: null },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: new TextEncoder().encode(account.id),
    userName: account.email ?? account.name,
    userDisplayName: account.name,
    attestationType: "none",
    excludeCredentials: existing.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports as never,
    })),
    authenticatorSelection: {
      /**
       * **`required` لا `preferred`**: المفتاح القابل للاكتشاف هو ما يجعل الدخول
       * ممكنًا بلا كتابة بريد. مع `preferred` قد يُنشئ الجهاز مفتاحًا غير قابل
       * للاكتشاف بصمت، فيفشل الدخول لاحقًا بلا سبب ظاهر للعميل.
       *
       * (المكتبة تشتقّ `requireResidentKey` القديم من هذه القيمة تلقائيًا —
       * لا نضبط الحقل المهجور بأنفسنا.)
       */
      residentKey: "required",
      /**
       * **تحقق فعلي من صاحب الجهاز** — بصمة أو Touch ID أو Face ID أو Windows
       * Hello أو رمز قفل الجهاز. أيّها يقرره الجهاز لا نحن. مع `preferred` تكفي
       * حيازة الجهاز، فيصير مفتاحًا يفتحه من سرق الهاتف المفتوح.
       */
      userVerification: "required",
    },
  });

  await storeChallenge(prisma, { challenge: options.challenge, purpose: "PASSKEY_REGISTRATION", customerAccountId: account.id });
  return options;
}

export async function verifyPasskeyRegistration(
  prisma: PrismaClient,
  input: { accountId: string; response: RegistrationResponseJSON; name?: string | null },
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  const config = requireSecureConfig();
  const challenge = input.response.response.clientDataJSON
    ? decodeClientChallenge(input.response.response.clientDataJSON)
    : null;
  if (!challenge || !(await consumeChallenge(prisma, { challenge, purpose: "PASSKEY_REGISTRATION", customerAccountId: input.accountId }))) {
    throw new BusinessError("انتهت صلاحية طلب التفعيل. حاول مرة أخرى.", 400);
  }

  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: challenge,
    expectedOrigin: config.expectedOrigins,
    expectedRPID: config.rpId,
    // الخادم يفرض التحقق ولا يكتفي بطلبه في الخيارات: الخيارات رجاء للمتصفح،
    // وهذا شرط قبول. مصادِق يوقّع بلا علم UV يُرفض هنا مهما قال الطلب.
    requireUserVerification: true,
  }).catch(() => null);

  if (!verification?.verified || !verification.registrationInfo) {
    throw new BusinessError("تعذر تفعيل الدخول السريع. حاول مرة أخرى.", 400);
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  const duplicate = await prisma.customerPasskey.findUnique({ where: { credentialId: credential.id }, select: { id: true } });
  if (duplicate) {
    // نفس المفتاح مسجَّل — لا صف ثانٍ ولا رسالة تقنية.
    throw new BusinessError("هذا الجهاز مفعّل مسبقًا على حسابك.", 409);
  }

  const passkey = await prisma.customerPasskey.create({
    data: {
      customerAccountId: input.accountId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: input.name?.trim() || null,
    },
  });

  await writeAuditLog({
    prisma,
    actorType: "CUSTOMER",
    action: "customer_account.passkey_registered",
    entityType: "CustomerPasskey",
    entityId: passkey.id,
    ...meta,
  });

  return { passkeyId: passkey.id };
}

// ————————————————————————— المصادقة —————————————————————————

/**
 * خيارات الدخول — **بلا بريد ولا تلميح لحساب**.
 *
 * قائمة `allowCredentials` فارغة عمدًا: المتصفح يعرض مفاتيح هذا النطاق ويختار
 * صاحبه. لو أرسلنا قائمة مبنية على بريد يكتبه الزائر لتحوّلت الشاشة إلى أداة
 * استكشاف تخبره أي بريد له مفتاح.
 */
export async function buildPasskeyAuthenticationOptions(prisma: PrismaClient) {
  const config = requireSecureConfig();
  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    userVerification: "required",
    // بلا `allowCredentials`: الدخول لا يعرف صاحبه بعد، والمتصفح يعرض مفاتيح
    // النطاق كلها فيختار العميل حسابه — وهذا ما يبقي عدة حسابات على جهاز واحد.
  });

  await storeChallenge(prisma, { challenge: options.challenge, purpose: "PASSKEY_AUTHENTICATION" });
  return options;
}

export type PasskeyLoginResult =
  | { outcome: "SUCCESS"; token: string; accountId: string }
  | { outcome: "INVALID" };

export async function verifyPasskeyAuthentication(
  prisma: PrismaClient,
  response: AuthenticationResponseJSON,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<PasskeyLoginResult> {
  const config = requireSecureConfig();
  const challenge = decodeClientChallenge(response.response.clientDataJSON);
  if (!challenge || !(await consumeChallenge(prisma, { challenge, purpose: "PASSKEY_AUTHENTICATION" }))) {
    return failed(prisma, meta);
  }

  // معرّف الاعتماد يُبحث عالميًا: الدخول لا يعرف صاحبه قبل هذه اللحظة.
  const passkey = await prisma.customerPasskey.findUnique({
    where: { credentialId: response.id },
    include: { account: { select: { id: true, status: true, emailVerifiedAt: true } } },
  });
  if (!passkey || passkey.revokedAt) return failed(prisma, meta);
  if (passkey.account.status !== "ACTIVE" || !passkey.account.emailVerifiedAt) return failed(prisma, meta, passkey.account.id);

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: config.expectedOrigins,
    expectedRPID: config.rpId,
    // نفس المبدأ: توكيد بلا علم UV مرفوض ولو مرّ كل ما عداه.
    requireUserVerification: true,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
      counter: Number(passkey.counter),
      transports: passkey.transports as never,
    },
  }).catch(() => null);

  if (!verification?.verified) return failed(prisma, meta, passkey.account.id);

  // عدّاد المكتبة هو المرجع، لكن كتابته يجب أن تكون رتيبة وذرّية أيضًا: مصادقتان
  // متزامنتان قد تتحققان من اللقطة القديمة نفسها، ولا يجوز للأبطأ أن يعيد العداد
  // إلى قيمة أصغر أو ينشئ جلسة بعد إلغاء المفتاح بين القراءة والكتابة.
  const counterClaimed = await advancePasskeyUsage(prisma, {
    passkeyId: passkey.id,
    storedCounter: passkey.counter,
    newCounter: BigInt(verification.authenticationInfo.newCounter),
  });
  if (!counterClaimed) return failed(prisma, meta, passkey.account.id);

  const { token } = await createCustomerSession(prisma, { customerAccountId: passkey.account.id, ...meta });
  await prisma.customerAccount.update({ where: { id: passkey.account.id }, data: { lastLoginAt: new Date() } });

  await writeAuditLog({
    prisma,
    actorType: "CUSTOMER",
    action: "customer_account.passkey_login_success",
    entityType: "CustomerAccount",
    entityId: passkey.account.id,
    ...meta,
  });

  return { outcome: "SUCCESS", token, accountId: passkey.account.id };
}

/**
 * يثبت تقدم عداد التوقيع دون lost update أو counter regression.
 *
 * بعض المصادقات لا تدعم العداد وتعيد صفرًا دائمًا؛ في هذه الحالة لا توجد إشارة
 * استنساخ نستطيع اختراعها، لكننا نظل نتحقق ذريًا أن المفتاح لم يُلغَ. أما العداد
 * المدعوم فلا تُقبل كتابته إلا إذا كان أكبر من القيمة الموجودة لحظة الكتابة.
 */
export async function advancePasskeyUsage(
  prisma: PrismaClient,
  input: { passkeyId: string; storedCounter: bigint; newCounter: bigint },
) {
  const zero = BigInt(0);
  const counterCondition = input.storedCounter === zero && input.newCounter === zero
    ? { equals: zero }
    : { lt: input.newCounter };

  const updated = await prisma.customerPasskey.updateMany({
    where: {
      id: input.passkeyId,
      revokedAt: null,
      counter: counterCondition,
    },
    data: { counter: input.newCounter, lastUsedAt: new Date() },
  });

  return updated.count === 1;
}

async function failed(
  prisma: PrismaClient,
  meta: { ipAddress?: string | null; userAgent?: string | null },
  accountId?: string,
): Promise<PasskeyLoginResult> {
  await writeAuditLog({
    prisma,
    actorType: "CUSTOMER",
    action: "customer_account.passkey_login_failed",
    entityType: "CustomerAccount",
    entityId: accountId ?? null,
    ...meta,
  });
  return { outcome: "INVALID" };
}

/** التحدي كما وقّعه المتصفح — يُقرأ من `clientDataJSON` لا من حقل يرسله العميل. */
function decodeClientChallenge(clientDataJSON: string) {
  try {
    const parsed = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8")) as { challenge?: string };
    return typeof parsed.challenge === "string" && parsed.challenge.length > 0 ? parsed.challenge : null;
  } catch {
    return null;
  }
}

// ————————————————————————— الإدارة —————————————————————————

export async function listPasskeys(prisma: PrismaClient, accountId: string) {
  const passkeys = await prisma.customerPasskey.findMany({
    where: { customerAccountId: accountId, revokedAt: null },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
  });
  return passkeys.map((passkey) => ({
    id: passkey.id,
    name: passkey.name,
    deviceType: passkey.deviceType,
    backedUp: passkey.backedUp,
    createdAt: passkey.createdAt.toISOString(),
    lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
  }));
}

/**
 * إلغاء مفتاح — **بقيد الملكية داخل `where`** لا بفحص لاحق.
 *
 * يجوز إلغاء آخر مفتاح: رمز البريد الموثّق يبقى مسار استعادة دائمًا، فلا يُترك
 * الحساب بلا طريق. والإلغاء وسم لا حذف، فيبقى أثره في التدقيق.
 */
export async function revokePasskey(
  prisma: PrismaClient,
  input: { accountId: string; passkeyId: string },
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  const revoked = await prisma.customerPasskey.updateMany({
    where: { id: input.passkeyId, customerAccountId: input.accountId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count !== 1) throw new BusinessError("طريقة الدخول غير موجودة", 404);

  await writeAuditLog({
    prisma,
    actorType: "CUSTOMER",
    action: "customer_account.passkey_revoked",
    entityType: "CustomerPasskey",
    entityId: input.passkeyId,
    ...meta,
  });
}
