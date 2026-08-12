"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

/**
 * واجهات مفاتيح المرور.
 *
 * **لا بيانات بيومترية تمرّ من هنا.** المتصفح يتولى البصمة/الوجه/قفل الجهاز
 * ويعيد توقيعًا فقط؛ لا يصل الصفحةَ ولا الخادمَ أي قياس حيوي.
 *
 * **رسائل عربية لا أسماء أخطاء تقنية.** `NotAllowedError` تعني غالبًا أن العميل
 * أغلق النافذة — وهو إلغاء لا حادث أمني، فلا يُعامل معاملة الفشل.
 */

type Feedback = { tone: "error" | "success"; message: string } | null;

/** يحوّل خطأ WebAuthn إلى رسالة مفهومة، أو `null` إن كان إلغاءً من المستخدم. */
function describeWebAuthnError(error: unknown): string | null {
  const name = (error as { name?: string })?.name;
  // إلغاء المستخدم لنافذة الجهاز ليس فشلًا ولا حادثًا أمنيًا — لا رسالة أصلًا.
  if (name === "NotAllowedError" || name === "AbortError") return null;
  if (name === "InvalidStateError") return "هذا الجهاز مفعّل مسبقًا على حسابك.";
  if (name === "SecurityError") return "تعذر الدخول السريع على هذا العنوان.";
  // `ConstraintError` تعني غالبًا أن الجهاز لا يستوفي شرط المفتاح القابل
  // للاكتشاف أو التحقق من المستخدم. **لا نتراجع إلى إعداد أضعف بصمت** — البديل
  // الآمن موجود أصلًا وهو رمز البريد.
  if (name === "ConstraintError" || name === "NotSupportedError") {
    return "تعذر تفعيل الدخول السريع على هذا الجهاز. يمكنك الدخول برمز يصل بريدك.";
  }
  return "تعذر استخدام الدخول السريع. يمكنك المحاولة مرة أخرى أو الدخول برمز يصل بريدك.";
}

function Alert({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const tone = feedback.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <p role="status" aria-live="polite" className={`rounded-xl border px-3.5 py-3 text-sm font-semibold ${tone}`}>
      {feedback.message}
    </p>
  );
}

/** يخفي أزرار مفاتيح المرور تمامًا على متصفح لا يدعمها بدل عرض زر مكسور. */
function useWebAuthnSupport() {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);
  return supported;
}

