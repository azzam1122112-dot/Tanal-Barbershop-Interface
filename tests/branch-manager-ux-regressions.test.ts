import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

describe("صلاحيات مدير الفرع متطابقة بين الواجهة والخادم", () => {
  it("يسمح بتعديل مبلغ الزيارة داخل نطاق الفروع المسندة", () => {
    const route = read("app", "api", "dashboard", "visits", "[id]", "amount", "route.ts");

    expect(route).toContain("requireDashboardApi");
    expect(route).not.toContain("requireAdminApi");
    expect(route).toContain("salonIds: session.scopedSalonIds ?? undefined");
  });

  it("يوجّه البيان المالي المحجوب إلى صفحة الصلاحيات", () => {
    const page = read("app", "dashboard", "(shell)", "finance", "page.tsx");
    expect(page).toContain('redirect("/dashboard/forbidden")');
  });
});

describe("واجهة مدير الفرع لا تخفي المعلومات أو النتائج", () => {
  it("ترسم بطاقة الصافي بتدرج ثابت بلا طبقة تمويه مركّبة", () => {
    const page = read("app", "dashboard", "(shell)", "page.tsx");
    const css = read("app", "globals.css");

    expect(page).toContain("dashboard-net-card");
    expect(page).not.toContain("bg-salon-gold/20 blur-3xl");
    expect(css).toMatch(/\.dashboard-net-card\s*\{[\s\S]*?radial-gradient/);
  });

  it("يعلن نجاح حفظ السياسة والمخزون والمستلزمات", () => {
    expect(read("components", "dashboard", "cash-custody-manager.tsx")).toContain("تم حفظ جدول التحصيل");
    expect(read("components", "dashboard", "products-manager.tsx")).toContain("تم تحديث المخزون");
    expect(read("components", "dashboard", "supplies-manager.tsx")).toContain("تمت إضافة الصنف");
  });
});

describe("الوصول في النماذج والجداول", () => {
  it("يجعل حاوية الجدول قابلة للتركيز وذات اسم مفهوم", () => {
    const ui = read("components", "dashboard", "ui.tsx");

    expect(ui).toContain('role="region"');
    expect(ui).toContain("tabIndex={0}");
    expect(ui).toContain('aria-label={`${label} — قابل للتمرير أفقيًا`}');
    expect(ui).toContain("مرّر أفقيًا لعرض بقية الأعمدة");
  });

  it("يربط حقول تصحيح الزيارة بتسميات فريدة ويشرح شرط العهدة", () => {
    const actions = read("components", "dashboard", "visit-admin-actions.tsx");

    expect(actions).toContain("useId()");
    expect(actions).toContain("سبب تعديل مبلغ الزيارة");
    expect(actions).toContain("إذا سبق تحصيلها فاعكس التحصيل أولًا");
  });
});
