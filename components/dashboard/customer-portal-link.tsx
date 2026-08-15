"use client";

import { useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { buildCustomerPortalShareMessage } from "@/lib/customers/portal-share";
import { safeFetch } from "@/lib/http/safe-fetch";
import { toSaudiWhatsAppPhone } from "@/lib/phone/saudi-phone";
/**
 * زر يولّد رابط بوابة العميل ويجهّز رسالة واتساب جاهزة للإرسال يدويًا.
 * لا إرسال تلقائي — النظام يفتح wa.me فقط، كما هي سياسة الواتساب في المشروع.
 */
export function CustomerPortalLink({
  customerId,
  customerName,
  customerPhone,
}: {
  customerId: string;
  customerName: string;
  customerPhone: string;
}) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  /**
   * الإصدار يُبطل الرابط السابق دائمًا — القاعدة تحفظ التجزئة وحدها فلا يُعرض
   * رمزٌ قائم مرة ثانية. لذلك: `POST` يرفض (409) متى كان بيد العميل رابط سارٍ،
   * ولا نمضي إلى `PUT` إلا بتأكيد صريح. كان الزر مكتوبًا عليه «نسخ الرابط
   * مجددًا» وكل ضغطة تقتل الرابط المفتوح على جهاز العميل بلا أن يعلم أحد.
   */
  async function buildLink() {
    setLoading(true);
    setToast(null);
    try {
      const response = await safeFetch(`/api/dashboard/customers/${customerId}/portal-link`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        path?: string;
        message?: string;
        hasLiveLink?: boolean;
      };

      if (response.ok && data.path) {
        await applyLink(data.path);
        return;
      }

      if (response.status === 409 && data.hasLiveLink) {
        const accepted = await confirm({
          title: "لهذا العميل رابط سارٍ",
          description:
            "الرابط القائم لا يمكن عرضه مجددًا. إصدار رابط جديد يُبطل الرابط الذي بيد العميل فورًا، فلن يعمل إن كان محفوظًا على جهازه.",
          confirmLabel: "أصدر رابطًا جديدًا",
          cancelLabel: "تراجع",
          tone: "danger",
        });
        if (!accepted) return;

        const rotated = await safeFetch(`/api/dashboard/customers/${customerId}/portal-link`, { method: "PUT" });
        const rotatedData = (await rotated.json().catch(() => ({}))) as { path?: string; message?: string };
        if (rotated.ok && rotatedData.path) {
          await applyLink(rotatedData.path, "أُصدر رابط جديد وأُبطل السابق");
        } else {
          setToast({ message: rotatedData.message ?? "تعذر إصدار رابط جديد", tone: "error" });
        }
        return;
      }

      setToast({ message: data.message ?? "تعذر إنشاء الرابط", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function applyLink(path: string, message = "تم نسخ الرابط") {
    const url = `${window.location.origin}${path}`;
    setLink(url);
    await copyLink(url, message);
  }

  async function copyLink(url: string, message = "تم نسخ الرابط") {
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setToast({ message, tone: "success" });
  }

  // `toSaudiWhatsAppPhone` لا `replace(/\D/g, "")`: الأخير يترك «0501234567»
  // كما هو فيفتح wa.me رقمًا بلا مفتاح دولة ولا يصل أحدًا. والرسالة من
  // `buildCustomerPortalShareMessage` — النص المحلي كان يسلّم مفتاح صفحة العميل
  // بلا أي تحذير من مشاركته.
  const waHref = link
    ? `https://wa.me/${toSaudiWhatsAppPhone(customerPhone)}?text=${encodeURIComponent(
        buildCustomerPortalShareMessage({ customerName, portalUrl: link }),
      )}`
    : null;

  return (
    <div className="grid gap-2">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      {confirmDialog}
      {/*
        الرابط المعروض في هذه الجلسة يُنسخ من الحالة لا بنداء جديد: النداء
        يُصدر رمزًا يُبطل ما قبله، فنسخُ ما هو أمامك لا يجوز أن يقتله.
      */}
      <button
        type="button"
        onClick={() => (link ? void copyLink(link) : void buildLink())}
        disabled={loading}
        className="dashboard-button-soft px-3 py-2 text-xs"
      >
        {loading ? "..." : link ? "انسخ الرابط" : "رابط نقاط العميل"}
      </button>
      {link ? (
        <button
          type="button"
          onClick={() => void buildLink()}
          disabled={loading}
          className="px-3 py-1 text-[11px] font-bold text-salon-charcoal/60 underline decoration-dotted underline-offset-4 transition hover:text-salon-ink disabled:opacity-55"
        >
          إصدار رابط جديد (يُبطل الحالي)
        </button>
      ) : null}
      {waHref ? (
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="dashboard-button px-3 py-2 text-center text-xs">
          إرسال عبر واتساب
        </a>
      ) : null}
    </div>
  );
}
