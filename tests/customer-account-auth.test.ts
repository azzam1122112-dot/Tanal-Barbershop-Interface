import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { CUSTOMER_SESSION_COOKIE_NAME, getCustomerAuthSession, hashCustomerSessionToken, revokeCustomerSession } from "../lib/customers/account-session";
import {
  loginCustomerAccount,
  registerCustomerAccount,
  requestPasswordReset,
  resetCustomerPassword,
  sendVerificationChallenge,
  verifyCustomerEmail,
} from "../lib/customers/account-auth";
import { CHALLENGE_MAX_ATTEMPTS, hashChallengeCode, safeCompare } from "../lib/customers/account-challenge";
import { createHash } from "node:crypto";
import { setEmailProvider, type EmailMessage, type EmailProvider } from "../lib/email/email-provider";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";

/**
 * مصادقة حساب العميل العالمي.
 *
 * البريد يمرّ عبر مزوّد وهمي يُحقن هنا: منطق الأعمال لا يعرف مزوّدًا، والاختبار
 * يقرأ الرمز من الرسالة لا من قاعدة البيانات (فهي لا تحفظه خامًا أصلًا).
 */

const prisma = new PrismaClient();
const ORG = "org_default";

// سرّ بصمات الرموز يأتي من البيئة وحدها؛ الاختبار يضبطه لنفسه بلا قيمة مضمَّنة في شيفرة الإنتاج.
process.env.CUSTOMER_OTP_PEPPER = process.env.CUSTOMER_OTP_PEPPER ?? "test-pepper-not-for-production";

class FakeEmailProvider implements EmailProvider {
  readonly name = "fake";
  readonly sent: EmailMessage[] = [];
  shouldFail = false;

  async send(message: EmailMessage) {
    if (this.shouldFail) throw new Error("provider down");
    this.sent.push(message);
  }

  lastCode() {
    const match = /(\d{6})/.exec(this.sent.at(-1)?.text ?? "");
    return match?.[1] ?? "";
  }
}

let mailer: FakeEmailProvider;
const createdAccountIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeEach(() => {
  mailer = new FakeEmailProvider();
  setEmailProvider(mailer);
});

afterEach(() => {
  setEmailProvider(null);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdAccountIds } } });
  await prisma.loyaltyAccount.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  await prisma.customerAccount.deleteMany({ where: { id: { in: createdAccountIds } } });
  await prisma.$disconnect();
}, 30000);

