import { NextResponse } from "next/server";
import { requireBarberApi } from "@/lib/auth/http";

export async function POST() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  return NextResponse.json(
    { message: "لا يملك الحلاق صلاحية إنشاء العملاء. يسجّل العميل نفسه عبر رمز QR المطبوع في المحل." },
    { status: 403 },
  );
}
