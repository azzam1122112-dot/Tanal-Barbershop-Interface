import type { ReactNode } from "react";

/** لوح موحّد لصفحات حساب العميل — نفس سلّم الأنصاف والظلال في نظام التصميم. */
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
    <section className="rounded-2xl border border-salon-line bg-white p-5 shadow-[0_1px_2px_rgba(16,25,22,0.04),0_12px_32px_-16px_rgba(16,25,22,0.18)] sm:p-7">
      <h1 className="text-xl font-bold text-salon-ink sm:text-2xl">{title}</h1>
      {description ? <p className="mt-2 text-sm font-medium leading-6 text-salon-charcoal/70">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
