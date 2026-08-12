import { AccountVerifyForm } from "@/components/public/account-auth-forms";
import { AccountCard } from "@/components/public/account-card";

export default async function AccountVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; join?: string }>;
}) {
  const { email, join } = await searchParams;

  return (
    <AccountCard title="فعّل بريدك" description="أرسلنا رمزًا من ست خانات إلى بريدك. أدخله لإكمال إنشاء حسابك.">
      <AccountVerifyForm email={email?.trim() ?? ""} join={join ?? null} />
    </AccountCard>
  );
}
