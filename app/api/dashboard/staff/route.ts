import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { getRequestMeta, parseJsonBody, requireAdminApi } from "@/lib/auth/http";
import { hashAdminPassword } from "@/lib/auth/password";
import { createStaffSchema } from "@/lib/auth/validation";
import { toSafeAdminUser } from "@/lib/auth/sanitize";
import { findUserIdentityConflicts, identityConflictMessage } from "@/lib/auth/user-identity";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { organizationId: session.organizationId, role: { in: ["OWNER", "ADMIN", "SUPERVISOR"] } },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { createdAt: "desc" }],
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
    const user = await prisma.user.create({
      data: {
        organizationId: session.organizationId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        passwordHash: await hashAdminPassword(parsed.data.password),
        role: parsed.data.role,
        isActive: true,
      },
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

    throw error;
  }
}
