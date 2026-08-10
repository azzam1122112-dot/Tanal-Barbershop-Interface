import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { signupSchema } from "@/lib/auth/validation";
import { createOrganizationWithOwner } from "@/lib/organizations/organization-service";
import { createStoredSession } from "@/lib/auth/session";
import { getRequestMeta, parseJsonBody, setSessionCookie } from "@/lib/auth/http";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { isBusinessError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getDefaultSignupPlan } from "@/lib/plans/subscription-service";

export async function GET() {
  const meta = await getRequestMeta();
  const rate = await consumeRateLimit(prisma, `signup-read:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 5 * 60_000, maxAttempts: 60, lockMs: 5 * 60_000,
  });
  if (rate.limited) return NextResponse.json({ message: "طلبات كثيرة، حاول لاحقًا" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  const plan = await getDefaultSignupPlan(prisma);
  if (!plan) {
    return NextResponse.json({ available: false, message: "التسجيل التجريبي غير متاح حاليًا" }, { status: 503 });
  }
  return NextResponse.json({
    available: true,
    plan: { name: plan.name, trialDays: plan.trialDays },
  });
}

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
    const { organization, salon, owner, plan, trialDays } = await createOrganizationWithOwner(prisma, {
      ...parsed.data,
      legalAcceptedIp: meta.ipAddress,
      legalAcceptedUserAgent: meta.userAgent,
    });

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
    const response = NextResponse.json(
      {
        redirectTo: "/dashboard",
        // Keep this relative: request.url may contain the deployment proxy's
        // internal localhost address. The signup page resolves it against the
        // public origin that is actually open in the customer's browser.
        loginPath: "/dashboard/login",
        slug: organization.slug,
        ownerEmail: owner.email,
        ownerPhone: owner.phone,
        planName: plan.name,
        trialDays,
        trialEndsAt: organization.trialEndsAt?.toISOString() ?? null,
      },
      { status: 201 },
    );
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
