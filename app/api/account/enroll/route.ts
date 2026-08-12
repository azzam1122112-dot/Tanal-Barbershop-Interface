import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { requireCustomerApi } from "@/lib/customers/account-http";
import { decodeJoinContext } from "@/lib/customers/join-context";
import { enrollAccountInOrganization } from "@/lib/customers/organization-enrollment";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { toErrorResponse } from "@/lib/http/error-response";

const enrollSchema = z.object({
  /** سياق موقّع فقط — لا `organizationId` ولا slug خام من الواجهة. */
  state: z.string().trim().min(1),
});

/**
 * انضمام الحساب الحالي إلى مؤسسة.
 *
 * المؤسسة تأتي **من سياق موقّع** لا من حقل حر: لو قبِلنا slug مجردًا لأمكن لمن
 * يعدّل الطلب أن يضمّ نفسه لأي مؤسسة على المنصّة بلا أن يفتح رابطها.
 * والعملية idempotent — الضغط مرتين يعيد النتيجة نفسها بلا سجل ثانٍ.
 */
export async function POST(request: Request) {
  const auth = await requireCustomerApi();
  if (auth.response) return auth.response;
  const session = auth.session!;

  const meta = await getRequestMeta();
  const parsed = enrollSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "طلب الانضمام غير صالح" }, { status: 400 });
  }

  const context = decodeJoinContext(parsed.data.state);
  if (!context) {
    // توقيع فاسد أو منتهٍ: رسالة واحدة لا تشرح للمهاجم أين أخطأ.
    return NextResponse.json({ message: "رابط الانضمام غير صالح أو انتهت صلاحيته" }, { status: 400 });
  }

  const limited = await consumeCustomerRateLimit("register", { ipAddress: meta.ipAddress, identifier: session.account.id });
  if (limited) return limited;

  try {
    const result = await enrollAccountInOrganization(
      prisma,
      { accountId: session.account.id, organizationSlug: context.organizationSlug },
      meta,
    );

    if (result.outcome === "PHONE_CONFLICT") {
      return NextResponse.json(
        { message: "رقم جوالك مسجّل مسبقًا لدى هذا الصالون. راجع الصالون لربط بطاقتك." },
        { status: 409 },
      );
    }

    // الوجهة بطاقة المؤسسة نفسها: «تم الانضمام» وحدها تترك العميل واقفًا.
    // والعضو مسبقًا يُنقل إلى بطاقته أيضًا — أنفع من إخباره أنه عضو.
    return NextResponse.json({
      outcome: result.outcome,
      message: result.outcome === "ENROLLED" ? "تم انضمامك إلى برنامج الولاء بنجاح." : "أنت مشترك في هذا البرنامج بالفعل.",
      redirectTo: `/account/loyalty/${encodeURIComponent(result.reference)}`,
    });
  } catch (error) {
    return toErrorResponse(error, "تعذر إتمام الانضمام");
  }
}
