import { describe, expect, it } from "vitest";
import { canAccessDashboard, canManageStaff } from "../lib/auth/access";
import { canBarberLogin } from "../lib/auth/login-policy";
import { toSafeAdminUser, toSafeBarber } from "../lib/auth/sanitize";

const date = new Date("2026-06-14T12:00:00.000Z");

describe("auth sanitization and access rules", () => {
  it("does not return passwordHash from safe admin data", () => {
    const safe = toSafeAdminUser({
      id: "admin-1",
      name: "مدير",
      email: "admin@tanal.local",
      phone: "966500000001",
      passwordHash: "secret-hash",
      role: "ADMIN",
      isActive: true,
      lastLoginAt: null,
      createdAt: date,
      updatedAt: date,
    });

    expect(safe).toEqual({
      id: "admin-1",
      name: "مدير",
      email: "admin@tanal.local",
      role: "ADMIN",
    });
    expect("passwordHash" in safe).toBe(false);
  });

  it("does not return accessPinHash from safe barber data", () => {
    const safe = toSafeBarber(
      {
        id: "barber-1",
        name: "حلاق",
        phone: "966500000002",
        accessPinHash: "pin-hash",
        role: "BARBER",
        isActive: true,
        lastLoginAt: null,
        createdAt: date,
        updatedAt: date,
      },
      true,
    );

    expect(safe).toMatchObject({
      id: "barber-1",
      name: "حلاق",
      phone: "966500000002",
      role: "BARBER",
      isActive: true,
    });
    expect("accessPinHash" in safe).toBe(false);
  });

  it("prevents barber sessions from dashboard access", () => {
    expect(
      canAccessDashboard({
        type: "barber",
        id: "session-1",
        role: "BARBER",
        barber: {
          id: "barber-1",
          name: "حلاق",
          phone: "966500000002",
          role: "BARBER",
        },
      }),
    ).toBe(false);
  });

  it("prevents anonymous users from dashboard access", () => {
    expect(canAccessDashboard(null)).toBe(false);
  });

  it("allows staff management only for admin dashboard sessions", () => {
    expect(
      canManageStaff({
        type: "dashboard",
        id: "admin-session",
        role: "ADMIN",
        user: { id: "admin-1", name: "مدير", email: "admin@tanal.local", role: "ADMIN" },
      }),
    ).toBe(true);
    expect(
      canManageStaff({
        type: "dashboard",
        id: "supervisor-session",
        role: "SUPERVISOR",
        user: { id: "supervisor-1", name: "مشرف", email: "supervisor@tanal.local", role: "SUPERVISOR" },
      }),
    ).toBe(false);
  });

  it("prevents disabled barbers from logging in", () => {
    expect(canBarberLogin({ isActive: false }, true)).toBe(false);
    expect(canBarberLogin({ isActive: true }, true)).toBe(true);
  });
});
