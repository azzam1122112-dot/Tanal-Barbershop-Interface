"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

/**
 * تنقّل بوابة العميل.
 *
 * كانت الصفحة عشرة ألواح متتالية بالوزن نفسه بلا تنقّل: المكافآت مفتَّتة على
 * ثلاثة، والحجز — الفعل الوحيد — خامسًا تحت ألواح ساكنة. التبويب يعطي كل سؤال
 * مكانه: «كم رصيدي» و«متى موعدي» و«ماذا يقدّم الصالون» و«ماذا فعلت سابقًا».
 *
 * **روابط لا حالة عميل:** الرمز في المسار أصلًا، فكل تبويب صفحة خادم تجلب ما
 * تعرضه وحده — لا تُحمَّل فروع الحجز لمن يفتح «زياراتي».
 */

const TABS = [
  { segment: "", label: "بطاقتي", icon: "loyalty" },
  { segment: "appointments", label: "مواعيدي", icon: "calendar" },
  { segment: "offers", label: "العروض", icon: "campaigns" },
  { segment: "visits", label: "زياراتي", icon: "scissors" },
  // «حسابي» يستقبل ما لا يُفعل في كل زيارة: التثبيت وطلبات الخصوصية وبياناتك.
  { segment: "account", label: "حسابي", icon: "customers" },
] as const;

export function PortalTabs({ token }: { token: string }) {
  const pathname = usePathname();
  const base = `/my/${token}`;

  return (
    // لاصق أسفل الشاشة مع منطقة الأمان — البوابة تُثبَّت كتطبيق وتُفتح بلا شريط متصفح.
    <nav
      aria-label="أقسام بطاقتك"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-salon-line/70 bg-white/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-3xl">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = tab.segment
            ? pathname === href || pathname.startsWith(`${href}/`)
            : pathname === base;
          return (
            <li key={tab.segment || "home"} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold transition ${
                  active ? "text-salon-forest" : "text-salon-charcoal/55"
                }`}
              >
                <Icon
                  name={tab.icon}
                  className={`h-5 w-5 ${active ? "text-salon-forest" : "text-salon-charcoal/45"}`}
                />
                {tab.label}
                {/* مؤشر بصري فوق اللون وحده: اللون لا يفرّق التبويب النشط لمن لا يميّزه. */}
                <span
                  aria-hidden="true"
                  className={`block h-0.5 w-6 rounded-full ${active ? "bg-salon-forest" : "bg-transparent"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
