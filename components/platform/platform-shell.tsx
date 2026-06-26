import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { LogoutButton } from "@/components/logout-button";
import { getRequestSession } from "@/lib/auth/http";

const navItems = [
  { href: "/platform", key: "overview", label: "نظرة عامة" },
  { href: "/platform/organizations", key: "orgs", label: "المؤسسات" },
  { href: "/platform/plans", key: "plans", label: "الباقات" },
  { href: "/platform/admins", key: "admins", label: "المدراء" },
] as const;

export async function PlatformShell({
  active,
  title,
  description,
  children,
}: {
  active: "overview" | "orgs" | "plans" | "admins";
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const session = await getRequestSession();
  if (!session || session.type !== "platform") redirect("/platform/login");

  return (
    <main className="dashboard-page min-h-screen">
      <header className="relative border-b border-white/5 bg-sidebar-onyx text-white shadow-lux">
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-salon-gold/60 to-transparent" aria-hidden="true" />
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-10 w-10 ring-1 ring-salon-gold/30" priority />
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-eyebrow text-salon-goldlight">منصّة تنال</p>
              <p className="text-sm font-bold">لوحة المدير العام</p>
            </div>
          </div>
          <nav className="flex items-center gap-1.5">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
                  active === item.key ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <LogoutButton className="ms-2 border-white/15 bg-white/10 text-white hover:bg-white/15" />
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="dashboard-panel flex flex-col gap-2 px-5 py-5">
          <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-gold">منصّة تنال</p>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {description ? <p className="dashboard-muted max-w-3xl">{description}</p> : null}
        </div>
        {children}
      </section>
    </main>
  );
}
