import { redirect } from "next/navigation";
import { AccountLoginForm } from "@/components/public/account-auth-forms";
import { AccountCard } from "@/components/public/account-card";
import { EmailOtpLoginForm } from "@/components/public/email-otp-login";
import { PasskeyLoginButton } from "@/components/public/passkey-forms";
import { getRequestCustomerSession } from "@/lib/customers/account-http";

/**
 * تسجيل الدخول — **مفتاح المرور أولًا، والرمز البريدي احتياطًا**.
 *
 * كلمة المرور باقية للتوافق لكنها انتقلت إلى «خيارات أخرى»: عرض ثلاث طرق
 * متساوية يربك، وترتيبها يقول للعميل أيّها المقصود. ولا شيء يُحذف من الخادم.
 */
export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ join?: string }>;
}) {
  const { join } = await searchParams;
  if (await getRequestCustomerSession()) redirect(join ? `/join?state=${encodeURIComponent(join)}` : "/account/loyalty");

  return (
    <AccountCard title="تسجيل الدخول" description="ادخل ببصمتك أو بوجهك، أو برمز يصل بريدك.">
      <PasskeyLoginButton join={join ?? null} />

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-salon-line" />
        <span className="text-xs font-bold text-salon-charcoal/50">أو</span>
        <span className="h-px flex-1 bg-salon-line" />
      </div>

      <EmailOtpLoginForm join={join ?? null} />

      <details className="mt-6 border-t border-salon-line/70 pt-4">
        <summary className="cursor-pointer text-sm font-bold text-salon-charcoal/70">خيارات أخرى</summary>
        <div className="mt-4">
          <AccountLoginForm join={join ?? null} />
        </div>
      </details>
    </AccountCard>
  );
}
