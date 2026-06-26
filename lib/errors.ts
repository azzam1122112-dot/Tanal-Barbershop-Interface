/**
 * خطأ أعمال متوقّع وآمن لعرضه للمستخدم (تحقق، صلاحية، حالة غير مسموحة).
 * أي خطأ آخر يُعتبر خطأ نظام ولا تُسرّب تفاصيله للواجهة.
 *
 * هذا الملف خفيف بلا اعتماديات على Next حتى يبقى صالحًا للاستيراد
 * داخل طبقة الخدمة النقية والاختبارات.
 */
export class BusinessError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BusinessError";
    this.status = status;
  }
}

export function isBusinessError(error: unknown): error is BusinessError {
  return error instanceof BusinessError;
}
