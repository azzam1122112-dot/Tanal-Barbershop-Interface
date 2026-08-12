"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { getDashboardRoleCopy, type DashboardRole } from "@/lib/auth/role-copy";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: IconName;
  roles?: DashboardRole[];
};

type NavGroup = { title: string; items: NavItem[] };

const ALL_MANAGEMENT: DashboardRole[] = ["OWNER", "ADMIN"];
const OWNER_ONLY: DashboardRole[] = ["OWNER"];
const BRANCH_OPERATIONS: DashboardRole[] = ["OWNER", "ADMIN", "SUPERVISOR"];

const navGroups: NavGroup[] = [
  {
    title: "القيادة",
    items: [
      { href: "/dashboard", label: "مركز المتابعة", description: "المهم الآن", icon: "home", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/finance", label: "البيان المالي", description: "الدخل والربح شهريًا", icon: "billing", roles: ALL_MANAGEMENT },
      { href: "/dashboard/reports", label: "التقارير", description: "الأداء والاتجاهات", icon: "reports", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/salons-compare", label: "مقارنة الفروع", description: "قرار المالك", icon: "reports", roles: ALL_MANAGEMENT },
    ],
  },
  {
    title: "التشغيل اليومي",
    items: [
      { href: "/dashboard/appointments", label: "المواعيد", description: "جدول اليوم", icon: "visits", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/visits", label: "الزيارات", description: "الخدمات والتحصيل", icon: "scissors", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/expenses", label: "المصروفات", description: "البنود وصافي التشغيل", icon: "cash", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/cash-custody", label: "عهدة الكاش", description: "التحصيل وخزائن الفروع", icon: "billing", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/daily-close", label: "الصندوق", description: "الجلسات والإغلاق", icon: "cash", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/post-close-adjustments", label: "تصحيحات الإغلاق", description: "الفروقات والمراجعة", icon: "adjustments", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/attendance", label: "الحضور", description: "حالة الفريق", icon: "staff", roles: BRANCH_OPERATIONS },
    ],
  },
  {
    title: "الفريق والعملاء",
    items: [
      { href: "/dashboard/barbers", label: "الحلاقون", description: "الفريق والعمولات", icon: "barbers", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/commissions", label: "المستحقات", description: "عمولات الحلاقين", icon: "billing", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/customers", label: "العملاء", description: "السجل والعلاقة", icon: "customers", roles: ALL_MANAGEMENT },
      { href: "/dashboard/privacy-requests", label: "طلبات الخصوصية", description: "وصول وتصحيح وحذف", icon: "customers", roles: ALL_MANAGEMENT },
    ],
  },
  {
    title: "الكتالوج والنمو",
    items: [
      { href: "/dashboard/services", label: "الخدمات", description: "الأسعار والمدد", icon: "services", roles: ALL_MANAGEMENT },
      { href: "/dashboard/products", label: "المنتجات والمخزون", description: "الرصيد والتوريد والتالف", icon: "services", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/supplies", label: "المستلزمات التشغيلية", description: "بلاغات النفاد والتوريد", icon: "adjustments", roles: BRANCH_OPERATIONS },
      { href: "/dashboard/loyalty", label: "الولاء", description: "النقاط والمكافآت", icon: "loyalty", roles: ALL_MANAGEMENT },
      { href: "/dashboard/campaigns", label: "الحملات", description: "العروض والاستهداف", icon: "campaigns", roles: ALL_MANAGEMENT },
      { href: "/dashboard/whatsapp", label: "واتساب", description: "التواصل والموافقات", icon: "whatsapp", roles: ALL_MANAGEMENT },
    ],
  },
  {
    title: "إدارة المؤسسة",
    items: [
      { href: "/dashboard/salons", label: "الفروع", description: "هيكل المؤسسة", icon: "home", roles: OWNER_ONLY },
      { href: "/dashboard/staff", label: "الإدارة والصلاحيات", description: "مديرو المؤسسة والفروع", icon: "staff", roles: ALL_MANAGEMENT },
      { href: "/dashboard/settings", label: "إعدادات التشغيل", description: "الفرع والسياسات", icon: "settings", roles: ALL_MANAGEMENT },
      { href: "/dashboard/subscription", label: "اشتراكي", description: "الباقة والدفع", icon: "billing", roles: ALL_MANAGEMENT },
    ],
  },
];

export function DashboardNav({ role }: { role: DashboardRole | null }) {
  const pathname = usePathname();
  const resolvedRole = role ?? "ADMIN";
  const copy = getDashboardRoleCopy(role);
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(resolvedRole)) }))
    .filter((group) => group.items.length > 0);

  return (
    <nav className="mt-2 space-y-6 lg:mt-5" aria-label={`تنقل ${copy.panelTitle}`}>
      {visibleGroups.map((group) => (
        <section key={group.title}>
          <div className="flex items-center gap-2 px-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/42">{group.title}</p>
            <span className="h-px flex-1 bg-white/[0.07]" />
          </div>
          <div className="mt-2 space-y-1">
            {group.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-[background-color,border-color,color,transform] duration-200 ${
                    isActive
                      ? "border-salon-gold/35 bg-white text-salon-ink shadow-[0_14px_30px_-18px_rgba(0,0,0,0.7)]"
                      : "border-transparent text-white/70 hover:translate-x-[-2px] hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {isActive ? <span className="absolute inset-y-2 right-0 w-1 rounded-full bg-gradient-to-b from-salon-gold to-[#6d28d9]" aria-hidden="true" /> : null}
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors duration-200 ${
                      isActive ? "bg-salon-ink text-salon-gold" : "bg-white/[0.07] text-white/70 group-hover:bg-white/[0.12] group-hover:text-white"
                    }`}
                    aria-hidden="true"
                  >
                    <Icon name={item.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{item.label}</span>
                    <span className={`mt-0.5 block truncate text-[11px] font-semibold ${isActive ? "text-salon-charcoal" : "text-white/42"}`}>
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
