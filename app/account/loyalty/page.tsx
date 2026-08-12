import Link from "next/link";
import { redirect } from "next/navigation";
import { LoyaltyCard } from "@/components/public/wallet-cards";
import { getRequestCustomerSession } from "@/lib/customers/account-http";
import { getCustomerLoyaltyWallet } from "@/lib/customers/loyalty-wallet";
import { prisma } from "@/lib/db/prisma";

/**
 * محفظة الولاء — بطاقة لكل **مؤسسة** لا لكل فرع.
 *
 * ملخّص فقط: الأرصدة والعدادات وآخر نشاط. الحركات تُحمَّل مصفَّحة داخل البطاقة،
 * فصفحة بعشرين مؤسسة لا تجرّ آلاف الصفوف.
 */
export default async function LoyaltyWalletPage() {
  const session = await getRequestCustomerSession();
  if (!session) redirect("/account/login");

  const cards = await getCustomerLoyaltyWallet(prisma, session.account.id);

  if (cards.length === 0) {
    return (
      <section>
        <header className="mb-4">
          <p className="text-sm font-semibold text-salon-charcoal/60">مرحبًا، {session.account.name}</p>
          <h1 className="mt-0.5 text-xl font-bold text-salon-ink">برامج الولاء الخاصة بك</h1>
        </header>
        <div className="barber-card p-5 sm:p-7">
          <p className="text-sm font-medium leading-7 text-salon-charcoal/70">
            ليس لديك برامج ولاء حتى الآن. امسح رمز QR الموجود لدى إحدى المنشآت المشتركة في إكس مانس إكس، أو افتح رابط
            الانضمام الذي يعطيك إياه الصالون.
          </p>
        </div>
        <BackToAccount />
      </section>
    );
  }

  // الترويسة نفسها في الحالتين. كانت الحالة الفارغة تُرسم داخل `AccountCard`
  // والمملوءة `<section>` عاريًا، فيتغيّر إطار الصفحة بتغيّر بياناتها.
  return (
    <section>
      <header className="mb-4">
        <p className="text-sm font-semibold text-salon-charcoal/60">مرحبًا، {session.account.name}</p>
        <h1 className="mt-0.5 text-xl font-bold text-salon-ink">برامج الولاء الخاصة بك</h1>
      </header>
      <div className="space-y-3.5">
        {cards.map((card) => (
          <LoyaltyCard key={card.reference} card={card} />
        ))}
      </div>
      <p className="mt-6 text-center text-xs font-medium leading-6 text-salon-charcoal/55">
        لإضافة صالون جديد، امسح رمز QR الخاص به داخل المحل.
      </p>
      <BackToAccount />
    </section>
  );
}

/** مخرج واحد للحالتين — لا صفحة داخل الحساب بلا طريق للرجوع منها. */
function BackToAccount() {
  return (
    <Link href="/account" className="mt-5 block text-center text-sm font-bold text-salon-charcoal/70 hover:text-salon-ink">
      → العودة إلى حسابي
    </Link>
  );
}
