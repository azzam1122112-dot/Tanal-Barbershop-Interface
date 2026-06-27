import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * يفحص تفرّد بريد/جوال المستخدم عبر **كل المؤسسات**، لأن قيود القاعدة مقيّدة بالمؤسسة فقط.
 * مرّر القيم المطبّعة (بريد بحروف صغيرة، جوال بصيغة موحّدة). يُستثنى المستخدم نفسه عند التعديل.
 */
export async function findUserIdentityConflicts(
  client: Client,
  { email, phone, excludeUserId }: { email?: string; phone?: string; excludeUserId?: string },
) {
  const or: Prisma.UserWhereInput[] = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  if (or.length === 0) return { emailTaken: false, phoneTaken: false };

  const conflicts = await client.user.findMany({
    where: { OR: or, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) },
    select: { email: true, phone: true },
  });

  return {
    emailTaken: email ? conflicts.some((user) => user.email === email) : false,
    phoneTaken: phone ? conflicts.some((user) => user.phone === phone) : false,
  };
}

/** رسالة عربية دقيقة حسب الحقل المتعارض، أو null إن لا تعارض. */
export function identityConflictMessage(emailTaken: boolean, phoneTaken: boolean) {
  if (emailTaken && phoneTaken) return "البريد الإلكتروني ورقم الجوال مسجّلان مسبقًا، استخدم بيانات أخرى";
  if (emailTaken) return "البريد الإلكتروني مسجّل مسبقًا، استخدم بريدًا آخر";
  if (phoneTaken) return "رقم الجوال مسجّل مسبقًا، استخدم رقمًا آخر";
  return null;
}
