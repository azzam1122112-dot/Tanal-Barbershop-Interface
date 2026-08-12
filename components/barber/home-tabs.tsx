"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";

/**
 * تبويبات شاشة الحلاق.
 *
 * **لماذا تبويبات لا ألواح متتالية:** الشاشة كانت تعرض ثلاثة عشر لوحًا بوزن
 * بصري متقارب، وعلى الجوال تتكدّس في عمود واحد — فيقع «فتح جلسة الصندوق»،
 * وهو أول ما يفعله الحلاق صباحًا، تاسعًا تحت المخزون والمستلزمات. التبويبات
 * تُبقي فعل اللحظة وحده أمام عينه وتُنزل الباقي إلى مسافة نقرة واحدة.
 *
 * **كل التبويبات مركّبة (mounted) والمخفي يُخفى بـ `hidden`** لا بإزالته من
 * الشجرة: ألواح المواعيد والمستلزمات تُحدّث نفسها بفاصل زمني ولا تُحدّثها عند
 * التركيب، فإزالتها وإعادتها كانت تُرجع بيانات لحظة فتح الصفحة وتنتظر ثلاثين
 * ثانية قبل أول تحديث. والإخفاء يحفظ أيضًا ما كتبه الحلاق في حقل البحث.
 */

export type BarberTabKey = "work" | "appointments" | "stock" | "day";

export type BarberTab = {
  key: BarberTabKey;
  label: string;
  icon: IconName;
  /** عدّاد على الأيقونة. صفر أو غير معرّف = بلا شارة. */
  badge?: number;
  /** شارة تحذير (كهرماني) بدل العدّاد المحايد. */
  alert?: boolean;
  content: React.ReactNode;
};

const TAB_KEYS: BarberTabKey[] = ["work", "appointments", "stock", "day"];

function tabKeyFromHash(hash: string): BarberTabKey | null {
  const value = hash.replace(/^#/, "");
  return (TAB_KEYS as string[]).includes(value) ? (value as BarberTabKey) : null;
}

export function BarberHomeTabs({ tabs }: { tabs: BarberTab[] }) {
  const [active, setActive] = useState<BarberTabKey>("work");

  // تنبيه الدفع يفتح `/barber#appointments` (`lib/push/barber-push.ts`). كان
  // الهاش يمرّر إلى لوح ظاهر أصلًا؛ ومع التبويبات صار هو ما يختار التبويب —
  // ولولا ذلك لفتح التنبيه الشاشة على تبويب العمل بلا أثر للحجز الذي نبّه عليه.
  // ونستمع لـ `hashchange` أيضًا لأن الضغط على تنبيه ثانٍ والتطبيق مفتوح يغيّر
  // الهاش بلا إعادة تحميل.
  useEffect(() => {
    function syncFromHash() {
      const key = tabKeyFromHash(window.location.hash);
      if (key) setActive(key);
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  // شريط التبويبات وأشرطة PWA كلاهما ثابت أسفل الشاشة: نُعلم الأشرطة بارتفاعه
  // لترتفع فوقه. المتغيّر يُزال عند التفكيك فتعود بقية صفحات `/barber` كما كانت.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--barber-bottom-gap", "4.25rem");
    return () => {
      root.style.removeProperty("--barber-bottom-gap");
    };
  }, []);

  // تبويب غير معروض (فرع بلا مخزون ولا مستلزمات) لا يترك الشاشة فارغة.
  const activeTab = tabs.find((tab) => tab.key === active) ?? tabs[0];

  return (
    <>
      <div className="mt-4">
        {tabs.map((tab) => (
          <div
            key={tab.key}
            id={`barber-panel-${tab.key}`}
            role="tabpanel"
            aria-labelledby={`barber-tab-${tab.key}`}
            hidden={tab.key !== activeTab?.key}
            className="space-y-4"
          >
            {tab.content}
          </div>
        ))}
      </div>

      <nav className="barber-tabbar" aria-label="أقسام شاشة الحلاق">
        {/* نفس عرض `.barber-container.is-app` فيبقى الشريط تحت المحتوى لا أعرض منه. */}
        <div className="mx-auto flex w-full max-w-md items-stretch md:max-w-lg" role="tablist">
          {tabs.map((tab) => {
            const selected = tab.key === activeTab?.key;
            const badge = tab.badge ?? 0;
            return (
              <button
                key={tab.key}
                id={`barber-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`barber-panel-${tab.key}`}
                onClick={() => setActive(tab.key)}
                className="barber-tab"
              >
                <span className="relative">
                  <Icon name={tab.icon} className="h-5 w-5" />
                  {badge > 0 ? (
                    <span className={`barber-tab-badge ${tab.alert ? "is-alert" : ""}`}>
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </span>
                {tab.label}
                <span aria-hidden="true" className="barber-tab-indicator" />
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
