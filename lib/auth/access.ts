import type { AuthSession } from "./session";

export function canAccessDashboard(session: AuthSession | null) {
  return session?.type === "dashboard" && (session.role === "OWNER" || session.role === "ADMIN" || session.role === "SUPERVISOR");
}

export function canManageStaff(session: AuthSession | null) {
  return session?.type === "dashboard" && (session.role === "OWNER" || session.role === "ADMIN");
}

export function canManageOrganization(session: AuthSession | null) {
  return session?.type === "dashboard" && session.role === "OWNER";
}

/**
 * تشغيل برنامج الولاء: صرف مكافآت المدير، تشغيل الحملات، رسائل واتساب، متابعة العملاء.
 * المشرف مسؤول عن هذا داخل فروعه المسندة.
 */
export function canOperateLoyalty(session: AuthSession | null) {
  return canAccessDashboard(session);
}

/**
 * سياسة الولاء: معدّل النقاط وقواعد المكافآت وسقوفها.
 * تبقى للمالك/المدير حتى لا يغيّر مشرفُ فرعٍ قواعدَ المؤسسة كلها.
 */
export function canSetLoyaltyPolicy(session: AuthSession | null) {
  return canManageStaff(session);
}

/** إنشاء/حذف الحلاقين وتغيير رموز دخولهم: مالك/مدير فقط. */
export function canManageBarbers(session: AuthSession | null) {
  return canManageStaff(session);
}

/** نقل الحلاقين بين الفروع ومتابعتهم: متاح للمشرف داخل فروعه المسندة. */
export function canTransferBarbers(session: AuthSession | null) {
  return canAccessDashboard(session);
}

export function canAccessBarberApp(session: AuthSession | null) {
  return session?.type === "barber" && session.role === "BARBER";
}

export function canAccessPlatform(session: AuthSession | null) {
  return session?.type === "platform";
}
