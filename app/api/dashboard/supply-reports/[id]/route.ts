import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { canManageProducts } from "@/lib/auth/access";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { resolveSupplyReport } from "@/lib/supplies/supply-service";
import { toErrorResponse } from "@/lib/http/error-response";

const resolveSchema = z.object({
  decision: z.enum(["RESTOCKED", "DISMISS"]),
  note: z.string().trim().max(200).optional().nullable(),
});

/** «تم التوريد» أو «تجاهل» — ضمن فروع المستخدم المسندة. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  if (!canManageProducts(session)) {
    return NextResponse.json({ message: "لا تملك صلاحية إدارة المستلزمات" }, { status: 403 });
  }

  const { id } = await context.params;
  const parsed = resolveSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "قرار غير صحيح" }, { status: 400 });
  }

  try {
    const report = await resolveSupplyReport(prisma, {
      organizationId: session.organizationId,
      salonIds: effectiveSalonIds(session),
      reportId: id,
      decision: parsed.data.decision,
      note: parsed.data.note,
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ report });
  } catch (error) {
    return toErrorResponse(error, "تعذر معالجة البلاغ");
  }
}
