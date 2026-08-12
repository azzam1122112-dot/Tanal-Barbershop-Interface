import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isTrustedOrigin, parseAllowedOrigins, MUTATING_METHODS } from "../lib/auth/origin";
import { middleware } from "../middleware";

describe("origin / CSRF helpers", () => {
  it("allows requests with no Origin header (server-to-server)", () => {
    expect(isTrustedOrigin(null, "https://app.tanal.com")).toBe(true);
  });

  it("allows a same-origin request", () => {
    expect(isTrustedOrigin("https://app.tanal.com", "https://app.tanal.com")).toBe(true);
  });

  it("allows any normalized request origin candidate", () => {
    expect(isTrustedOrigin("https://app.tanal.com", ["http://internal:3000", "https://app.tanal.com"])).toBe(true);
  });

  it("rejects a cross-origin request", () => {
    expect(isTrustedOrigin("https://evil.example", "https://app.tanal.com")).toBe(false);
  });

  it("allows an explicitly configured extra origin", () => {
    const allowed = parseAllowedOrigins("https://admin.tanal.com, https://app.tanal.com");
    expect(isTrustedOrigin("https://admin.tanal.com", "https://app.tanal.com", allowed)).toBe(true);
  });

  it("rejects a malformed Origin header", () => {
    expect(isTrustedOrigin("not-a-url", "https://app.tanal.com")).toBe(false);
  });

  it("parses and normalizes the allowlist, dropping invalid entries", () => {
    expect(parseAllowedOrigins("https://a.com/path, , bad, https://b.com")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });

  it("treats only state-changing methods as mutating", () => {
    expect(MUTATING_METHODS.has("POST")).toBe(true);
    expect(MUTATING_METHODS.has("DELETE")).toBe(true);
    expect(MUTATING_METHODS.has("GET")).toBe(false);
  });

  it("fails closed when a mutating customer-account request omits Origin", () => {
    const missing = middleware(new NextRequest("https://xmansx.com/api/account/register", { method: "POST" }));
    const crossSite = middleware(new NextRequest("https://xmansx.com/api/account/login", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }));
    const sameSite = middleware(new NextRequest("https://xmansx.com/api/account/login", {
      method: "POST",
      headers: { origin: "https://xmansx.com" },
    }));

    expect(missing.status).toBe(403);
    expect(crossSite.status).toBe(403);
    expect(sameSite.status).toBe(200);
  });

  it("keeps authenticated server-to-server jobs usable without Origin", () => {
    const response = middleware(new NextRequest("https://xmansx.com/api/maintenance/cleanup", { method: "POST" }));
    expect(response.status).toBe(200);
  });
});
