import type { AuthSession } from "./session";

export function canAccessDashboard(session: AuthSession | null): session is Extract<AuthSession, { type: "dashboard" }> {
  return session?.type === "dashboard" && (session.role === "OWNER" || session.role === "ADMIN" || session.role === "SUPERVISOR");
}

export function canManageStaff(session: AuthSession | null) {
  return session?.type === "dashboard" && (session.role === "OWNER" || session.role === "ADMIN");
}

export function canManageOrganization(session: AuthSession | null) {
  return session?.type === "dashboard" && session.role === "OWNER";
}

/**
 * تشغيل برنامج الولاء والحملات والرسائل يغيّر بيانات المؤسسة ويتواصل مع العملاء؛
 * لذلك يقتصر صراحة على المالك والمدير. المشرف تشغيلي داخل فروعه فقط.
 */
export function canOperateLoyalty(session: AuthSession | null) {
  return canManageStaff(session);
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

/**
 * المنتجات والمخزون: متاح للمشرف **داخل فروعه المسندة**.
 *
 * المخزون شأن الفرع لا سياسة مؤسسة: من يرى الرفّ فارغًا هو من يجب أن يسجّل
 * التوريد والتالف والجرد. القيد الأمني هو نطاق الفروع (`salonIds`) في كل
 * استعلام وحركة، لا حجب الشاشة عمّن يقف أمام المنتج.
 */
export function canManageProducts(session: AuthSession | null) {
  return canAccessDashboard(session);
}

/**
 * صرف عمولات الحلاقين وعكسها: مالك/مدير مؤسسة فقط.
 * قرار مالي يُخرج نقدًا من الخزنة أو يُسقط دَينًا على المؤسسة، فلا يُترك لمشرف
 * فرع كما لا تُترك له إدارة الموظفين والإعدادات.
 */
export function canPayCommissions(session: AuthSession | null) {
  return canManageStaff(session);
}

/**
 * قراءة البيان المالي الشهري وربحية الفروع: مالك/مدير مؤسسة فقط.
 * المشرف فرعي النطاق ويرى مصروفات فروعه وأداءها، أما ربح المؤسسة بعد العمولات
 * فقرار ملكية لا معلومة تشغيلية.
 */
export function canViewFinancials(session: AuthSession | null) {
  return canManageStaff(session);
}

/**
 * إخراج نقد من خزنة الفرع (تسليم للمالك أو إيداع بنكي): مالك/مدير مؤسسة فقط.
 *
 * القاعدة الجامعة: **كل ما يُخرج نقدًا من الخزنة بيد واحدة يحتاج نفس الصلاحية.**
 * كان صرف خمسين ريالًا عمولة محجوبًا عن المشرف بينما سحب رصيد الخزنة كاملًا
 * متاحًا له — تدرّج مخاطر معكوس. التحصيل من الحلاق يبقى للمشرف لأنه **يُدخل**
 * النقد إلى الخزنة لا يُخرجه.
 */
export function canWithdrawBranchSafe(session: AuthSession | null) {
  return canManageStaff(session);
}

export function canAccessBarberApp(session: AuthSession | null) {
  return session?.type === "barber" && session.role === "BARBER";
}

export function canAccessPlatform(session: AuthSession | null): session is Extract<AuthSession, { type: "platform" }> {
  return session?.type === "platform" && session.mfaVerified;
}

export function canSetupPlatformMfa(session: AuthSession | null): session is Extract<AuthSession, { type: "platform" }> {
  return session?.type === "platform" && session.mfaSetupRequired;
}
