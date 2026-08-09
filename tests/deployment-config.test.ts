import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ثوابت النشر المستقلة عن المزوّد.
 * المشروع لا يرتبط بمنصة استضافة بعينها: أي خادم يشغّل Node 22 ويوفّر
 * `DATABASE_URL` يكفي. ما يلي يحرس ما يكسر النشر فعلًا أيًّا كان المزوّد.
 */
describe("إعداد النشر", () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    engines: Record<string, string>;
  };

  it("يثبّت نسخة Node على LTS واحدة في كل الملفات", () => {
    const nvmrc = readFileSync(join(process.cwd(), ".nvmrc"), "utf8").trim();
    const nodeVersion = readFileSync(join(process.cwd(), ".node-version"), "utf8").trim();

    // اختلاف النسخة بين الملفات يعني بناءً ناجحًا محليًا وفاشلًا على الخادم.
    expect(packageJson.engines.node).toBe(">=22 <23");
    expect(nvmrc).toBe("22.22.3");
    expect(nodeVersion).toBe("22.22.3");
  });

  it("يوفّر أمر تشغيل إنتاجي يطبّق الهجرات قبل بدء الخدمة", () => {
    // بدء الخدمة قبل الهجرات يعني أول طلب على مخطط قديم.
    expect(packageJson.scripts["start:prod"]).toBe("prisma migrate deploy && next start");
    expect(packageJson.scripts.build).toBe("next build");
    expect(packageJson.scripts["prisma:deploy"]).toBe("prisma migrate deploy");
  });

  it("يمنع زرع بيانات اعتماد تجريبية في الإنتاج", () => {
    const seed = readFileSync(join(process.cwd(), "prisma", "seed.ts"), "utf8");
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");

    expect(seed).toContain("REQUIRE_EXPLICIT_SEED_CREDENTIALS");
    expect(seed).toContain("is required when REQUIRE_EXPLICIT_SEED_CREDENTIALS=true");
    expect(envExample).toContain("REQUIRE_EXPLICIT_SEED_CREDENTIALS");
  });

  it("يعرض مسار فحص صحة خفيفًا لموازن الحمل", () => {
    const healthRoutePath = join(process.cwd(), "app", "api", "health", "route.ts");

    expect(existsSync(healthRoutePath)).toBe(true);
    const healthRoute = readFileSync(healthRoutePath, "utf8");
    expect(healthRoute).toContain('status: "ok"');
    expect(healthRoute).toContain("Cache-Control");
  });

  it("لا يبقي أي ارتباط بمزوّد استضافة بعينه", () => {
    expect(existsSync(join(process.cwd(), "render.yaml"))).toBe(false);
    expect(JSON.stringify(packageJson.scripts)).not.toMatch(/render|vercel|heroku|netlify/i);
  });
});
