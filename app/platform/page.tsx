import { PlatformShell } from "@/components/platform/platform-shell";
import { PlatformOrganizations } from "@/components/platform/platform-organizations";
import { prisma } from "@/lib/db/prisma";
import { listOrganizations, listPlans } from "@/lib/platform/platform-service";

export default async function PlatformOrganizationsPage() {
  const [organizations, plans] = await Promise.all([listOrganizations(prisma), listPlans(prisma)]);

  return (
    <PlatformShell active="orgs" title="المؤسسات" description="كل المؤسسات المسجّلة على المنصّة: إسناد الباقات، الإيقاف والتفعيل.">
      <PlatformOrganizations
        initialOrganizations={organizations}
        plans={plans.filter((plan) => plan.isActive).map((plan) => ({ id: plan.id, name: plan.name, maxSalons: plan.maxSalons }))}
      />
    </PlatformShell>
  );
}
