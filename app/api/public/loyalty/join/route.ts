import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { resolveRequestOrganization } from "@/lib/tenant/request-org";
import { selfRegisterForLoyalty } from "@/lib/customers/loyalty-signup";
import { saudiPhoneInputSchema } from "@/lib/phone/saudi-phone";
import { toErrorResponse } from "@/lib/http/error-response";

const joinSchema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب").max(60),
  phone: saudiPhoneInputSchema,
  /** معرّف المؤسسة حين لا يوجد نطاق فرعي (التشغيل المحلي أو نطاق واحد). */
  organizationSlug: z.string().trim().min(1).max(60).optional(),
  whatsappTransactionalOptIn: z.boolean().optional().default(false),
  whatsappMarketingOptIn: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const parsed = joinSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }, { status: 400 });
  }

  const organization = parsed.data.organizationSlug
    ? await prisma.organization.findUnique({ where: { slug: parsed.data.organizationSlug } })
    : await resolveRequestOrganization();

  if (!organization || organization.status === "SUSPENDED") {
    return NextResponse.json({ message: "الصالون غير متاح للتسجيل حاليًا" }, { status: 404 });
  }

  const meta = await getRequestMeta();

  try {
    const result = await selfRegisterForLoyalty(prisma, {
      organizationId: organization.id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      rateLimitKey: meta.ipAddress ?? "unknown",
      whatsappTransactionalOptIn: parsed.data.whatsappTransactionalOptIn,
      whatsappMarketingOptIn: parsed.data.whatsappMarketingOptIn,
    });

    if (result.outcome === "ALREADY_REGISTERED") {
      return NextResponse.json({
        outcome: "ALREADY_REGISTERED",
        message: "رقمك مسجّل لدينا مسبقًا. اطلب رابط نقاطك من الحلاق عند زيارتك القادمة.",
      });
    }

    return NextResponse.json({ outcome: "CREATED", portalPath: result.portalPath }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر التسجيل");
  }
}
