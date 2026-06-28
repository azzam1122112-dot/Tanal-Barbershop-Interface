import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { getRequestMeta, parseJsonBody, requireAdminApi } from "@/lib/auth/http";
import { hashAdminPassword } from "@/lib/auth/password";
import { createStaffSchema } from "@/lib/auth/validation";
import { toSafeAdminUser } from "@/lib/auth/sanitize";
import { findUserIdentityConflicts, identityConflictMessage } from "@/lib/auth/user-identity";
import { assertSalonsInOrg, replaceStaffSalonAssignments, staffWithSalonsInclude } from "@/lib/staff/staff-salon";
import { toErrorResponse } from "@/lib/http/error-response";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { organizationId: session.organizationId, role: { in: ["OWNER", "ADMIN", "SUPERVISOR"] } },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { createdAt: "desc" }],
    include: staffWithSalonsInclude,
  });

  return NextResponse.json({ users: users.map((user) => toSafeAdminUser(user, true)) });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const body = await parseJsonBody(request);
  const parsed = createStaffSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الموظف غير صحيحة" }, { status: 400 });
  }

  // حارس عالمي: لا يتكرر بريد/جوال الموظف عبر كل المؤسسات (قيد القاعدة مقيّد بالمؤسسة فقط).
  const { emailTaken, phoneTaken } = await findUserIdentityConflicts(prisma, {
    email: parsed.data.email,
    phone: parsed.data.phone,
  });
  const conflictMessage = identityConflictMessage(emailTaken, phoneTaken);
  if (conflictMessage) {
    return NextResponse.json({ message: conflictMessage }, { status: 409 });
  }

  try {
    // المشرف يُسند لفروعه؛ المدير على كل الفروع فلا فروع مسندة له.
    const salonIds =
      parsed.data.role === "SUPERVISOR"
        ? await assertSalonsInOrg(prisma, session.organizationId, parsed.data.salonIds ?? [])
        : [];
    const passwordHash = await hashAdminPassword(parsed.data.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: session.organizationId,
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          passwordHash,
          role: parsed.data.role,
          isActive: true,
        },
      });
      await replaceStaffSalonAssignments(tx, session.organizationId, created.id, salonIds);
      return tx.user.findUniqueOrThrow({ where: { id: created.id }, include: staffWithSalonsInclude });
    });

    const meta = await getRequestMeta();
    await writeAuditLog({
      prisma,
      organizationId: session.organizationId,
      actorType: session.role,
      actorUserId: session.user.id,
      action: "staff.created",
      entityType: "User",
      entityId: user.id,
      after: toSafeAdminUser(user, true),
      ...meta,
    });

    return NextResponse.json({ user: toSafeAdminUser(user, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "البريد الإلكتروني أو رقم الجوال مستخدم مسبقًا" }, { status: 409 });
    }

    return toErrorResponse(error, "تعذر إنشاء حساب الموظف");
  }
}
