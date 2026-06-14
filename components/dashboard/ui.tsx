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

export function DashboardShell({
  title,
  eyebrow = "لوحة الإدارة",
  description,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="dashboard-page">
      <div className="mx-auto grid max-w-[1680px] gap-0 lg:grid-cols-[288px_1fr]">
        <aside className="border-b border-white/10 bg-salon-ink px-4 py-5 text-white shadow-2xl shadow-salon-ink/25 lg:sticky lg:top-0 lg:min-h-screen lg:border-b-0 lg:px-5">
          <div className="flex items-center justify-between gap-3 lg:block">
            <div>
              <p className="text-xs font-black text-salon-gold">حلاق تنال</p>
              <p className="mt-2 text-2xl font-black">إدارة الحلاقة الرجالية</p>
              <p className="mt-2 hidden text-xs leading-6 text-white/55 lg:block">لوحة فاخرة لمتابعة جلسات الصندوق، الحلاقين، العملاء، الزيارات، والرسائل.</p>
            </div>
            <LogoutButton className="border-white/15 bg-white/10 text-white hover:bg-white/15 lg:mt-6 lg:w-full" />
          </div>
          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block whitespace-nowrap rounded-lg border border-transparent px-3 py-2.5 text-sm font-bold text-white/76 transition hover:border-white/10 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <PageHeader eyebrow={eyebrow} title={title} description={description} />
          {children}
        </section>
      </div>
    </main>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="dashboard-panel flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-6">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-black text-salon-gold">{eyebrow}</p> : null}
        <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">{title}</h1>
        {description ? <p className="dashboard-muted mt-3 max-w-3xl">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`dashboard-panel p-5 ${className}`}>{children}</div>;
}

export function StatCard({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-salon-gold via-salon-forest to-salon-ink" />
      <p className="text-sm font-bold text-salon-charcoal">{label}</p>
      <p className="mt-2 text-2xl font-black leading-tight">{value}</p>
      {subValue ? <p className="mt-2 text-sm font-semibold text-salon-charcoal">{subValue}</p> : null}
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
    <div className="rounded-lg border border-dashed border-salon-gold/60 bg-white/80 px-5 py-10 text-center shadow-sm">
      <p className="text-lg font-black">{title}</p>
      {description ? <p className="dashboard-muted mx-auto mt-2 max-w-xl">{description}</p> : null}
    </div>
  );
}

export function FilterBar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <form className={`dashboard-panel mt-6 grid gap-3 p-4 ${className}`}>{children}</form>;
}

export function TablePanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`dashboard-panel mt-6 overflow-x-auto p-0 ${className}`}>{children}</div>;
}

export function SectionPanel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`dashboard-panel mt-6 overflow-hidden ${className}`}>
      <div className="border-b border-salon-line px-5 py-4">
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}
