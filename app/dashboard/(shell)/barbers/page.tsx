import { redirect } from "next/navigation";
import { DashboardShell, Notice } from "@/components/dashboard/ui";
import { BarberManager } from "@/components/dashboard/barber-manager";
import { canAccessDashboard, canManageBarbers, canTransferBarbers } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeBarber } from "@/lib/auth/sanitize";

export default async function DashboardBarbersPage() {
  const session = await getRequestSession();

  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canTransferBarbers(session)) redirect("/dashboard");

  const fullControl = canManageBarbers(session);
  const { organizationId, orgWhere, salonWhere, activeSalonId } = dashboardScope(session);
  const scopedSalonIds = session.type === "dashboard" ? session.scopedSalonIds : null;

  const [barbers, salons] = await Promise.all([
    prisma.barber.findMany({
      where: { ...orgWhere, ...salonWhere },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    }),
    organizationId
      ? prisma.salon.findMany({
          // المشرف ينقل بين فروعه المسندة فقط، فلا نعرض له غيرها.
          where: { organizationId, isActive: true, ...(scopedSalonIds ? { id: { in: scopedSalonIds } } : {}) },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <DashboardShell
      title={fullControl ? "إدارة الحلاقين" : "فريق الحلاقين"}
      description={
        fullControl
          ? "إضافة الحلاقين، تحديث بياناتهم، نقلهم بين الفروع، وتعطيل الحسابات أو تغيير رموز الدخول بسرعة."
          : "متابعة حلاقي فروعك ونقلهم بين الفروع المسندة لك."
      }
    >
      {fullControl ? null : (
        <Notice tone="gold" className="mt-6" title="صلاحيتك: النقل والمتابعة">
          تستطيع نقل الحلاق بين فروعك المسندة فقط. إضافة الحلاقين وتعطيلهم وتغيير رموز دخولهم من صلاحيات المالك أو
          المدير.
        </Notice>
      )}

      <BarberManager
        initialBarbers={barbers.map((barber) => toSafeBarber(barber, true))}
        salons={salons}
        defaultSalonId={activeSalonId ?? salons[0]?.id ?? null}
        mode={fullControl ? "full" : "transfer"}
      />
    </DashboardShell>
  );
}
