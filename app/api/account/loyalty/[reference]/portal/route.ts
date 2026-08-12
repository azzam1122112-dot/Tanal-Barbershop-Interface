import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta } from "@/lib/auth/http";
import { requireCustomerApi } from "@/lib/customers/account-http";
import { issueAccountPortalToken } from "@/lib/customers/customer-portal";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { toErrorResponse } from "@/lib/http/error-response";

/**
 * فتح بطاقة الصالون من محفظة الحساب.
 *
 * **`POST` لا `GET`:** النداء يُصدر رمز بوابة جديدًا ويبطل السابق. مسار `GET`
 * كان سيُستدعى من تلقاء نفسه — `<Link>` في Next يسبق التحميل عند التمرير — فيدوّر
 * رمز العميل بلا أن يضغط أحد، ويبطل رابطًا مفتوحًا على جهازه الآخر.
 *
 * المؤسسة تأتي من مسار الطلب، لكن الإصدار لا يتم إلا لسجل عميل **يملكه** صاحب
 * الجلسة داخل تلك المؤسسة — الفحص في `issueAccountPortalToken` داخل `where`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const auth = await requireCustomerApi();
  if (auth.response) return auth.response;
  const session = auth.session!;

  const meta = await getRequestMeta();
  const limited = await consumeCustomerRateLimit("portalLink", {
    ipAddress: meta.ipAddress,
    identifier: session.account.id,
  });
  if (limited) return limited;

  const { reference } = await params;

  try {
    const token = await issueAccountPortalToken(prisma, {
      accountId: session.account.id,
      organizationSlug: reference,
    });
    return NextResponse.json({ url: `/my/${token}` });
  } catch (error) {
    return toErrorResponse(error, "تعذر فتح بطاقة الصالون");
  }
}
