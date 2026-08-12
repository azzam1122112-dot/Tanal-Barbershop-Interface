import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { deriveRpId, getWebAuthnConfig, isCustomerAuthProductionReady, isSecureWebAuthnOrigin } from "../lib/auth/webauthn-config";
import {
  advancePasskeyUsage,
  buildPasskeyAuthenticationOptions,
  buildPasskeyRegistrationOptions,
  listPasskeys,
  revokePasskey,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from "../lib/customers/passkey-service";
import { loginWithEmailOtp, requestLoginOtp } from "../lib/customers/account-auth";
import { getCustomerAuthSession } from "../lib/customers/account-session";
import { setEmailProvider, type EmailMessage, type EmailProvider } from "../lib/email/email-provider";
import { normalizeEmail } from "../lib/email/normalize-email";
import { toSaudiE164 } from "../lib/phone/saudi-phone";
import { VirtualAuthenticator } from "./helpers/virtual-authenticator";

/**
 * مفاتيح المرور ودخول الرمز البريدي.
 *
 * الاختبارات تستعمل **مصادِقًا افتراضيًا حقيقيًا** يوقّع بمفتاح ES256 فعلي، فما
 * يُتحقق منه هنا هو مسار التحقق الكامل في المكتبة لا محاكاة سطحية له.
 */

const prisma = new PrismaClient();
process.env.CUSTOMER_OTP_PEPPER = process.env.CUSTOMER_OTP_PEPPER ?? "test-pepper-not-for-production";
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-not-for-production";
process.env.WEBAUTHN_ORIGIN = "https://xmansx.test";
process.env.WEBAUTHN_RP_ID = "xmansx.test";

const ORIGIN = "https://xmansx.test";
const RP_ID = "xmansx.test";

class FakeEmailProvider implements EmailProvider {
  readonly name = "fake";
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
  lastCode() {
    return /(\d{6})/.exec(this.sent.at(-1)?.text ?? "")?.[1] ?? "";
  }
}

let mailer: FakeEmailProvider;
const createdAccountIds: string[] = [];

beforeEach(() => {
  mailer = new FakeEmailProvider();
  setEmailProvider(mailer);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdAccountIds } } });
  await prisma.customerAccount.deleteMany({ where: { id: { in: createdAccountIds } } });
  await prisma.$disconnect();
  setEmailProvider(null);
}, 30000);

describe("relying party configuration", () => {
  it("never derives the RP identity from request headers", () => {
    const source = readFileSync(join(process.cwd(), "lib/auth/webauthn-config.ts"), "utf8");

    expect(source).not.toMatch(/headers\(\)|x-forwarded-host|request\.headers/);
    // النطاق الأب المشترك: مفتاح على xmansx.com يعمل على www وبدونه.
    expect(deriveRpId("https://www.xmansx.com")).toBe("xmansx.com");
    expect(deriveRpId("https://xmansx.com")).toBe("xmansx.com");
  });

  it("accepts both the canonical origin and its www form", () => {
    const config = getWebAuthnConfig({ WEBAUTHN_ORIGIN: "https://xmansx.com", NODE_ENV: "production" } as NodeJS.ProcessEnv);

    expect(config.rpId).toBe("xmansx.com");
    expect(config.expectedOrigins).toEqual(expect.arrayContaining(["https://xmansx.com", "https://www.xmansx.com"]));
  });

  it("treats plain http as insecure except on localhost", () => {
    expect(isSecureWebAuthnOrigin("https://xmansx.com")).toBe(true);
    expect(isSecureWebAuthnOrigin("http://localhost:3000")).toBe(true);
    expect(isSecureWebAuthnOrigin("http://xmansx.com")).toBe(false);
  });

  it("fails production readiness unless every customer-auth value is explicit and strong", () => {
    const valid = {
      NODE_ENV: "production",
      SESSION_SECRET: "s".repeat(32),
      CUSTOMER_OTP_PEPPER: "p".repeat(32),
      WEBAUTHN_RP_NAME: "XMANSX",
      WEBAUTHN_RP_ID: "xmansx.com",
      WEBAUTHN_ORIGIN: "https://xmansx.com",
    } as NodeJS.ProcessEnv;

    expect(isCustomerAuthProductionReady(valid)).toBe(true);
    for (const key of ["SESSION_SECRET", "CUSTOMER_OTP_PEPPER", "WEBAUTHN_RP_NAME", "WEBAUTHN_RP_ID", "WEBAUTHN_ORIGIN"] as const) {
      expect(isCustomerAuthProductionReady({ ...valid, [key]: "" })).toBe(false);
    }
    expect(isCustomerAuthProductionReady({ ...valid, WEBAUTHN_ORIGIN: "http://xmansx.com" })).toBe(false);
  });
});

