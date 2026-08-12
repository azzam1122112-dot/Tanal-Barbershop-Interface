import { redirect } from "next/navigation";
import { AccountCard } from "@/components/public/account-card";
import { AccountLogoutButton } from "@/components/public/account-auth-forms";
import { getRequestCustomerSession } from "@/lib/customers/account-http";

/**
 * صفحة الحساب — هوية فقط، بلا محفظة ولاء بعد.
 *
 * **حساب بلا مؤسسات حالة صحيحة لا خطأ:** الربط بالصالونات فعل مستقل في مرحلة
 * المطالبة، ولا يجوز أن تُنشئ زيارةُ هذه الصفحة سجلَ عميل في أي مؤسسة.
 */
export default async function AccountPage() {
  const session = await getRequestCustomerSession();
  if (!session) redirect("/account/login");

  const { account } = session;

  return (
    <AccountCard title={`أهلًا ${account.name}`} description="بيانات هويتك على منصة XMANSX.">
      <dl className="space-y-3.5">
        <Row label="الاسم" value={account.name} />
        <Row label="رقم الجوال" value={account.phone} ltr />
        <Row label="البريد الإلكتروني" value={account.email ?? "—"} ltr />
        <Row label="حالة البريد" value={account.emailVerifiedAt ? "موثّق" : "غير موثّق"} />
      </dl>

      <p className="mt-6 rounded-xl border border-salon-line bg-salon-mist/60 px-3.5 py-3 text-sm font-medium leading-6 text-salon-charcoal/80">
        ربط بطاقات الولاء لدى الصالونات التي تزورها لم يُفعَّل بعد. حسابك جاهز، وبطاقاتك ستظهر هنا عند إطلاق الربط.
      </p>

      <div className="mt-6 flex justify-end">
        <AccountLogoutButton />
      </div>
    </AccountCard>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-salon-line/70 pb-3 last:border-0 last:pb-0">
      <dt className="text-sm font-semibold text-salon-charcoal/65">{label}</dt>
      <dd className="text-sm font-bold text-salon-ink" dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}
