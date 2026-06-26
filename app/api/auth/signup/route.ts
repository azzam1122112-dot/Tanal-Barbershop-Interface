import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { signupSchema } from "@/lib/auth/validation";
import { createOrganizationWithOwner } from "@/lib/organizations/organization-service";
import { createStoredSession } from "@/lib/auth/session";
import { getRequestMeta, parseJsonBody, setSessionCookie } from "@/lib/auth/http";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { isBusinessError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = signupSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "بيانات التسجيل غير صحيحة";
    return NextResponse.json({ message }, { status: 400 });
  }

  const rate = await consumeRateLimit(prisma, `signup:${meta.ipAddress ?? "unknown"}`);
  if (rate.limited) {
    return NextResponse.json(
      { message: "محاولات كثيرة، حاول لاحقًا" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  try {
    const { organization, salon, owner } = await createOrganizationWithOwner(prisma, parsed.data);

    const { token } = await createStoredSession({
      prisma,
      actorType: "OWNER",
      actorId: owner.id,
      role: "OWNER",
      organizationId: organization.id,
      activeSalonId: salon.id,
      ...meta,
    });

    logger.info("organization.created", { organizationId: organization.id, slug: organization.slug });
    const response = NextResponse.json({ redirectTo: "/dashboard/subscription", slug: organization.slug }, { status: 201 });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    if (isBusinessError(error)) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    logger.error("signup_failed", error);
    return NextResponse.json({ message: "تعذر إنشاء الحساب، حاول مرة أخرى" }, { status: 500 });
  }
}
