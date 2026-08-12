import type { ReactNode } from "react";

/**
 * لوح موحّد لصفحات حساب العميل.
 *
 * `.barber-card` هي السطح الأبيض الوحيد في التطبيق: `border-salon-line/60`
 * وتدرّج `--surface-card` و`--shadow-md` وإضاءة حافة داخلية. الصياغة اليدوية
 * السابقة كانت تخالفها في الأربعة معًا، فيظهر لوح الحساب أسطح ورقيًا مسطّحًا
 * بجوار لوح البوابة على الجهاز نفسه.
 */
export function AccountCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="barber-card p-5 sm:p-7">
      <h1 className="text-xl font-bold text-salon-ink sm:text-2xl">{title}</h1>
      {description ? <p className="mt-2 text-sm font-medium leading-6 text-salon-charcoal/70">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
