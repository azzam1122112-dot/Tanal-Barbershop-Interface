import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformApi } from "@/lib/auth/http";
import { listOrganizations } from "@/lib/platform/platform-service";

export async function GET() {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ organizations: await listOrganizations(prisma) });
}
