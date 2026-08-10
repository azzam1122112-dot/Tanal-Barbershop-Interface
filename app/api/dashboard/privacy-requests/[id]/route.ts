import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { parseJsonBody, requireAdminApi } from "@/lib/auth/http";
import { updateDataSubjectRequest } from "@/lib/privacy/execute-data-subject-request";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED", "REJECTED"]),
  resolutionNote: z.string().trim().min(3, "أدخل ملاحظة توضح الإجراء").max(1000),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  if (!auth.session || auth.session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "البيانات غير صحيحة" }, { status: 400 });
  const { id } = await params;
  try {
    const updated = await updateDataSubjectRequest(prisma, {
      requestId: id,
      organizationId: auth.session.organizationId,
      status: parsed.data.status,
      resolutionNote: parsed.data.resolutionNote,
      actorUserId: auth.session.user.id,
      actorType: auth.session.user.role,
    });
    return NextResponse.json({ request: { id: updated.id, status: updated.status, resolutionNote: updated.resolutionNote, resolvedAt: updated.resolvedAt?.toISOString() ?? null, executedAt: updated.executedAt?.toISOString() ?? null, ...(updated.customerId === null ? { customer: null } : {}) } });
  } catch (error) {
    return toErrorResponse(error, "تعذر تنفيذ طلب الخصوصية");
  }
}
