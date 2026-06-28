import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

type StaffPrisma = PrismaClient | Prisma.TransactionClient;

/** تضمين فروع المشرف المسندة عند جلب الموظف. */
export const staffWithSalonsInclude = {
  salonAssignments: {
    include: { salon: { select: { id: true, name: true } } },
    orderBy: { salon: { name: "asc" } },
  },
} satisfies Prisma.UserInclude;

/** يتحقق أن كل الفروع المختارة نشطة وتعود لنفس المؤسسة، ويعيد القائمة بلا تكرار. */
export async function assertSalonsInOrg(prisma: StaffPrisma, organizationId: string, salonIds: string[]): Promise<string[]> {
  const unique = [...new Set(salonIds)];
  if (unique.length === 0) return [];
  const count = await prisma.salon.count({ where: { id: { in: unique }, organizationId, isActive: true } });
  if (count !== unique.length) {
    throw new BusinessError("بعض الفروع المختارة غير صحيحة", 400);
  }
  return unique;
}

/** يستبدل فروع المشرف المسندة بالكامل (حذف ثم إدراج) داخل معاملة. */
export async function replaceStaffSalonAssignments(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  salonIds: string[],
): Promise<void> {
  await tx.staffSalon.deleteMany({ where: { userId } });
  if (salonIds.length > 0) {
    await tx.staffSalon.createMany({
      data: salonIds.map((salonId) => ({ organizationId, userId, salonId })),
    });
  }
}
