import { NextResponse } from "next/server";
import { isBusinessError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * يحوّل أي خطأ إلى استجابة JSON آمنة.
 * أخطاء الأعمال تُعرض كما هي؛ غيرها يُسجَّل داخليًا ويُعاد رسالة عامة.
 */
export function toErrorResponse(error: unknown, fallbackMessage = "حدث خطأ غير متوقع") {
  if (isBusinessError(error)) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  logger.error("unhandled_route_error", error);
  return NextResponse.json({ message: fallbackMessage }, { status: 500 });
}

/** يستخرج رسالة آمنة للعرض من خطأ أعمال، أو رسالة بديلة عامة. */
export function safeErrorMessage(error: unknown, fallbackMessage = "حدث خطأ غير متوقع") {
  if (isBusinessError(error)) {
    return error.message;
  }
  logger.error("unhandled_route_error", error);
  return fallbackMessage;
}