describe("passkey registration", () => {
  it("registers a passkey for a verified account and stores no biometric data", async () => {
    const account = await createVerifiedAccount();
    const authenticator = new VirtualAuthenticator(RP_ID, ORIGIN);

    const options = await buildPasskeyRegistrationOptions(prisma, account.id);
    const attestation = await authenticator.register(options);
    const { passkeyId } = await verifyPasskeyRegistration(prisma, { accountId: account.id, response: attestation, name: "آيفون منصور" });

    const stored = await prisma.customerPasskey.findUniqueOrThrow({ where: { id: passkeyId } });
    expect(stored.customerAccountId).toBe(account.id);
    expect(stored.name).toBe("آيفون منصور");
    // المخزَّن مفتاح عام ومعرّف وعدّاد — لا شيء بيومتري.
    const columns = Object.keys(stored).join(" ").toLowerCase();
    expect(columns).not.toMatch(/fingerprint|biometric|faceid|template|privatekey/);
    expect(stored.publicKey.length).toBeGreaterThan(0);
  });

  it("refuses registration for an unverified account", async () => {
    const account = await createAccount({ verified: false });

    await expect(buildPasskeyRegistrationOptions(prisma, account.id)).rejects.toThrow("فعّل بريدك");
  });

  it("refuses a duplicate credential instead of creating a second row", async () => {
    const account = await createVerifiedAccount();
    const authenticator = new VirtualAuthenticator(RP_ID, ORIGIN);
    const first = await authenticator.register(await buildPasskeyRegistrationOptions(prisma, account.id));
    await verifyPasskeyRegistration(prisma, { accountId: account.id, response: first });

    // نفس المصادِق ونفس الاعتماد: التحدي جديد لكن المعرّف مكرر.
    const options = await buildPasskeyRegistrationOptions(prisma, account.id);
    const replay = await authenticator.register(options, { reuseCredential: true });

    await expect(verifyPasskeyRegistration(prisma, { accountId: account.id, response: replay })).rejects.toThrow("مفعّل مسبقًا");
    expect(await prisma.customerPasskey.count({ where: { customerAccountId: account.id } })).toBe(1);
  });

  it("supports several passkeys on one account", async () => {
    const account = await createVerifiedAccount();
    for (const label of ["آيفون", "ويندوز"]) {
      const authenticator = new VirtualAuthenticator(RP_ID, ORIGIN);
      const options = await buildPasskeyRegistrationOptions(prisma, account.id);
      await verifyPasskeyRegistration(prisma, { accountId: account.id, response: await authenticator.register(options), name: label });
    }

    expect(await listPasskeys(prisma, account.id)).toHaveLength(2);
  });

  it("rejects a registration challenge issued for another account", async () => {
    const owner = await createVerifiedAccount();
    const attacker = await createVerifiedAccount();
    const authenticator = new VirtualAuthenticator(RP_ID, ORIGIN);
    const options = await buildPasskeyRegistrationOptions(prisma, owner.id);
    const attestation = await authenticator.register(options);

    await expect(verifyPasskeyRegistration(prisma, { accountId: attacker.id, response: attestation })).rejects.toThrow("انتهت صلاحية");
  });
});

