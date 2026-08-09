import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getBarberPushPublicConfig } from "../lib/push/barber-push";

const originalEnv = {
  publicKey: process.env.WEB_PUSH_PUBLIC_KEY,
  privateKey: process.env.WEB_PUSH_PRIVATE_KEY,
  subject: process.env.WEB_PUSH_SUBJECT,
};

afterEach(() => {
  restoreEnv("WEB_PUSH_PUBLIC_KEY", originalEnv.publicKey);
  restoreEnv("WEB_PUSH_PRIVATE_KEY", originalEnv.privateKey);
  restoreEnv("WEB_PUSH_SUBJECT", originalEnv.subject);
});

describe("barber web push", () => {
  it("does not expose or enable a partially configured VAPID setup", () => {
    process.env.WEB_PUSH_PUBLIC_KEY = "public-test-key";
    delete process.env.WEB_PUSH_PRIVATE_KEY;
    process.env.WEB_PUSH_SUBJECT = "mailto:ops@example.com";

    expect(getBarberPushPublicConfig()).toEqual({ enabled: false, publicKey: null });
  });

  it("returns only the public VAPID key to the browser", () => {
    process.env.WEB_PUSH_PUBLIC_KEY = "public-test-key";
    process.env.WEB_PUSH_PRIVATE_KEY = "private-test-key";
    process.env.WEB_PUSH_SUBJECT = "mailto:ops@example.com";

    const config = getBarberPushPublicConfig();
    expect(config).toEqual({ enabled: true, publicKey: "public-test-key" });
    expect(JSON.stringify(config)).not.toContain("private-test-key");
  });

  it("handles push display and clicks without caching appointment data", () => {
    const worker = readFileSync(join(process.cwd(), "public", "barber-sw.js"), "utf8");

    expect(worker).toContain('addEventListener("push"');
    expect(worker).toContain('addEventListener("notificationclick"');
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain("كل نداءات الـ API شبكة فقط");
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
