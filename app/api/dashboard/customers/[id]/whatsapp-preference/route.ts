import { toErrorResponse } from "@/lib/http/error-response";
import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireLoyaltyOperatorApi } from "@/lib/auth/http";
import { customerWhatsappPreferenceSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { updateCustomerWhatsappPreference } from "@/lib/whatsapp/whatsapp-service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireLoyaltyOperatorApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = customerWhatsappPreferenceSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "تفضيل واتساب غير صحيح" }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const preference = parsed.data.whatsappOptIn !== undefined
      ? parsed.data.whatsappOptIn
      : {
          transactionalOptIn: parsed.data.transactionalOptIn,
          marketingOptIn: parsed.data.marketingOptIn,
          consentSource: parsed.data.consentSource,
          optOutReason: parsed.data.optOutReason,
        };
    const customer = await updateCustomerWhatsappPreference(prisma, id, preference, {
      actorUserId: session.user.id,
      actorType: session.role,
      organizationId: session.organizationId,
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ customer });
  } catch (error) {
    return toErrorResponse(error, "تعذر تعديل تفضيل واتساب");
  }
}
