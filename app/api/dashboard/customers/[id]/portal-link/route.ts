import { NextResponse } from "next/server";
import { getRequestMeta, requireLoyaltyOperatorApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { hasLivePortalToken, issueCustomerPortalToken } from "@/lib/customers/customer-portal";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { toErrorResponse } from "@/lib/http/error-response";
import type { AuthSession } from "@/lib/auth/session";

/**
 * رابط بوابة العميل من لوحة الإدارة.
 *
 * **إصدار الرمز يُبطل ما قبله دائمًا** — القاعدة تحفظ التجزئة وحدها فلا يُعاد
 * عرض رمز قائم. لذلك المساران مختلفان في **السياسة** لا في الأثر:
 * - `POST` = إصدار أول. يرفض (409) إن كان بيد العميل رابط سارٍ، فلا يُقتل رابطٌ
 *   مفتوح على جهازه بضغطة عابرة من زر «انسخ الرابط».
 * - `PUT` = تدوير مقصود بعد تأكيد المستخدم (تسرّب الرابط أو فقدانه).
 *
 * وكلاهما يكتب في سجل التدقيق. كان `POST` وحده بلا تدقيق رغم أنه يدوّر فعليًا،
 * فيقع إبطال وصولٍ إلى بيانات عميل بلا أثر يُراجَع.
 */

type DashboardSession = Extract<AuthSession, { type: "dashboard" }>;

async function issueAndAudit(
  session: DashboardSession,
  customerId: string,
  action: "customer.portal_token_issued" | "customer.portal_token_rotated",
) {
  const token = await issueCustomerPortalToken(prisma, customerId, session.organizationId);
  await writeAuditLog({
    prisma,
    organizationId: session.organizationId,
    actorType: session.role,
    actorUserId: session.user.id,
    action,
    entityType: "Customer",
    entityId: customerId,
    ...(await getRequestMeta()),
  });
  // الرمز نفسه لا يدخل سجل التدقيق: هو السرّ الذي يفتح صفحة العميل، وحفظه في
  // جدول يُقرأ لاحقًا يجعل التدقيق نفسه مخزنًا للمفاتيح.
  return NextResponse.json({ token, path: `/my/${token}` });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireLoyaltyOperatorApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;

  try {
    if (await hasLivePortalToken(prisma, id, session.organizationId)) {
      return NextResponse.json(
        {
          message: "لهذا العميل رابط سارٍ لا يمكن عرضه مجددًا. إصدار رابط جديد يُبطل الرابط الذي بيده.",
          hasLiveLink: true,
        },
        { status: 409 },
      );
    }
    return await issueAndAudit(session, id, "customer.portal_token_issued");
  } catch (error) {
    return toErrorResponse(error, "تعذر إنشاء رابط العميل");
  }
}

/** يبطل الرابط القديم ويصدر جديدًا — بعد تأكيد صريح من المستخدم. */
export async function PUT(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireLoyaltyOperatorApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;

  try {
    return await issueAndAudit(session, id, "customer.portal_token_rotated");
  } catch (error) {
    return toErrorResponse(error, "تعذر تدوير رابط العميل");
  }
}
