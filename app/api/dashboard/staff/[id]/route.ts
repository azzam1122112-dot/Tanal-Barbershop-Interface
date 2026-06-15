import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { getRequestMeta, parseJsonBody, requireAdminApi } from "@/lib/auth/http";
import { hashAdminPassword } from "@/lib/auth/password";
import { updateStaffSchema } from "@/lib/auth/validation";
import { toSafeAdminUser } from "@/lib/auth/sanitize";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const body = await parseJsonBody(request);
  const parsed = updateStaffSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الموظف غير صحيحة" }, { status: 400 });
  }

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before || before.role === "BARBER") {
    return NextResponse.json({ message: "الموظف غير موجود" }, { status: 404 });
  }

  if (id === session.user.id && (parsed.data.role === "SUPERVISOR" || parsed.data.isActive === false)) {
    return NextResponse.json({ message: "لا يمكن تغيير صلاحيتك أو تعطيل حسابك الحالي" }, { status: 400 });
  }

  const nextRole = parsed.data.role ?? before.role;
  const nextIsActive = parsed.data.isActive ?? before.isActive;
  if ((before.role === "ADMIN" && nextRole !== "ADMIN") || (before.role === "ADMIN" && !nextIsActive)) {
    const activeAdmins = await prisma.user.count({
      where: {
        role: "ADMIN",
        isActive: true,
        id: { not: id },
      },
    });

    if (activeAdmins === 0) {
      return NextResponse.json({ message: "يجب بقاء مدير نشط واحد على الأقل" }, { status: 400 });
    }
  }

  const { password, ...profileData } = parsed.data;
  const data: Prisma.UserUpdateInput = {
    ...profileData,
    ...(password ? { passwordHash: await hashAdminPassword(password) } : {}),
  };

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
    });

    const meta = await getRequestMeta();
    await writeAuditLog({
      prisma,
      actorType: session.role,
      actorUserId: session.user.id,
      action: password ? "staff.password_updated" : "staff.updated",
      entityType: "User",
      entityId: user.id,
      before: toSafeAdminUser(before, true),
      after: toSafeAdminUser(user, true),
      ...meta,
    });

    return NextResponse.json({ user: toSafeAdminUser(user, true) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "البريد الإلكتروني أو رقم الجوال مستخدم مسبقًا" }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ message: "الموظف غير موجود" }, { status: 404 });
    }

    throw error;
  }
}
