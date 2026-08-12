import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { normalizeEmail } from "../lib/email/normalize-email";
import { toSaudiE164 } from "../lib/phone/saudi-phone";

/**
 * المرحلة البنيوية الأولى لطبقة الهوية العالمية.
 *
 * تثبّت شيئين معًا: أن البنية الجديدة تفعل ما وُعدت به، وأن النظام القائم **لم
 * يتغيّر** — العميل القديم بلا حساب يعمل كما كان، ولا إنشاء تلقائي ولا تعبئة رجعية.
 */

const prisma = new PrismaClient();
const ORG = "org_default";
const createdAccountIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdOrganizationIds: string[] = [];

describe("global CustomerAccount foundation", () => {
  afterAll(async () => {
    await prisma.loyaltyAccount.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.customerAccount.deleteMany({ where: { id: { in: createdAccountIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.$disconnect();
  }, 30000);

  describe("identity is global, not a tenant entity", () => {
    it("has no organization or salon ownership on the model", () => {
      const fields = Prisma.dmmf.datamodel.models.find((model) => model.name === "CustomerAccount")?.fields ?? [];
      const names = fields.map((field) => field.name);

      expect(names).not.toContain("organizationId");
      expect(names).not.toContain("salonId");
      expect(names).toEqual(expect.arrayContaining(["phoneNormalized", "emailNormalized", "emailVerifiedAt", "passwordHash", "status", "lastLoginAt"]));
      // ولا قيد مستأجرين مركّب في الهجرة.
      const sql = readFileSync(join(process.cwd(), "prisma/migrations/20260812110000_customer_account_foundation/migration.sql"), "utf8");
      expect(sql).not.toMatch(/CustomerAccount.*organizationId/);
      // إضافة بحتة: لا جملة هدم ولا تعبئة رجعية. (`ON DELETE`/`ON UPDATE` أفعال
      // مرجعية داخل تعريف المفتاح لا جُملًا، فالمطابقة على بداية الجملة.)
      expect(sql).not.toMatch(/^\s*(DROP|DELETE\s+FROM|TRUNCATE|UPDATE)\b/im);
      expect(sql).not.toMatch(/UPDATE\s+"Customer"\s+SET/i);
    });

    it("enforces a globally unique normalized phone", async () => {
      const phone = uniqueE164();
      await createAccount({ phone });

      await expect(createAccount({ phone })).rejects.toMatchObject({ code: "P2002" });
    });

    it("enforces a globally unique normalized email but allows many without one", async () => {
      const email = `identity-${Date.now()}@example.com`;
      await createAccount({ email });

      await expect(createAccount({ email })).rejects.toMatchObject({ code: "P2002" });
      // NULL مميّز عن NULL: حسابان بلا بريد يتعايشان.
      await createAccount({});
      await createAccount({});
    });

    it("treats a different-case email as the same identity", async () => {
      const local = `Mixed.Case-${Date.now()}`;
      await createAccount({ email: `${local}@Example.COM` });

      expect(normalizeEmail(`  ${local}@EXAMPLE.com `)).toBe(`${local.toLowerCase()}@example.com`);
      await expect(createAccount({ email: `${local}@example.com` })).rejects.toMatchObject({ code: "P2002" });
    });
  });

  describe("one identity, many organizations", () => {
    it("links the same account to a customer in two organizations", async () => {
      const account = await createAccount({});
      const otherOrganizationId = await createOrganization();

      const here = await linkedCustomer(ORG, account.id);
      const there = await linkedCustomer(otherOrganizationId, account.id);

      expect(here.accountId).toBe(account.id);
      expect(there.accountId).toBe(account.id);
      expect(here.organizationId).not.toBe(there.organizationId);
    });

    it("refuses a second customer for the same account inside one organization", async () => {
      const account = await createAccount({});
      await linkedCustomer(ORG, account.id);

      await expect(linkedCustomer(ORG, account.id)).rejects.toMatchObject({ code: "P2002" });
    });

    it("does not constrain legacy customers that share a null account inside one organization", async () => {
      // السلوك المفترض في PostgreSQL — مُثبَّت لا مفترض.
      const first = await legacyCustomer();
      const second = await legacyCustomer();
      const third = await legacyCustomer();

      expect([first, second, third].every((customer) => customer.organizationId === ORG)).toBe(true);
      expect([first, second, third].every((customer) => customer.accountId === null)).toBe(true);
      expect(await prisma.customer.count({ where: { organizationId: ORG, accountId: null } })).toBeGreaterThanOrEqual(3);
    });
  });

  describe("legacy behaviour is untouched", () => {
    it("creates a customer with loyalty, visits and appointments without any account", async () => {
      const created = await createCustomerWithLoyalty({ enrollInLoyalty: true, prisma, organizationId: ORG, name: `عميل قديم ${Date.now()}`, phone: uniqueLegacyPhone() });
      createdCustomerIds.push(created.customer.id);
      const barber = await prisma.barber.findFirstOrThrow({ where: { organizationId: ORG, isActive: true } });

      const appointment = await prisma.appointment.create({
        data: { organizationId: ORG, salonId: barber.salonId, customerId: created.customer.id, customerName: "عميل قديم", customerPhone: created.customer.phone, startAt: new Date(Date.now() + 86_400_000), durationMinutes: 30 },
      });

      // المسار القديم كامل بلا هوية عالمية: عضوية ولاء، وموعد، وسجل عميل.
      expect(created.customer.accountId).toBeNull();
      expect(await prisma.loyaltyAccount.count({ where: { customerId: created.customer.id } })).toBe(1);
      expect(appointment.customerId).toBe(created.customer.id);

      await prisma.appointment.delete({ where: { id: appointment.id } });
    });

    it("never creates or backfills an account implicitly", async () => {
      const before = await prisma.customerAccount.count();
      const created = await createCustomerWithLoyalty({ enrollInLoyalty: true, prisma, organizationId: ORG, name: `بلا حساب ${Date.now()}`, phone: uniqueLegacyPhone() });
      createdCustomerIds.push(created.customer.id);

      // ولا حتى عند وجود رقم مطابق لحساب قائم: لا دمج تلقائي بالجوال.
      await createAccount({ phone: toSaudiE164(`0${created.customer.phone.slice(-9)}`) });

      expect(await prisma.customerAccount.count()).toBe(before + 1);
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: created.customer.id } })).accountId).toBeNull();
      expect(await prisma.customer.count({ where: { organizationId: ORG, accountId: { not: null } } })).toBe(
        await prisma.customer.count({ where: { organizationId: ORG, account: { isNot: null } } }),
      );
    });

    it("keeps the account alive when a linked customer is deleted", async () => {
      const account = await createAccount({});
      const customer = await linkedCustomer(ORG, account.id);

      await prisma.customer.delete({ where: { id: customer.id } });

      // لا Cascade من عمليات المؤسسة إلى الهوية العالمية.
      expect(await prisma.customerAccount.findUnique({ where: { id: account.id } })).not.toBeNull();
    });

    it("unlinks instead of deleting when the account itself is removed", async () => {
      const account = await createAccount({});
      const customer = await linkedCustomer(ORG, account.id);

      await prisma.customerAccount.delete({ where: { id: account.id } });

      const survivor = await prisma.customer.findUnique({ where: { id: customer.id } });
      expect(survivor).not.toBeNull();
      expect(survivor?.accountId).toBeNull();
    });
  });

  describe("tenant isolation guard", () => {
    /**
     * حارس مصدر لا مراجعة بشرية: `Customer → account → customers` يكشف لموظفي
     * مؤسسة أن عميلهم زبون عند منافس. العلاقة العكسية لازمة لـ Prisma، فالحماية
     * أن يمنع البناءُ استعمالَها في كود تخدمه مؤسسة.
     */
    it("has no code path expanding an account back into its customers", () => {
      const offenders: string[] = [];
      for (const file of sourceFiles(["app", "lib", "components"])) {
        const source = readFileSync(file, "utf8");
        if (/\baccount\s*:\s*\{[^}]*\b(include|select)\b[\s\S]{0,200}?\bcustomers\s*:/.test(source)) {
          offenders.push(`${file}: expands account.customers`);
        }
        if (/\.account\s*\.\s*customers\b/.test(source) || /\baccount\.customers\b/.test(source)) {
          offenders.push(`${file}: reads account.customers`);
        }
        if (/customerAccount\.[a-zA-Z]+\([\s\S]{0,300}?\bcustomers\s*:\s*(true|\{)/.test(source)) {
          offenders.push(`${file}: includes customers from a CustomerAccount query`);
        }
      }

      expect(offenders).toEqual([]);
    });

    it("keeps organization-facing code reading Customer only", () => {
      const tenantFacing = sourceFiles(["app/api/dashboard", "app/api/barber", "app/dashboard", "app/barber"]);
      const usages = tenantFacing.filter((file) => /\bcustomerAccount\b/.test(readFileSync(file, "utf8")));

      // لا لوحة ولا واجهة حلاق تلمس جدول الهوية إطلاقًا في هذه المرحلة.
      expect(usages).toEqual([]);
    });
  });

  describe("normalization", () => {
    it("maps every accepted Saudi mobile shape to one canonical value", () => {
      for (const input of ["0551234567", "551234567", "+966551234567", "00966551234567", "+966 55 123 4567", "055-123-4567", "٠٥٥١٢٣٤٥٦٧".replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))]) {
        expect(toSaudiE164(input)).toBe("+966551234567");
      }
    });

    it("rejects anything that is not a Saudi mobile", () => {
      for (const input of ["", "0512345", "0451234567", "+971551234567", "abcdefghij", "05512345678"]) {
        expect(() => toSaudiE164(input)).toThrow();
      }
    });

    it("normalizes email without vendor-specific rewriting", () => {
      expect(normalizeEmail("  Mansour@Example.Com ")).toBe("mansour@example.com");
      // نقاط Gmail ولواحق +tag تبقى كما هي: حذفها يدمج بريدين مختلفين عند مزوّد لا يعاملهما كواحد.
      expect(normalizeEmail("man.sour+salon@Gmail.com")).toBe("man.sour+salon@gmail.com");
      expect(() => normalizeEmail("not-an-email")).toThrow();
    });
  });
});

