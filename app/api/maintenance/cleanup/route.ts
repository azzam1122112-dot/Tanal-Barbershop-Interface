import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, requireAdminApi } from "@/lib/auth/http";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { runMaintenanceCleanup } from "@/lib/maintenance/cleanup";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * صيانة دورية. تُستدعى إمّا:
 * - من مدير مسجّل دخول (لوحة التحكم)، أو
 * - من cron عبر ترويسة x-maintenance-token مطابقة لـ MAINTENANCE_TOKEN.
 */
export async function POST(request: Request) {
  const token = process.env.MAINTENANCE_TOKEN;
  const provided = request.headers.get("x-maintenance-token");
  const tokenOk = Boolean(token && provided && safeEqual(token, provided));

  let actorUserId: string | null = null;

  if (!tokenOk) {
    const auth = await requireAdminApi();
    if (auth.response) return auth.response;
    actorUserId = auth.session?.type === "dashboard" ? auth.session.user.id : null;
  }

  const meta = await getRequestMeta();

  try {
    const result = await runMaintenanceCleanup(prisma);

    await writeAuditLog({
      prisma,
      actorType: tokenOk ? "SYSTEM" : "ADMIN",
      actorUserId,
      action: "maintenance.cleanup",
      entityType: "System",
      after: result,
      ...meta,
    });

    logger.info("maintenance.cleanup", result);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("maintenance.cleanup_failed", error);
    return NextResponse.json({ message: "تعذر تنفيذ الصيانة" }, { status: 500 });
  }
}

function safeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}
