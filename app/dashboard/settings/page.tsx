import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { canAccessDashboard, canManageStaff } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeSystemSettings } from "@/lib/settings/system-settings";

export default async function DashboardSettingsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageStaff(session)) redirect("/dashboard");

  const settings = await prisma.systemSettings.findFirst({});
  if (!settings) redirect("/dashboard");

  return (
    <DashboardShell title="إعدادات النظام">
      <p className="mt-5 max-w-2xl text-sm text-salon-charcoal">
        إعدادات تشغيلية عامة فقط. قواعد المكافآت والخصومات تدار من صفحة الولاء والحملات.
      </p>
      <SettingsForm initialSettings={toSafeSystemSettings(settings)} />
    </DashboardShell>
  );
}
