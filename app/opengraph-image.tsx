import { ImageResponse } from "next/og";

export const alt = "XMANSX — منصة تشغيل صالونات الحلاقة الرجالية";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * صورة معاينة الرابط (واتساب، تويتر، لينكدإن).
 *
 * نصّها لاتيني عمدًا: `ImageResponse` يرسم بخط النظام الافتراضي، وهو لا يحمل
 * محارف عربية، فأي نص عربي هنا يخرج مربعات فارغة. العنوان والوصف العربيان
 * يظهران بجانب الصورة من وسوم `metadata` أصلًا.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #09070f 0%, #1a1030 52%, #08060d 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "76px",
              height: "76px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
              fontSize: "38px",
              fontWeight: 700,
            }}
          >
            X
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "38px", fontWeight: 700, letterSpacing: "6px" }}>XMANSX</div>
            <div style={{ fontSize: "17px", letterSpacing: "8px", color: "#c4b5fd", marginTop: "6px" }}>
              SOFTWARE SERVICE
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "78px", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-2px" }}>
            The operating system
          </div>
          <div
            style={{
              fontSize: "78px",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-2px",
              color: "#c4b5fd",
            }}
          >
            for barbershops.
          </div>
          <div style={{ fontSize: "30px", color: "#94a3b8", marginTop: "26px" }}>
            Cash sessions · Commissions · Receipts · Loyalty
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 28px",
              borderRadius: "999px",
              border: "1px solid rgba(196,181,253,.35)",
              background: "rgba(139,92,246,.14)",
              fontSize: "26px",
              fontWeight: 700,
              color: "#ddd6fe",
            }}
          >
            14 days free — no card required
          </div>
          <div style={{ display: "flex", fontSize: "24px", color: "#64748b", letterSpacing: "2px" }}>AR · RTL</div>
        </div>
      </div>
    ),
    size,
  );
}
