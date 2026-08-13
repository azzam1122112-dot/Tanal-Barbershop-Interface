"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { PrintButton } from "@/components/ui/print-button";
import { FeedbackNote, useFeedback } from "@/components/ui/toast";
import { countAr, formatNumber, pluralizeAr } from "@/lib/format";

/**
 * ورقة الملصق بالبكسل عند 96dpi: 700×1000 بكسل = 185×265 مم — أي **داخل** منطقة
 * الطباعة في A4 عمودي بهوامش 12 مم (186×273 مم). ولذلك لا يحتاج الملصق قاعدة
 * `@page` خاصة: قاعدة اللوحة العامة تحكمه، وتغييرها هنا كان سيغيّر طباعة
 * الإيصالات والتقارير معه. المقاس ثابت لأن الشاشة تعرض الورقة نفسها مصغّرة
 * (`transform: scale`) لا نسخة ثانية تُصان على حدة.
 */
const SHEET_WIDTH = 700;
const SHEET_HEIGHT = 1000;

const STEPS = [
  {
    title: "امسح الرمز",
    detail: "وجّه كاميرا جوالك إلى الرمز — يفتح الرابط وحده بلا تحميل تطبيق.",
  },
  {
    title: "سجّل باسمك وجوالك",
    detail: "أقل من دقيقة، وبطاقتك الرقمية تصلك فورًا.",
  },
  {
    title: "اجمع مع كل زيارة",
    detail: "النقاط تُضاف تلقائيًا، ومكافأتك تُخصم عند الدفع.",
  },
] as const;

/**
 * ملصق التسجيل الذاتي في برنامج الولاء: يُطبع ويُعلَّق في الصالون فيسجّل العميل
 * نفسه بلا انتظار الحلاق (وهو المدخل الوحيد للانضمام — لا الحلاق ولا المدير
 * يمنح عضوية لأحد).
 *
 * **لماذا ورقة كاملة لا بطاقة صغيرة تُكبَّر عند الطباعة:** الملصق كان مربّعًا
 * بعرض 220 بكسل يحمل الرمز والاسم، وتُوسّعه الطباعة بـ`scale(1.6)` — فيخرج على
 * الورق رمزٌ صغير في أعلى صفحة فارغة، وتحته سطرٌ مقصوص من شرحٍ مكتوبٍ **للمدير**
 * لا للعميل («اطبع الرمز وضعه على المرآة»). ورقةٌ تُعلَّق أمام الزبون تحتاج ما
 * يجعله يمسح: هوية الصالون، وما سيربحه، وثلاث خطوات تُقرأ من مسافة متر.
 */
export function LoyaltyJoinPoster({
  joinPath,
  joinUrl,
  qrSvg,
  salonName,
  pointsPerRiyal,
  rewardsCount,
  lowestRewardPoints,
}: {
  joinPath: string;
  joinUrl: string;
  qrSvg: string;
  salonName: string;
  pointsPerRiyal: number;
  rewardsCount: number;
  lowestRewardPoints: number | null;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const { feedback, succeed, fail } = useFeedback();

  // الشاشة تعرض الورقة نفسها مصغّرة بمقدار عرض الحاوية، فما يراه المدير قبل
  // الضغط هو ما سيخرج من الطابعة حرفيًا.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setScale(width / SHEET_WIDTH);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      succeed("نُسخ رابط الانضمام — أرسله في واتساب أو ضعه في السيرة التعريفية.");
    } catch {
      // النسخ يُرفض بلا HTTPS أو بلا إذن، وكان الزر يقول «تم النسخ» في الحالتين.
      fail("تعذّر النسخ من المتصفح. انسخ الرابط الظاهر يدويًا.");
    }
  }

  // الصفة تتبع المعدود: «مكافأتان جاهزتان» لا «2 مكافآت جاهزة».
  const rewardsLabel = rewardsCount
    ? `${countAr(rewardsCount, {
        one: "مكافأة واحدة بانتظارك",
        two: "مكافأتان بانتظارك",
        few: "مكافآت بانتظارك",
        many: "مكافأة بانتظارك",
      })}`
    : "ورصيدك محفوظ من أول زيارة";

  return (
    <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
      {/* ===== المعاينة: الورقة نفسها مصغّرة ===== */}
      <div className="mx-auto w-full max-w-[320px]">
        <div
          ref={frameRef}
          className="join-poster-frame relative w-full overflow-hidden rounded-2xl bg-white shadow-lux ring-1 ring-salon-line/70"
          style={{ height: scale ? Math.round(SHEET_HEIGHT * scale) : undefined, aspectRatio: scale ? undefined : "700 / 1000" }}
        >
          <PosterSheet
            scale={scale}
            qrSvg={qrSvg}
            salonName={salonName}
            joinUrl={joinUrl}
            pointsPerRiyal={pointsPerRiyal}
            rewardsLabel={rewardsLabel}
            lowestRewardPoints={lowestRewardPoints}
          />
        </div>
        <p className="dashboard-muted mt-2.5 text-center text-xs font-semibold print:hidden">
          معاينة الملصق — يُطبع بحجم A4 عمودي
        </p>
      </div>

      {/* ===== أدوات المدير (لا تُطبع) ===== */}
      <div className="min-w-0 print:hidden">
        <p className="dashboard-muted text-sm leading-7">
          اطبع الملصق وعلّقه على المرآة أو الكاونتر. العميل يمسحه بكاميرا جواله فيسجّل نفسه ويحصل على بطاقة نقاطه
          فورًا — دون أن يشغل وقت الحلاق. الملصق يحمل اسم صالونك ومعدل كسب النقاط لديك، فما يقرأه الزبون هو عرضك أنت.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PrintButton label="طباعة الملصق" />
          <button type="button" onClick={() => void copyLink()} className="dashboard-button-soft px-4 py-2.5 text-sm">
            نسخ الرابط
          </button>
          <a href={joinPath} target="_blank" rel="noopener noreferrer" className="dashboard-button-soft px-4 py-2.5 text-sm">
            فتح صفحة الانضمام
          </a>
        </div>

        <p dir="ltr" className="mt-3 truncate rounded-xl border border-salon-line bg-salon-pearl px-3 py-2.5 text-left text-sm font-semibold">
          {joinUrl}
        </p>

        <FeedbackNote feedback={feedback} className="mt-3" />

        <p className="mt-4 rounded-xl border border-salon-line bg-salon-pearl/70 px-4 py-3 text-xs font-semibold leading-6 text-salon-charcoal">
          العميل المسجّل مسبقًا لن يُعاد له رابطه من النموذج العام حفاظًا على خصوصيته — يفتح بطاقته من حسابه.
        </p>
      </div>
    </div>
  );
}

