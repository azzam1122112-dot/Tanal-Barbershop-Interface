import { redirect } from "next/navigation";
import { AccountRegisterForm } from "@/components/public/account-auth-forms";
import { AccountCard } from "@/components/public/account-card";
import { getRequestCustomerSession } from "@/lib/customers/account-http";

export default async function AccountRegisterPage() {
  if (await getRequestCustomerSession()) redirect("/account");

  return (
    <AccountCard
      title="حساب واحد لكل صالوناتك"
      description="سجّل مرة واحدة بهوية واحدة. ربط بطاقاتك لدى الصالونات يأتي في خطوة لاحقة."
    >
      <AccountRegisterForm />
    </AccountCard>
  );
}
