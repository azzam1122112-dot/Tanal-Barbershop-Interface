import crypto from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

type MfaPrisma = PrismaClient | Prisma.TransactionClient;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_ATTEMPTS = 5;

function encryptionKey() {
  const raw = process.env.PLATFORM_MFA_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("PLATFORM_MFA_ENCRYPTION_KEY is required for platform MFA");

  const decoded = Buffer.from(raw, raw.includes("-") || raw.includes("_") ? "base64url" : "base64");
  if (decoded.length !== 32) {
    throw new Error("PLATFORM_MFA_ENCRYPTION_KEY must be a base64/base64url encoded 32-byte key");
  }
  return decoded;
}

export function hasValidPlatformMfaEncryptionKey() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptMfaSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptMfaSecret(value: string) {
  const [version, ivRaw, tagRaw, ciphertextRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Invalid encrypted MFA secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function encodeBase32(input: Buffer) {
  let bits = "";
  for (const byte of input) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i < bits.length; i += 5) {
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

export function decodeBase32(input: string) {
  const normalized = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 value");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotp(secret: string, at = new Date()) {
  const step = BigInt(Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(step);
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS;
  return { code: String(binary).padStart(TOTP_DIGITS, "0"), step };
}

export function verifyTotp(secret: string, input: string, at = new Date()) {
  const normalized = input.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  for (const drift of [-1, 0, 1]) {
    const candidateAt = new Date(at.getTime() + drift * TOTP_PERIOD_SECONDS * 1000);
    const candidate = generateTotp(secret, candidateAt);
    if (crypto.timingSafeEqual(Buffer.from(normalized), Buffer.from(candidate.code))) return candidate.step;
  }
  return null;
}

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string) {
  return digest(normalizeRecoveryCode(code));
}

function createRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const value = crypto.randomBytes(6).toString("hex").toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
  });
}

export async function beginPlatformMfaSetup(prisma: MfaPrisma, platformAdminId: string) {
  const admin = await prisma.platformAdmin.findUnique({ where: { id: platformAdminId }, select: { email: true, isActive: true } });
  if (!admin?.isActive) throw new BusinessError("الحساب غير متاح", 403);
  if (await prisma.platformAdmin.findFirst({ where: { id: platformAdminId, mfaEnabledAt: { not: null } }, select: { id: true } })) {
    throw new BusinessError("المصادقة الثنائية مفعلة بالفعل", 409);
  }

  const secret = encodeBase32(crypto.randomBytes(20));
  await prisma.platformAdmin.update({
    where: { id: platformAdminId },
    data: { mfaPendingCiphertext: encryptMfaSecret(secret) },
  });
  const label = encodeURIComponent(`إكس مانس إكس XMANSX:${admin.email}`);
  const issuer = encodeURIComponent("إكس مانس إكس XMANSX");
  return { secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` };
}

export async function confirmPlatformMfaSetup(
  prisma: PrismaClient,
  platformAdminId: string,
  sessionId: string,
  code: string,
) {
  const admin = await prisma.platformAdmin.findUnique({ where: { id: platformAdminId } });
  if (!admin?.mfaPendingCiphertext || !admin.isActive) throw new BusinessError("ابدأ إعداد المصادقة الثنائية أولًا", 409);
  const secret = decryptMfaSecret(admin.mfaPendingCiphertext);
  const step = verifyTotp(secret, code);
  if (step === null) throw new BusinessError("رمز التحقق غير صحيح", 400);
  const recoveryCodes = createRecoveryCodes();

  await prisma.$transaction(async (tx) => {
    await tx.platformAdmin.update({
      where: { id: platformAdminId },
      data: {
        mfaEnabledAt: new Date(),
        mfaSecretCiphertext: encryptMfaSecret(secret),
        mfaPendingCiphertext: null,
        mfaRecoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
        mfaLastUsedStep: step,
      },
    });
    await tx.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: new Date(), mfaSetupOnly: false } });
    await tx.session.updateMany({
      where: { platformAdminId, id: { not: sessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
  return recoveryCodes;
}

export async function createPlatformMfaChallenge(
  prisma: MfaPrisma,
  platformAdminId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null },
) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.platformMfaChallenge.create({
    data: {
      tokenHash: digest(token),
      platformAdminId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      ipAddress: meta.ipAddress?.slice(0, 128) ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return token;
}

export async function verifyPlatformMfaChallenge(prisma: PrismaClient, token: string, code: string) {
  const tokenHash = digest(token);
  const challenge = await prisma.platformMfaChallenge.findUnique({
    where: { tokenHash },
    include: { platformAdmin: true },
  });
  const now = new Date();
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= MAX_CHALLENGE_ATTEMPTS || !challenge.platformAdmin.isActive) {
    throw new BusinessError("انتهت محاولة التحقق؛ سجّل الدخول من جديد", 401);
  }

  const admin = challenge.platformAdmin;
  if (!admin.mfaEnabledAt || !admin.mfaSecretCiphertext) throw new BusinessError("المصادقة الثنائية غير مهيأة", 401);
  const normalizedRecovery = hashRecoveryCode(code);
  const recoveryIndex = admin.mfaRecoveryCodeHashes.findIndex((value) => value === normalizedRecovery);
  const step = recoveryIndex < 0 ? verifyTotp(decryptMfaSecret(admin.mfaSecretCiphertext), code, now) : null;
  if (recoveryIndex < 0 && (step === null || (admin.mfaLastUsedStep !== null && step <= admin.mfaLastUsedStep))) {
    await prisma.platformMfaChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { attempts: { increment: 1 } } });
    throw new BusinessError("رمز التحقق غير صحيح", 401);
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.platformMfaChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_CHALLENGE_ATTEMPTS } },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) throw new BusinessError("تم استخدام محاولة التحقق", 409);

    if (recoveryIndex >= 0) {
      const current = await tx.platformAdmin.findUniqueOrThrow({ where: { id: admin.id }, select: { mfaRecoveryCodeHashes: true } });
      if (!current.mfaRecoveryCodeHashes.includes(normalizedRecovery)) throw new BusinessError("تم استخدام رمز الاسترداد", 409);
      await tx.platformAdmin.update({
        where: { id: admin.id },
        data: { mfaRecoveryCodeHashes: current.mfaRecoveryCodeHashes.filter((value) => value !== normalizedRecovery) },
      });
    } else {
      const updated = await tx.platformAdmin.updateMany({
        where: { id: admin.id, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step! } }] },
        data: { mfaLastUsedStep: step! },
      });
      if (updated.count !== 1) throw new BusinessError("تم استخدام رمز التحقق", 409);
    }
  }, { isolationLevel: "Serializable" });

  return { id: admin.id, name: admin.name, email: admin.email };
}
