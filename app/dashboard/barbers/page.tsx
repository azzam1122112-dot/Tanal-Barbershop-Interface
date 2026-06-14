import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { BarberManager } from "@/components/dashboard/barber-manager";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeBarber } from "@/lib/auth/sanitize";

export default async function DashboardBarbersPage() {
  const session = await getRequestSession();

  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const barbers = await prisma.barber.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return (
    <main className="min-h-screen bg-salon-mist px-5 py-8 text-salon-ink">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 border-b border-salon-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-bold text-salon-gold">
              لوحة الإدارة
            </Link>
            <h1 className="mt-2 text-3xl font-bold">إدارة الحلاقين</h1>
          </div>
          <LogoutButton />
        </div>
        <BarberManager initialBarbers={barbers.map((barber) => toSafeBarber(barber, true))} />
      </section>
    </main>
  );
}
