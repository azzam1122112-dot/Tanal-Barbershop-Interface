import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

/**
 * إعادة تنفيذ معاملة `Serializable` عند تعارض التسلسل.
 *
 * **متى تصلح:** حين يكون جسم المعاملة **قاعدة بيانات خالصة**. إعادة التنفيذ تعني
 * تشغيل الجسم كاملًا مرة أخرى، فأي أثر خارج PostgreSQL (رسالة، نداء خارجي، ملف)
 * سيتكرر بلا تراجع — وحدها القاعدة تتراجع مع المعاملة الملغاة. لا تمرّر جسمًا
 * فيه أثر خارجي إلى هنا؛ افصله بعد نجاح المعاملة أو مرّره بمفتاح منع تكرار.
 *
 * **لا تعيد إلا تعارض التسلسل** (`P2034`). خطأ تحقق أو صلاحية أو قاعدة أعمال
 * يفشل فورًا: إعادته لا تغيّر نتيجته، وتحوّل رفضًا فوريًا إلى انتظار بلا فائدة.
 */

const BASE_DELAY_MS = 25;
/** سقف التأخير: أسوأ انتظار تراكمي ~1.6 ثانية، لا دقيقة تُعلَّق فيها الشاشة. */
const MAX_DELAY_MS = 400;
/**
 * مهلة Prisma الافتراضية لانتظار اتصال معاملة تفاعلية ثانيتان فقط. تحت دفعة
 * فتح الدوام قد تنتظر المعاملة الثانية انتهاء الأولى الصحيحة فتسقط بـP2028
 * قبل أن تبدأ، مع أن نافذة الطلب ما زالت سليمة. نوسّع الانتظار لا زمن تنفيذ
 * جسم المعاملة؛ فلا نعيد تصنيف P2028 كتعارض ولا نخفي عطل قاعدة حقيقيًا.
 */
const TRANSACTION_MAX_WAIT_MS = 10_000;
const TRANSACTION_TIMEOUT_MS = 20_000;

export const SERIALIZABLE_MAX_ATTEMPTS = 8;

type SerializableCapable = {
  $transaction: <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options: {
      isolationLevel: Prisma.TransactionIsolationLevel;
      maxWait?: number;
      timeout?: number;
    },
  ) => Promise<T>;
};

export function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/**
 * التأخير تصاعدي مع **jitter كامل**.
 *
 * التصاعد وحده يعيد المتعارضين في اللحظة نفسها بعد كل جولة فيتعارضون ثانيةً؛
 * العشوائية تبعثرهم فيمرّ أحدهم. والانتظار يقع **بعد** فشل المعاملة وقبل بدء
 * التالية — لا نوم داخل معاملة مفتوحة تحجز الصفوف بينما لا تفعل شيئًا.
 */
function backoffDelay(attempt: number) {
  const ceiling = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
  return Math.floor(Math.random() * ceiling) + 1;
}

export async function runSerializable<T>(
  prisma: SerializableCapable,
  /** اسم العملية للسجل — وسم قصير بلا بيانات، مثل `cash_session.close`. */
  operation: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? SERIALIZABLE_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      });
    } catch (error) {
      if (!isSerializationConflict(error)) throw error;

      if (attempt === maxAttempts) {
        // الاستنفاد حدث يستحق التحقيق لا صمتًا: تكراره يعني تزاحمًا حقيقيًا
        // لا يُعالج برفع المحاولات. ويُعاد الخطأ الأصلي كما هو بلا تغليف.
        logger.error("serializable_transaction_exhausted", { operation, attempt, maxAttempts });
        throw error;
      }

      // وسم وعدّادات فقط — لا حمولة ولا مبالغ ولا معرّفات ولا رموز.
      logger.warn("serializable_transaction_retry", { operation, attempt, maxAttempts });
      await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt)));
    }
  }

  // غير قابل للوصول: الجولة الأخيرة إمّا تعيد قيمة أو ترمي.
  throw new Error(`serializable transaction exhausted: ${operation}`);
}
