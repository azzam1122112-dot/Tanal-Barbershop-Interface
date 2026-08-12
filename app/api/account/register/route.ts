import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { registerCustomerAccount } from "@/lib/customers/account-auth";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { customerRegisterSchema } from "@/lib/customers/account-validation";
import { toErrorResponse } from "@/lib/http/error-response";

/**
 * تسجيل حساب عميل عالمي.
 *
 * **لا ينشئ `Customer` في أي مؤسسة ولا يربط عميلًا قديمًا** — حتى لو وُجد سجل
 * قديم بنفس الجوال. المطالبة مرحلة مستقلة بقرار صاحبها.
 */
export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = customerRegisterSchema.safeParse(await parseJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }, { status: 400 });
  }

  const limited = await consumeCustomerRateLimit("register", { ipAddress: meta.ipAddress, identifier: parsed.data.email });
  if (limited) return limited;

  try {
    const result = await registerCustomerAccount(prisma, parsed.data, meta);

    const joinSuffix = parsed.data.join ? `&join=${encodeURIComponent(parsed.data.join)}` : "";
    const verifyPath = `/account/verify?email=${encodeURIComponent(parsed.data.email)}${joinSuffix}`;

    switch (result.outcome) {
      case "CREATED":
      case "VERIFICATION_RESENT":
        return NextResponse.json({ message: "أرسلنا رمز التفعيل إلى بريدك.", redirectTo: verifyPath });
      case "ACCOUNT_CREATED_VERIFICATION_PENDING":
        // نجاح جزئي: الحساب قائم والإرسال تعثّر. نقولها كما هي ونوجّهه لإعادة
        // الإرسال، بدل خطأ يوهمه أن التسجيل لم يحدث فيعيده ويصطدم بـ«مستعمل».
        return NextResponse.json({
          message: "تم إنشاء الحساب، لكن تعذر إرسال رمز التحقق. حاول إعادة الإرسال.",
          redirectTo: verifyPath,
        });
      case "EMAIL_TAKEN":
        // نقول إن المدخل مستعمل ولا نكشف حرفًا عن صاحبه.
        return NextResponse.json({ message: "البريد الإلكتروني مرتبط بحساب موجود مسبقًا." }, { status: 409 });
    }
  } catch (error) {
    return toErrorResponse(error, "تعذر إنشاء الحساب");
  }
}
