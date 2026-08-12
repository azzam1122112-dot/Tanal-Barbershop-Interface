import { redirect } from "next/navigation";
import { PasskeyPrompt } from "@/components/public/passkey-forms";
import { getRequestCustomerSession } from "@/lib/customers/account-http";
import { listPasskeys } from "@/lib/customers/passkey-service";
import { prisma } from "@/lib/db/prisma";

/**
 * دعوة تفعيل الدخول السريع — **اقتراح لا إجبار**.
 *
 * تُعرض بعد توثيق البريد وبعد الدخول برمز بريدي على جهاز جديد. من فعّل مفتاحًا
 * على هذا الحساب من قبل لا يُسأل مجددًا هنا؛ الإضافة تبقى متاحة من صفحة حسابه.
 */
export default async function PasskeySetupPage() {
  const session = await getRequestCustomerSession();
  if (!session) redirect("/account/login");

  const passkeys = await listPasskeys(prisma, session.account.id);
  if (passkeys.length > 0) redirect("/account/loyalty");

  return <PasskeyPrompt continueHref="/account/loyalty" />;
}
