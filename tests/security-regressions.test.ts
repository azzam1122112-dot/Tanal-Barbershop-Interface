import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../next.config";
import { adminPasswordSchema } from "../lib/auth/password";
import { redactForLog } from "../lib/logger";
import { isTrustedPushEndpoint } from "../lib/push/barber-push";
import { buildContentSecurityPolicy, createCspNonce } from "../lib/security/csp";
import { serializeJsonForHtml } from "../lib/security/serialization";

describe("security regression controls", () => {
  it("allows recognized Web Push providers and rejects SSRF-shaped endpoints", () => {
    expect(isTrustedPushEndpoint("https://fcm.googleapis.com/fcm/send/example")).toBe(true);
    expect(isTrustedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/example")).toBe(true);
    expect(isTrustedPushEndpoint("https://example.notify.windows.com/w/?token=example")).toBe(true);
    expect(isTrustedPushEndpoint("http://fcm.googleapis.com/fcm/send/example")).toBe(false);
    expect(isTrustedPushEndpoint("https://127.0.0.1/internal")).toBe(false);
    expect(isTrustedPushEndpoint("https://localhost/internal")).toBe(false);
    expect(isTrustedPushEndpoint("https://user:pass@fcm.googleapis.com/fcm/send/example")).toBe(false);
    expect(isTrustedPushEndpoint("https://attacker.example/webpush")).toBe(false);
  });

  /**
   * الحلاق لا يمنح عضوية ولاء لأحد — العضوية يفتحها العميل بنفسه بحساب بريده
   * موثَّق.
   *
   * كان هذا الاختبار يفحص `customerCreateSchema` ويتأكد أنه **يُسقط** حقل
   * `enrollInLoyalty`. لكن المسار تشدّد بعدها: صار `POST /api/barber/customers`
   * يرفض الإنشاء كليًا بـ403 ولم يعد يستورد ذلك المخطط أصلًا — فبقي الاختبار
   * أخضر فوق كود لا يمرّ به أحد، وهو أسوأ من غياب الاختبار. حُذف المخطط، وصار
   * الفحص على الضابط القائم فعلًا.
   */
  it("refuses barber-side customer creation outright", () => {
    const route = readFileSync(join(process.cwd(), "app", "api", "barber", "customers", "route.ts"), "utf8");

    expect(route).toContain("status: 403");
    // لا إنشاء ولا كتابة في أي جدول من هذا المسار.
    expect(route).not.toContain("createCustomerWithLoyalty");
    expect(route).not.toContain("prisma.customer.create");

    // والطبقة الأعمق: الخدمة نفسها تفشل مغلقةً — من ينسى التمرير لا يمنح عضوية.
    const service = readFileSync(join(process.cwd(), "lib", "customers", "customer-service.ts"), "utf8");
    expect(service).toMatch(/enrollInLoyalty[^\n]*=\s*false|enrollInLoyalty\s*\?\?\s*false/);
  });

  it("keeps portal-link issuance out of the barber API surface", () => {
    const barberRoutes = join(process.cwd(), "app", "api", "barber", "customers");
    expect(existsSync(join(barberRoutes, "[id]", "portal-link", "route.ts"))).toBe(false);
    // ويبقى للإدارة: المسؤول القانوني عن البيانات يحتاج استرجاعًا استثنائيًا.
    expect(
      existsSync(join(process.cwd(), "app", "api", "dashboard", "customers", "[id]", "portal-link", "route.ts")),
    ).toBe(true);
  });

  it("escapes script-closing characters in JSON-LD", () => {
    const serialized = serializeJsonForHtml({ description: "</script><script>alert(1)</script>" });
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
  });

  it("redacts secrets and masks common PII in structured logs", () => {
    const redacted = redactForLog({
      password: "not-for-logs",
      accessToken: "not-for-logs",
      email: "person@example.com",
      phone: "0501234567",
      nested: { authorization: "Bearer not-for-logs" },
    }) as Record<string, unknown>;

    expect(redacted.password).toBe("[REDACTED]");
    expect(redacted.accessToken).toBe("[REDACTED]");
    expect(redacted.email).toBe("p***@example.com");
    expect(redacted.phone).toBe("050***567");
    expect((redacted.nested as Record<string, unknown>).authorization).toBe("[REDACTED]");
  });

  it("never writes email recipients or OTP-bearing bodies through the console provider", () => {
    const providerSource = readFileSync(join(process.cwd(), "lib", "email", "email-provider.ts"), "utf8");
    const consoleProvider = providerSource.match(/class ConsoleEmailProvider[\s\S]*?class ResendEmailProvider/)?.[0] ?? "";

    expect(consoleProvider).not.toContain("message.to");
    expect(consoleProvider).not.toContain("message.text");
    expect(consoleProvider).not.toContain("message.subject");
  });

  it("rejects passwords beyond the safe bcrypt input policy", () => {
    expect(adminPasswordSchema.safeParse("A".repeat(65)).success).toBe(false);
    expect(adminPasswordSchema.safeParse("ك".repeat(40)).success).toBe(false);
  });

  it("publishes baseline security and no-store headers", async () => {
    const rules = await nextConfig.headers?.();
    const global = rules?.find((rule) => rule.source === "/:path*")?.headers ?? [];
    const api = rules?.find((rule) => rule.source === "/api/:path*")?.headers ?? [];
    const names = new Set(global.map((header) => header.key));

    for (const expected of [
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]) {
      expect(names.has(expected)).toBe(true);
    }
    expect(api.find((header) => header.key === "Cache-Control")?.value).toContain("no-store");
  });

  /**
   * `'unsafe-inline'` في `script-src` يُبطل مفعول CSP كدفاع ضد XSS: أي حقن HTML
   * يصير تنفيذ سكربت. النسخة الموقّعة بـnonce تُرسل من `middleware.ts` لكل مسار
   * يعرض بيانات، والنسخة الثابتة تبقى للصفحات العامة المُصيَّرة مسبقًا وحدها.
   */
  it("signs scripts with a per-request nonce instead of allowing every inline script", () => {
    const guarded = buildContentSecurityPolicy({ nonce: "test-nonce", isProduction: true });
    const scriptSrc = guarded.split("; ").find((directive) => directive.startsWith("script-src")) ?? "";

    expect(scriptSrc).toContain("'nonce-test-nonce'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // عامل خدمة الحلاق يرث `script-src` ما لم يُعلن؛ و`strict-dynamic` يحجب تسجيله.
    expect(guarded).toContain("worker-src 'self'");
    // ورقم عشوائي حقيقي لكل طلب لا قيمة ثابتة يمكن توقّعها.
    expect(createCspNonce()).not.toBe(createCspNonce());
  });

  /**
   * سياسة الـnonce تُعطب أي صفحة مُصيَّرة مسبقًا: HTML المبني وقت `next build`
   * يحمل سكربتات Next بلا توقيع فيحجبها المتصفح. لذلك كل تخطيط يغطّي بادئة
   * داخل `middleware.matcher` يُلزم التصيير عند الطلب — والتوجيه في التخطيط لا
   * في الصفحات لأن مكوّنات العميل لا تُحترم فيها إعدادات المقطع.
   */
  it("forces on-demand rendering for every layout the nonce policy covers", () => {
    const layouts = [
      ["dashboard"],
      ["barber"],
      ["platform"],
      ["receipt"],
      ["account"],
      ["my", "[token]"],
    ];

    for (const segments of layouts) {
      const source = readFileSync(join(process.cwd(), "app", ...segments, "layout.tsx"), "utf8");
      expect(source, `app/${segments.join("/")}/layout.tsx`).toContain('export const dynamic = "force-dynamic"');
    }
  });

  it("keeps global maintenance outside tenant-admin authorization", () => {
    const route = readFileSync(join(process.cwd(), "app", "api", "maintenance", "cleanup", "route.ts"), "utf8");
    expect(route).toContain("requirePlatformApi");
    expect(route).not.toContain("requireAdminApi");
  });

  it("keeps owner-account and tenant predicates in sensitive write paths", () => {
    const staffRoute = readFileSync(join(process.cwd(), "app", "api", "dashboard", "staff", "[id]", "route.ts"), "utf8");
    const visitService = readFileSync(join(process.cwd(), "lib", "visits", "visit-service.ts"), "utf8");
    expect(staffRoute).toContain('before.role === "OWNER"');
    expect(visitService).toContain("id: input.rewardRuleId, organizationId: input.organizationId");
  });

  it("keeps migrations deployable and the proxy IP chain non-spoofable", () => {
    const migration = readFileSync(
      join(process.cwd(), "prisma", "migrations", "20260811000000_performance_indexes", "migration.sql"),
      "utf8",
    );
    const nginx = readFileSync(join(process.cwd(), "deploy", "nginx", "tanal.conf"), "utf8");
    expect(migration).not.toContain("CONCURRENTLY");
    expect(nginx).toContain("proxy_set_header X-Forwarded-For $remote_addr");
    expect(nginx).not.toContain("$proxy_add_x_forwarded_for");
    // ترويسة يتركها البروكسي تمرّ هي ترويسة يكتبها الزائر: منها يُبنى أصل
    // التحويل وقائمة أصول CSRF، فتُضبط في كل كتلة تمرير بلا استثناء.
    const proxyLocations = nginx.match(/proxy_pass http:\/\/tanal_app;/g)?.length ?? 0;
    expect(proxyLocations).toBeGreaterThan(0);
    expect(nginx.match(/proxy_set_header X-Forwarded-Host \$host;/g)).toHaveLength(proxyLocations);
  });

  it("keeps database tenant guards, backup restore guards, and CI scanners enabled", () => {
    const migration = readFileSync(join(process.cwd(), "prisma", "migrations", "20260811010000_security_hardening", "migration.sql"), "utf8");
    const auditMigration = readFileSync(join(process.cwd(), "prisma", "migrations", "20260811011000_audit_pii_guard", "migration.sql"), "utf8");
    const expandedTenantMigration = readFileSync(join(process.cwd(), "prisma", "migrations", "20260811012000_tenant_constraint_expansion", "migration.sql"), "utf8");
    const restore = readFileSync(join(process.cwd(), "deploy", "backup", "tanal-restore-drill.sh"), "utf8");
    const securityWorkflow = readFileSync(join(process.cwd(), ".github", "workflows", "security.yml"), "utf8");
    const semgrepPolicy = readFileSync(join(process.cwd(), ".semgrep.yml"), "utf8");
    expect(migration).toContain("VisitService_tenant_guard");
    expect(migration).toContain("Visit_customer_tenant_fkey");
    expect(auditMigration).toContain("AuditLog_minimization_guard");
    expect(expandedTenantMigration).toContain("Session_user_tenant_fkey");
    expect(restore).toContain("*_restore_test|*_restore_drill");
    expect(restore).toContain("target database is not empty");
    expect(securityWorkflow).toContain("semgrep/semgrep@sha256:");
    expect(securityWorkflow).toContain("zricethezav/gitleaks@sha256:");
    expect(securityWorkflow).toContain("github/codeql-action/init@");
    expect(semgrepPolicy).toContain("xmansx-no-unsafe-prisma-raw");
  });
});
