import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { clearSessionCookie, getRequestMeta, getRequestSession } from "@/lib/auth/http";
import { revokeSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/audit-log";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getRequestSession();
  const meta = await getRequestMeta();

  await revokeSession(prisma, token);

  if (session?.type === "dashboard") {
    await writeAuditLog({
      prisma,
      actorType: session.role,
      actorUserId: session.user.id,
      action: "auth.logout",
      entityType: "Session",
      entityId: session.id,
      ...meta,
    });
  }

  if (session?.type === "barber") {
    await writeAuditLog({
      prisma,
      actorType: "BARBER",
      actorBarberId: session.barber.id,
      action: "auth.logout",
      entityType: "Session",
      entityId: session.id,
      ...meta,
    });
  }

  const redirectTo = session?.type === "barber" ? "/barber/login" : "/dashboard/login";
  const response = NextResponse.json({ redirectTo });
  clearSessionCookie(response);
  return response;
}
