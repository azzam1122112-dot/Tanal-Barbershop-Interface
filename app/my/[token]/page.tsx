import Link from "next/link";
import { notFound } from "next/navigation";
import { countAr, formatDate, formatMoney, formatNumber } from "@/lib/format";
import { getPortalCard, getPortalIdentity } from "@/lib/customers/portal-view";
import { rewardNameMentionsAmount } from "@/lib/loyalty/reward-summary";
import { NextAppointmentCard } from "@/components/public/next-appointment-card";

/**
 * تبويب «بطاقتي» — أربعة عناصر لا سبعة.
 *
 * كان يحمل بعدها: دعوةَ تثبيت، ونموذجَ طلبات خصوصية بأربعة حقول، وسطرَ تحذير.
 * ثلاثتها إداريّة تُفعل مرة في العمر، وقد انتقلت إلى تبويب «حسابي». وما بقي هو
 * ما يفتح العميل بطاقته من أجله: متى موعدي، كم رصيدي، ما التالي، وأين العروض.
 */
export default async function CustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const identity = await getPortalIdentity(token);
  if (!identity) notFound();

  const card = await getPortalCard(identity);

  // قبل أول استبدال يتساوى المجموع مع الرصيد، فعرضهما معًا رقمان متطابقان
  // بتسميتين مختلفتين — يقرؤه العميل كخلل لا كمعلومة. يظهر حين يفترق فعلًا.
  const showLifetimeEarned = identity.lifetimeEarned > identity.points;

  // القاعدة مشتركة مع تبويب «العروض»: `includes` النصية كانت تُطابق «خصم ٢٥٠
  // ريال» لمكافأة قيمتها ٢٥ فتحذف مبلغًا مختلفًا عن الاسم.
  const nextRewardMentionsAmount = card.nextReward
    ? rewardNameMentionsAmount(card.nextReward.name, card.nextReward.discountAmount)
    : false;

  return (
    <div className="space-y-4">
      {/* الموعد القادم أولًا: أهم حقيقة على الشاشة لمن له موعد، وكانت مدفونة تحت
          ثلاثة ألواح مكافآت لا تتغيّر من زيارة لأخرى. */}
      {card.nextAppointment ? (
        <NextAppointmentCard
          appointment={card.nextAppointment}
          arriveEarlyMinutes={identity.arriveEarlyMinutes}
          manageHref={`/my/${token}/appointments`}
        />
      ) : null}

      <section className="lux-edge rounded-2xl border border-white/10 bg-sidebar-onyx px-6 py-7 text-center text-white shadow-[var(--shadow-lg)]">
        <p className="text-6xl leading-none text-salon-goldlight lux-number">{formatNumber(identity.points)}</p>
        <p className="mt-2 text-sm font-bold text-white/70">نقطة في رصيدك</p>
        {/* الرقم وحده بلا معنى؛ هذا السطر يخبر العميل كيف يكبر رصيده. */}
        <p className="mt-1 text-xs font-semibold text-white/45">
          تكسب {identity.pointsPerRiyal === 1 ? "نقطة" : `${formatNumber(identity.pointsPerRiyal)} نقاط`} على كل ريال
        </p>

        <div className={`mt-6 grid gap-2.5 text-center ${showLifetimeEarned ? "grid-cols-3" : "grid-cols-2"}`}>
          <div className="rounded-xl bg-white/[0.08] px-2 py-3">
            <p className="text-[11px] font-semibold text-white/55">زياراتك</p>
            <p className="mt-1 text-lg lux-number">{formatNumber(identity.visitCount)}</p>
          </div>
          {showLifetimeEarned ? (
            <div className="rounded-xl bg-white/[0.08] px-2 py-3">
              <p className="text-[11px] font-semibold text-white/55">جمعتها كلها</p>
              <p className="mt-1 text-lg lux-number">{formatNumber(identity.lifetimeEarned)}</p>
            </div>
          ) : null}
          <div className="rounded-xl bg-white/[0.08] px-2 py-3">
            <p className="text-[11px] font-semibold text-white/55">آخر زيارة</p>
            <p className="mt-1 text-sm font-bold">
              {identity.lastVisitAt ? formatDate(identity.lastVisitAt) : "—"}
            </p>
          </div>
        </div>
      </section>

      {card.nextReward ? (
        <section className="barber-card px-5 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="lux-section-title">مكافأتك القادمة</h2>
            <span className="text-sm text-salon-forest lux-number">{card.nextReward.progress}%</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-salon-charcoal">
            {card.nextReward.name}
            {nextRewardMentionsAmount ? "" : ` — خصم ${formatMoney(card.nextReward.discountAmount)}`}
          </p>
          <div
            className="mt-4 h-3 overflow-hidden rounded-full bg-salon-mist"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={card.nextReward.progress}
            aria-label="تقدّمك نحو المكافأة القادمة"
          >
            <div
              className="h-full rounded-full bg-gradient-to-l from-salon-gold to-salon-forest transition-[width]"
              style={{ width: `${card.nextReward.progress}%` }}
            />
          </div>
          {/* «فقط» تُقال حين يكون الباقي قريبًا؛ مع ٣٥٥ نقطة متبقية تبدو سخرية. */}
          <p className="mt-2.5 text-sm font-bold text-salon-forest">
            تبقّى {formatNumber(card.nextReward.pointsRemaining)} نقطة للوصول إليها
          </p>
        </section>
      ) : null}

      {/* بوابة إلى تبويب العروض بدل تكرار قوائمه هنا — كان تفتيتها على ثلاثة
          ألواح يجعل «ماذا لي؟» سؤالًا بلا جواب واحد. */}
      <Link
        href={`/my/${token}/offers`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-salon-gold/35 bg-salon-gold/[0.09] px-5 py-4 shadow-[var(--shadow-sm)] transition hover:border-salon-gold/60"
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold text-salon-ink">
            {card.unlockedCount > 0
              ? `لديك ${countAr(card.unlockedCount, {
                  one: "خصم واحد جاهز",
                  two: "خصمان جاهزان",
                  few: "خصومات جاهزة",
                  many: "خصمًا جاهزًا",
                })}`
              : "عروض الصالون"}
          </span>
          {/* **تاريخ الانتهاء هو ما يحرّك العميل، لا وجود عرضٍ ما.** الحملات
              محدودة بفترة، وسطرٌ عام («عروض الصالون») يجعل العرض الذي ينتهي بعد
              يومين يمرّ دون أن يُفتح. */}
          <span className="mt-0.5 block text-xs font-semibold text-salon-charcoal/70">
            {card.soonestCampaignEndsAt
              ? `عرض ساري حتى ${formatDate(card.soonestCampaignEndsAt)} · الأسعار والمكافآت`
              : "الخدمات والأسعار والمكافآت والهدايا"}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-lg font-black text-salon-gold">
          ‹
        </span>
      </Link>

      {/* لا موعد قادم = الحجز هو الفعل المقصود. من له موعد يراه أعلى الشاشة
          ولا يحتاج دعوة ثانية، ويجد «إدارة مواعيدي» على بطاقته. */}
      {card.nextAppointment ? null : (
        <Link
          href={`/my/${token}/appointments`}
          className="flex min-h-12 items-center justify-center rounded-2xl bg-salon-ink text-sm font-bold text-white transition hover:bg-salon-charcoal"
        >
          احجز موعدك القادم
        </Link>
      )}
    </div>
  );
}
