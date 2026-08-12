import { AccountResetPasswordForm } from "@/components/public/account-auth-forms";
import { AccountCard } from "@/components/public/account-card";

export default async function AccountResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AccountCard title="كلمة مرور جديدة" description="أدخل الرمز الذي وصلك ثم اختر كلمة مرور جديدة.">
      <AccountResetPasswordForm email={email?.trim() ?? ""} />
    </AccountCard>
  );
}
