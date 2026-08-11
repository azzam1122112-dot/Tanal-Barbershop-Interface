"use client";

import { useEffect, useState } from "react";

/**
 * `false` أثناء عرض الخادم وحتى يكتمل ترطيب الصفحة، ثم `true`.
 *
 * **لماذا:** نماذج الدخول لا تحمل `action`، فالضغط على «دخول» قبل اكتمال
 * الترطيب يُرسلها المتصفح إرسالًا أصليًا بطريقة GET — فينتهي رقم الجوال ورمز
 * الدخول في شريط العنوان وسجلات الخادم وتاريخ المتصفح. تعطيل زر الإرسال حتى
 * الترطيب يقفل هذا الباب، ويكلّف أجزاء من الثانية على جهاز بطيء.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
