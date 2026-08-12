import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta } from "@/lib/auth/http";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { clearCustomerSessionCookie, readCustomerSessionToken } from "@/lib/customers/account-http";
import { getCustomerAuthSession, revokeCustomerSession } from "@/lib/customers/account-session";

/**
 * خروج العميل — يُبطل جلسته ويمسح كوكيه **وحده**.
 *
 * لا يمسّ `tanal_session` إطلاقًا: موظف يفتح حسابه الشخصي على الجهاز نفسه لا
 * يجوز أن يُخرجه خروجُ العميل من لوحته، والعكس كذلك.
 */
export async function POST() {
  const token = await readCustomerSessionToken();
  const session = await getCustomerAuthSession(prisma, token);
  await revokeCustomerSession(prisma, token);

  if (session) {
    await writeAuditLog({
      prisma,
      actorType: "CUSTOMER",
      action: "customer_account.logout",
      entityType: "CustomerAccount",
      entityId: session.account.id,
      ...(await getRequestMeta()),
    });
  }

  const response = NextResponse.json({ redirectTo: "/account/login" });
  clearCustomerSessionCookie(response);
  return response;
}