describe("hardened webauthn policy", () => {
  it("asks the authenticator for a discoverable credential and real user verification", async () => {
    const account = await createVerifiedAccount();

    const options = await buildPasskeyRegistrationOptions(prisma, account.id);

    expect(options.authenticatorSelection?.residentKey).toBe("required");
    expect(options.authenticatorSelection?.userVerification).toBe("required");
    // المكتبة تشتقّ الحقل القديم من `residentKey` — نتحقق أنها فعلت.
    expect(options.authenticatorSelection?.requireResidentKey).toBe(true);
  });

  it("asks for user verification when signing in too", async () => {
    const options = await buildPasskeyAuthenticationOptions(prisma);

    expect(options.userVerification).toBe("required");
    // بلا قائمة اعتمادات: الدخول لا يعرف صاحبه، وعدة حسابات على الجهاز تبقى ممكنة.
    expect(options.allowCredentials ?? []).toHaveLength(0);
  });

  it("rejects a registration whose authenticator did not verify its owner", async () => {
    const account = await createVerifiedAccount();
    const authenticator = new VirtualAuthenticator(RP_ID, ORIGIN);
    const options = await buildPasskeyRegistrationOptions(prisma, account.id);

    // مصادِق اكتفى بالحيازة: علم UV مطفأ.
    const attestation = await authenticator.register(options, { userVerified: false });

    await expect(verifyPasskeyRegistration(prisma, { accountId: account.id, response: attestation })).rejects.toThrow();
    expect(await prisma.customerPasskey.count({ where: { customerAccountId: account.id } })).toBe(0);
  });

  it("rejects an assertion whose authenticator did not verify its owner", async () => {
    const { account, authenticator } = await registeredPasskey();

    const options = await buildPasskeyAuthenticationOptions(prisma);
    const result = await verifyPasskeyAuthentication(prisma, await authenticator.authenticate(options, { userVerified: false }));

    // الخادم يفرض UV ولا يكتفي بطلبه في الخيارات.
    expect(result.outcome).toBe("INVALID");
    // ولا جلسة تُفتح لصاحبه.
    expect(await prisma.customerSession.count({ where: { customerAccountId: account.id } })).toBe(0);
  });

  it("still accepts a fully verified registration and assertion", async () => {
    const { account, authenticator } = await registeredPasskey();

    const result = await verifyPasskeyAuthentication(prisma, await authenticator.authenticate(await buildPasskeyAuthenticationOptions(prisma)));

    expect(result.outcome).toBe("SUCCESS");
    expect(await prisma.customerPasskey.count({ where: { customerAccountId: account.id } })).toBe(1);
  });

  it("signs in with no email identifier at all", async () => {
    const { account, authenticator } = await registeredPasskey();

    // لا بريد ولا معرّف في أي خطوة — المتصفح يقدّم اعتمادًا قابلًا للاكتشاف.
    const options = await buildPasskeyAuthenticationOptions(prisma);
    const result = await verifyPasskeyAuthentication(prisma, await authenticator.authenticate(options));

    expect(result.outcome).toBe("SUCCESS");
    expect((result as { accountId: string }).accountId).toBe(account.id);
  });

  it("keeps several accounts usable from one authenticator device", async () => {
    const first = await createVerifiedAccount();
    const second = await createVerifiedAccount();
    // جهاز واحد، اعتمادان مستقلان — كما يحدث لعميل له حسابان على هاتفه.
    const deviceForFirst = new VirtualAuthenticator(RP_ID, ORIGIN);
    const deviceForSecond = new VirtualAuthenticator(RP_ID, ORIGIN);

    await verifyPasskeyRegistration(prisma, {
      accountId: first.id,
      response: await deviceForFirst.register(await buildPasskeyRegistrationOptions(prisma, first.id)),
    });
    await verifyPasskeyRegistration(prisma, {
      accountId: second.id,
      response: await deviceForSecond.register(await buildPasskeyRegistrationOptions(prisma, second.id)),
    });

    const asFirst = await verifyPasskeyAuthentication(prisma, await deviceForFirst.authenticate(await buildPasskeyAuthenticationOptions(prisma)));
    const asSecond = await verifyPasskeyAuthentication(prisma, await deviceForSecond.authenticate(await buildPasskeyAuthenticationOptions(prisma)));

    expect((asFirst as { accountId: string }).accountId).toBe(first.id);
    expect((asSecond as { accountId: string }).accountId).toBe(second.id);
  });

  it("leaves RP, origin and localhost rules untouched by the hardening", () => {
    const production = getWebAuthnConfig({ WEBAUTHN_ORIGIN: "https://xmansx.com", NODE_ENV: "production" } as NodeJS.ProcessEnv);
    const development = getWebAuthnConfig({ WEBAUTHN_ORIGIN: "http://localhost:3000", NODE_ENV: "development" } as NodeJS.ProcessEnv);

    expect(production.rpId).toBe("xmansx.com");
    expect(production.expectedOrigins).toEqual(expect.arrayContaining(["https://xmansx.com", "https://www.xmansx.com"]));
    expect(development.rpId).toBe("localhost");
    expect(isSecureWebAuthnOrigin("http://localhost:3000")).toBe(true);
    expect(isSecureWebAuthnOrigin("http://xmansx.com")).toBe(false);
  });
});

