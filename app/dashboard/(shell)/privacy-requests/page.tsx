import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { PrivacyRequestsManager } from "@/components/dashboard/privacy-requests-manager";
import { canManageStaff } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";

export default async function PrivacyRequestsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (session.type !== "dashboard" || !canManageStaff(session)) redirect("/dashboard/forbidden");
  const rows = await prisma.dataSubjectRequest.findMany({ where: { organizationId: session.organizationId }, include: { customer: { select: { name: true, phone: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 });
  return <DashboardShell title="طلبات خصوصية العملاء" description="التنفيذ الفعلي لطلبات الوصول والنسخ والتصحيح والحذف وسحب الموافقة، بعد توثيق هوية صاحب البيانات."><PrivacyRequestsManager initialRows={rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null, identityVerifiedAt: row.identityVerifiedAt?.toISOString() ?? null, executedAt: row.executedAt?.toISOString() ?? null }))} /></DashboardShell>;
}
