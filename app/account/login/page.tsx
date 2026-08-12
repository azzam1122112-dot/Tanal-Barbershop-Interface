import { redirect } from "next/navigation";
import { AccountLoginForm } from "@/components/public/account-auth-forms";
import { AccountCard } from "@/components/public/account-card";
import { getRequestCustomerSession } from "@/lib/customers/account-http";

export default async function AccountLoginPage() {
  if (await getRequestCustomerSession()) redirect("/account");

  return (
    <AccountCard title="تسجيل الدخول" description="بالجوال أو البريد الإلكتروني.">
      <AccountLoginForm />
    </AccountCard>
  );
}