describe("customer account registration", () => {
  it("creates an unverified account and emails a six digit code", async () => {
    const identity = newIdentity();
    const result = await track(await registerCustomerAccount(prisma, identity));

    expect(result.outcome).toBe("CREATED");
    const account = await prisma.customerAccount.findUniqueOrThrow({ where: { emailNormalized: identity.email.toLowerCase() } });
    expect(account.emailVerifiedAt).toBeNull();
    // الرقم محفوظ للتواصل بشكله المعياري، وغير مُثبت وغير محجوز.
    expect(account.phone).toBe(identity.expectedPhone);
    expect(account.phoneNormalized).toBeNull();
    expect(account.emailNormalized).toBe(identity.email.toLowerCase());
    expect(mailer.lastCode()).toMatch(/^\d{6}$/);
  });

  it("stores the password hashed and never in clear text", async () => {
    const identity = newIdentity();
    await track(await registerCustomerAccount(prisma, identity));
    const account = await prisma.customerAccount.findUniqueOrThrow({ where: { emailNormalized: identity.email.toLowerCase() } });

    expect(account.passwordHash).not.toBe(identity.password);
    expect(account.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("stores the code as an HMAC bound to the challenge, not a bare hash", async () => {
    const identity = newIdentity();
    const { accountId } = (await track(await registerCustomerAccount(prisma, identity))) as { accountId: string };
    const challenge = await prisma.customerEmailChallenge.findFirstOrThrow({ where: { customerAccountId: accountId } });
    const code = mailer.lastCode();

    expect(challenge.codeHash).not.toBe(code);
    // ليست SHA-256 عارية: تلك يبني مهاجمٌ جدول المليون احتمال لها في ثوانٍ.
    expect(challenge.codeHash).not.toBe(createHash("sha256").update(code).digest("hex"));
    expect(challenge.codeHash).toBe(hashChallengeCode({ challengeId: challenge.id, purpose: challenge.purpose, code }));
    // ومربوطة بالتحدي: نفس الرمز في تحدٍّ آخر يعطي بصمة مختلفة.
    expect(hashChallengeCode({ challengeId: "another-challenge", purpose: challenge.purpose, code })).not.toBe(challenge.codeHash);
  });

  it("invalidates live challenges when the server pepper rotates", async () => {
    const { identity } = await registered();
    const code = mailer.lastCode();
    const original = process.env.CUSTOMER_OTP_PEPPER;

    process.env.CUSTOMER_OTP_PEPPER = "rotated-pepper-value";
    await expect(verifyCustomerEmail(prisma, { email: identity.email, code })).rejects.toThrow();

    process.env.CUSTOMER_OTP_PEPPER = original;
  });

  it("compares in constant time and returns false instead of throwing on length mismatch", () => {
    expect(safeCompare("abc123", "abc123")).toBe(true);
    expect(safeCompare("abc123", "abc124")).toBe(false);
    // اختلاف الطول: timingSafeEqual ترمي، والغلاف يردّ false بدل 500.
    expect(safeCompare("abc", "abcdef")).toBe(false);
    expect(safeCompare("", "x")).toBe(false);
  });

  it("rejects a verified email without revealing its owner", async () => {
    const { identity: first } = await verified();

    const sameEmail = await registerCustomerAccount(prisma, { ...newIdentity(), email: first.email });

    expect(sameEmail.outcome).toBe("EMAIL_TAKEN");
    expect(JSON.stringify(sameEmail)).not.toContain(first.name);
  });

  it("never lets an unproven phone be squatted or block its real owner", async () => {
    const shared = newIdentity();
    const attacker = await track(await registerCustomerAccount(prisma, { ...newIdentity(), phone: shared.phone }));
    const owner = await track(await registerCustomerAccount(prisma, { ...newIdentity(), phone: shared.phone }));

    // الرقم بيانات تواصل لا هوية: الحسابان قائمان ولا أحد يحجزه على الآخر.
    expect(attacker.outcome).toBe("CREATED");
    expect(owner.outcome).toBe("CREATED");
    const accounts = await prisma.customerAccount.findMany({ where: { phone: shared.expectedPhone } });
    expect(accounts).toHaveLength(2);
    // ولا واحد منهما يدّعي إثباتًا.
    expect(accounts.every((account) => account.phoneNormalized === null && account.phoneVerifiedAt === null)).toBe(true);
  });

  it("resends verification instead of creating a second row for an unverified retry", async () => {
    const identity = newIdentity();
    const first = await track(await registerCustomerAccount(prisma, identity));
    const retry = await registerCustomerAccount(prisma, identity);

    expect(retry.outcome).toBe("VERIFICATION_RESENT");
    expect((retry as { accountId: string }).accountId).toBe((first as { accountId: string }).accountId);
    expect(await prisma.customerAccount.count({ where: { emailNormalized: identity.email.toLowerCase() } })).toBe(1);
  });

  it("lets the database settle a race on email", async () => {
    const emailRace = newIdentity();
    const emailResults = await Promise.allSettled([
      registerCustomerAccount(prisma, emailRace),
      registerCustomerAccount(prisma, { ...newIdentity(), email: emailRace.email }),
    ]);
    trackAll(emailResults);

    // لا انفجار 500: التعارض يعود نتيجةَ أعمال مفهومة.
    expect(emailResults.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await prisma.customerAccount.count({ where: { emailNormalized: emailRace.email.toLowerCase() } })).toBe(1);
  });

  it("never links or claims a legacy customer that shares the phone", async () => {
    const identity = newIdentity();
    const legacy = await createCustomerWithLoyalty({
      prisma,
      organizationId: ORG,
      name: "عميل قديم",
      phone: `0${identity.expectedPhone.slice(-9)}`,
    });
    createdCustomerIds.push(legacy.customer.id);

    await track(await registerCustomerAccount(prisma, identity));

    expect((await prisma.customer.findUniqueOrThrow({ where: { id: legacy.customer.id } })).accountId).toBeNull();
    expect(await prisma.customer.count({ where: { accountId: { not: null } } })).toBe(0);
    // ولا مطالبة ضمنية: لا حساب واحد في النظام يدّعي رقمًا مُثبتًا.
    expect(await prisma.customerAccount.count({ where: { phoneVerifiedAt: { not: null } } })).toBe(0);
  });
});

describe("email verification", () => {
  it("verifies with the emailed code and opens a session", async () => {
    const { identity } = await registered();

    const { token } = await verifyCustomerEmail(prisma, { email: identity.email, code: mailer.lastCode() });
    const session = await getCustomerAuthSession(prisma, token);

    expect(session?.account.emailVerifiedAt).not.toBeNull();
    expect(session?.account.phone).toBe(identity.expectedPhone);
  });

  it("refuses a reused code", async () => {
    const { identity } = await registered();
    const code = mailer.lastCode();
    await verifyCustomerEmail(prisma, { email: identity.email, code });

    await expect(verifyCustomerEmail(prisma, { email: identity.email, code })).rejects.toThrow("موثّق مسبقًا");
  });

  it("refuses an expired code", async () => {
    const { identity, accountId } = await registered();
    await prisma.customerEmailChallenge.updateMany({
      where: { customerAccountId: accountId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(verifyCustomerEmail(prisma, { email: identity.email, code: mailer.lastCode() })).rejects.toThrow("انتهت صلاحيته");
  });

  it("locks the challenge after too many wrong attempts", async () => {
    const { identity } = await registered();

    for (let attempt = 0; attempt < CHALLENGE_MAX_ATTEMPTS; attempt += 1) {
      await expect(verifyCustomerEmail(prisma, { email: identity.email, code: "000000" })).rejects.toThrow();
    }

    // حتى الرمز الصحيح لا ينفع بعد استنفاد المحاولات.
    await expect(verifyCustomerEmail(prisma, { email: identity.email, code: mailer.lastCode() })).rejects.toThrow("انتهت محاولات");
  });

  it("invalidates the previous code when a new one is sent", async () => {
    const { identity, accountId } = await registered();
    const firstCode = mailer.lastCode();

    await sendVerificationChallenge(prisma, accountId);
    const secondCode = mailer.lastCode();

    expect(secondCode).not.toBe(firstCode);
    await expect(verifyCustomerEmail(prisma, { email: identity.email, code: firstCode })).rejects.toThrow();
    // الرمز الجديد وحده يعمل — بعد فشل القديم الذي استهلك محاولة.
    const { token } = await verifyCustomerEmail(prisma, { email: identity.email, code: secondCode });
    expect(token).toBeTruthy();
  });
});

describe("challenge hardening", () => {
  it("lets exactly one of two concurrent correct verifications win", async () => {
    const { identity } = await registered();
    const code = mailer.lastCode();

    const results = await Promise.allSettled([
      verifyCustomerEmail(prisma, { email: identity.email, code }),
      verifyCustomerEmail(prisma, { email: identity.email, code }),
    ]);
    const succeeded = results.filter((result) => result.status === "fulfilled");

    // الاستهلاك مشروط ذرّيًا: لا يظفر بالتحدي إلا من كتب الشرط أولًا.
    expect(succeeded).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const challenge = await prisma.customerEmailChallenge.findFirstOrThrow({
      where: { account: { emailNormalized: identity.email.toLowerCase() } },
      orderBy: { createdAt: "desc" },
    });
    expect(challenge.consumedAt).not.toBeNull();
  });

  it("persists failed attempts so guessing is never free", async () => {
    const { identity, accountId } = await registered();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(verifyCustomerEmail(prisma, { email: identity.email, code: "000000" })).rejects.toThrow();
    }

    // المحاولات لا تتراجع مع فشل الطلب — الزيادة عملية مستقلة لا داخل معاملة تُلغى.
    const afterFour = await prisma.customerEmailChallenge.findFirstOrThrow({
      where: { customerAccountId: accountId },
      orderBy: { createdAt: "desc" },
    });
    expect(afterFour.attemptCount).toBe(4);

    await expect(verifyCustomerEmail(prisma, { email: identity.email, code: "000000" })).rejects.toThrow();
    const afterFive = await prisma.customerEmailChallenge.findFirstOrThrow({
      where: { customerAccountId: accountId },
      orderBy: { createdAt: "desc" },
    });
    expect(afterFive.attemptCount).toBe(5);
    expect(afterFive.consumedAt).toBeNull();

    // والرمز الصحيح نفسه لا ينفع بعد استنفاد الحد.
    await expect(verifyCustomerEmail(prisma, { email: identity.email, code: mailer.lastCode() })).rejects.toThrow("انتهت محاولات");
  });
});

describe("email delivery failure", () => {
  it("keeps the account and says so instead of pretending registration failed", async () => {
    mailer.shouldFail = true;
    const identity = newIdentity();

    const result = await track(await registerCustomerAccount(prisma, identity));

    expect(result.outcome).toBe("ACCOUNT_CREATED_VERIFICATION_PENDING");
    // الحساب قائم فعلًا — ولا حذف تلقائي يفتح سباقًا.
    const account = await prisma.customerAccount.findUniqueOrThrow({ where: { emailNormalized: identity.email.toLowerCase() } });
    expect(account.emailVerifiedAt).toBeNull();
  });

  it("recovers through resend once the provider is back, without a second account", async () => {
    mailer.shouldFail = true;
    const identity = newIdentity();
    const pending = await track(await registerCustomerAccount(prisma, identity));

    mailer.shouldFail = false;
    await sendVerificationChallenge(prisma, (pending as { accountId: string }).accountId);
    const { token } = await verifyCustomerEmail(prisma, { email: identity.email, code: mailer.lastCode() });

    expect(await prisma.customerAccount.count({ where: { emailNormalized: identity.email.toLowerCase() } })).toBe(1);
    expect(await getCustomerAuthSession(prisma, token)).not.toBeNull();
  });
});

describe("login", () => {
  it("signs in with the verified email in any letter case", async () => {
    const { identity } = await verified();

    const byEmail = await loginCustomerAccount(prisma, { identifier: identity.email.toUpperCase(), password: identity.password });

    expect(byEmail.outcome).toBe("SUCCESS");
  });

  it("refuses a phone number as a login identifier while phones are unproven", async () => {
    const { identity } = await verified();

    const byLocalPhone = await loginCustomerAccount(prisma, { identifier: `0${identity.expectedPhone.slice(-9)}`, password: identity.password });
    const byInternational = await loginCustomerAccount(prisma, { identifier: identity.expectedPhone, password: identity.password });

    // توثيق البريد يثبت البريد وحده — فالجوال ليس معرّف دخول.
    expect([byLocalPhone.outcome, byInternational.outcome]).toEqual(["INVALID", "INVALID"]);
  });

  it("leaves the phone unverified when the email is verified", async () => {
    const { accountId } = await verified();
    const account = await prisma.customerAccount.findUniqueOrThrow({ where: { id: accountId } });

    expect(account.emailVerifiedAt).not.toBeNull();
    expect(account.phoneVerifiedAt).toBeNull();
    expect(account.phoneNormalized).toBeNull();
  });

  it("returns the same shape for a wrong password and an unknown identifier", async () => {
    const { identity } = await verified();

    const wrongPassword = await loginCustomerAccount(prisma, { identifier: identity.email, password: "wrong-password-99" });
    const unknown = await loginCustomerAccount(prisma, { identifier: "0500000000", password: identity.password });

    expect(wrongPassword).toEqual({ outcome: "INVALID" });
    expect(unknown).toEqual({ outcome: "INVALID" });
  });

  it("withholds a session while the email is unverified", async () => {
    const { identity } = await registered();

    const result = await loginCustomerAccount(prisma, { identifier: identity.email, password: identity.password });

    expect(result.outcome).toBe("EMAIL_UNVERIFIED");
    expect(await prisma.customerSession.count({ where: { account: { emailNormalized: identity.email.toLowerCase() } } })).toBe(0);
  });
});

describe("customer sessions", () => {
  it("stores only the token hash and resolves the live session", async () => {
    const { token } = await signedIn();

    const stored = await prisma.customerSession.findUniqueOrThrow({ where: { tokenHash: hashCustomerSessionToken(token) } });
    expect(stored.tokenHash).not.toBe(token);
    expect(await prisma.customerSession.findFirst({ where: { tokenHash: token } })).toBeNull();
    expect(await getCustomerAuthSession(prisma, token)).not.toBeNull();
  });

  it("rejects a revoked and an expired session", async () => {
    const revoked = await signedIn();
    await revokeCustomerSession(prisma, revoked.token);

    const expired = await signedIn();
    await prisma.customerSession.updateMany({
      where: { tokenHash: hashCustomerSessionToken(expired.token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await getCustomerAuthSession(prisma, revoked.token)).toBeNull();
    expect(await getCustomerAuthSession(prisma, expired.token)).toBeNull();
    expect(await getCustomerAuthSession(prisma, "not-a-token")).toBeNull();
  });
});

describe("password reset", () => {
  it("resets with the emailed code and kills every existing session", async () => {
    const { identity } = await verified();
    const live = await loginCustomerAccount(prisma, { identifier: identity.email, password: identity.password });
    const liveToken = (live as { token: string }).token;

    await requestPasswordReset(prisma, identity.email);
    await resetCustomerPassword(prisma, { email: identity.email, code: mailer.lastCode(), password: "brand-new-passphrase" });

    expect(await getCustomerAuthSession(prisma, liveToken)).toBeNull();
    expect((await loginCustomerAccount(prisma, { identifier: identity.email, password: identity.password })).outcome).toBe("INVALID");
    expect((await loginCustomerAccount(prisma, { identifier: identity.email, password: "brand-new-passphrase" })).outcome).toBe("SUCCESS");
  });

  it("stays silent and side-effect free for an unknown or unverified email", async () => {
    const unverified = await registered();
    const before = mailer.sent.length;

    await expect(requestPasswordReset(prisma, "nobody-here@example.com")).resolves.toBeUndefined();
    await expect(requestPasswordReset(prisma, unverified.identity.email)).resolves.toBeUndefined();

    // لا رسالة تُرسل في الحالتين، فلا يفرّق المجرِّب بينهما ولا بين حساب موجود وغيره.
    expect(mailer.sent.length).toBe(before);
  });
});

describe("session boundaries", () => {
  it("never lets a customer cookie open a staff route", () => {
    for (const pathname of ["/dashboard", "/barber", "/platform", "/receipt/abc"]) {
      const request = new NextRequest(`http://localhost:3000${pathname}`, {
        headers: { host: "xmansx.com", "x-forwarded-proto": "https" },
      });
      request.cookies.set(CUSTOMER_SESSION_COOKIE_NAME, "a-valid-looking-customer-token");

      const response = middleware(request);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toMatch(/login$/);
    }
  });

  it("never lets a staff cookie open the customer account area", () => {
    const request = new NextRequest("http://localhost:3000/account", {
      headers: { host: "xmansx.com", "x-forwarded-proto": "https" },
    });
    request.cookies.set("tanal_session", "a-valid-looking-staff-token");

    expect(middleware(request).headers.get("location")).toBe("https://xmansx.com/account/login");
  });

  it("keeps the public account pages reachable without any session", () => {
    for (const pathname of ["/account/login", "/account/register", "/account/verify", "/account/forgot-password", "/account/reset-password"]) {
      const response = middleware(new NextRequest(`http://localhost:3000${pathname}`, { headers: { host: "xmansx.com" } }));
      expect(response.headers.get("location")).toBeNull();
    }
  });
});

describe("audit trail", () => {
  it("records the lifecycle without any secret", async () => {
    const { identity, accountId } = await verified();
    await loginCustomerAccount(prisma, { identifier: identity.email, password: "wrong-password-99" });

    const logs = await prisma.auditLog.findMany({ where: { entityId: accountId } });
    const actions = logs.map((log) => log.action);
    const dump = JSON.stringify(logs);

    expect(actions).toEqual(expect.arrayContaining([
      "customer_account.registered",
      "customer_account.verification_sent",
      "customer_account.email_verified",
      "customer_account.login_failed",
    ]));
    expect(logs.every((log) => log.actorType === "CUSTOMER")).toBe(true);
    expect(dump).not.toContain(identity.password);
    expect(dump).not.toContain(mailer.lastCode());
    expect(dump).not.toMatch(/passwordHash|codeHash|tokenHash/);
  });
});

describe("email provider", () => {
  it("surfaces a safe configuration error instead of pretending to send", async () => {
    setEmailProvider(null);
    const previousProvider = process.env.EMAIL_PROVIDER;
    const previousKey = process.env.RESEND_API_KEY;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;

    const account = await prisma.customerAccount.create({
      data: { name: "بلا مزوّد", phone: "+966500000001", email: `noprovider.${Date.now()}@example.com`, emailNormalized: `noprovider.${Date.now()}@example.com` },
    });
    createdAccountIds.push(account.id);

    // الإرسال المباشر يرفع خطأ إعداد واضحًا بدل ابتلاعه بصمت.
    await expect(sendVerificationChallenge(prisma, account.id)).rejects.toThrow("غير مهيّأة");
    // والتسجيل لا ينفجر: يعلن نجاحًا جزئيًا قابلًا للاستعادة.
    const result = await track(await registerCustomerAccount(prisma, newIdentity()));
    expect(result.outcome).toBe("ACCOUNT_CREATED_VERIFICATION_PENDING");

    if (previousProvider !== undefined) process.env.EMAIL_PROVIDER = previousProvider;
    if (previousKey !== undefined) process.env.RESEND_API_KEY = previousKey;
    setEmailProvider(mailer);
  });

  it("refuses to hash a code when the server pepper is missing", async () => {
    const previous = process.env.CUSTOMER_OTP_PEPPER;
    delete process.env.CUSTOMER_OTP_PEPPER;

    // لا قيمة افتراضية مضمَّنة: غياب السرّ خطأ إعداد يُرفع لا سرّ يُختلق.
    expect(() => hashChallengeCode({ challengeId: "c", purpose: "EMAIL_VERIFICATION", code: "123456" })).toThrow("غير مهيّأ");

    process.env.CUSTOMER_OTP_PEPPER = previous;
  });
});

type Identity = { name: string; phone: string; email: string; password: string; expectedPhone: string };

function newIdentity(): Identity {
  const national = `5${Math.floor(10000000 + Math.random() * 89999999)}`;
  const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    name: "منصور الاختبار",
    phone: `0${national}`,
    email: `account.${tag}@Example.com`,
    password: "a-long-enough-passphrase",
    expectedPhone: `+966${national}`,
  };
}

/** يلتقط معرّف الحساب للتنظيف. النتائج التي لا تحمل معرّفًا (تعارض) تمرّ كما هي. */
async function track<T extends { outcome: string }>(result: T) {
  collect(result);
  return result;
}

function trackAll(results: PromiseSettledResult<{ outcome: string }>[]) {
  for (const result of results) {
    if (result.status === "fulfilled") collect(result.value);
  }
}

function collect(result: { outcome: string }) {
  const accountId = (result as { accountId?: unknown }).accountId;
  if (typeof accountId === "string") createdAccountIds.push(accountId);
}

async function registered() {
  const identity = newIdentity();
  const result = await track(await registerCustomerAccount(prisma, identity));
  return { identity, accountId: (result as { accountId: string }).accountId };
}

async function verified() {
  const context = await registered();
  await verifyCustomerEmail(prisma, { email: context.identity.email, code: mailer.lastCode() });
  return context;
}

async function signedIn() {
  const context = await verified();
  const login = await loginCustomerAccount(prisma, { identifier: context.identity.email, password: context.identity.password });
  return { ...context, token: (login as { token: string }).token };
}
