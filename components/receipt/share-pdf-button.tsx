"use client";

import { useCallback, useEffect, useState } from "react";
import { safeFetch } from "@/lib/http/safe-fetch";

export function ShareReceiptPdfButton({
  visitId,
  pdfPath = `/api/receipt/${visitId}/pdf`,
  receiptHref = `/receipt/${visitId}`,
  className = "dashboard-button-gold px-4 py-2 text-sm",
}: {
  visitId: string;
  pdfPath?: string;
  receiptHref?: string;
  className?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const preparePdf = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");

    const response = await safeFetch(pdfPath, {
      credentials: "same-origin",
      signal,
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(data.message ?? "تعذر إنشاء ملف الإيصال");
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `XMANSX-sales-receipt-${visitId}.pdf`;
    const preparedFile = new File([blob], filename, { type: "application/pdf" });
    setFile(preparedFile);
    return preparedFile;
  }, [pdfPath, visitId]);

  useEffect(() => {
    const controller = new AbortController();

    void preparePdf(controller.signal).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "تعذر تجهيز ملف الإيصال");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => controller.abort();
  }, [preparePdf]);

  async function sharePdf() {
    setMessage("");
    setLoading(true);
    try {
      // أول ضغطة تُجهّز الملف وتفتحه مباشرة؛ التدفق السابق كان يطلب من المستخدم
      // الضغط مرتين إذا فشل التجهيز الاستباقي أو كان الاتصال بطيئًا.
      const preparedFile = file ?? await preparePdf();
      if (navigator.share && navigator.canShare?.({ files: [preparedFile] })) {
        try {
          await navigator.share({
            files: [preparedFile],
            title: "إيصال المبيعات",
            text: "إيصال زيارتك من الصالون",
          });
          setMessage("تم فتح خيارات المشاركة");
        } catch (error) {
          // إغلاق المستخدم لنافذة المشاركة ليس طلبًا للتنزيل، أما منع المتصفح
          // أو نظام التشغيل لها فيجب ألا يتركه بلا إيصال.
          if (error instanceof DOMException && error.name === "AbortError") return;
          downloadBlob(preparedFile, preparedFile.name);
          setMessage("لم يفتح النظام نافذة المشاركة، لذلك نُزّل ملف PDF بدلًا منها.");
        }
      } else {
        downloadBlob(preparedFile, preparedFile.name);
        setMessage("تم تنزيل ملف PDF. يمكنك إرساله من تطبيق الملفات أو واتساب.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "تعذر مشاركة ملف الإيصال");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-center">
      <button type="button" disabled={loading} onClick={() => void sharePdf()} className={className}>
        {loading ? "جاري تجهيز PDF..." : "مشاركة الإيصال PDF"}
      </button>
      {message ? (
        <div className="mt-2 print:hidden" role="status" aria-live="polite">
          <p className="text-xs font-semibold text-salon-charcoal">{message}</p>
          {!file ? <a href={receiptHref} className="mt-1 inline-block text-xs font-bold text-violet-800 underline">فتح نسخة الطباعة</a> : null}
        </div>
      ) : null}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
