"use client";

import { useEffect, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/ui/toast";
import { takeHandoffNotice } from "@/lib/ui/handoff-notice";

/**
 * يلتقط التأكيد المودَع قبل إعادة تحميل الصفحة ويعرضه إشعارًا.
 *
 * يُركَّب مرة واحدة في تخطيط كل فضاء — لا في الصفحات — فيغطّي كل ما يعيد التحميل
 * داخله بلا أن يعرف كل مكوّن أين سيهبط المستخدم. انظر `lib/ui/handoff-notice.ts`.
 */
export function NoticeRelay() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    const notice = takeHandoffNotice();
    if (notice) setToast({ message: notice.message, tone: notice.tone });
  }, []);

  return <DashboardToast toast={toast} onClose={() => setToast(null)} />;
}
