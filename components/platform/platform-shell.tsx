import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon, type IconName } from "@/components/icons";
import { LogoutButton } from "@/components/logout-button";
import { getRequestSession } from "@/lib/auth/http";
import { canAccessPlatform } from "@/lib/auth/access";

type PlatformSection = "overview" | "orgs" | "plans" | "admins";

const navItems: { href: string; key: PlatformSection; label: string; description: string; icon: IconName }[] = [
  { href: "/platform", key: "overview", label: "مركز القيادة", description: "المتابعة والإجراءات", icon: "home" },
  { href: "/platform/organizations", key: "orgs", label: "المؤسسات", description: "الاشتراك والوصول", icon: "customers" },
  { href: "/platform/plans", key: "plans", label: "الباقات", description: "التسعير والحدود", icon: "billing" },
  { href: "/platform/admins", key: "admins", label: "مديرو المنصة", description: "الحسابات والأمان", icon: "staff" },
];

export async function PlatformShell({
  active,
  title,
  description,
  actions,
  children,
}: {
  active: PlatformSection;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const session = await getRequestSession();
  if (session?.type === "platform" && session.mfaSetupRequired) redirect("/platform/mfa-setup");
  if (!canAccessPlatform(session)) redirect("/platform/login");

  return (
    <main className="dashboard-page">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-sidebar-onyx text-white shadow-lux lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-10 w-10 ring-1 ring-salon-gold/30" priority />
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-eyebrow text-salon-goldlight">إدارة المنصة</p><p className="truncate text-sm font-bold">لوحة مدير النظام</p></div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/70">{session.admin.name}</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3" aria-label="تنقل مدير النظام">
          {navItems.map((item) => <PlatformNavLink key={item.key} item={item} active={active} compact />)}
        </nav>
      </header>

      <div className="mx-auto grid max-w-[1800px] lg:grid-cols-[296px_minmax(0,1fr)]">
        <aside className="relative hidden min-h-screen flex-col bg-sidebar-onyx px-5 py-5 text-white shadow-[var(--shadow-sidebar)] lg:sticky lg:top-0 lg:flex lg:h-screen">
          <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-salon-gold/40 to-transparent" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-salon-gold/70 to-transparent" aria-hidden="true" />
            <div className="flex items-center gap-3">
              <BrandLogo className="h-12 w-12 ring-1 ring-salon-gold/30" priority />
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-salon-goldlight">XMANSX · المنصة</p><p className="mt-1 truncate text-lg font-bold">لوحة مدير النظام</p></div>
            </div>
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5">
              <p className="truncate text-xs font-bold">{session.admin.name}</p>
              <p className="mt-0.5 truncate text-[10px] font-semibold text-white/45" dir="ltr">{session.admin.email}</p>
            </div>
            <p className="mt-3 text-xs leading-6 text-white/55">إدارة المؤسسات والاشتراكات والباقات وصحة المنصة دون التدخل في تشغيل الفروع.</p>
          </div>

          <nav className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="تنقل مدير النظام">
            {navItems.map((item) => <PlatformNavLink key={item.key} item={item} active={active} />)}
          </nav>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] font-bold uppercase tracking-eyebrow text-white/40">جلسة مدير النظام</p>
            <LogoutButton className="mt-3 w-full border-white/15 bg-white/10 text-white hover:bg-white/15" />
          </div>
        </aside>

        <section className="min-w-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <div className="dashboard-panel lux-edge flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between lg:px-7">
            <div className="min-w-0">
              <p className="lux-eyebrow">إدارة منصة XMANSX</p>
              <h1 className="mt-2.5 text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl">{title}</h1>
              {description ? <p className="dashboard-muted mt-3 max-w-3xl">{description}</p> : null}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}

function PlatformNavLink({ item, active, compact = false }: { item: (typeof navItems)[number]; active: PlatformSection; compact?: boolean }) {
  const selected = active === item.key;
  if (compact) {
    return <Link href={item.href} aria-current={selected ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${selected ? "bg-white text-salon-ink" : "bg-white/[0.05] text-white/65"}`}>{item.label}</Link>;
  }
  return (
    <Link href={item.href} aria-current={selected ? "page" : undefined} className={`group relative flex items-center gap-3 rounded-xl border px-3 py-3 transition ${selected ? "border-salon-gold/35 bg-white text-salon-ink" : "border-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"}`}>
      {selected ? <span className="absolute inset-y-2 right-0 w-1 rounded-full bg-salon-gold" aria-hidden="true" /> : null}
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${selected ? "bg-salon-ink text-salon-gold" : "bg-white/[0.07]"}`}><Icon name={item.icon} className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0"><span className="block truncate text-sm font-bold">{item.label}</span><span className={`mt-0.5 block truncate text-[11px] font-semibold ${selected ? "text-salon-charcoal" : "text-white/42"}`}>{item.description}</span></span>
    </Link>
  );
}
