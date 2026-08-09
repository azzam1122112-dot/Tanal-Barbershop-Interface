import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import {
  deleteBarberPushSubscription,
  getBarberPushPublicConfig,
  hasBarberPushSubscription,
  saveBarberPushSubscription,
} from "@/lib/push/barber-push";
import { toErrorResponse } from "@/lib/http/error-response";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(256),
  }),
});

const deleteSchema = z.object({ endpoint: z.string().url().max(4096).optional() });

export async function GET() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const [config, subscribed] = await Promise.all([
    Promise.resolve(getBarberPushPublicConfig()),
    hasBarberPushSubscription(prisma, session.id),
  ]);

  return NextResponse.json(
    { ...config, subscribed },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const config = getBarberPushPublicConfig();
  if (!config.enabled) {
    return NextResponse.json({ message: "خدمة التنبيهات غير مهيأة بعد" }, { status: 503 });
  }

  const parsed = subscriptionSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات اشتراك التنبيهات غير صحيحة" }, { status: 400 });
  }

  try {
    await saveBarberPushSubscription(prisma, {
      organizationId: session.organizationId,
      barberId: session.barber.id,
      sessionId: session.id,
      subscription: parsed.data,
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ subscribed: true }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر تفعيل التنبيهات");
  }
}

export async function DELETE(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const parsed = deleteSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "تعذر قراءة اشتراك التنبيهات" }, { status: 400 });
  }

  await deleteBarberPushSubscription(prisma, {
    sessionId: session.id,
    endpoint: parsed.data.endpoint,
  });
  return NextResponse.json({ subscribed: false });
}
