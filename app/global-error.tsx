"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "Tahoma, Arial, sans-serif",
          background: "#0b1310",
          color: "#fff",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <p style={{ fontSize: 12, letterSpacing: "0.18em", color: "#c9a86a", fontWeight: 700 }}>واجهة تنال</p>
          <h1 style={{ marginTop: 12, fontSize: 24 }}>تعذّر تحميل النظام</h1>
          <p style={{ marginTop: 12, lineHeight: 1.8, color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
            حدث خطأ غير متوقع. أعد المحاولة، وإذا استمر الأمر حدّث الصفحة.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "12px 24px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(180deg,#c19a55,#8f6c39)",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
