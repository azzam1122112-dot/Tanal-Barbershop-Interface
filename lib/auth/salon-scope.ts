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
 *
 * **استخدم هذه الدالة بدل `...(salonId ? { salonId } : {})` في كل استعلام.**
 * النمط اليدوي يتسرّب: عند اختيار «كل الفروع» يصبح بلا قيد إطلاقًا، وهو صحيح
 * للمالك/المدير وخطأ للمشرف الذي يجب أن يبقى محصورًا في فروعه المسندة.
 *
 * - مالك/مدير مع فرع نشط: ذلك الفرع. بدون فرع نشط: كل الفروع (لا قيد).
 * - مشرف مع فرع نشط: ذلك الفرع (مضمون أنه ضمن فروعه). بدونه: كل فروعه المسندة مجتمعة.
 */
export function salonScopeWhere(session: DashboardSession): { salonId?: string | { in: string[] } } {
  if (session.salonId) return { salonId: session.salonId };
  if (session.scopedSalonIds === null) return {};
  return { salonId: { in: session.scopedSalonIds } };
}

/**
 * الفروع الفعّالة للجلسة كمصفوفة معرّفات، أو `null` إن كانت بلا قيد (مالك/مدير على كل الفروع).
 * تُمرَّر للخدمات التي تستقبل `salonIds` مثل إغلاق الصندوق والإغلاق اليومي.
 */
export function effectiveSalonIds(session: DashboardSession): string[] | null {
  if (session.salonId) return [session.salonId];
  return session.scopedSalonIds;
}

/** هل تعرض الجلسة حاليًا أكثر من فرع مجتمعًا؟ (يُستخدم لعناوين الواجهة). */
export function isAggregateView(session: DashboardSession): boolean {
  return session.salonId === null;
}

/**
 * سياق النطاق الجاهز لصفحات لوحة الإدارة — يغني عن تكرار
 * `session.type === "dashboard" ? ... : undefined` في كل صفحة.
 */
export function dashboardScope(session: AuthSession | null) {
  if (!session || session.type !== "dashboard") {
    return {
      organizationId: undefined,
      orgWhere: {} as { organizationId?: string },
      salonWhere: {} as ReturnType<typeof salonScopeWhere>,
      salonIds: null as string[] | null,
      activeSalonId: null as string | null,
      isAggregate: false,
    };
  }

  return {
    organizationId: session.organizationId,
    orgWhere: { organizationId: session.organizationId },
    salonWhere: salonScopeWhere(session),
    salonIds: effectiveSalonIds(session),
    activeSalonId: session.salonId,
    isAggregate: isAggregateView(session),
  };
}
