import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("barber experience regressions", () => {
  it("keeps the install invitation away from transactional barber screens", () => {
    const pwa = readFileSync(join(process.cwd(), "components", "barber", "pwa.tsx"), "utf8");

    expect(pwa).toContain('usePathname');
    expect(pwa).toContain('pathname === "/barber/login"');
    expect(pwa).toContain("canOfferInstall && installEvent");
    expect(pwa).toContain("canOfferInstall && showIosHint");
  });

  it("suppresses only the expected nonce hydration mismatch", () => {
    const layout = readFileSync(join(process.cwd(), "app", "barber", "layout.tsx"), "utf8");

    expect(layout).toContain("nonce={nonce}");
    expect(layout).toContain("suppressHydrationWarning");
  });

  it("makes the access code usable and recoverable", () => {
    const login = readFileSync(join(process.cwd(), "app", "barber", "login", "page.tsx"), "utf8");

    expect(login).toContain('type={showPin ? "text" : "password"}');
    expect(login).toContain('aria-pressed={showPin}');
    expect(login).toContain('إظهار رمز الدخول');
    expect(login).toContain("نسيت رمز الدخول؟");
    expect(login).toContain("مدير الصالون");
  });
});
