import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRIVATE_ROBOTS } from "@/lib/seo";

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
