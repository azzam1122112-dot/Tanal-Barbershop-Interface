/**
 * ترويسة الصفحة داخل هيكل اللوحة.
 *
 * الشريط الجانبي وحالة الاشتراك انتقلا إلى `app/dashboard/(shell)/layout.tsx`،
 * فلم يعد هذا المكوّن يقرأ جلسة ولا يستعلم قاعدة البيانات — لا تُعِد إليه شيئًا من ذلك،
 * لأنه يُرسم في كل صفحة بينما التخطيط يُرسم مرة واحدة لكل زيارة.
 */
export function DashboardShell({
  title,
  eyebrow = "إكس مانس إكس XMANSX · الإدارة والتشغيل",
  description,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      {children}
    </>
  );
}

/**
 * ترويسة الصفحة — السطح البطولي الوحيد في كل شاشة، فهي تستحق الخط الذهبي.
 * بقية الألواح تبقى محايدة حتى يظل الذهب علامةَ أهمية لا زينة متكررة.
 */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="dashboard-panel lux-edge flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between lg:px-7">
      <div className="min-w-0">
        {eyebrow ? <p className="lux-eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-2.5 text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl">{title}</h1>
        {description ? <p className="dashboard-muted mt-3 max-w-3xl">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <div className={`dashboard-panel p-5 ${className}`} title={title}>
      {children}
    </div>
  );
}

/**
 * مجموعة مؤشرات معنونة. تقسيم الشبكة الطويلة إلى مجموعات قصيرة يحوّلها من
 * جدار أرقام إلى قصة تُقرأ: «المال» ثم «الحركة» ثم «الولاء».
 */
export function StatGroup({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-6 ${className}`}>
      {title ? (
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-salon-gold to-[#8f6c39]" aria-hidden="true" />
          <h2 className="text-[13px] font-bold uppercase tracking-eyebrow text-salon-charcoal">{title}</h2>
          <span className="lux-rule flex-1" />
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * بطاقة مؤشّر.
 *
 * `tone` يبني التراتب البصري: صفّ من عشر بطاقات متطابقة لا يُقرأ، والعين تحتاج
 * مرساة. `gold` للمؤشر الرئيسي في الشاشة، و`danger`/`success` للحالات، والباقي محايد.
 * القيمة الصفرية تُخفَّت عمدًا حتى يقفز البصر إلى الأرقام التي فيها حياة.
 */
export function StatCard({
  label,
  value,
  subValue,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  subValue?: string;
  tone?: "neutral" | "gold" | "success" | "danger";
  /** شرح يظهر عند المرور — للمؤشرات التي يلتبس معناها. */
  hint?: string;
}) {
  const isZero = /^[0٠]([.,٫]0+)?(\s|$)/.test(value.trim());

  const accent = {
    neutral: "bg-salon-line",
    gold: "bg-gradient-to-l from-salon-gold to-[#8f6c39]",
    success: "bg-salon-forest",
    danger: "bg-salon-ruby",
  }[tone];

  const valueTone = {
    neutral: "text-salon-ink",
    gold: "text-salon-ink",
    success: "text-salon-forest",
    danger: "text-salon-ruby",
  }[tone];

  return (
    <Card
      className={`lux-hover relative overflow-hidden p-4 ${tone === "gold" ? "ring-1 ring-inset ring-salon-gold/25" : ""}`}
      title={hint}
    >
      <span className={`absolute inset-y-0 right-0 w-[3px] ${accent}`} aria-hidden="true" />
      <p className="pr-1 text-[12px] font-semibold leading-5 text-salon-charcoal">{label}</p>
      <p className={`lux-number mt-1.5 pr-1 text-[26px] leading-none ${isZero ? "text-salon-charcoal/35" : valueTone}`}>
        {value}
      </p>
      {subValue ? <p className="mt-2 pr-1 text-[13px] font-medium text-salon-charcoal/80">{subValue}</p> : null}
    </Card>
  );
}

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * شارة الحالة الموحّدة.
 *
 * النقطة اللونية ليست زينة: اللون وحده لا يفرّق «مؤكدة» عن «ملغاة» لمن لا يميّز
 * الأحمر عن الأخضر، والنقطة تضيف موضعًا وشكلًا يُقرآن بلا لون.
 */
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: BadgeTone }) {
  const toneClass: Record<BadgeTone, string> = {
    neutral: "bg-salon-mist/80 text-salon-charcoal ring-salon-line",
    info: "bg-salon-steel/[0.08] text-salon-steel ring-salon-steel/20",
    success: "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
    warning: "bg-amber-50 text-amber-800 ring-amber-200/70",
    danger: "bg-red-50 text-red-800 ring-red-200/70",
  };
  const dotClass: Record<BadgeTone, string> = {
    neutral: "bg-salon-charcoal/45",
    info: "bg-salon-steel",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneClass[tone]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: "info" | "warning" | "gold";
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const toneClass = {
    info: "border-salon-line bg-salon-pearl/70 text-salon-ink",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    gold: "border-salon-gold/40 bg-salon-gold/10 text-salon-ink",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3.5 ${toneClass} ${className}`}>
      <p className="text-sm font-bold">{title}</p>
      {children ? <div className="mt-1.5 text-sm font-medium leading-6 opacity-85">{children}</div> : null}
    </div>
  );
}

