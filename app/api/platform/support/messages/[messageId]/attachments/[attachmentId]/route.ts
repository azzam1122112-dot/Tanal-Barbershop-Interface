import { NextResponse } from "next/server";
import { requirePlatformApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getSupportAttachmentDownload } from "@/lib/email/platform-support";
import { toErrorResponse } from "@/lib/http/error-response";

export async function GET(_request: Request, context: { params: Promise<{ messageId: string; attachmentId: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const { messageId, attachmentId } = await context.params;
  try {
    const result = await getSupportAttachmentDownload(prisma, messageId, attachmentId);
    const response = NextResponse.redirect(result.downloadUrl);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return toErrorResponse(error, "تعذر فتح المرفق");
  }
}
