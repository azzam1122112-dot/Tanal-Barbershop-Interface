import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

/**
 * `X-Forwarded-Host` لا يمسحها كل بروكسي، ومنها يُبنى أصلُ التحويل بعد فشل
 * الجلسة وتُشتقّ أصولُ CSRF المقبولة. بلا تحقق كانت قيمةٌ يكتبها الزائر تقرّر
 * إلى أين يُحوَّل — ولذلك تُقبل الآن فقط داخل النطاق الذي نملكه.
 */
describe("forwarded host is validated before it is trusted", () => {
  const originalRoot = process.env.ROOT_DOMAIN;
  const originalPublicUrl = process.env.PUBLIC_APP_URL;

  afterEach(() => {
    process.env.ROOT_DOMAIN = originalRoot;
    process.env.PUBLIC_APP_URL = originalPublicUrl;
  });

  function redirectFor(headers: Record<string, string>) {
    return middleware(new NextRequest("http://localhost:3000/dashboard", { headers })).headers.get("location");
  }

  it("يتجاهل مضيفًا مُمرَّرًا خارج ROOT_DOMAIN ويعود إلى مضيف الطلب", () => {
    process.env.ROOT_DOMAIN = "xmansx.com";
    delete process.env.PUBLIC_APP_URL;

    expect(
      redirectFor({ host: "xmansx.com", "x-forwarded-host": "evil.test", "x-forwarded-proto": "https" }),
    ).toBe("https://xmansx.com/dashboard/login");
  });

  it("يقبل نطاق مستأجر فرعيًا داخل ROOT_DOMAIN", () => {
    process.env.ROOT_DOMAIN = "xmansx.com";
    delete process.env.PUBLIC_APP_URL;

    expect(
      redirectFor({ host: "xmansx.com", "x-forwarded-host": "salon.xmansx.com", "x-forwarded-proto": "https" }),
    ).toBe("https://salon.xmansx.com/dashboard/login");
  });

  it("لا يقبل نطاقًا يتشابه لاحقته مع النطاق الجذر", () => {
    process.env.ROOT_DOMAIN = "xmansx.com";
    delete process.env.PUBLIC_APP_URL;

    // `notxmansx.com` ينتهي بـ`xmansx.com` نصًّا ولا يخصّنا — الفاصل نقطة لا حرف.
    expect(
      redirectFor({ host: "xmansx.com", "x-forwarded-host": "notxmansx.com", "x-forwarded-proto": "https" }),
    ).toBe("https://xmansx.com/dashboard/login");
  });

  it("يعتمد مضيف PUBLIC_APP_URL حين لا يوجد ROOT_DOMAIN", () => {
    delete process.env.ROOT_DOMAIN;
    process.env.PUBLIC_APP_URL = "https://xmansx.com";

    expect(
      redirectFor({ host: "xmansx.com", "x-forwarded-host": "evil.test", "x-forwarded-proto": "https" }),
    ).toBe("https://xmansx.com/dashboard/login");
  });
});

describe("protected-route redirects", () => {
  it("keeps a PWA navigation on its public origin when the upstream URL is localhost", () => {
    const request = new NextRequest("http://localhost:3000/barber", {
      headers: {
        host: "xmansx.com",
        "x-forwarded-host": "xmansx.com",
        "x-forwarded-proto": "https",
      },
    });

    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://xmansx.com/barber/login");
  });

  it("uses the forwarded production origin for every protected application area", () => {
    const cases = [
      ["/dashboard", "/dashboard/login"],
      ["/platform", "/platform/login"],
      ["/receipt/example", "/dashboard/login"],
    ] as const;

    for (const [pathname, destination] of cases) {
      const response = middleware(new NextRequest(`http://localhost:3000${pathname}`, {
        headers: {
          host: "www.xmansx.com",
          "x-forwarded-proto": "https",
        },
      }));
      expect(response.headers.get("location")).toBe(`https://www.xmansx.com${destination}`);
    }
  });
});
