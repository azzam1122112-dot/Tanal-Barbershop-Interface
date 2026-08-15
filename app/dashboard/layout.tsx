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

/**
 * تخطيط مرور فقط: يحمل توجيه «لا تُفهرس» لكل ما تحت `‎/dashboard` بما فيها
 * صفحة الدخول الواقعة خارج مجموعة `(shell)`.
 *
 * **لا تضع فيه أي استعلام أو قراءة جلسة** — هيكل اللوحة كله في
 * `app/dashboard/(shell)/layout.tsx` عمدًا، وأي عمل هنا يُنفَّذ لصفحة الدخول
 * التي لا جلسة لها أصلًا.
 *
 * `robots.txt` يمنع الزحف، وهذا الوسم يمنع بقاء الرابط في الفهرس لو وصل
 * الزاحف من رابط خارجي قبل قراءة `robots.txt`.
 */
export const metadata: Metadata = { robots: PRIVATE_ROBOTS };

export default function DashboardSegmentLayout({ children }: { children: ReactNode }) {
  return children;
}
