import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRIVATE_ROBOTS } from "@/lib/seo";

/** لوحة مشغّل المنصّة — خاصة بالكامل ولا تُفهرس. تخطيط مرور بلا أي استعلام. */
export const metadata: Metadata = { robots: PRIVATE_ROBOTS };

export default function PlatformSegmentLayout({ children }: { children: ReactNode }) {
  return children;
}
