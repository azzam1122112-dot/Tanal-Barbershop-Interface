import { PlatformShell } from "@/components/platform/platform-shell";
import { PlatformPlans } from "@/components/platform/platform-plans";
import { prisma } from "@/lib/db/prisma";
import { listPlans } from "@/lib/platform/platform-service";

export default async function PlatformPlansPage() {
  const plans = await listPlans(prisma);

  return (
    <PlatformShell active="plans" title="إدارة الباقات والتسعير" description="أنشئ الباقات وأسعارها ومزاياها وحدودها، وتحكم بما يُنشر تلقائيًا في صفحة الهبوط وصفحة اشتراك العملاء.">
      <PlatformPlans initialPlans={plans} />
    </PlatformShell>
  );
}
