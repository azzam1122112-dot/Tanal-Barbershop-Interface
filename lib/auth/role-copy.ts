export type DashboardRole = "OWNER" | "ADMIN" | "SUPERVISOR";

export const DASHBOARD_ROLE_COPY: Record<
  DashboardRole,
  {
    label: string;
    panelTitle: string;
    panelEyebrow: string;
    description: string;
    sessionLabel: string;
  }
> = {
  OWNER: {
    label: "مالك المؤسسة",
    panelTitle: "لوحة المالك",
    panelEyebrow: "قيادة المؤسسة",
    description: "متابعة الأداء المالي والتشغيلي لجميع الفروع واتخاذ القرارات من مستوى المؤسسة.",
    sessionLabel: "جلسة مالك المؤسسة",
  },
  ADMIN: {
    label: "مدير المؤسسة",
    panelTitle: "لوحة مدير المؤسسة",
    panelEyebrow: "إدارة المؤسسة",
    description: "إدارة الفريق والسياسات والتشغيل عبر فروع المؤسسة ضمن صلاحيات الإدارة المفوّضة.",
    sessionLabel: "جلسة مدير المؤسسة",
  },
  SUPERVISOR: {
    label: "مدير الفرع",
    panelTitle: "لوحة مدير الفرع",
    panelEyebrow: "تشغيل الفرع",
    description: "متابعة المواعيد والصندوق والفريق والعملاء داخل الفروع المسندة فقط.",
    sessionLabel: "جلسة مدير الفرع",
  },
};

export function getDashboardRoleCopy(role: DashboardRole | null) {
  return role ? DASHBOARD_ROLE_COPY[role] : DASHBOARD_ROLE_COPY.ADMIN;
}
