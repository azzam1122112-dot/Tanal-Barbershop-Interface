import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { parseJsonBody, requireAdminApi } from "@/lib/auth/http";

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
  const existing = await prisma.dataSubjectRequest.findFirst({ where: { id, organizationId: auth.session.organizationId }, select: { id: true } });
  if (!existing) return NextResponse.json({ message: "الطلب غير موجود" }, { status: 404 });
  const updated = await prisma.dataSubjectRequest.update({ where: { id }, data: { status: parsed.data.status, resolutionNote: parsed.data.resolutionNote, resolvedAt: parsed.data.status === "IN_PROGRESS" ? null : new Date() } });
  return NextResponse.json({ request: { id: updated.id, status: updated.status, resolutionNote: updated.resolutionNote, resolvedAt: updated.resolvedAt?.toISOString() ?? null } });
}
