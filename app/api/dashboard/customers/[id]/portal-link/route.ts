import { NextResponse } from "next/server";
import { getRequestMeta, requireLoyaltyOperatorApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { ensurePortalToken, rotatePortalToken } from "@/lib/customers/customer-portal";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { toErrorResponse } from "@/lib/http/error-response";

/** يعيد رابط بوابة العميل (ينشئ الرمز عند أول طلب). */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireLoyaltyOperatorApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;

  try {
    const token = await ensurePortalToken(prisma, id, session.organizationId);
    return NextResponse.json({ token, path: `/my/${token}` });
  } catch (error) {
    return toErrorResponse(error, "تعذر إنشاء رابط العميل");
  }
}

/** يبطل الرابط القديم ويصدر جديدًا — للاستخدام عند تسرّب الرابط. */
export async function PUT(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireLoyaltyOperatorApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;

  try {
    const token = await rotatePortalToken(prisma, id, session.organizationId);
    await writeAuditLog({
      prisma,
      organizationId: session.organizationId,
      actorType: session.role,
      actorUserId: session.user.id,
      action: "customer.portal_token_rotated",
      entityType: "Customer",
      entityId: id,
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ token, path: `/my/${token}` });
  } catch (error) {
    return toErrorResponse(error, "تعذر تدوير رابط العميل");
  }
}
