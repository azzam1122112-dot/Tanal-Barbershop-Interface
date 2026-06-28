import { BusinessError } from "@/lib/errors";
import type { AuthSession } from "./session";

type DashboardSession = Extract<AuthSession, { type: "dashboard" }>;

/**
 * نطاق الفروع المسموح بها لجلسة لوحة الإدارة:
 * - `null` = كل فروع المؤسسة (المالك والمدير).
 * - مصفوفة = فروع المشرف المسندة فقط (غير فارغة دائمًا بحكم بناء الجلسة).
 */
export function accessibleSalonIds(session: DashboardSession): string[] | null {
  return session.scopedSalonIds;
}

/** هل يُسمح لهذه الجلسة بالعمل على هذا الفرع؟ المالك/المدير: أي فرع. المشرف: فروعه فقط. */
export function isSalonAllowed(session: DashboardSession, salonId: string | null | undefined): boolean {
  if (!salonId) return false;
  const scoped = session.scopedSalonIds;
  if (scoped === null) return true;
  return scoped.includes(salonId);
}

/** يرمي خطأ صلاحية (403) إذا كان الفرع خارج نطاق الجلسة. */
export function assertSalonAllowed(session: DashboardSession, salonId: string | null | undefined): void {
  if (!isSalonAllowed(session, salonId)) {
    throw new BusinessError("لا تملك صلاحية على هذا الفرع", 403);
  }
}

/**
 * فلتر Prisma لقصر استعلام على فروع الجلسة المسموح بها.
 * - مالك/مدير مع فرع نشط محدد: ذلك الفرع. بدون فرع نشط: كل الفروع (لا قيد).
 * - مشرف: دائمًا فرعه النشط (مضمون ضمن فروعه المسندة).
 */
export function salonScopeWhere(session: DashboardSession): { salonId?: string | { in: string[] } } {
  if (session.scopedSalonIds === null) {
    return session.salonId ? { salonId: session.salonId } : {};
  }
  // المشرف: الفرع النشط مضمون أنه أحد فروعه المسندة.
  return session.salonId ? { salonId: session.salonId } : { salonId: { in: session.scopedSalonIds } };
}
