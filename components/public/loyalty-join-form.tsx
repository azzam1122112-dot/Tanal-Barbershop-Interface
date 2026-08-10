"use client";

import { FormEvent, type SVGProps, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { buildCustomerPortalShareMessage } from "@/lib/customers/portal-share";
import { toSaudiWhatsAppPhone } from "@/lib/phone/saudi-phone";

type JoinState =
  | { kind: "idle" }
  | { kind: "created"; portalPath: string; portalUrl: string; customerName: string; phone: string }
  | { kind: "already" }
  | { kind: "error"; message: string };

function FieldIcon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function LoyaltyJoinForm({
  organizationSlug,
  brandName,
  controllerEmail,
  controllerPhone,
}: {
  organizationSlug?: string;
  brandName?: string;
  controllerEmail?: string | null;
  controllerPhone?: string | null;
}) {
  const [state, setState] = useState<JoinState>({ kind: "idle" });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setState({ kind: "idle" });
    setCopied(false);
    const form = new FormData(event.currentTarget);
    const customerName = String(form.get("name") ?? "").trim();
    const phone = String(form.get("phone") ?? "");

    try {
      const response = await fetch("/api/public/loyalty/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customerName,
          phone,
          whatsappTransactionalOptIn: form.get("whatsappTransactionalOptIn") === "on",
          whatsappMarketingOptIn: form.get("whatsappMarketingOptIn") === "on",
          privacyNoticeAcknowledged: form.get("privacyNoticeAcknowledged") === "on",
          ...(organizationSlug ? { organizationSlug } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        outcome?: string;
        portalPath?: string;
        message?: string;
      };

      if (response.ok && data.outcome === "CREATED" && data.portalPath) {
        setState({
          kind: "created",
          portalPath: data.portalPath,
          portalUrl: new URL(data.portalPath, window.location.origin).toString(),
          customerName,
          phone,
        });
      } else if (response.ok && data.outcome === "ALREADY_REGISTERED") {
        setState({ kind: "already" });
      } else {
        setState({ kind: "error", message: data.message ?? "تعذر التسجيل، حاول مرة أخرى" });
      }
    } catch {
      setState({ kind: "error", message: "تعذر الاتصال الآن. تحقق من الإنترنت وحاول مجددًا." });
    } finally {
      setLoading(false);
    }
  }

  async function copyPortalLink(portalUrl: string) {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  if (state.kind === "created") {
    const whatsappMessage = buildCustomerPortalShareMessage({
      customerName: state.customerName,
      portalUrl: state.portalUrl,
    });
    const whatsappUrl = `https://wa.me/${toSaudiWhatsAppPhone(state.phone)}?text=${encodeURIComponent(whatsappMessage)}`;

    return (
      <section className="loyalty-success relative overflow-hidden rounded-[2rem] border border-white/80 bg-white px-5 pb-5 pt-8 text-center text-salon-ink shadow-[0_35px_100px_-40px_rgba(0,0,0,0.85)] sm:px-7 sm:pb-7">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-violet-700 via-violet-400 to-fuchsia-400" />
        <div aria-hidden="true" className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-violet-100 blur-3xl" />

        <div className="relative">
          <div className="loyalty-success-mark mx-auto grid h-20 w-20 place-items-center rounded-full border-[7px] border-emerald-50 bg-emerald-500 text-white shadow-[0_16px_35px_-16px_rgba(16,185,129,0.8)]">
            <Icon name="check" className="h-9 w-9" />
          </div>
          <p className="mt-5 text-[11px] font-black tracking-[0.2em] text-emerald-600">أهلًا بك في النادي</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">بطاقتك جاهزة، {state.customerName}</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-7 text-salon-charcoal">
            احتفظ برابطك الشخصي لتتابع نقاطك ومكافآتك وحجوزاتك في أي وقت.
          </p>

          <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/75 p-4 text-right">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600 text-lg font-black text-white">!</span>
              <div>
                <h3 className="text-sm font-bold text-violet-950">احفظ الرابط الآن</h3>
                <p className="mt-1 text-xs font-medium leading-6 text-violet-900/60">
                  هذا الرابط مفتاح صفحتك الشخصية، لذلك لا تشاركه مع أي شخص.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-salon-line/70 bg-salon-mist/70 px-3.5 py-3 text-left" dir="ltr">
            <p className="truncate text-xs font-semibold text-salon-charcoal">{state.portalUrl}</p>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#128c7e] px-4 text-base font-bold text-white shadow-[0_14px_28px_-14px_rgba(18,140,126,0.8)] transition hover:-translate-y-0.5 hover:bg-[#0f796d] active:translate-y-0"
          >
            <Icon name="whatsapp" className="h-5 w-5" />
            إرسال بطاقتي إلى واتساب
          </a>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => void copyPortalLink(state.portalUrl)}
              className="min-h-12 rounded-2xl border border-salon-line bg-white px-3 text-sm font-bold text-salon-charcoal transition hover:border-violet-300 hover:bg-violet-50 active:scale-[0.99]"
            >
              {copied ? "تم النسخ ✓" : "نسخ الرابط"}
            </button>
            <a
              href={state.portalPath}
              className="flex min-h-12 items-center justify-center rounded-2xl bg-salon-ink px-3 text-sm font-bold text-white transition hover:bg-violet-950 active:scale-[0.99]"
            >
              فتح بطاقتي
            </a>
          </div>
        </div>
      </section>
    );
  }

  if (state.kind === "already") {
    return (
      <section className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white px-6 py-9 text-center text-salon-ink shadow-[0_35px_100px_-40px_rgba(0,0,0,0.85)] sm:px-8">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-violet-700 via-violet-400 to-fuchsia-400" />
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-violet-100 text-violet-700">
          <Icon name="loyalty" className="h-8 w-8" />
        </div>
        <p className="mt-5 text-[11px] font-black tracking-[0.18em] text-violet-600">عضويتك موجودة</p>
        <h2 className="mt-2 text-2xl font-bold">رقمك مسجّل لدينا</h2>
        <p className="mt-3 text-sm font-medium leading-7 text-salon-charcoal">
          أنت عضو بالفعل. اطلب رابط صفحة نقاطك من الصالون في زيارتك القادمة—نحن لا نعرضه هنا حفاظًا على خصوصيتك.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-7 min-h-[3.25rem] w-full rounded-2xl bg-salon-ink px-4 py-3.5 font-bold text-white transition hover:bg-violet-950 active:scale-[0.99]"
        >
          تسجيل رقم آخر
        </button>
      </section>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white p-5 text-salon-ink shadow-[0_35px_100px_-40px_rgba(0,0,0,0.85)] sm:p-7"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-violet-700 via-violet-400 to-fuchsia-400" />
      <div aria-hidden="true" className="absolute -left-24 -top-24 h-56 w-56 rounded-full bg-violet-100/70 blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black tracking-[0.18em] text-violet-600">عضويتك تبدأ هنا</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">انضم خلال لحظات</h2>
          </div>
          <span className="shrink-0 rounded-full border border-violet-100 bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-700">
            أقل من دقيقة
          </span>
        </div>
        <p className="mt-3 text-sm font-medium leading-7 text-salon-charcoal">
          أدخل بياناتك لإنشاء بطاقتك لدى {brandName || "الصالون"}.
        </p>

        <div className="mt-7 space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold text-salon-charcoal">الاسم الكامل</span>
            <span className="loyalty-field-wrap relative block">
              <span className="pointer-events-none absolute inset-y-0 right-0 grid w-12 place-items-center text-salon-charcoal/45 transition-colors">
                <FieldIcon className="h-5 w-5">
                  <circle cx="12" cy="8" r="3.2" />
                  <path d="M5 20a7 7 0 0 1 14 0" />
                </FieldIcon>
              </span>
              <input
                name="name"
                required
                minLength={2}
                maxLength={60}
                autoComplete="name"
                placeholder="مثال: محمد أحمد"
                className="loyalty-input"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold text-salon-charcoal">رقم الجوال</span>
            <span className="loyalty-field-wrap relative block">
              <span className="pointer-events-none absolute inset-y-0 right-0 grid w-12 place-items-center text-salon-charcoal/45 transition-colors">
                <FieldIcon className="h-5 w-5">
                  <rect x="7" y="2.5" width="10" height="19" rx="2" />
                  <path d="M10.5 5h3M11 18.5h2" />
                </FieldIcon>
              </span>
              <input
                name="phone"
                required
                inputMode="numeric"
                minLength={10}
                maxLength={10}
                pattern="05[0-9]{8}"
                autoComplete="tel"
                aria-describedby="phone-hint"
                placeholder="05xxxxxxxx"
                dir="ltr"
                onInput={(event) => {
                  event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 10);
                }}
                className="loyalty-input text-left"
              />
            </span>
            <span id="phone-hint" className="mt-1.5 block text-[10px] font-medium text-salon-charcoal/55">
              مثال: 05xxxxxxxx
            </span>
          </label>
        </div>

        <fieldset className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-xs font-bold text-salon-charcoal">تفضيلات التواصل</legend>
            <span className="text-[10px] font-semibold text-salon-charcoal/50">اختياري بالكامل</span>
          </div>
          <div className="mt-2.5 grid gap-2.5">
            <label className="loyalty-choice flex cursor-pointer items-center gap-3 rounded-2xl border border-salon-line/70 bg-salon-mist/45 px-3.5 py-3 transition">
              <input name="whatsappTransactionalOptIn" type="checkbox" className="peer sr-only" />
              <span className="loyalty-switch relative h-6 w-10 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:right-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-violet-600 peer-checked:after:-translate-x-4" />
              <span className="min-w-0 flex-1">
                <strong className="block text-xs font-bold">تحديثات الخدمة والمواعيد</strong>
                <small className="mt-0.5 block text-[10px] font-medium leading-5 text-salon-charcoal/55">تأكيد الحجز وتحديث النقاط.</small>
              </span>
              <Icon name="whatsapp" className="h-5 w-5 shrink-0 text-emerald-600" />
            </label>
            <label className="loyalty-choice flex cursor-pointer items-center gap-3 rounded-2xl border border-salon-line/70 bg-salon-mist/45 px-3.5 py-3 transition">
              <input name="whatsappMarketingOptIn" type="checkbox" className="peer sr-only" />
              <span className="loyalty-switch relative h-6 w-10 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:right-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-violet-600 peer-checked:after:-translate-x-4" />
              <span className="min-w-0 flex-1">
                <strong className="block text-xs font-bold">العروض والمكافآت</strong>
                <small className="mt-0.5 block text-[10px] font-medium leading-5 text-salon-charcoal/55">يمكنك إيقافها في أي وقت.</small>
              </span>
              <Icon name="loyalty" className="h-5 w-5 shrink-0 text-violet-600" />
            </label>
          </div>
        </fieldset>

        <section className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/75 p-4 text-xs font-semibold leading-6 text-violet-950" aria-labelledby="loyalty-privacy-title">
          <h3 id="loyalty-privacy-title" className="text-sm font-bold">إشعار الخصوصية قبل التسجيل</h3>
          <ul className="mt-2 list-disc space-y-1 pr-5">
            <li><strong>{brandName || "الصالون"}</strong> هو جهة التحكم في بيانات زبائنه، وXMANSX معالج تقني يعمل بتعليماته.</li>
            <li>الاسم والجوال إلزاميان لإنشاء العضوية وربط الزيارات والنقاط والحجوزات وخدمة طلباتك؛ تفضيلات واتساب اختيارية.</li>
            <li>المسوغ هو تنفيذ خدمة العضوية التي تطلبها، أما الرسائل التسويقية فتعتمد على موافقتك المنفصلة.</li>
            <li>تُحفظ البيانات طوال العضوية والحاجة التشغيلية. عند انتهاء علاقة الصالون بالمنصة يمكنه تصديرها، ثم تُحذف من قاعدة البيانات التشغيلية بعد مهلة 60 يومًا من عدم النشاط، وقد تبقى ضمن نسخة احتياطية معزولة مدة لا تتجاوز 30 يومًا إضافية.</li>
            <li>لك طلب الوصول والنسخة والتصحيح والحذف وسحب موافقة التواصل من بطاقتك الشخصية أو بالتواصل مع الصالون.</li>
          </ul>
          {controllerEmail || controllerPhone ? (
            <p className="mt-2">تواصل جهة التحكم: {[controllerEmail, controllerPhone].filter(Boolean).join(" · ")}</p>
          ) : null}
          <p className="mt-2">التفاصيل في <Link href="/privacy" target="_blank" className="font-bold text-violet-800 underline">سياسة الخصوصية</Link>.</p>
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-white px-3 py-2.5">
            <input name="privacyNoticeAcknowledged" type="checkbox" required className="mt-1 h-4 w-4 accent-violet-700" />
            <span>اطلعت على إشعار الخصوصية وفهمت دور الصالون وXMANSX وحقوقي.</span>
          </label>
        </section>

        {state.kind === "error" ? (
          <p role="alert" aria-live="assertive" className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700">
            {state.message}
          </p>
        ) : null}

        <button disabled={loading} className="loyalty-submit sheen-overlay mt-6 min-h-14 w-full rounded-2xl px-4 text-base font-bold text-white disabled:cursor-wait disabled:opacity-70">
          <span className="relative z-10 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" />
                جاري إنشاء بطاقتك...
              </>
            ) : (
              <>
                <Icon name="loyalty" className="h-5 w-5" />
                أنشئ بطاقتي مجانًا
              </>
            )}
          </span>
        </button>

        <p className="mt-4 flex items-start justify-center gap-1.5 text-center text-[10px] font-medium leading-5 text-salon-charcoal/60">
          <FieldIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600">
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </FieldIcon>
          موافقتك على رسائل واتساب منفصلة، ولن نفعّل أي نوع منها تلقائيًا.
        </p>
      </div>
    </form>
  );
}