/**
 * حالة فارغة داخل لوح أو قائمة.
 *
 * كانت تُكتب في كل مكوّن بشكل مختلف — سطر رمادي عارٍ هنا، ونص وسط جدول هناك.
 * السطر العاري يبدو كأن الصفحة لم تُحمّل؛ الصندوق المنقّط يقول «هنا مكان محتوى
 * لم يوجد بعد»، والسطر الثاني يخبر المستخدم بما يفعله.
 */
export function InlineEmpty({
  title,
  hint,
  icon,
  className = "",
}: {
  title: string;
  hint?: string;
  icon?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-dashed border-salon-line bg-salon-pearl/50 px-5 py-9 text-center ${className}`}>
      {icon ? (
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-white text-xl shadow-sm" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-bold text-salon-ink">{title}</p>
      {hint ? <p className="dashboard-muted mx-auto mt-1.5 max-w-sm text-sm">{hint}</p> : null}
    </div>
  );
}

/**
 * حالة فراغ هادئة: الحدّ المنقّط الذهبي العريض كان يصرخ في شاشة لا شيء فيها.
 * الآن سطح لؤلؤي خفيف بعلامة ذهبية صغيرة — يقول «لا يوجد» لا «انتبه».
 */
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="dashboard-soft-panel px-5 py-12 text-center">
      <span
        className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full border border-salon-gold/25 bg-salon-gold/[0.08]"
        aria-hidden="true"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-salon-gold/70" />
      </span>
      <p className="lux-section-title">{title}</p>
      {description ? <p className="dashboard-muted mx-auto mt-2 max-w-xl">{description}</p> : null}
    </div>
  );
}

export function FilterBar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // `print:hidden` هنا لا في كل صفحة: شريط التصفية أداةُ اختيارٍ لا نتيجة، وورقة
  // مطبوعة فيها قوائم منسدلة فارغة تبدو نموذجًا لم يُملأ.
  return <form className={`dashboard-panel mt-6 grid items-end gap-3 p-4 print:hidden ${className}`}>{children}</form>;
}

/**
 * ترويسة الورقة المطبوعة.
 *
 * الشريط الجانبي وشريط التصفية يختفيان عند الطباعة، فبدون هذا السطر تخرج ورقة
 * أرقام لا تقول عن أي فترة ولا أي نطاق هي — وورقةٌ كهذه لا تصلح لملف ولا لاجتماع.
 */
export function ReportPrintMeta({ period, scope, printedAt }: { period: string; scope?: string; printedAt?: string }) {
  return (
    <div className="mt-4 hidden text-sm font-semibold text-salon-charcoal print:block">
      <p>الفترة: {period}</p>
      {scope ? <p>النطاق: {scope}</p> : null}
      {printedAt ? <p>تاريخ الطباعة: {printedAt}</p> : null}
    </div>
  );
}

/**
 * حقل مُعنون داخل شريط التصفية.
 * حقول التاريخ الأصلية تعرض نائبًا عربيًا مشوّهًا في Chrome، فالتسمية فوق الحقل
 * هي ما يخبر المستخدم بالمقصود — لا النائب.
 */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

/**
 * لوح جدول قابل للسحب أفقيًا.
 *
 * جداول اللوحة أعرض من شاشة الجوال بطبيعتها، فبدل قصّ الأعمدة نجعل السحب مرئيًا:
 * تلاشٍ عند الحافة اليسرى يشير إلى وجود تكملة، ويختفي على الشاشات الواسعة.
 */
export function TableScroller({
  children,
  label = "جدول البيانات",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <>
      <p className="table-scroll-hint print:hidden xl:hidden" aria-hidden="true">
        مرّر أفقيًا لعرض بقية الأعمدة
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label={`${label} — قابل للتمرير أفقيًا`}
        tabIndex={0}
      >
        {children}
      </div>
    </>
  );
}

export function TablePanel({
  children,
  className = "",
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={`dashboard-panel table-scroll-wrap mt-6 overflow-hidden p-0 ${className}`}>
      <TableScroller label={label}>{children}</TableScroller>
    </div>
  );
}

export function SectionPanel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`dashboard-panel mt-6 overflow-hidden ${className}`}>
      {/* شريط الترويسة بتدرّج لؤلؤي: يفصل العنوان عن المحتوى بمستوى بصري لا بمسافة. */}
      <div className="flex items-center gap-2.5 border-b border-salon-line/70 bg-gradient-to-b from-[#fbfaf6] to-[#f6f3ec] px-5 py-4">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-salon-gold to-[#8f6c39]" aria-hidden="true" />
        <h2 className="lux-section-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}
