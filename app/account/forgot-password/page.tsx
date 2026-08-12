import { AccountForgotPasswordForm } from "@/components/public/account-auth-forms";
import { AccountCard } from "@/components/public/account-card";

export default function AccountForgotPasswordPage() {
  return (
    <AccountCard title="نسيت كلمة المرور" description="أدخل بريدك المسجّل وسنرسل لك رمز إعادة تعيين.">
      <AccountForgotPasswordForm />
    </AccountCard>
  );
}
