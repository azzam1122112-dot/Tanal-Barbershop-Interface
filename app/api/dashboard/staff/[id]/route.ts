import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { getRequestMeta, parseJsonBody, requireAdminApi } from "@/lib/auth/http";
import { hashAdminPassword } from "@/lib/auth/password";
import { updateStaffSchema } from "@/lib/auth/validation";
import { toSafeAdminUser } from "@/lib/auth/sanitize";
import { findUserIdentityConflicts, identityConflictMessage } from "@/lib/auth/user-identity";
import { assertSalonsInOrg, replaceStaffSalonAssignments, staffWithSalonsInclude } from "@/lib/staff/staff-salon";
import { toErrorResponse } from "@/lib/http/error-response";

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

  const before = await prisma.user.findFirst({ where: { id, organizationId: session.organizationId } });
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
        organizationId: session.organizationId,
        role: "ADMIN",
        isActive: true,
        id: { not: id },
      },
    });

    if (activeAdmins === 0) {
      return NextResponse.json({ message: "يجب بقاء مدير نشط واحد على الأقل" }, { status: 400 });
    }
  }

  // حارس عالمي عند تغيير البريد/الجوال فقط (يُستثنى الموظف نفسه).
  const emailToCheck = parsed.data.email && parsed.data.email !== before.email ? parsed.data.email : undefined;
  const phoneToCheck = parsed.data.phone && parsed.data.phone !== before.phone ? parsed.data.phone : undefined;
  if (emailToCheck || phoneToCheck) {
    const { emailTaken, phoneTaken } = await findUserIdentityConflicts(prisma, {
      email: emailToCheck,
      phone: phoneToCheck,
      excludeUserId: id,
    });
    const conflictMessage = identityConflictMessage(emailTaken, phoneTaken);
    if (conflictMessage) {
      return NextResponse.json({ message: conflictMessage }, { status: 409 });
    }
  }

  const { password, salonIds, ...profileData } = parsed.data;
  const data: Prisma.UserUpdateInput = {
    ...profileData,
    ...(password ? { passwordHash: await hashAdminPassword(password) } : {}),
  };

  // فروع المشرف: null = لا تغيير على الإسناد؛ مصفوفة = استبدال كامل.
  let salonIdsToSet: string[] | null = null;
  if (nextRole === "SUPERVISOR") {
    if (salonIds !== undefined) {
      try {
        salonIdsToSet = await assertSalonsInOrg(prisma, session.organizationId, salonIds);
      } catch (error) {
        return toErrorResponse(error, "بعض الفروع المختارة غير صحيحة");
      }
    }
    // التحويل إلى مشرف يتطلب فرعًا واحدًا على الأقل؛ ولا يُسمح بإفراغ فروع مشرف قائم.
    const willHaveNone = salonIdsToSet !== null && salonIdsToSet.length === 0;
    const becomingSupervisorWithoutSalons = before.role !== "SUPERVISOR" && (salonIdsToSet === null || salonIdsToSet.length === 0);
    if (willHaveNone || becomingSupervisorWithoutSalons) {
      return NextResponse.json({ message: "اختر فرعًا واحدًا على الأقل للمشرف" }, { status: 400 });
    }
  } else {
    // مدير/مالك على كل الفروع: امسح أي إسناد سابق.
    salonIdsToSet = [];
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data });
      if (salonIdsToSet !== null) {
        await replaceStaffSalonAssignments(tx, session.organizationId, updated.id, salonIdsToSet);
      }
      return tx.user.findUniqueOrThrow({ where: { id: updated.id }, include: staffWithSalonsInclude });
    });

    const meta = await getRequestMeta();
    await writeAuditLog({
      prisma,
      organizationId: session.organizationId,
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

    return toErrorResponse(error, "تعذر تحديث الموظف");
  }
}
