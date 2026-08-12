import { NextResponse } from "next/server";
import { requirePlatformApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getSupportAttachmentDownload } from "@/lib/email/platform-support";
import { BusinessError } from "@/lib/errors";
import { toErrorResponse } from "@/lib/http/error-response";

const INLINE_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

export async function GET(_request: Request, context: { params: Promise<{ messageId: string; attachmentId: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const { messageId, attachmentId } = await context.params;
  try {
    const result = await getSupportAttachmentDownload(prisma, messageId, attachmentId);
    const upstream = await fetch(result.downloadUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok || !upstream.body) throw new BusinessError("تعذر تنزيل المرفق من مزود البريد", 502);

    const contentType = normalizedContentType(result.attachment.contentType);
    const disposition = INLINE_ATTACHMENT_TYPES.has(contentType) ? "inline" : "attachment";
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": contentDisposition(disposition, result.attachment.filename),
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error, "تعذر فتح المرفق");
  }
}

function normalizedContentType(value: string) {
  const type = value.split(";", 1)[0]?.trim().toLowerCase();
  return type && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type)
    ? type
    : "application/octet-stream";
}

function contentDisposition(disposition: "inline" | "attachment", filename: string) {
  const clean = filename.replace(/[\x00-\x1f\x7f]/g, "_").slice(0, 180) || "attachment";
  const fallback = clean.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(clean).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
