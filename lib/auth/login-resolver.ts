/**
 * حلّ المؤسسة عند تسجيل الدخول **بلا مطالبة المستخدم بمعرّف المؤسسة**.
 *
 * المبدأ: المستخدم يعرف بريده/جواله وكلمة مروره فقط. نبحث عن كل الهويات
 * المطابقة عبر المؤسسات، ونتحقق من بيانات الاعتماد ضدّ كل مرشّح:
 * - مطابقة واحدة (الحالة الغالبة) → دخول مباشر.
 * - أكثر من مطابقة → نعرض **أسماء الصالونات** ليختار، لا معرّفات يكتبها.
 * - بلا مطابقة → رسالة عامة واحدة لا تكشف أي الحقلين كان خاطئًا.
 *
 * التحقق يسبق أي كشف: لا نعرض قائمة المؤسسات إلا بعد نجاح كلمة المرور،
 * وإلا لأمكن معرفة أين يعمل شخص ما بمجرد إدخال بريده.
 */

/** سقف دفاعي: بريد مسجّل في مؤسسات كثيرة لا يجرّ عملية تحقق مكلفة لكل واحدة. */
const MAX_CANDIDATES = 5;

export type OrganizationChoice = { id: string; name: string };

export type LoginResolution<TIdentity> =
  | { outcome: "NO_MATCH" }
  | { outcome: "SINGLE"; identity: TIdentity }
  | { outcome: "NEEDS_CHOICE"; organizations: OrganizationChoice[] };

/**
 * يتحقق من بيانات الاعتماد ضدّ كل هوية مرشّحة ويقرّر النتيجة.
 * `verify` تُستدعى مرة واحدة لكل مرشّح، ودالة `organizationOf` تستخرج مؤسسته.
 */
export async function resolveLoginIdentity<TIdentity>(
  candidates: TIdentity[],
  verify: (identity: TIdentity) => Promise<boolean>,
  organizationOf: (identity: TIdentity) => OrganizationChoice | null,
): Promise<LoginResolution<TIdentity>> {
  if (candidates.length === 0) return { outcome: "NO_MATCH" };

  const limited = candidates.slice(0, MAX_CANDIDATES);
  const matches: TIdentity[] = [];

  for (const candidate of limited) {
    if (await verify(candidate)) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) return { outcome: "NO_MATCH" };
  if (matches.length === 1) return { outcome: "SINGLE", identity: matches[0] };

  const organizations = matches
    .map(organizationOf)
    .filter((org): org is OrganizationChoice => Boolean(org));

  // تعذّر تمييز المؤسسات (بيانات ناقصة) — نعامله كعدم تطابق بدل دخول عشوائي.
  if (organizations.length < 2) {
    return organizations.length === 1 ? { outcome: "SINGLE", identity: matches[0] } : { outcome: "NO_MATCH" };
  }

  return { outcome: "NEEDS_CHOICE", organizations };
}
