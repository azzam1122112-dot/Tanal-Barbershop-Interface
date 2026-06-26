import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/auth/password";

export async function listPlatformAdmins(prisma: PrismaClient) {
  const admins = await prisma.platformAdmin.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  return admins.map((admin) => ({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
    createdAt: admin.createdAt.toISOString(),
  }));
}

export async function createPlatformAdmin(prisma: PrismaClient, input: { name: string; email: string; password: string }) {
  const existing = await prisma.platformAdmin.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new BusinessError("البريد الإلكتروني مستخدم مسبقًا");

  return prisma.platformAdmin.create({
    data: { name: input.name, email: input.email, passwordHash: await hashAdminPassword(input.password), isActive: true },
    select: { id: true, name: true, email: true, isActive: true },
  });
}

export async function setPlatformAdminActive(
  prisma: PrismaClient,
  targetId: string,
  isActive: boolean,
  actingAdminId: string,
) {
  if (!isActive && targetId === actingAdminId) {
    throw new BusinessError("لا يمكنك تعطيل حسابك الحالي");
  }

  if (!isActive) {
    const activeCount = await prisma.platformAdmin.count({ where: { isActive: true, id: { not: targetId } } });
    if (activeCount === 0) throw new BusinessError("لا يمكن تعطيل آخر مدير منصّة فعّال");
  }

  const target = await prisma.platformAdmin.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) throw new BusinessError("المدير غير موجود");

  return prisma.platformAdmin.update({
    where: { id: targetId },
    data: { isActive },
    select: { id: true, isActive: true },
  });
}

export async function changePlatformAdminPassword(
  prisma: PrismaClient,
  adminId: string,
  currentPassword: string,
  newPassword: string,
) {
  const admin = await prisma.platformAdmin.findUnique({ where: { id: adminId }, select: { id: true, passwordHash: true } });
  if (!admin) throw new BusinessError("المدير غير موجود");

  const ok = await verifyAdminPassword(currentPassword, admin.passwordHash);
  if (!ok) throw new BusinessError("كلمة المرور الحالية غير صحيحة");

  await prisma.platformAdmin.update({ where: { id: adminId }, data: { passwordHash: await hashAdminPassword(newPassword) } });
  return { ok: true };
}
