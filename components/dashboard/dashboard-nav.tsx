"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navGroups = [
  {
    title: "المتابعة",
    items: [
      { href: "/dashboard", label: "الرئيسية", description: "ملخص الأداء", icon: "R" },
      { href: "/dashboard/reports", label: "التقارير", description: "أرقام ومؤشرات", icon: "T" },
      { href: "/dashboard/daily-close", label: "جلسات الصندوق", description: "الإغلاق والتحصيل", icon: "C" },
      { href: "/dashboard/post-close-adjustments", label: "تصحيحات الإغلاق", description: "مراجعة الفروقات", icon: "A" },
    ],
  },
  {
    title: "التشغيل",
    items: [
      { href: "/dashboard/visits", label: "الزيارات", description: "سجل الخدمات", icon: "V" },
      { href: "/dashboard/barbers", label: "الحلاقون", description: "الحسابات والصلاحية", icon: "B" },
      { href: "/dashboard/services", label: "الخدمات", description: "القائمة والأسعار", icon: "S" },
      { href: "/dashboard/customers", label: "العملاء", description: "البيانات والولاء", icon: "U" },
    ],
  },
  {
    title: "التسويق",
    items: [
      { href: "/dashboard/loyalty", label: "الولاء", description: "النقاط والمكافآت", icon: "L" },
      { href: "/dashboard/campaigns", label: "الحملات", description: "العروض والاستهداف", icon: "M" },
      { href: "/dashboard/whatsapp", label: "واتساب", description: "قوالب ورسائل", icon: "W" },
      { href: "/dashboard/settings", label: "الإعدادات", description: "النظام والتفضيلات", icon: "G" },
    ],
  },
  {
    title: "النظام",
    adminOnly: true,
    items: [
      { href: "/dashboard/staff", label: "الموظفون", description: "المدراء والمشرفون", icon: "P" },
    ],
  },
];

export function DashboardNav({ role }: { role: "ADMIN" | "SUPERVISOR" | null }) {
  const pathname = usePathname();
  const visibleGroups = navGroups.filter((group) => !("adminOnly" in group) || role === "ADMIN");

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
                  className={`group flex items-center gap-3 rounded-lg border px-3 py-3 text-sm transition ${
                    isActive
                      ? "border-salon-gold/50 bg-white text-salon-ink shadow-lg shadow-black/15"
                      : "border-transparent text-white/75 hover:border-white/10 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-black ${
                      isActive ? "bg-salon-ink text-salon-gold" : "bg-white/[0.08] text-white/70 group-hover:bg-white/[0.12] group-hover:text-white"
                    }`}
                    aria-hidden="true"
                  >
                    {item.icon}
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
