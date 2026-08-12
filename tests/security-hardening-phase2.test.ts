import crypto from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { canAccessPlatform } from "../lib/auth/access";
import { createStoredSession, getAuthSession } from "../lib/auth/session";
import {
  beginPlatformMfaSetup,
  confirmPlatformMfaSetup,
  createPlatformMfaChallenge,
  decryptMfaSecret,
  encryptMfaSecret,
  generateTotp,
  verifyPlatformMfaChallenge,
  verifyTotp,
} from "../lib/auth/platform-mfa";
import { ensurePortalToken, hashPortalToken, resolveCustomerByPortalToken } from "../lib/customers/customer-portal";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { sanitizeAuditValue } from "../lib/audit/audit-log";

const prisma = new PrismaClient();
const organizationIds: string[] = [];
const planIds: string[] = [];
const platformAdminIds: string[] = [];
const auditLogIds: string[] = [];

describe("security hardening phase 2", () => {
  beforeAll(() => {
    process.env.PLATFORM_MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { id: { in: auditLogIds } } });
    await prisma.platformAdmin.deleteMany({ where: { id: { in: platformAdminIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.$disconnect();
  });

  it("encrypts TOTP secrets and accepts only a valid time window", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptMfaSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptMfaSecret(encrypted)).toBe(secret);
    const at = new Date("2030-01-01T00:00:00.000Z");
    const current = generateTotp(secret, at);
    expect(verifyTotp(secret, current.code, at)).toBe(current.step);
    expect(verifyTotp(secret, "000000", at)).toBeNull();
  });

  it("requires platform MFA enrollment and stores only hashed one-time recovery codes", async () => {
    const suffix = crypto.randomBytes(5).toString("hex");
    const admin = await prisma.platformAdmin.create({
      data: { name: "MFA test", email: `mfa-${suffix}@example.test`, passwordHash: "test-only" },
    });
    platformAdminIds.push(admin.id);
    const stored = await createStoredSession({ prisma, actorType: "PLATFORM_ADMIN", actorId: admin.id, mfaSetupOnly: true });
    const setupSession = await getAuthSession(prisma, stored.token);
    expect(setupSession?.type).toBe("platform");
    expect(canAccessPlatform(setupSession)).toBe(false);

    const setup = await beginPlatformMfaSetup(prisma, admin.id);
    const recoveryCodes = await confirmPlatformMfaSetup(prisma, admin.id, stored.session.id, generateTotp(setup.secret).code);
    const verifiedSession = await getAuthSession(prisma, stored.token);
    expect(canAccessPlatform(verifiedSession)).toBe(true);
    const persisted = await prisma.platformAdmin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(persisted.mfaSecretCiphertext).not.toContain(setup.secret);
    expect(persisted.mfaRecoveryCodeHashes).not.toContain(recoveryCodes[0]);

    const challenge = await createPlatformMfaChallenge(prisma, admin.id, {});
    await expect(verifyPlatformMfaChallenge(prisma, challenge, recoveryCodes[0])).resolves.toMatchObject({ id: admin.id });
    await expect(verifyPlatformMfaChallenge(prisma, challenge, recoveryCodes[0])).rejects.toThrow();
  });

  it("stores a short-lived portal token hash and rejects expiry", async () => {
    const suffix = crypto.randomBytes(5).toString("hex");
    const organization = await prisma.organization.create({ data: { name: "Portal security", slug: `portal-security-${suffix}` } });
    organizationIds.push(organization.id);
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, name: "Portal customer", phone: `9665${Date.now().toString().slice(-8)}` } });
    const token = await ensurePortalToken(prisma, customer.id, organization.id);
    const persisted = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(persisted.portalTokenHash).toBe(hashPortalToken(token));
    expect(JSON.stringify(persisted)).not.toContain(token);
    await expect(resolveCustomerByPortalToken(prisma, token)).resolves.toMatchObject({ id: customer.id });
    await prisma.customer.update({ where: { id: customer.id }, data: { portalTokenExpiresAt: new Date(Date.now() - 1000) } });
    await expect(resolveCustomerByPortalToken(prisma, token)).resolves.toBeNull();
  });

  it("serializes customer quota checks under concurrency", async () => {
    const suffix = crypto.randomBytes(5).toString("hex");
    const plan = await prisma.plan.create({ data: { name: `Quota ${suffix}`, slug: `quota-${suffix}`, maxCustomers: 1 } });
    planIds.push(plan.id);
    const organization = await prisma.organization.create({ data: { name: "Quota security", slug: `quota-org-${suffix}`, planId: plan.id } });
    organizationIds.push(organization.id);
    const results = await Promise.allSettled([
      createCustomerWithLoyalty({ enrollInLoyalty: true, prisma, organizationId: organization.id, name: "A", phone: `96651${suffix.padEnd(7, "1").slice(0, 7)}` }),
      createCustomerWithLoyalty({ enrollInLoyalty: true, prisma, organizationId: organization.id, name: "B", phone: `96652${suffix.padEnd(7, "2").slice(0, 7)}` }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.customer.count({ where: { organizationId: organization.id } })).toBe(1);
  });

  it("redacts PII and free-form content from audit payloads", () => {
    const safe = sanitizeAuditValue({ phone: "0501234567", email: "person@example.com", message: "private text", note: "private note", token: "secret" }) as Record<string, unknown>;
    expect(safe).toEqual({ phone: "050***567", email: "p***@example.com", message: "[CONTENT_REDACTED]", note: "[CONTENT_REDACTED]", token: "[REDACTED]" });
  });

  it("enforces audit minimization at the database boundary", async () => {
    const audit = await prisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "SECURITY_TEST",
        entityType: "SecurityFixture",
        after: {
          phone: "0501234567",
          email: "person@example.test",
          message: "private operational content",
          accessToken: "test-token-value",
        },
        ipAddress: "192.0.2.10",
      },
    });
    auditLogIds.push(audit.id);
    expect(audit.after).toEqual({
      phone: "[PII_REDACTED]",
      email: "[PII_REDACTED]",
      message: "[CONTENT_REDACTED]",
      accessToken: "[REDACTED]",
    });
    expect(audit.ipAddress).toMatch(/^sha256:[a-f0-9]{16}$/);
  });

  it("rejects cross-tenant references at the database boundary", async () => {
    const suffix = crypto.randomBytes(5).toString("hex");
    const organizationA = await prisma.organization.create({ data: { name: "Tenant A", slug: `tenant-a-${suffix}` } });
    const organizationB = await prisma.organization.create({ data: { name: "Tenant B", slug: `tenant-b-${suffix}` } });
    organizationIds.push(organizationA.id, organizationB.id);
    const salonB = await prisma.salon.create({ data: { organizationId: organizationB.id, name: "Branch B", slug: "branch-b" } });

    await expect(
      prisma.service.create({
        data: {
          organizationId: organizationA.id,
          salonId: salonB.id,
          name: "Cross-tenant service",
          defaultPrice: 100,
        },
      }),
    ).rejects.toThrow();
  });
});