async function createAccount({ phone, email }: { phone?: string; email?: string }) {
  const account = await prisma.customerAccount.create({
    data: {
      name: "هوية اختبار",
      phone: phone ?? uniqueE164(),
      phoneNormalized: toSaudiE164(phone ?? uniqueE164()),
      email: email ?? null,
      emailNormalized: email ? normalizeEmail(email) : null,
    },
  });
  createdAccountIds.push(account.id);
  return account;
}

async function linkedCustomer(organizationId: string, accountId: string) {
  const customer = await prisma.customer.create({
    data: { organizationId, accountId, name: "عميل مرتبط", phone: uniqueLegacyPhone() },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function legacyCustomer() {
  const customer = await prisma.customer.create({
    data: { organizationId: ORG, name: "عميل قديم", phone: uniqueLegacyPhone() },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createOrganization() {
  const plan = (await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { planId: true } })).planId;
  const organization = await prisma.organization.create({
    data: { name: "مؤسسة هوية", slug: `identity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, planId: plan, subscriptionStatus: "ACTIVE" },
  });
  createdOrganizationIds.push(organization.id);
  return organization.id;
}

/** كل ملفات المصدر تحت مجلدات محددة — للحُرّاس التي تفحص الشيفرة نفسها. */
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

function uniqueE164() {
  return `+9665${Math.floor(10000000 + Math.random() * 89999999)}`;
}

function uniqueLegacyPhone() {
  return `05${Math.floor(10000000 + Math.random() * 89999999)}`;
}
