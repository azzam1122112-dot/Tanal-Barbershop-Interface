import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { legalInfo, supportWhatsAppLink } from "@/lib/legal";
import { getSupportAvailability, supportMailtoLink, supportTelLink } from "@/lib/legal-contact";

export const metadata: Metadata = {
  title: "التواصل والشكاوى",
  description:
    "قنوات التواصل مع دعم منصة XMANSX: واتساب واتصال وبريد رسمي موحّد للدعم والشكاوى والخصوصية والفوترة.",
};

// حالة التوفّر تُحسب وقت الطلب: صفحة مُخزَّنة ستقول «متاح الآن» منتصف الليل.
export const dynamic = "force-dynamic";

const WHATSAPP_MESSAGE = "السلام عليكم، أحتاج مساعدة بخصوص منصة XMANSX.\nاسم الصالون:\nوصف المشكلة:";

/**
 * تصنيف الطلبات المعتمد. يُرسل كعنوان جاهز بدل أن يُطلب من الزائر كتابته:
 * وسمٌ يُكتب يدويًا يصل نصفه مكتوبًا خطأ فيُصنَّف الطلب في المكان الخطأ.
 */
const REQUEST_TYPES = [
  { tag: "دعم فني", hint: "عطل أو سؤال في الاستخدام" },
  { tag: "شكوى", hint: "خدمة لم تُقدَّم كما ينبغي" },
  { tag: "خصوصية وحقوق بيانات", hint: "وصول أو تصحيح أو حذف" },
  { tag: "فوترة ومدفوعات", hint: "اشتراك أو تحويل أو فاتورة" },
] as const;

