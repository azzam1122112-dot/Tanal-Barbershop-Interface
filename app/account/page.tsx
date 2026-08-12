import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountCard } from "@/components/public/account-card";
import { AccountLogoutButton } from "@/components/public/account-auth-forms";
import { PasskeyManager } from "@/components/public/passkey-forms";
import { getRequestCustomerSession } from "@/lib/customers/account-http";
import { listPasskeys } from "@/lib/customers/passkey-service";
import { prisma } from "@/lib/db/prisma";

/**
 * صفحة الحساب — الهوية، ومدخل إلى محفظة الولاء.
 *
 * **حساب بلا مؤسسات حالة صحيحة لا خطأ:** الربط بالصالونات فعل مستقل في مرحلة
 * المطالبة، ولا يجوز أن تُنشئ زيارةُ هذه الصفحة سجلَ عميل في أي مؤسسة.
 */
export default async function AccountPage() {
  const session = await getRequestCustomerSession();
  if (!session) redirect("/account/login");

  const { account } = session;
  const passkeys = await listPasskeys(prisma, account.id);

  return (
    <AccountCard title={`أهلًا ${account.name}`} description="بيانات هويتك على منصة إكس مانس إكس XMANSX.">
      <dl className="space-y-3.5">
        <Row label="الاسم" value={account.name} />
        <Row label="رقم الجوال" value={account.phone} ltr />
        <Row label="البريد الإلكتروني" value={account.email ?? "—"} ltr />
        <Row label="حالة البريد" value={account.emailVerifiedAt ? "موثّق" : "غير موثّق"} />
      </dl>

      <Link
        href="/account/loyalty"
        className="mt-6 block w-full rounded-xl bg-salon-ink px-4 py-3.5 text-center text-base font-bold text-white transition hover:bg-salon-charcoal"
      >
        برامج الولاء الخاصة بي
      </Link>

      <div className="mt-4">
        <PasskeyManager passkeys={passkeys} />
      </div>

      {/* الخروج آخر شيء على الشاشة. كان فوق مدير مفاتيح الدخول، فيقرأ العميل
          «تسجيل الخروج» ثم يجد إعدادات أمان تحته — يقطع الصفحة في منتصفها. */}
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
