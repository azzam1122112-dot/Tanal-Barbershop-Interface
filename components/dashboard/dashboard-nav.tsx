"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

type NavItem = { href: string; label: string; description: string; icon: IconName; hideFromSupervisor?: boolean };
type NavGroup = { title: string; adminOnly?: boolean; ownerOnly?: boolean; hideFromSupervisor?: boolean; items: NavItem[] };

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
      { href: "/dashboard/barbers", label: "الحلاقون", description: "الحسابات والصلاحية", icon: "barbers", hideFromSupervisor: true },
      { href: "/dashboard/services", label: "الخدمات", description: "القائمة والأسعار", icon: "services", hideFromSupervisor: true },
      { href: "/dashboard/customers", label: "العملاء", description: "البيانات والولاء", icon: "customers", hideFromSupervisor: true },
    ],
  },
  {
    title: "التسويق",
    hideFromSupervisor: true,
    items: [
      { href: "/dashboard/loyalty", label: "الولاء", description: "النقاط والمكافآت", icon: "loyalty" },
      { href: "/dashboard/campaigns", label: "الحملات", description: "العروض والاستهداف", icon: "campaigns" },
      { href: "/dashboard/whatsapp", label: "واتساب", description: "قوالب ورسائل", icon: "whatsapp" },
      { href: "/dashboard/settings", label: "الإعدادات", description: "النظام والتفضيلات", icon: "settings" },
    ],
  },
  {
    title: "المؤسسة",
    ownerOnly: true,
    items: [
      { href: "/dashboard/salons", label: "الفروع", description: "صالونات المؤسسة", icon: "home" },
      { href: "/dashboard/subscription", label: "الباقة", description: "الحدود والترقية", icon: "billing" },
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

export function DashboardNav({ role }: { role: "OWNER" | "ADMIN" | "SUPERVISOR" | null }) {
  const pathname = usePathname();
  const visibleGroups = navGroups
    .filter((group) => {
      if (group.ownerOnly) return role === "OWNER";
      if (group.adminOnly) return role === "OWNER" || role === "ADMIN";
      if (group.hideFromSupervisor && role === "SUPERVISOR") return false;
      return true;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !(item.hideFromSupervisor && role === "SUPERVISOR")),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav className="mt-2 space-y-6 lg:mt-6">
      {visibleGroups.map((group) => (
        <section key={group.title}>
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
