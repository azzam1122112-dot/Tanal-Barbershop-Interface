import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canAccessBarberApp, canAccessDashboard } from "../lib/auth/access";

describe("phase 13 hardening docs and access gates", () => {
  it("keeps dashboard APIs and pages behind dashboard-only sessions", () => {
    const barberSession = {
      type: "barber" as const,
      id: "barber-session",
      role: "BARBER" as const,
      organizationId: "org_default",
      salonId: "salon_default",
      barber: { id: "barber-1", name: "حلاق", phone: "966500000002", role: "BARBER" as const },
    };
    const adminSession = {
      type: "dashboard" as const,
      id: "admin-session",
      role: "ADMIN" as const,
      organizationId: "org_default",
      salonId: null,
      scopedSalonIds: null,
      user: { id: "admin-1", name: "مدير", email: "admin@tanal.local", role: "ADMIN" as const },
    };

    expect(canAccessDashboard(null)).toBe(false);
    expect(canAccessDashboard(barberSession)).toBe(false);
    expect(canAccessDashboard(adminSession)).toBe(true);
    expect(canAccessBarberApp(null)).toBe(false);
    expect(canAccessBarberApp(adminSession)).toBe(false);
    expect(canAccessBarberApp(barberSession)).toBe(true);
  });

  it("ships the salon demo checklist", () => {
    const checklistPath = join(process.cwd(), "DEMO_CHECKLIST.md");
    const checklist = readFileSync(checklistPath, "utf8");

    expect(existsSync(checklistPath)).toBe(true);
    expect(checklist).toContain("تجربة الحلاق");
    expect(checklist).toContain("تجربة المدير");
    expect(checklist).toContain("معايير النجاح");
    expect(checklist).toContain("لا توجد زيارة مكررة");
    expect(checklist).toContain("فتح جلسة صندوق");
    expect(checklist).toContain("لا يوجد WhatsApp API");
  });

  it("documents the required local commands and core routes", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("npm run prisma:migrate");
    expect(readme).toContain("npm run prisma:seed");
    expect(readme).toContain("npm run demo:seed");
    expect(readme).toContain("npm run dev");
    expect(readme).toContain("npm run typecheck");
    expect(readme).toContain("npm test");
    expect(readme).toContain("/barber/login");
    expect(readme).toContain("/dashboard/reports");
    expect(readme).toContain("/dashboard/daily-close");
    expect(readme).toContain("/dashboard/whatsapp");
    expect(readme).toContain("جلسة الصندوق CashSession");
    expect(readme).toContain("`DailyClose` لم يعد القفل التشغيلي");
    expect(readme).toContain("لا يوجد WhatsApp API");
  });

  it("keeps demo data generation explicit and separate from the base seed", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const seed = readFileSync(join(process.cwd(), "prisma", "seed.ts"), "utf8");

    expect(packageJson.scripts["demo:seed"]).toBe("tsx scripts/demo-seed.ts");
    expect(packageJson.scripts["prisma:seed"]).toBe("tsx prisma/seed.ts");
    expect(seed).not.toContain("[DEMO]");
  });
});
