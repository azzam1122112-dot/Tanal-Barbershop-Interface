import { NextResponse } from "next/server";
import { requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { sendBarberTestPush } from "@/lib/push/barber-push";
import { toErrorResponse } from "@/lib/http/error-response";

export async function POST() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  try {
    const result = await sendBarberTestPush(prisma, {
      organizationId: session.organizationId,
      barberId: session.barber.id,
    });
    if (result.sent === 0) {
      return NextResponse.json(
        { message: "لم نجد جهازًا فعّالًا لإرسال التجربة إليه" },
        { status: 409 },
      );
    }
    return NextResponse.json({ sent: result.sent });
  } catch (error) {
    return toErrorResponse(error, "تعذر إرسال التنبيه التجريبي");
  }
}
