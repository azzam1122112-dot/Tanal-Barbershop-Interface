"use client";

/**
 * الإشعار انتقل إلى `components/ui/toast.tsx` لأنه صار مشتركًا بين الفضاءات
 * الثلاثة (حلاق/لوحة/منصّة) لا خاصًّا باللوحة. هذا الملف تصدير معاد يبقي
 * الواردات القائمة تعمل — لا نسخة ثانية من المنطق.
 */
export { DashboardToast, useToast, type ToastState, type ToastTone } from "@/components/ui/toast";
