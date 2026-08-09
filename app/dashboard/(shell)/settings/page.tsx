import { redirect } from "next/navigation";
import { DashboardShell, Notice } from "@/components/dashboard/ui";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { canAccessDashboard, canManageStaff } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getEffectiveSettings, toSafeSystemSettings } from "@/lib/settings/system-settings";

export default async function DashboardSettingsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageStaff(session)) redirect("/dashboard");

  const { organizationId, activeSalonId, isAggregate } = dashboardScope(session);
  const settings = await getEffectiveSettings(prisma, { organizationId, salonId: activeSalonId });
  if (!settings) redirect("/dashboard");

  const activeSalon = activeSalonId
    ? await prisma.salon.findUnique({ where: { id: activeSalonId }, select: { name: true } })
    : null;

  return (
    <DashboardShell title="إعدادات النظام">
      <p className="mt-5 max-w-2xl text-sm text-salon-charcoal">
        إعدادات تشغيلية وضريبية لكل فرع. قواعد المكافآت والخصومات تدار من صفحة الولاء والحملات.
      </p>

      {isAggregate ? (
        <Notice tone="warning" className="mt-5 max-w-2xl" title="أنت تعرض «كل الفروع»">
          الإعدادات والضريبة تُضبط لكل فرع على حدة. اختر فرعًا محددًا من مبدّل الفروع لتعديل إعداداته، وإلا فالحفظ
          سيطبَّق على إعدادات المؤسسة العامة.
        </Notice>
      ) : (
        <Notice tone="info" className="mt-5 max-w-2xl" title={`إعدادات فرع: ${activeSalon?.name ?? settings.salonName}`}>
          أي تغيير هنا يخص هذا الفرع وحده.
        </Notice>
      )}

      <SettingsForm initialSettings={toSafeSystemSettings(settings)} />
    </DashboardShell>
  );
}
