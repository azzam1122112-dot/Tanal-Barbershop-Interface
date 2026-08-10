import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { listOrganizations } from "@/lib/platform/platform-service";
import { signupSchema } from "@/lib/auth/validation";
import { createOrganizationWithOwner } from "@/lib/organizations/organization-service";
import { isBusinessError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function GET() {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  if (!auth.session || auth.session.type !== "platform") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  return NextResponse.json({ organizations: await listOrganizations(prisma) });
}

export async function POST(request: Request) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;

  const parsed = signupSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات المؤسسة غير صحيحة" }, { status: 400 });
  }

  try {
    const meta = await getRequestMeta();
    const { organization } = await createOrganizationWithOwner(prisma, {
      ...parsed.data,
      legalAcceptedIp: meta.ipAddress,
      legalAcceptedUserAgent: meta.userAgent,
      createdByPlatformAdminId: auth.session.admin.id,
    });
    return NextResponse.json({ organization: { id: organization.id, name: organization.name, slug: organization.slug } }, { status: 201 });
  } catch (error) {
    if (isBusinessError(error)) return NextResponse.json({ message: error.message }, { status: 400 });
    logger.error("platform_organization_create_failed", error);
    return NextResponse.json({ message: "تعذر إنشاء المؤسسة" }, { status: 500 });
  }
}
