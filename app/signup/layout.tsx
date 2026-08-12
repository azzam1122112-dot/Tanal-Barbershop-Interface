import type { Metadata } from "next";
import type { ReactNode } from "react";
import { publicPageMetadata } from "@/lib/seo";

/**
 * صفحة البدء مكوّن عميل (`"use client"`) فلا تستطيع تصدير `metadata` بنفسها.
 * بقيت لذلك تحمل عنوان الموقع الافتراضي بلا وصف ولا رابط أساسي، وهي **صفحة
 * التحويل الأولى** والوجهة المعلنة في خريطة الموقع. التخطيط هو الموضع الوحيد
 * الذي يصفها فيه Next بلا تحويلها إلى مكوّن خادم.
 */
export const metadata: Metadata = publicPageMetadata({
  path: "/signup",
  title: "ابدأ تجربة مجانية لصالونك",
  description:
    "أنشئ حساب صالونك في دقيقة وابدأ التجربة المجانية بدون بطاقة بنكية: فرعك وخدماتك وحلاقوك وصندوقك وإيصالات زياراتك في نظام عربي واحد.",
  keywords: [
    "تجربة مجانية برنامج صالون",
    "إنشاء حساب صالون حلاقة",
    "اشتراك برنامج صالونات",
  ],
});

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
