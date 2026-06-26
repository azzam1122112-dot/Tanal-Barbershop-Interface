import { PlatformShell } from "@/components/platform/platform-shell";
import { PlatformPlans } from "@/components/platform/platform-plans";
import { prisma } from "@/lib/db/prisma";
import { listPlans } from "@/lib/platform/platform-service";

export default async function PlatformPlansPage() {
  const plans = await listPlans(prisma);

  return (
    <PlatformShell active="plans" title="الباقات والحدود" description="عرّف باقات الاشتراك وحدودها (عدد الفروع والحلاقين)، ثم أسندها للمؤسسات.">
      <PlatformPlans initialPlans={plans} />
    </PlatformShell>
  );
}
