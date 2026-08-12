import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRIVATE_ROBOTS } from "@/lib/seo";

/**
 * الإيصال يحمل اسم زبون ومبلغًا ورقمًا متسلسلًا. `noindex, nofollow, noarchive`
 * يمنع أيضًا بقاء نسخة مخبّأة منه لدى المحرك بعد حذف الزيارة.
 */
export const metadata: Metadata = { robots: PRIVATE_ROBOTS };

export default function ReceiptSegmentLayout({ children }: { children: ReactNode }) {
  return children;
}