/**
 * الورقة المطبوعة. تُرسم مرة واحدة وتُصغَّر على الشاشة بـ`transform` — لا نسخة
 * شاشة ونسخة طباعة، فلا يتخلّف أحدهما عن الآخر.
 */
function PosterSheet({
  scale,
  qrSvg,
  salonName,
  joinUrl,
  pointsPerRiyal,
  rewardsLabel,
  lowestRewardPoints,
}: {
  scale: number;
  qrSvg: string;
  salonName: string;
  joinUrl: string;
  pointsPerRiyal: number;
  rewardsLabel: string;
  lowestRewardPoints: number | null;
}) {
  return (
    <div
      className="join-poster-sheet absolute right-0 top-0 flex flex-col overflow-hidden text-salon-ink"
      style={{
        width: SHEET_WIDTH,
        height: SHEET_HEIGHT,
        transform: `scale(${scale})`,
        transformOrigin: "top right",
        // قبل أول قياس لا مقياس: عرض الورقة بحجمها الكامل ثم انكماشها قفزةٌ تحت العين.
        opacity: scale ? 1 : 0,
      }}
    >
      {/* ===== الترويسة: هوية المنصّة ثم اسم الصالون ثم الوعد ===== */}
      <header className="join-poster-hero relative shrink-0 px-[42px] pb-[38px] pt-[36px] text-white">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/xmansx-mark.png"
              alt=""
              // مصدر أكبر من مقاس العرض عمدًا: الورقة تُطبع بكثافة أعلى من الشاشة،
              // وشعارٌ بحجم 48 بكسل يخرج مهترئًا على الورق.
              width={192}
              height={192}
              className="h-[48px] w-[48px] rounded-xl bg-[#09070f] object-contain p-[5px] ring-1 ring-white/15"
            />
            <div>
              <p className="text-[11px] font-bold tracking-eyebrow text-violet-300">برنامج الولاء</p>
              <p className="mt-1 text-[13px] font-bold text-white/85">إكس مانس إكس XMANSX</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-4 py-2 text-[12px] font-bold text-emerald-200">
            <Icon name="check" className="h-3.5 w-3.5" />
            العضوية مجانية
          </span>
        </div>

        <div className="join-poster-rule mt-[30px]" />

        <h3 className="mt-[26px] line-clamp-2 text-[22px] font-bold leading-snug text-white/90">{salonName}</h3>
        <p className="mt-[14px] text-[40px] font-bold leading-[1.22] tracking-tight">
          زيارتك اليوم،
          <span className="mt-1 block text-violet-300">مكافأتك غدًا.</span>
        </p>
        {/* بلا أرقام هنا عمدًا: معدل الكسب وأول مكافأة رقمان يعرضهما شريط
            الحقائق أسفل الورقة، وتكرارهما في الترويسة يجعلهما أربعة أرقام
            تُقرأ من مسافة متر فلا يُقرأ منها شيء. */}
        <p className="mt-[16px] max-w-[520px] text-[15px] font-semibold leading-[1.9] text-white/60">
          سجّل مرة واحدة، وكل ريال تدفعه هنا يقرّبك من مكافأتك القادمة — {rewardsLabel}.
        </p>
      </header>

      {/* ===== الفعل: الرمز والخطوات ===== */}
      {/* الجسم وحده يتنازل عن ارتفاعه (`min-h-0`) إن طال اسم الصالون: الأولى أن
          يضيق ما بين الرمز والحقائق من أن يُقتطع التذييل الحامل للرابط البديل. */}
      <div className="join-poster-body flex min-h-0 flex-1 flex-col justify-between overflow-hidden px-[42px] py-[34px]">
        <div className="grid grid-cols-[300px_minmax(0,1fr)] items-center gap-[30px]">
          <div className="join-poster-qr-card relative rounded-2xl px-[22px] pb-[18px] pt-[20px] text-center">
            <span aria-hidden="true" className="join-poster-corner join-poster-corner-tr" />
            <span aria-hidden="true" className="join-poster-corner join-poster-corner-bl" />
            <div
              className="join-poster-qr mx-auto h-[236px] w-[236px]"
              // الرمز مبني على الخادم من رابط ثابت — بلا مدخلات مستخدم.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="mt-[16px] text-[15px] font-bold text-salon-ink">امسح بكاميرا جوالك</p>
          </div>

          <ol className="space-y-[18px]">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex items-start gap-3.5">
                <span className="join-poster-step-badge lux-number grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl text-[15px] text-white">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[17px] font-bold leading-tight text-salon-ink">{step.title}</span>
                  <span className="mt-1.5 block text-[13px] font-semibold leading-[1.75] text-salon-charcoal">
                    {step.detail}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <dl className="grid grid-cols-3 gap-[14px]">
          <Fact label="معدل الكسب" {...earnRateFact(pointsPerRiyal)} />
          {lowestRewardPoints !== null ? (
            <Fact label="أول مكافأة" value={formatNumber(lowestRewardPoints)} unit="نقطة فقط" numeric />
          ) : (
            <Fact label="نقاطك" value="محفوظة" unit="من أول زيارة" />
          )}
          <Fact label="بطاقتك الرقمية" value="نقاط ومكافآت" unit="وحجز مواعيد" />
        </dl>
      </div>

      {/* ===== التذييل: البديل لمن لا يمسح ===== */}
      <footer className="join-poster-footer flex shrink-0 items-center justify-between gap-6 px-[42px] py-[18px] text-white">
        <p className="text-[12px] font-bold text-white/60">
          لا يعمل المسح؟ افتح الرابط:{" "}
          <span dir="ltr" className="font-bold text-violet-200">
            {joinUrl.replace(/^https?:\/\//, "")}
          </span>
        </p>
        <p className="shrink-0 text-[11px] font-bold tracking-eyebrow text-white/35">XMANSX</p>
      </footer>
    </div>
  );
}

/**
 * معدل الكسب: المفرد والمثنى يُقالان بالكلمة لا بالرقم — «2 نقطتان لكل ريال»
 * تعرض العدد مرتين. من ثلاثة فأكثر يعود الرقم لأنه هو الخبر.
 */
function earnRateFact(pointsPerRiyal: number) {
  if (pointsPerRiyal === 1) return { value: "نقطة", unit: "لكل ريال" };
  if (pointsPerRiyal === 2) return { value: "نقطتان", unit: "لكل ريال" };
  const unit = pluralizeAr(pointsPerRiyal, { one: "نقطة", two: "نقطتان", few: "نقاط", many: "نقطة" });
  return { value: formatNumber(pointsPerRiyal), unit: `${unit} لكل ريال`, numeric: true };
}

/**
 * الحقيقة الواحدة على الملصق. `numeric` ليس زينة: وزن 800 يعني «هذا هو الرقم»
 * في هذا المشروع، فكلمةٌ تُكتب به تسرق الانتباه من الرقم المجاور لها.
 */
function Fact({ label, value, unit, numeric = false }: { label: string; value: string; unit: string; numeric?: boolean }) {
  return (
    <div className="join-poster-fact rounded-xl px-[16px] py-[14px]">
      <dt className="text-[11px] font-bold tracking-eyebrow text-salon-gold">{label}</dt>
      <dd className="mt-[6px] text-[13px] font-semibold leading-[1.6] text-salon-charcoal">
        <span className={`ml-1 text-salon-ink ${numeric ? "lux-number text-[22px]" : "text-[15px] font-bold"}`}>
          {value}
        </span>
        {unit}
      </dd>
    </div>
  );
}
