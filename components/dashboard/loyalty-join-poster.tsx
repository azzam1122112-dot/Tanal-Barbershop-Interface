"use client";

import { useState } from "react";
import { PrintButton } from "@/components/ui/print-button";

/**
 * ملصق التسجيل الذاتي: رابط + رمز QR يُطبع ويُعلَّق في الصالون
 * فيسجّل العميل نفسه في برنامج الولاء بلا انتظار الحلاق.
 */
export function LoyaltyJoinPoster({
  joinPath,
  qrSvg,
  brandName,
}: {
  joinPath: string;
  qrSvg: string;
  brandName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard?.writeText(`${window.location.origin}${joinPath}`).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="grid gap-5 p-5 lg:grid-cols-[220px_1fr] lg:items-start">
      <div className="join-poster mx-auto w-full max-w-[220px] rounded-2xl border border-salon-line bg-white p-4 text-center">
        <p className="text-xs font-bold text-salon-charcoal/70">امسح للانضمام</p>
        <div
          className="join-poster-qr mx-auto mt-3 h-[180px] w-[180px]"
          // الرمز مبني على الخادم من رابط ثابت — بلا مدخلات مستخدم.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <p className="mt-3 text-sm font-bold">{brandName}</p>
        <p className="mt-1 text-[11px] font-bold text-salon-charcoal/70">برنامج الولاء</p>
      </div>

      <div className="min-w-0">
        <p className="dashboard-muted text-sm leading-7">
          اطبع الرمز وضعه على المرآة أو الكاونتر. العميل يمسحه بكاميرا جواله فيسجّل نفسه ويحصل على صفحة نقاطه فورًا —
          دون أن يشغل وقت الحلاق.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code dir="ltr" className="min-w-0 flex-1 truncate rounded-xl border border-salon-line bg-salon-pearl px-3 py-2.5 text-sm font-semibold">
            {joinPath}
          </code>
          <button type="button" onClick={() => void copyLink()} className="dashboard-button-soft px-4 py-2.5 text-sm">
            {copied ? "تم النسخ" : "نسخ الرابط"}
          </button>
          <a href={joinPath} target="_blank" rel="noopener noreferrer" className="dashboard-button-soft px-4 py-2.5 text-sm">
            معاينة
          </a>
          <PrintButton label="طباعة الملصق" />
        </div>

        <p className="mt-4 rounded-xl border border-salon-line bg-salon-pearl/70 px-4 py-3 text-xs font-semibold leading-6 text-salon-charcoal">
          العميل المسجّل مسبقًا لن يُعاد له رابطه من النموذج العام حفاظًا على خصوصيته — يأخذه من الحلاق عند زيارته.
        </p>
      </div>
    </div>
  );
}
