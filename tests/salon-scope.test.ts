import { describe, expect, it } from "vitest";
import { accessibleSalonIds, assertSalonAllowed, isSalonAllowed, salonScopeWhere } from "../lib/auth/salon-scope";
import type { AuthSession } from "../lib/auth/session";

type DashboardSession = Extract<AuthSession, { type: "dashboard" }>;

function dashboardSession(overrides: Partial<DashboardSession>): DashboardSession {
  return {
    type: "dashboard",
    id: "session-1",
    role: "ADMIN",
    organizationId: "org_default",
    salonId: null,
    scopedSalonIds: null,
    user: { id: "u1", name: "مستخدم", email: null, role: "ADMIN" },
    ...overrides,
  };
}

describe("salon scope helpers", () => {
  describe("owner/admin (unrestricted)", () => {
    const owner = dashboardSession({ role: "OWNER", scopedSalonIds: null });

    it("has no salon restriction", () => {
      expect(accessibleSalonIds(owner)).toBeNull();
      expect(isSalonAllowed(owner, "salon-anything")).toBe(true);
      expect(() => assertSalonAllowed(owner, "salon-anything")).not.toThrow();
    });

    it("builds an org-wide filter without an active salon, and a single-salon filter with one", () => {
      expect(salonScopeWhere(owner)).toEqual({});
      expect(salonScopeWhere(dashboardSession({ salonId: "salon-x" }))).toEqual({ salonId: "salon-x" });
    });
  });

  describe("supervisor (restricted to assigned salons)", () => {
    const supervisor = dashboardSession({
      role: "SUPERVISOR",
      scopedSalonIds: ["salon-a", "salon-b"],
      salonId: "salon-a",
    });

    it("exposes only the assigned salons", () => {
      expect(accessibleSalonIds(supervisor)).toEqual(["salon-a", "salon-b"]);
    });

    it("allows assigned salons and rejects others", () => {
      expect(isSalonAllowed(supervisor, "salon-a")).toBe(true);
      expect(isSalonAllowed(supervisor, "salon-b")).toBe(true);
      expect(isSalonAllowed(supervisor, "salon-c")).toBe(false);
      expect(isSalonAllowed(supervisor, null)).toBe(false);
      expect(() => assertSalonAllowed(supervisor, "salon-c")).toThrow();
    });

    it("scopes queries to the active assigned salon", () => {
      expect(salonScopeWhere(supervisor)).toEqual({ salonId: "salon-a" });
    });

    it("falls back to all assigned salons when no active salon is set", () => {
      const noActive = dashboardSession({ role: "SUPERVISOR", scopedSalonIds: ["salon-a", "salon-b"], salonId: null });
      expect(salonScopeWhere(noActive)).toEqual({ salonId: { in: ["salon-a", "salon-b"] } });
    });
  });
});
