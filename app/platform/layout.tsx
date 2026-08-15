import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRIVATE_ROBOTS } from "@/lib/seo";

/**
 * كل مسار داخل `middleware.ts` يُصيَّر عند الطلب.
 *
 * السياسة هناك تحمل `nonce` جديدًا لكل طلب، وصفحةٌ مبنية وقت `next build` تحمل
 * سكربتات Next بلا توقيع فيحجبها المتصفح وتُشلّ الصفحة. التوجيه في **التخطيط**
 * لا في الصفحات: مكوّنات العميل لا تُحترم فيها إعدادات المقطع، وصفحةٌ جديدة
 * تُضاف لاحقًا ترث الحكم بلا أن يتذكّره أحد. ولا كلفة — هذه المسارات تُقدَّم
 * أصلًا بـ`Cache-Control: private, no-store`.
 *
 * يحرسه `tests/security-regressions.test.ts`.
 */
export const dynamic = "force-dynamic";

/** لوحة مشغّل المنصّة — خاصة بالكامل ولا تُفهرس. تخطيط مرور بلا أي استعلام. */
export const metadata: Metadata = { robots: PRIVATE_ROBOTS };

export default function PlatformSegmentLayout({ children }: { children: ReactNode }) {
  return children;
}
