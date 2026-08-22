import Link from "next/link";
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
    <AccountCard
      title="تسجيل الدخول"
      description={join ? "ادخل وسنعيدك تلقائيًا لإكمال عضويتك في الصالون." : "ادخل ببصمتك أو بوجهك، أو برمز يصل بريدك."}
    >
      <PasskeyLoginButton join={join ?? null} />

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-salon-line" />
        <span className="text-xs font-bold text-salon-charcoal/50">أو</span>
        <span className="h-px flex-1 bg-salon-line" />
      </div>

      <EmailOtpLoginForm join={join ?? null} />

      {/* طريق العميل الجديد ظاهر دائمًا. كان الرابط داخل «خيارات أخرى» فقط،
          فيرى القادم من الصفحة الرئيسية نموذج دخول بلا بداية ممكنة له. */}
      <div className="mt-5 rounded-2xl border border-salon-gold/30 bg-salon-gold/[0.08] px-4 py-3.5 text-center">
        <p className="text-xs font-semibold text-salon-charcoal/70">أول مرة تستخدم إكس مانس إكس؟</p>
        <Link
          href={join ? `/account/register?join=${encodeURIComponent(join)}` : "/account/register"}
          className="mt-1 inline-flex min-h-10 items-center justify-center text-sm font-black text-salon-ink underline decoration-salon-gold decoration-2 underline-offset-4"
        >
          إنشاء حساب عميل جديد
        </Link>
      </div>

      <details className="mt-6 border-t border-salon-line/70 pt-4">
        <summary className="cursor-pointer text-sm font-bold text-salon-charcoal/70">الدخول بكلمة المرور</summary>
        <div className="mt-4">
          <AccountLoginForm join={join ?? null} showRegisterLink={false} />
        </div>
      </details>
    </AccountCard>
  );
}
