import { describe, expect, it } from "vitest";
import { extractOrgSlug, isPlatformHost } from "../lib/tenant/subdomain";

describe("subdomain tenant resolution", () => {
  const root = "tanal.com";

  it("extracts the org slug from a subdomain", () => {
    expect(extractOrgSlug("owner1.tanal.com", root)).toBe("owner1");
    expect(extractOrgSlug("owner1.tanal.com:443", root)).toBe("owner1");
    expect(extractOrgSlug("OWNER1.TANAL.COM", root)).toBe("owner1");
  });

  it("returns null for the apex and www", () => {
    expect(extractOrgSlug("tanal.com", root)).toBeNull();
    expect(extractOrgSlug("www.tanal.com", root)).toBeNull();
  });

  it("returns null for localhost and IPs (dev / default org)", () => {
    expect(extractOrgSlug("localhost", root)).toBeNull();
    expect(extractOrgSlug("localhost:3000", root)).toBeNull();
    expect(extractOrgSlug("127.0.0.1:3000", root)).toBeNull();
  });

  it("ignores reserved subdomains", () => {
    expect(extractOrgSlug("platform.tanal.com", root)).toBeNull();
    expect(extractOrgSlug("api.tanal.com", root)).toBeNull();
  });

  it("detects the platform host", () => {
    expect(isPlatformHost("platform.tanal.com", root)).toBe(true);
    expect(isPlatformHost("owner1.tanal.com", root)).toBe(false);
    expect(isPlatformHost("tanal.com", root)).toBe(false);
  });

  it("falls back to first label when no root domain configured", () => {
    expect(extractOrgSlug("owner1.example.dev", "")).toBe("owner1");
    expect(extractOrgSlug("example.dev", "")).toBeNull();
  });
});