describe("passkey authentication", () => {
  it("signs in and opens a customer session", async () => {
    const { account, authenticator } = await registeredPasskey();

    const options = await buildPasskeyAuthenticationOptions(prisma);
    const result = await verifyPasskeyAuthentication(prisma, await authenticator.authenticate(options));

    expect(result.outcome).toBe("SUCCESS");
    const session = await getCustomerAuthSession(prisma, (result as { token: string }).token);
    expect(session?.account.id).toBe(account.id);
  });

  it("advances the signature counter", async () => {
    const { account, authenticator } = await registeredPasskey();
    const before = await prisma.customerPasskey.findFirstOrThrow({ where: { customerAccountId: account.id } });

    await verifyPasskeyAuthentication(prisma, await authenticator.authenticate(await buildPasskeyAuthenticationOptions(prisma)));

    const after = await prisma.customerPasskey.findFirstOrThrow({ where: { customerAccountId: account.id } });
    expect(Number(after.counter)).toBeGreaterThan(Number(before.counter));
    expect(after.lastUsedAt).not.toBeNull();
  });

  it("keeps the signature counter monotonic under concurrent writes", async () => {
    const { account } = await registeredPasskey();
    const passkey = await prisma.customerPasskey.findFirstOrThrow({ where: { customerAccountId: account.id } });
    await prisma.customerPasskey.update({ where: { id: passkey.id }, data: { counter: BigInt(10) } });

    const outcomes = await Promise.all([
      advancePasskeyUsage(prisma, { passkeyId: passkey.id, storedCounter: BigInt(10), newCounter: BigInt(11) }),
      advancePasskeyUsage(prisma, { passkeyId: passkey.id, storedCounter: BigInt(10), newCounter: BigInt(12) }),
    ]);

    expect(outcomes).toContain(true);
    expect((await prisma.customerPasskey.findUniqueOrThrow({ where: { id: passkey.id } })).counter).toBe(BigInt(12));
  });

  it("rejects an unknown credential, a revoked passkey and a disabled account", async () => {
    const stranger = new VirtualAuthenticator(RP_ID, ORIGIN);
    stranger.mintCredential();
    const unknown = await verifyPasskeyAuthentication(prisma, await stranger.authenticate(await buildPasskeyAuthenticationOptions(prisma)));

    const revokedCase = await registeredPasskey();
    const passkey = await prisma.customerPasskey.findFirstOrThrow({ where: { customerAccountId: revokedCase.account.id } });
    await revokePasskey(prisma, { accountId: revokedCase.account.id, passkeyId: passkey.id });
    const revoked = await verifyPasskeyAuthentication(prisma, await revokedCase.authenticator.authenticate(await buildPasskeyAuthenticationOptions(prisma)));

    const disabledCase = await registeredPasskey();
    await prisma.customerAccount.update({ where: { id: disabledCase.account.id }, data: { status: "DISABLED" } });
    const disabled = await verifyPasskeyAuthentication(prisma, await disabledCase.authenticator.authenticate(await buildPasskeyAuthenticationOptions(prisma)));

    expect(unknown.outcome).toBe("INVALID");
    expect(revoked.outcome).toBe("INVALID");
    expect(disabled.outcome).toBe("INVALID");
  });

  it("rejects a wrong origin, a wrong RP id and a forged challenge", async () => {
    const { authenticator } = await registeredPasskey();

    const wrongOrigin = new VirtualAuthenticator(RP_ID, "https://evil.example.com", authenticator.credential);
    const wrongRp = new VirtualAuthenticator("evil.example.com", ORIGIN, authenticator.credential);

    const options = await buildPasskeyAuthenticationOptions(prisma);
    const badOrigin = await verifyPasskeyAuthentication(prisma, await wrongOrigin.authenticate(options));
    const badRp = await verifyPasskeyAuthentication(prisma, await wrongRp.authenticate(await buildPasskeyAuthenticationOptions(prisma)));
    // تحدٍّ لم يصدره الخادم قط.
    const forged = await verifyPasskeyAuthentication(
      prisma,
      await authenticator.authenticate({ challenge: crypto.randomBytes(32).toString("base64url") }),
    );

    expect(badOrigin.outcome).toBe("INVALID");
    expect(badRp.outcome).toBe("INVALID");
    expect(forged.outcome).toBe("INVALID");
  });

  it("rejects an expired and an already consumed challenge", async () => {
    const { authenticator } = await registeredPasskey();

    const expiredOptions = await buildPasskeyAuthenticationOptions(prisma);
    await prisma.customerWebAuthnChallenge.updateMany({
      where: { consumedAt: null, purpose: "PASSKEY_AUTHENTICATION" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await verifyPasskeyAuthentication(prisma, await authenticator.authenticate(expiredOptions));

    const options = await buildPasskeyAuthenticationOptions(prisma);
    const first = await verifyPasskeyAuthentication(prisma, await authenticator.authenticate(options));
    const replayed = await verifyPasskeyAuthentication(prisma, await authenticator.authenticate(options));

    expect(expired.outcome).toBe("INVALID");
    expect(first.outcome).toBe("SUCCESS");
    // إعادة استعمال نفس التحدي مرفوضة — one-time use.
    expect(replayed.outcome).toBe("INVALID");
  });

  it("lets only one of two concurrent verifications win", async () => {
    const { authenticator } = await registeredPasskey();
    const options = await buildPasskeyAuthenticationOptions(prisma);
    const assertion = await authenticator.authenticate(options);

    const [a, b] = await Promise.all([
      verifyPasskeyAuthentication(prisma, assertion),
      verifyPasskeyAuthentication(prisma, assertion),
    ]);

    expect([a.outcome, b.outcome].filter((outcome) => outcome === "SUCCESS")).toHaveLength(1);
  });

  it("lets only one of two concurrent registrations win", async () => {
    const account = await createVerifiedAccount();
    const authenticator = new VirtualAuthenticator(RP_ID, ORIGIN);
    const attestation = await authenticator.register(await buildPasskeyRegistrationOptions(prisma, account.id));

    const results = await Promise.allSettled([
      verifyPasskeyRegistration(prisma, { accountId: account.id, response: attestation }),
      verifyPasskeyRegistration(prisma, { accountId: account.id, response: attestation }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.customerPasskey.count({ where: { customerAccountId: account.id } })).toBe(1);
  });
});

describe("passkey management", () => {
  it("revokes one passkey without touching the others", async () => {
    const account = await createVerifiedAccount();
    const ids: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const authenticator = new VirtualAuthenticator(RP_ID, ORIGIN);
      const options = await buildPasskeyRegistrationOptions(prisma, account.id);
      ids.push((await verifyPasskeyRegistration(prisma, { accountId: account.id, response: await authenticator.register(options) })).passkeyId);
    }

    await revokePasskey(prisma, { accountId: account.id, passkeyId: ids[0] });

    const remaining = await listPasskeys(prisma, account.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(ids[1]);
  });

  it("refuses to revoke a passkey owned by another account", async () => {
    const owner = await registeredPasskey();
    const stranger = await createVerifiedAccount();
    const passkey = await prisma.customerPasskey.findFirstOrThrow({ where: { customerAccountId: owner.account.id } });

    await expect(revokePasskey(prisma, { accountId: stranger.id, passkeyId: passkey.id })).rejects.toThrow("غير موجودة");
    expect((await prisma.customerPasskey.findUniqueOrThrow({ where: { id: passkey.id } })).revokedAt).toBeNull();
  });
});

describe("email otp login", () => {
  it("signs in a verified account with a LOGIN-purpose code", async () => {
    const account = await createVerifiedAccount();

    await requestLoginOtp(prisma, account.email!);
    const challenge = await prisma.customerEmailChallenge.findFirstOrThrow({
      where: { customerAccountId: account.id },
      orderBy: { createdAt: "desc" },
    });
    const result = await loginWithEmailOtp(prisma, { email: account.email!, code: mailer.lastCode() });

    // غرض مستقل: رمز الدخول ليس رمز تفعيل.
    expect(challenge.purpose).toBe("LOGIN");
    expect(mailer.sent.at(-1)?.subject).toBe("رمز تسجيل الدخول إلى حسابك");
    expect(mailer.sent.at(-1)?.tags).toContainEqual({ name: "message_type", value: "account_login" });
    expect(result.outcome).toBe("SUCCESS");
    expect(await getCustomerAuthSession(prisma, (result as { token: string }).token)).not.toBeNull();
  });

  it("does not send a login code to an unverified account and never reveals which", async () => {
    const unverified = await createAccount({ verified: false });
    const before = mailer.sent.length;

    await expect(requestLoginOtp(prisma, unverified.email!)).resolves.toBeUndefined();
    await expect(requestLoginOtp(prisma, "nobody-at-all@example.com")).resolves.toBeUndefined();

    // لا رسالة في الحالتين، ولا فرق يُقرأ بينهما.
    expect(mailer.sent.length).toBe(before);
  });

  it("refuses an email-verification code as a login code", async () => {
    const account = await createVerifiedAccount();
    await requestLoginOtp(prisma, account.email!);
    const loginCode = mailer.lastCode();

    // نفس الرمز بغرض آخر لا يعمل: الأغراض لا تتبادل.
    await prisma.customerEmailChallenge.updateMany({
      where: { customerAccountId: account.id, consumedAt: null },
      data: { purpose: "EMAIL_VERIFICATION" },
    });

    await expect(loginWithEmailOtp(prisma, { email: account.email!, code: loginCode })).rejects.toThrow();
  });

  it("remains the recovery path after every passkey is revoked", async () => {
    const { account } = await registeredPasskey();
    const passkey = await prisma.customerPasskey.findFirstOrThrow({ where: { customerAccountId: account.id } });
    await revokePasskey(prisma, { accountId: account.id, passkeyId: passkey.id });

    await requestLoginOtp(prisma, account.email!);
    const result = await loginWithEmailOtp(prisma, { email: account.email!, code: mailer.lastCode() });

    expect(await listPasskeys(prisma, account.id)).toHaveLength(0);
    expect(result.outcome).toBe("SUCCESS");
  });
});

describe("boundaries preserved", () => {
  it("stores no biometric column anywhere in the schema", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8").toLowerCase();

    for (const forbidden of ["fingerprint", "biometric", "faceid", "face_id", "biometrictemplate", "privatekey"]) {
      expect(schema).not.toContain(forbidden);
    }
  });

  it("keeps phone login disabled and the phone unverified", async () => {
    const { account } = await registeredPasskey();
    const stored = await prisma.customerAccount.findUniqueOrThrow({ where: { id: account.id } });
    const source = readFileSync(join(process.cwd(), "lib/customers/account-auth.ts"), "utf8");

    expect(stored.phoneVerifiedAt).toBeNull();
    expect(stored.phoneNormalized).toBeNull();
    // معرّف الدخول بريد حصرًا.
    expect(source).toMatch(/!value\.includes\("@"\)/);
  });

  it("keeps password login available on the server", async () => {
    const account = await createVerifiedAccount();

    expect(account.passwordHash).not.toBeNull();
    expect(existsSync(join(process.cwd(), "app/api/account/login/route.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "app/api/account/reset-password/route.ts"))).toBe(true);
  });

  it("never exposes passkey services to organization-facing code", () => {
    const tenantFacing = sourceFiles(["app/api/dashboard", "app/api/barber", "app/dashboard", "app/barber", "lib/reports"]);
    const leaks = tenantFacing.filter((file) => /passkey-service|webauthn/.test(readFileSync(file, "utf8")));

    expect(leaks).toEqual([]);
  });
});

async function createAccount({ verified }: { verified: boolean }) {
  const national = `5${Math.floor(10000000 + Math.random() * 89999999)}`;
  const email = `passkey.${Date.now()}${Math.floor(Math.random() * 100000)}@example.com`;
  const account = await prisma.customerAccount.create({
    data: {
      name: "منصور المفاتيح",
      phone: toSaudiE164(`0${national}`),
      email,
      emailNormalized: normalizeEmail(email),
      emailVerifiedAt: verified ? new Date() : null,
      passwordHash: "$2a$12$C6UzMDM.H6dfI/f/IKcEe.4Zt0eJgLPWuPBYlXQBB7VbFo9V6h1Aq",
    },
  });
  createdAccountIds.push(account.id);
  return account;
}

function createVerifiedAccount() {
  return createAccount({ verified: true });
}

async function registeredPasskey() {
  const account = await createVerifiedAccount();
  const authenticator = new VirtualAuthenticator(RP_ID, ORIGIN);
  const options = await buildPasskeyRegistrationOptions(prisma, account.id);
  await verifyPasskeyRegistration(prisma, { accountId: account.id, response: await authenticator.register(options) });
  return { account, authenticator };
}

function sourceFiles(roots: string[]) {
  const files: string[] = [];
  const walk = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
    }
  };
  for (const root of roots) walk(join(process.cwd(), root));
  return files;
}
