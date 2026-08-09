import { describe, expect, it } from "vitest";
import {
  canAccessDashboard,
  canManageBarbers,
  canManageOrganization,
  canManageStaff,
  canOperateLoyalty,
  canSetLoyaltyPolicy,
  canTransferBarbers,
} from "../lib/auth/access";
import { dashboardScope, effectiveSalonIds, isAggregateView, salonScopeWhere } from "../lib/auth/salon-scope";
import type { AuthSession } from "../lib/auth/session";

type DashboardSession = Extract<AuthSession, { type: "dashboard" }>;

function session(overrides: Partial<DashboardSession>): DashboardSession {
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

const owner = session({ role: "OWNER", user: { id: "owner", name: "مالك", email: null, role: "OWNER" } });
const admin = session({ role: "ADMIN" });
const supervisor = session({
  role: "SUPERVISOR",
  scopedSalonIds: ["salon-a", "salon-b"],
  salonId: null,
  user: { id: "sup", name: "مشرف", email: null, role: "SUPERVISOR" },
});

describe("نموذج الأدوار: من يضبط سياسة الولاء ومن يشغّلها", () => {
  it("يسمح للمالك والمدير والمشرف بتشغيل برنامج الولاء", () => {
    expect(canOperateLoyalty(owner)).toBe(true);
    expect(canOperateLoyalty(admin)).toBe(true);
    expect(canOperateLoyalty(supervisor)).toBe(true);
    expect(canOperateLoyalty(null)).toBe(false);
  });

  it("يقصر ضبط سياسة الولاء على المالك والمدير", () => {
    expect(canSetLoyaltyPolicy(owner)).toBe(true);
    expect(canSetLoyaltyPolicy(admin)).toBe(true);
    expect(canSetLoyaltyPolicy(supervisor)).toBe(false);
  });

  it("يمنع المشرف من إنشاء/حذف الحلاقين ويسمح له بنقلهم", () => {
    expect(canManageBarbers(supervisor)).toBe(false);
    expect(canTransferBarbers(supervisor)).toBe(true);
    expect(canManageBarbers(admin)).toBe(true);
    expect(canTransferBarbers(admin)).toBe(true);
  });

  it("يبقي إدارة الموظفين والمؤسسة كما هي", () => {
    expect(canManageStaff(supervisor)).toBe(false);
    expect(canManageStaff(admin)).toBe(true);
    expect(canManageOrganization(admin)).toBe(false);
    expect(canManageOrganization(owner)).toBe(true);
    expect(canAccessDashboard(supervisor)).toBe(true);
  });
});

describe("العرض المجمّع لا يتجاوز نطاق المشرف", () => {
  it("يجمع فروع المشرف المسندة فقط عند اختيار «كل فروعي»", () => {
    expect(salonScopeWhere(supervisor)).toEqual({ salonId: { in: ["salon-a", "salon-b"] } });
    expect(effectiveSalonIds(supervisor)).toEqual(["salon-a", "salon-b"]);
    expect(isAggregateView(supervisor)).toBe(true);
  });

  it("يقصر الاستعلام على الفرع النشط عند اختياره", () => {
    const active = session({ role: "SUPERVISOR", scopedSalonIds: ["salon-a", "salon-b"], salonId: "salon-b" });
    expect(salonScopeWhere(active)).toEqual({ salonId: "salon-b" });
    expect(effectiveSalonIds(active)).toEqual(["salon-b"]);
    expect(isAggregateView(active)).toBe(false);
  });

  it("يترك المالك/المدير بلا قيد فرع عند العرض المجمّع", () => {
    expect(salonScopeWhere(admin)).toEqual({});
    expect(effectiveSalonIds(admin)).toBeNull();
  });

  it("يبني سياق نطاق جاهز للصفحات", () => {
    const scope = dashboardScope(supervisor);
    expect(scope.organizationId).toBe("org_default");
    expect(scope.orgWhere).toEqual({ organizationId: "org_default" });
    expect(scope.salonWhere).toEqual({ salonId: { in: ["salon-a", "salon-b"] } });
    expect(scope.salonIds).toEqual(["salon-a", "salon-b"]);
    expect(scope.isAggregate).toBe(true);
  });

  it("يعيد سياقًا فارغًا لغير جلسات لوحة الإدارة", () => {
    const scope = dashboardScope(null);
    expect(scope.organizationId).toBeUndefined();
    expect(scope.orgWhere).toEqual({});
    expect(scope.salonWhere).toEqual({});
    expect(scope.salonIds).toBeNull();
  });
});
