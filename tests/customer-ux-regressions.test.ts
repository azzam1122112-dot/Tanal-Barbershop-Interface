import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReceipt } from "../lib/invoicing/receipt";

const source = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("customer receipt access", () => {
  it("scopes a portal receipt to its owning customer", async () => {
    let where: Record<string, unknown> | undefined;
    const prisma = {
      visit: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          where = args.where;
          return null;
        },
      },
    };

    await expect(
      buildReceipt(prisma as never, "visit_other", { organizationId: "org_1", customerId: "customer_1" }),
    ).rejects.toThrow("الزيارة غير موجودة");
    expect(where).toMatchObject({ id: "visit_other", organizationId: "org_1", customerId: "customer_1" });
  });

  it("resolves the secret portal token before producing a customer PDF", () => {
    const route = source("app", "api", "my", "[token]", "visits", "[visitId]", "pdf", "route.ts");
    expect(route).toContain("resolveCustomerByPortalToken");
    expect(route).toContain("customerId: customer.id");
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
  });

  it("gives every visit a full receipt link and useful payment summary", () => {
    const page = source("app", "my", "[token]", "visits", "page.tsx");
    expect(page).toContain("عرض الإيصال الكامل");
    expect(page).toContain("visit.discountAmount");
    expect(page).toContain("visit.paymentMethod");
  });
});

describe("customer account discoverability", () => {
  it("offers customer, management, and barber login from the landing header and footer", () => {
    const landing = source("app", "page.tsx");
    expect(landing.match(/href="\/account\/login"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(landing).toContain("دخول العميل");
    expect(landing).toContain("دخول الإدارة");
    expect(landing).toContain("دخول الحلاق");
  });

  it("uses a full navigation after registration so verification never stays behind the form", () => {
    const forms = source("components", "public", "account-auth-forms.tsx");
    expect(forms).toContain("window.location.assign(data.redirectTo)");
  });
});

describe("customer portal polish", () => {
  it("uses a contextual title for every customer tab", () => {
    const pages: Array<[string[], string]> = [
      [["app", "my", "[token]", "page.tsx"], "بطاقتي"],
      [["app", "my", "[token]", "offers", "page.tsx"], "العروض"],
      [["app", "my", "[token]", "appointments", "page.tsx"], "مواعيدي"],
      [["app", "my", "[token]", "visits", "page.tsx"], "زياراتي"],
      [["app", "my", "[token]", "account", "page.tsx"], "حسابي"],
    ];

    for (const [path, title] of pages) {
      expect(source(...path)).toContain(`title: "${title}"`);
    }
  });

  it("shows exact Riyadh times and honest scheduled/current/expired campaign states", () => {
    const manager = source("components", "dashboard", "campaign-manager.tsx");
    expect(manager).toContain("formatDateTime(campaign.startAt)");
    expect(manager).toContain("فعالة الآن");
    expect(manager).toContain("مجدولة");
    expect(manager).toContain("منتهية");
  });
});
