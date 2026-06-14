import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

const navItems = [
  { href: "/dashboard", label: "الرئيسية" },
  { href: "/dashboard/reports", label: "التقارير" },
  { href: "/dashboard/barbers", label: "الحلاقون" },
  { href: "/dashboard/customers", label: "العملاء" },
  { href: "/dashboard/services", label: "الخدمات" },
  { href: "/dashboard/visits", label: "الزيارات" },
  { href: "/dashboard/loyalty", label: "الولاء" },
  { href: "/dashboard/campaigns", label: "الحملات" },
  { href: "/dashboard/daily-close", label: "جلسات الصندوق" },
  { href: "/dashboard/post-close-adjustments", label: "تصحيحات الإغلاق" },
  { href: "/dashboard/whatsapp", label: "واتساب" },
  { href: "/dashboard/settings", label: "الإعدادات" },
];

export function DashboardShell({ title, eyebrow = "لوحة الإدارة", children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-salon-mist text-salon-ink">
      <div className="mx-auto grid max-w-[1500px] gap-0 lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-salon-line bg-salon-ink p-4 text-white lg:sticky lg:top-0 lg:min-h-screen lg:border-b-0">
          <div className="flex items-center justify-between gap-3 lg:block">
            <div>
              <p className="text-sm font-bold text-salon-gold">TANAL</p>
              <p className="mt-1 text-xl font-bold">إدارة الصالون</p>
            </div>
            <LogoutButton className="border-white/20 bg-white/10 text-white lg:mt-5 lg:w-full" />
          </div>
          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="block whitespace-nowrap rounded-md px-3 py-2 text-sm font-bold text-white/80 transition hover:bg-white/10 hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="px-5 py-7 lg:px-8">
          <PageHeader eyebrow={eyebrow} title={title} />
          {children}
        </section>
      </div>
    </main>
  );
}

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-salon-line pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {eyebrow ? <p className="text-sm font-bold text-salon-gold">{eyebrow}</p> : null}
        <h1 className="mt-2 text-3xl font-bold">{title}</h1>
      </div>
      {actions}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-salon-line bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function StatCard({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-salon-charcoal">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {subValue ? <p className="mt-1 text-sm text-salon-charcoal">{subValue}</p> : null}
    </Card>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const toneClass = {
    neutral: "bg-salon-mist text-salon-charcoal",
    success: "bg-green-50 text-green-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
  }[tone];
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${toneClass}`}>{children}</span>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-salon-line bg-white px-5 py-10 text-center">
      <p className="font-bold">{title}</p>
      {description ? <p className="mt-1 text-sm text-salon-charcoal">{description}</p> : null}
    </div>
  );
}
