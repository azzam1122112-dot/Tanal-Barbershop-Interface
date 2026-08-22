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
    expect(seed).toContain('process.env.NODE_ENV === "production"');
    expect(seed).toContain("must not use the demo value in production");
    expect(envExample).toContain("REQUIRE_EXPLICIT_SEED_CREDENTIALS");
  });

  it("يعرض مسار فحص صحة خفيفًا لموازن الحمل", () => {
    const healthRoutePath = join(process.cwd(), "app", "api", "health", "route.ts");

    expect(existsSync(healthRoutePath)).toBe(true);
    const healthRoute = readFileSync(healthRoutePath, "utf8");
    expect(healthRoute).toContain('status: "ok"');
    expect(healthRoute).toContain("Cache-Control");
  });

  it("يوفّر readiness مستقلة تتحقق من PostgreSQL وRedis", () => {
    const readinessPath = join(process.cwd(), "app", "api", "health", "readiness", "route.ts");
    expect(existsSync(readinessPath)).toBe(true);
    const readiness = readFileSync(readinessPath, "utf8");
    expect(readiness).toContain("SELECT 1");
    expect(readiness).toContain("pingRedis");
    expect(readiness).toContain("REDIS_REQUIRED");
    expect(readiness).toContain("isCustomerAuthProductionReady");
  });

  it("لا يبقي أي ارتباط بمزوّد استضافة بعينه", () => {
    expect(existsSync(join(process.cwd(), "render.yaml"))).toBe(false);
    expect(JSON.stringify(packageJson.scripts)).not.toMatch(/render|vercel|heroku|netlify/i);
  });

  it("يشغّل حذف الحسابات غير النشطة وصيانة الخصوصية يوميًا", () => {
    const service = readFileSync(join(process.cwd(), "deploy", "systemd", "tanal-maintenance.service"), "utf8");
    const timer = readFileSync(join(process.cwd(), "deploy", "systemd", "tanal-maintenance.timer"), "utf8");
    expect(service).toContain("npm run maintenance:cleanup");
    expect(timer).toContain("OnCalendar=");
    expect(timer).toContain("Persistent=true");
  });

  it("يحدد دورة حذف آمنة ويمنع النشر بلا نسخة PostgreSQL قابلة للتحقق", () => {
    const backup = readFileSync(join(process.cwd(), "deploy", "backup", "tanal-backup.sh"), "utf8");
    const release = readFileSync(join(process.cwd(), "deploy", "release.sh"), "utf8");
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    expect(backup).toContain('BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"');
    expect(backup).toContain("BACKUP_DIR must be an absolute non-root directory");
    expect(backup).toContain("-name 'xmansx_*.dump.age'");
    expect(envExample).toContain('BACKUP_RETENTION_DAYS="30"');
    expect(envExample).toContain('BACKUP_AGE_RECIPIENT=""');
    expect(release).toContain("pg_dump --format=custom");
    expect(release).toContain("pg_restore --list");
    expect(release).toContain('chmod 600 "$BACKUP"');
  });

  it("يراقب readiness دوريًا وينبّه دون تسجيل الأسرار", () => {
    const monitor = readFileSync(join(process.cwd(), "deploy", "monitor", "tanal-healthcheck.sh"), "utf8");
    const service = readFileSync(join(process.cwd(), "deploy", "systemd", "tanal-healthcheck.service"), "utf8");
    const timer = readFileSync(join(process.cwd(), "deploy", "systemd", "tanal-healthcheck.timer"), "utf8");

    expect(monitor).toContain("/api/health/readiness");
    expect(monitor).toContain("production_health_alert");
    expect(monitor).toContain("MONITOR_ALERT_COOLDOWN_SECONDS");
    expect(monitor).not.toContain("echo $RESEND_API_KEY");
    expect(service).toContain("StateDirectory=tanal-monitor");
    expect(service).toContain("ExecStart=/usr/bin/bash /srv/tanal/app/deploy/monitor/tanal-healthcheck.sh");
    expect(timer).toContain("OnUnitActiveSec=2m");
    expect(timer).toContain("Persistent=true");
  });

  it("يبني إصدار Docker معزولًا ثم ينسخ البيانات ويبدّل مع استرجاع وفحص صحة", () => {
    const release = readFileSync(join(process.cwd(), "deploy", "release.sh"), "utf8");
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    const buildPosition = release.indexOf("npm run build");
    const backupPosition = release.indexOf("pg_dump --format=custom");
    const switchPosition = release.indexOf('mv -- "$APP_DIR" "$PREVIOUS"');

    expect(release).toContain('. "$BUILD_ENV_FILE"');
    expect(release).toContain('BUILD_ENV_ARGS+=(--env "$key")');
    expect(release).not.toContain('--env-file "$BUILD_ENV_FILE"');
    expect(release).toContain('DATABASE_URL//127.0.0.1:15432/postgres:5432');
    expect(release).toContain('docker network connect "$BUILD_NETWORK" "$BUILD_CONTAINER"');
    expect(release).toContain("npm run prisma:generate");
    expect(release).toContain("npm run build");
    expect(dockerfile).not.toContain("tanal.env");
    expect(dockerfile).not.toContain("tanal_env_build");
    expect(dockerfile).toContain("npm run prisma:deploy");
    expect(release).toContain("tanal-web:candidate-$SHA");
    expect(release).toContain("tanal-web:rollback-$SHA");
    expect(release).toContain("restoring the previous release");
    expect(release).toContain("/api/health/readiness");
    expect(buildPosition).toBeGreaterThan(-1);
    expect(backupPosition).toBeGreaterThan(buildPosition);
    expect(switchPosition).toBeGreaterThan(buildPosition);
    expect(switchPosition).toBeGreaterThan(backupPosition);
  });
});