export function PasskeyLoginButton({ join }: { join?: string | null }) {
  const router = useRouter();
  const supported = useWebAuthnSupport();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  if (supported === false) return null;

  async function signIn() {
    setLoading(true);
    setFeedback(null);
    try {
      const optionsResponse = await fetch("/api/account/passkeys/authenticate/options", { method: "POST" });
      if (!optionsResponse.ok) throw new Error("options");
      const options = await optionsResponse.json();

      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyResponse = await fetch("/api/account/passkeys/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: assertion, join: join ?? undefined }),
      });
      const data = (await verifyResponse.json().catch(() => ({}))) as { message?: string; redirectTo?: string };

      if (!verifyResponse.ok) {
        setFeedback({ tone: "error", message: data.message ?? "تعذر الدخول السريع." });
        return;
      }
      router.push(data.redirectTo ?? "/account/loyalty");
      router.refresh();
    } catch (error) {
      const message = describeWebAuthnError(error);
      if (message) setFeedback({ tone: "error", message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={signIn}
        disabled={loading || supported === null}
        className="w-full rounded-xl bg-salon-ink px-4 py-3.5 text-base font-bold text-white transition hover:bg-salon-charcoal disabled:opacity-60"
      >
        {loading ? "جارٍ التحقق…" : "الدخول بالبصمة أو Face ID أو قفل الجهاز"}
      </button>
      <Alert feedback={feedback} />
    </div>
  );
}

/** زر تفعيل مفتاح مرور — يُعرض بعد التوثيق وبعد الدخول بالرمز البريدي. */
export function PasskeyEnrollButton({
  label = "تفعيل الدخول السريع",
  onDone,
}: {
  label?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const supported = useWebAuthnSupport();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  if (supported === false) return null;

  async function enroll() {
    setLoading(true);
    setFeedback(null);
    try {
      const optionsResponse = await fetch("/api/account/passkeys/register/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) {
        setFeedback({ tone: "error", message: (options as { message?: string }).message ?? "تعذر تفعيل الدخول السريع." });
        return;
      }

      const attestation = await startRegistration({ optionsJSON: options });

      const verifyResponse = await fetch("/api/account/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: attestation }),
      });
      const data = (await verifyResponse.json().catch(() => ({}))) as { message?: string };

      if (!verifyResponse.ok) {
        setFeedback({ tone: "error", message: data.message ?? "تعذر تفعيل الدخول السريع." });
        return;
      }
      setFeedback({ tone: "success", message: data.message ?? "تم التفعيل." });
      onDone?.();
      router.refresh();
    } catch (error) {
      const message = describeWebAuthnError(error);
      if (message) setFeedback({ tone: "error", message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={enroll}
        disabled={loading || supported === null}
        className="w-full rounded-xl bg-salon-ink px-4 py-3.5 text-base font-bold text-white transition hover:bg-salon-charcoal disabled:opacity-60"
      >
        {loading ? "جارٍ التفعيل…" : label}
      </button>
      <Alert feedback={feedback} />
    </div>
  );
}

/** دعوة غير إجبارية تظهر بعد التوثيق أو بعد الدخول بالرمز. */
export function PasskeyPrompt({ continueHref }: { continueHref: string }) {
  const supported = useWebAuthnSupport();
  const [dismissed, setDismissed] = useState(false);

  if (supported === false || dismissed) return null;

  return (
    <section className="barber-card p-5">
      <h2 className="text-base font-bold text-salon-ink">فعّل الدخول السريع</h2>
      <p className="mt-2 text-sm font-medium leading-7 text-salon-charcoal/70">
        استخدم بصمتك أو Face ID أو Windows Hello أو رمز قفل جهازك للدخول بسرعة وأمان. لا يصل أيٌّ منها إلينا — جهازك يتحقق منك ويرسل توقيعًا فقط.
      </p>
      <div className="mt-4 space-y-2.5">
        <PasskeyEnrollButton />
        <Link
          href={continueHref}
          onClick={() => setDismissed(true)}
          className="block w-full rounded-xl border border-salon-line px-4 py-3 text-center text-sm font-bold text-salon-ink transition hover:border-salon-gold"
        >
          ليس الآن
        </Link>
      </div>
    </section>
  );
}

/** إدارة طرق الدخول داخل صفحة الحساب. */
export function PasskeyManager({
  passkeys,
}: {
  passkeys: Array<{ id: string; name: string | null; deviceType: string | null; lastUsedAt: string | null; createdAt: string }>;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function revoke(id: string) {
    setBusyId(id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/account/passkeys/${id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setFeedback({ tone: response.ok ? "success" : "error", message: data.message ?? "تعذر الإلغاء" });
      if (response.ok) router.refresh();
    } catch {
      setFeedback({ tone: "error", message: "تعذر الاتصال بالخادم" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="barber-card p-5">
      <h2 className="text-base font-bold text-salon-ink">طرق الدخول</h2>

      {passkeys.length === 0 ? (
        <p className="mt-2 text-sm font-medium leading-7 text-salon-charcoal/70">
          لا توجد مفاتيح دخول سريع على حسابك. يمكنك الدخول دائمًا برمز يصل بريدك.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center justify-between gap-3 rounded-xl bg-salon-mist/60 px-3.5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-salon-ink">{passkey.name ?? "مفتاح دخول"}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-salon-charcoal/55">
                  {passkey.lastUsedAt ? "آخر استخدام: مسجَّل" : "لم يُستخدم بعد"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(passkey.id)}
                disabled={busyId === passkey.id}
                className="shrink-0 rounded-xl border border-salon-line px-3 py-2 text-xs font-bold text-salon-ruby transition hover:border-salon-ruby disabled:opacity-60"
              >
                {busyId === passkey.id ? "…" : "إلغاء"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-3">
        <PasskeyEnrollButton label="إضافة طريقة دخول" />
        <Alert feedback={feedback} />
        <p className="text-xs font-medium leading-6 text-salon-charcoal/55">
          يمكنك إلغاء كل المفاتيح بأمان — رمز البريد يبقى طريقك للدخول دائمًا.
        </p>
      </div>
    </section>
  );
}
