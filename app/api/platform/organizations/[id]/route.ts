import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { updateOrganizationByPlatform } from "@/lib/platform/platform-service";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  planId: z.string().min(1).nullable().optional(),
  subscriptionStatus: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"]).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  currentPeriodEnd: z.string().datetime().nullable().optional(),
  extendTrialDays: z.coerce.number().int().positive().max(365).optional(),
  extendPeriodDays: z.coerce.number().int().positive().max(365).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const org = await updateOrganizationByPlatform(prisma, id, parsed.data);
    await writeAuditLog({
      prisma,
      organizationId: org.id,
      actorType: "PLATFORM_ADMIN",
      action: "platform.organization_updated",
      entityType: "Organization",
      entityId: org.id,
      after: { status: org.status, planId: org.planId, subscriptionStatus: org.subscriptionStatus, trialEndsAt: org.trialEndsAt, currentPeriodEnd: org.currentPeriodEnd, by: session.admin.id },
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ organization: org });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث المؤسسة");
  }
}
