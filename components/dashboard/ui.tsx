import { BrandLogo } from "@/components/brand-logo";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DashboardMobileBar } from "@/components/dashboard/dashboard-mobile-bar";
import { SalonSwitcher } from "@/components/dashboard/salon-switcher";
import { LogoutButton } from "@/components/logout-button";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";

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
  const organizationId = session?.type === "dashboard" ? session.organizationId : null;
  const activeSalonId = session?.type === "dashboard" ? session.salonId : null;
  const salons = organizationId
    ? await prisma.salon.findMany({
        where: { organizationId, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  return (
    <main className="dashboard-page">
      <DashboardMobileBar role={role} salons={salons} activeSalonId={activeSalonId} />
      <div className="mx-auto grid max-w-[1680px] gap-0 lg:grid-cols-[320px_1fr]">
        <aside className="relative hidden bg-sidebar-onyx text-white shadow-[var(--shadow-sidebar)] lg:sticky lg:top-0 lg:flex lg:min-h-screen lg:flex-col lg:px-5 lg:py-5">
          <span className="pointer-events-none absolute inset-y-0 left-0 hidden w-px bg-gradient-to-b from-transparent via-salon-gold/40 to-transparent lg:block" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-salon-gold/70 to-transparent" aria-hidden="true" />
            <div className="flex items-center gap-3">
              <BrandLogo className="h-12 w-12 ring-1 ring-salon-gold/30" priority />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">حلاق تنال</p>
                <p className="mt-1 truncate text-lg font-bold">لوحة الإدارة</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-6 text-white/55">إدارة التشغيل، العملاء، الصندوق، الحملات، ورسائل واتساب من مكان واحد.</p>
          </div>

          <div className="mt-4">
            <SalonSwitcher salons={salons} activeSalonId={activeSalonId} />
          </div>

          <div className="mt-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <DashboardNav role={role} />
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] font-bold uppercase tracking-eyebrow text-white/40">{role === "SUPERVISOR" ? "جلسة مشرف" : "جلسة المدير"}</p>
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
        {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-gold">{eyebrow}</p> : null}
        <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{title}</h1>
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
    <Card className="lux-hover relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-salon-gold via-salon-forest to-salon-ink" />
      <p className="text-[13px] font-semibold text-salon-charcoal">{label}</p>
      <p className="mt-2 text-2xl font-bold leading-tight tracking-tight tabular-nums">{value}</p>
      {subValue ? <p className="mt-1.5 text-sm font-medium text-salon-charcoal/85">{subValue}</p> : null}
    </Card>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const toneClass = {
    neutral: "bg-salon-mist text-salon-charcoal ring-salon-line",
    success: "bg-green-50 text-green-700 ring-green-200/70",
    warning: "bg-amber-50 text-amber-700 ring-amber-200/70",
    danger: "bg-red-50 text-red-700 ring-red-200/70",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneClass}`}>{children}</span>;
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
      <div className="flex items-center gap-2.5 border-b border-salon-line/70 px-5 py-4">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-salon-gold to-[#8f6c39]" aria-hidden="true" />
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}
