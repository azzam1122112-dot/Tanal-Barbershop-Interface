import { Prisma } from "@prisma/client";

/**
 * قفل معاملاتي دقيق لكل مؤسسة/مورد. يمنع طلبين متزامنين من قراءة الحد نفسه
 * ثم كليهما يتجاوزه، ويُحرر تلقائيًا عند انتهاء المعاملة.
 */
export async function lockTenantQuota(tx: Prisma.TransactionClient, organizationId: string, resource: string) {
  const key = `quota:${organizationId}:${resource}`;
  await tx.$queryRaw(Prisma.sql`
    SELECT true AS locked
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS tenant_quota_guard
  `);
}
