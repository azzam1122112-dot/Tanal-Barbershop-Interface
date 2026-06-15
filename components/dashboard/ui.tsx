import { BrandLogo } from "@/components/brand-logo";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { LogoutButton } from "@/components/logout-button";
import { getRequestSession } from "@/lib/auth/http";

export async function DashboardShell({
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
  const session = await getRequestSession();
  const role = session?.type === "dashboard" ? session.role : null;

  return (
    <main className="dashboard-page">
      <div className="mx-auto grid max-w-[1680px] gap-0 lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-white/10 bg-salon-ink px-4 py-4 text-white shadow-2xl shadow-salon-ink/25 lg:sticky lg:top-0 lg:flex lg:min-h-screen lg:flex-col lg:border-b-0 lg:px-5 lg:py-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center gap-3">
              <BrandLogo className="h-12 w-12 ring-1 ring-white/20" priority />
              <div className="min-w-0">
                <p className="text-xs font-black text-salon-gold">حلاق تنال</p>
                <p className="mt-1 truncate text-lg font-black">لوحة الإدارة</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-6 text-white/55">إدارة التشغيل، العملاء، الصندوق، الحملات، ورسائل واتساب من مكان واحد.</p>
          </div>

          <div className="overflow-x-auto pb-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overflow-x-visible lg:pb-0">
            <DashboardNav role={role} />
          </div>

          <div className="mt-5 rounded-lg border border-white/10 bg-black/10 p-3">
            <p className="text-xs font-bold text-white/45">{role === "SUPERVISOR" ? "جلسة مشرف" : "جلسة المدير"}</p>
            <LogoutButton className="mt-3 w-full border-white/15 bg-white/10 text-white hover:bg-white/15" />
          </div>
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
