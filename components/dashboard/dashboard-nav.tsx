"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

type NavItem = { href: string; label: string; description: string; icon: IconName };
type NavGroup = { title: string; adminOnly?: boolean; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "المتابعة",
    items: [
      { href: "/dashboard", label: "الرئيسية", description: "ملخص الأداء", icon: "home" },
      { href: "/dashboard/reports", label: "التقارير", description: "أرقام ومؤشرات", icon: "reports" },
      { href: "/dashboard/daily-close", label: "جلسات الصندوق", description: "الإغلاق والتحصيل", icon: "cash" },
      { href: "/dashboard/post-close-adjustments", label: "تصحيحات الإغلاق", description: "مراجعة الفروقات", icon: "adjustments" },
    ],
  },
  {
    title: "التشغيل",
    items: [
      { href: "/dashboard/visits", label: "الزيارات", description: "سجل الخدمات", icon: "visits" },
      { href: "/dashboard/barbers", label: "الحلاقون", description: "الحسابات والصلاحية", icon: "barbers" },
      { href: "/dashboard/services", label: "الخدمات", description: "القائمة والأسعار", icon: "services" },
      { href: "/dashboard/customers", label: "العملاء", description: "البيانات والولاء", icon: "customers" },
    ],
  },
  {
    title: "التسويق",
    items: [
      { href: "/dashboard/loyalty", label: "الولاء", description: "النقاط والمكافآت", icon: "loyalty" },
      { href: "/dashboard/campaigns", label: "الحملات", description: "العروض والاستهداف", icon: "campaigns" },
      { href: "/dashboard/whatsapp", label: "واتساب", description: "قوالب ورسائل", icon: "whatsapp" },
      { href: "/dashboard/settings", label: "الإعدادات", description: "النظام والتفضيلات", icon: "settings" },
    ],
  },
  {
    title: "النظام",
    adminOnly: true,
    items: [
      { href: "/dashboard/staff", label: "الموظفون", description: "المدراء والمشرفون", icon: "staff" },
    ],
  },
];

export function DashboardNav({ role }: { role: "ADMIN" | "SUPERVISOR" | null }) {
  const pathname = usePathname();
  const visibleGroups = navGroups.filter((group) => !group.adminOnly || role === "ADMIN");

  return (
    <nav className="mt-5 flex min-w-max gap-4 lg:mt-6 lg:block lg:min-w-0 lg:space-y-6">
      {visibleGroups.map((group) => (
        <section key={group.title} className="w-[260px] shrink-0 lg:w-auto">
          <p className="px-3 text-[11px] font-black uppercase tracking-[0.08em] text-white/42">{group.title}</p>
          <div className="mt-2 space-y-1">
            {group.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-[background-color,border-color,color] duration-200 ${
                    isActive
                      ? "border-salon-gold/40 bg-white text-salon-ink shadow-[0_14px_30px_-18px_rgba(0,0,0,0.7)]"
                      : "border-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {isActive ? (
                    <span className="absolute inset-y-2 right-0 w-1 rounded-full bg-gradient-to-b from-salon-gold to-[#8f6c39]" aria-hidden="true" />
                  ) : null}
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors duration-200 ${
                      isActive
                        ? "bg-salon-ink text-salon-gold"
                        : "bg-white/[0.07] text-white/70 group-hover:bg-white/[0.12] group-hover:text-white"
                    }`}
                    aria-hidden="true"
                  >
                    <Icon name={item.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-black">{item.label}</span>
                    <span className={`mt-0.5 block truncate text-xs font-bold ${isActive ? "text-salon-charcoal" : "text-white/45"}`}>
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
