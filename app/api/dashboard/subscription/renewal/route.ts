import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireAdminApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { changeSubscriptionRenewal } from "@/lib/billing/billing-service";
import { toErrorResponse } from "@/lib/http/error-response";

const renewalSchema = z.object({ action: z.enum(["CANCEL", "RESUME"]) });

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = renewalSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "إجراء الاشتراك غير صحيح" }, { status: 400 });

  try {
    const subscription = await changeSubscriptionRenewal(prisma, {
      organizationId: session.organizationId,
      action: parsed.data.action,
      actorType: session.role === "OWNER" ? "OWNER" : "ADMIN",
      actorUserId: session.user.id,
    });
    return NextResponse.json({ subscription });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث التجديد");
  }
}
