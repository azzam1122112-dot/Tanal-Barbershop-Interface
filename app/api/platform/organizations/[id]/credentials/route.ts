import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { resetBarberPin, resetMemberPassword } from "@/lib/platform/platform-service";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({
  type: z.enum(["user", "barber"]),
  targetId: z.string().min(1),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "platform") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات غير صحيحة" }, { status: 400 });
  }

  try {
    if (parsed.data.type === "user") {
      const result = await resetMemberPassword(prisma, id, parsed.data.targetId);
      await writeAuditLog({
        prisma,
        organizationId: id,
        actorType: "PLATFORM_ADMIN",
        action: "platform.member_password_reset",
        entityType: "User",
        entityId: result.id,
        after: { by: session.admin.id },
        ...(await getRequestMeta()),
      });
      return NextResponse.json({ name: result.name, login: result.email, secret: result.password, kind: "password" });
    }

    const result = await resetBarberPin(prisma, id, parsed.data.targetId);
    await writeAuditLog({
      prisma,
      organizationId: id,
      actorType: "PLATFORM_ADMIN",
      action: "platform.barber_pin_reset",
      entityType: "Barber",
      entityId: result.id,
      after: { by: session.admin.id },
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ name: result.name, login: result.phone, secret: result.pin, kind: "pin" });
  } catch (error) {
    return toErrorResponse(error, "تعذر إعادة تعيين بيانات الدخول");
  }
}