export default function ContactPage() {
  const availability = getSupportAvailability();

  return (
    <LegalPage
      title="التواصل والشكاوى"
      description="اختر الأسرع لك: واتساب للاستفسار العاجل، والاتصال لما يحتاج شرحًا، والبريد لما يحتاج مرفقات أو أثرًا مكتوبًا. القنوات الثلاث تصل الفريق نفسه."
      intro={
        <div className="space-y-6">
          {/* «هل يرد أحد الآن؟» سؤال الزائر الأول، وساعات مكتوبة وحدها لا تجيبه. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold ${
                availability.open
                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                  : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${availability.open ? "bg-emerald-600" : "bg-amber-500"}`}
              />
              {availability.label}
            </span>
            <span className="text-xs font-semibold text-salon-charcoal/70">
              {availability.open
                ? "نستقبل رسائلك الآن ضمن ساعات العمل."
                : `تصلنا رسالتك الآن ويبدأ الرد ${availability.nextOpenLabel ?? "في أول يوم عمل"}.`}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <ContactChannel
              href={supportWhatsAppLink(WHATSAPP_MESSAGE)}
              external
              label="واتساب"
              value={legalInfo.supportPhone}
              hint="الأسرع للاستفسار"
              tone="whatsapp"
            />
            <ContactChannel
              href={supportTelLink()}
              label="اتصال"
              value={legalInfo.supportPhone}
              hint="ضمن ساعات العمل"
            />
            <ContactChannel
              href={supportMailtoLink("[دعم فني] ")}
              label="البريد الرسمي"
              value={legalInfo.supportEmail}
              hint="للمرفقات والشكاوى"
            />
          </div>

          <div className="rounded-xl border border-salon-line bg-white p-4">
            <h2 className="text-sm font-bold text-salon-ink">بريد واحد لكل شيء — اختر نوع طلبك</h2>
            <p className="mt-1 text-xs font-semibold leading-6 text-salon-charcoal/75">
              الدعم والشكاوى والخصوصية والفوترة تصل جميعها إلى{" "}
              <span className="font-bold text-salon-ink" dir="ltr">
                {legalInfo.supportEmail}
              </span>
              . اضغط النوع المناسب ليُفتح بريدك بعنوان مُصنَّف ونموذج جاهز.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {REQUEST_TYPES.map((type) => (
                <a
                  key={type.tag}
                  href={supportMailtoLink(`[${type.tag}] `)}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-salon-line bg-salon-pearl px-3.5 py-2.5 transition hover:border-violet-300 hover:bg-white"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-salon-ink">{type.tag}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold text-salon-charcoal/65">
                      {type.hint}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-lg font-bold text-violet-700">
                    ←
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* الحقول هنا هي نفسها المُعبّأة تلقائيًا في روابط البريد أعلاه:
              رسالة ناقصة تعني دورة أسئلة كاملة قبل أن يبدأ الحل. */}
          <div className="rounded-xl border border-salon-line bg-white p-4">
            <h2 className="text-sm font-bold text-salon-ink">اذكر هذه البيانات ليُعالج طلبك من أول رسالة</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                "اسم الصالون واسم صاحب الحساب",
                "رقم جوال صحيح للتواصل",
                "وصف المشكلة وتاريخ حدوثها",
                "رقم الفاتورة أو مرجع التحويل للأمور المالية",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-xs font-semibold leading-6 text-salon-charcoal"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-salon-forest"
                  />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-xs font-bold leading-6 text-red-800">
              لا ترسل كلمة المرور أو رمز التحقق أو بيانات بطاقتك في أي قناة — لن يطلبها منك موظف الدعم
              إطلاقًا.
            </p>
          </div>

          <div className="rounded-xl border border-salon-line bg-white p-4">
            <h2 className="text-sm font-bold text-salon-ink">ساعات العمل ومدد الرد</h2>
            <dl className="mt-2 divide-y divide-salon-line/70 text-xs font-semibold text-salon-charcoal">
              <ResponseRow
                term="ساعات العمل"
                value="الأحد – الخميس · 9 صباحًا إلى 6 مساءً بتوقيت الرياض، عدا العطلات الرسمية"
              />
              <ResponseRow term="تأكيد الاستلام" value="خلال يومَي عمل" />
              <ResponseRow
                term="الرد النهائي"
                value="خلال 10 أيام عمل، ونُبلغك بالحالة والسبب إن احتاج الأمر مدة أطول"
              />
              <ResponseRow
                term="حقوق البيانات"
                value="خلال 30 يومًا، وقد تُمدَّد 30 يومًا أخرى بإشعار مسبق بالمبررات"
              />
            </dl>
          </div>
        </div>
      }
      sections={[
        {
          title: "التصعيد",
          paragraphs: [
            "إذا لم تُحل الشكوى وديًا خلال المدد أعلاه، يحتفظ العميل بحقه في الرجوع إلى الجهة المختصة في المملكة العربية السعودية. استخدام قنوات الدعم لا يمنع ممارسة أي حق نظامي ولا يُسقط أي مدة نظامية.",
          ],
        },
        {
          title: "مقدم الخدمة",
          items: [
            `${legalInfo.providerName} — ${legalInfo.providerType}.`,
            `وثيقة العمل الحر رقم ${legalInfo.freelanceDocumentNumber} — ${legalInfo.freelanceActivity}.`,
            `مقر العمل: ${legalInfo.businessAddress}.`,
          ],
        },
      ]}
    />
  );
}

/**
 * قناة تواصل قابلة للضغط بمساحة لمس مريحة.
 *
 * القيمة تُعرض `dir="ltr"`: رقم أو بريد داخل نصّ عربي تعيد ثنائية الاتجاه
 * ترتيبَه بصريًا، فتقفز نقطة النهاية إلى أوله ويُقرأ مقلوبًا.
 */
function ContactChannel({
  href,
  label,
  value,
  hint,
  external = false,
  tone = "default",
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  external?: boolean;
  tone?: "default" | "whatsapp";
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`flex min-h-20 flex-col justify-center rounded-xl border px-4 py-3 transition ${
        tone === "whatsapp"
          ? "border-[#128c7e]/35 bg-[#128c7e]/[0.07] hover:border-[#128c7e]/70"
          : "border-salon-line bg-white hover:border-violet-300"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-salon-ink">{label}</span>
        <span className="text-[11px] font-bold text-salon-charcoal/60">{hint}</span>
      </span>
      <span className="mt-1 text-sm font-bold text-violet-800" dir="ltr">
        {value}
      </span>
    </a>
  );
}

function ResponseRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 font-bold text-salon-ink sm:w-40">{term}</dt>
      <dd className="leading-6">{value}</dd>
    </div>
  );
}
