import { redirect } from "next/navigation";
import { DashboardShell, Notice } from "@/components/dashboard/ui";
import { AppointmentsManager } from "@/components/dashboard/appointments-manager";
import { canAccessDashboard } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { listAppointments } from "@/lib/appointments/appointment-service";
import { toRiyadhDateKey } from "@/lib/datetime/riyadh";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (session.type !== "dashboard") redirect("/dashboard");

  const params = await searchParams;
  const selectedDate = params.date ?? toDateInput(new Date());
  const { organizationId, orgWhere, salonWhere, salonIds, activeSalonId } = dashboardScope(session);
  const scopedSalonIds = session.scopedSalonIds;

  const [appointments, barbers, salons] = await Promise.all([
    organizationId
      ? listAppointments(prisma, { organizationId, salonIds, date: selectedDate })
      : Promise.resolve([]),
    prisma.barber.findMany({
      where: { isActive: true, ...orgWhere, ...salonWhere },
      orderBy: { name: "asc" },
      select: { id: true, name: true, salonId: true },
    }),
    organizationId
      ? prisma.salon.findMany({
          where: { organizationId, isActive: true, ...(scopedSalonIds ? { id: { in: scopedSalonIds } } : {}) },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <DashboardShell
      title="المواعيد"
      description="جدول حجوزات اليوم لكل فرع. الحجز اختياري ولا يمنع استقبال العملاء بلا موعد."
    >
      <form className="dashboard-panel mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="text-sm font-bold text-salon-charcoal">
          يوم المواعيد
          <input dir="ltr" lang="en" name="date" type="date" defaultValue={selectedDate} className="dashboard-field mt-2" />
        </label>
        <button className="dashboard-button">عرض</button>
      </form>

      {salons.length === 0 ? (
        <Notice tone="warning" className="mt-6" title="لا يوجد فرع نشط">
          أضف فرعًا نشطًا قبل حجز المواعيد.
        </Notice>
      ) : (
        <AppointmentsManager
          initialAppointments={appointments}
          barbers={barbers}
          salons={salons}
          defaultSalonId={activeSalonId ?? salons[0]?.id ?? null}
          date={selectedDate}
        />
      )}
    </DashboardShell>
  );
}

function toDateInput(date: Date) {
  return toRiyadhDateKey(date);
}
