import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

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
