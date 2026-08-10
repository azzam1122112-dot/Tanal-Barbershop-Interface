"use client";

import { useCallback, useEffect, useState } from "react";

export function ShareReceiptPdfButton({
  visitId,
  className = "dashboard-button-gold px-4 py-2 text-sm",
}: {
  visitId: string;
  className?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const preparePdf = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");

    const response = await fetch(`/api/receipt/${visitId}/pdf`, {
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
  }, [visitId]);

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
    if (!file) {
      try {
        await preparePdf();
        setMessage("تم تجهيز الملف. اضغط مرة أخرى لفتح خيارات المشاركة.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "تعذر تجهيز ملف الإيصال");
      } finally {
        setLoading(false);
      }
      return;
    }

    setMessage("");
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "إيصال المبيعات",
          text: "إيصال زيارتك من الصالون",
        });
        setMessage("تم فتح خيارات المشاركة");
      } else {
        downloadBlob(file, file.name);
        setMessage("تم تنزيل ملف PDF. يمكنك إرساله من تطبيق الملفات أو واتساب.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "تعذر مشاركة ملف الإيصال");
    }
  }

  return (
    <div className="text-center">
      <button type="button" disabled={loading} onClick={() => void sharePdf()} className={className}>
        {loading ? "جاري تجهيز PDF..." : "مشاركة الإيصال PDF"}
      </button>
      {message ? <p className="mt-2 text-xs font-semibold text-salon-charcoal print:hidden">{message}</p> : null}
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
