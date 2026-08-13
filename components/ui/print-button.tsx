"use client";

/**
 * زر الطباعة الوحيد في المشروع — الإيصال، الفاتورة، ملصق الولاء، وتقارير اللوحة.
 * الطباعة تعتمد على قواعد `@media print` في `globals.css` لا على صفحة منفصلة،
 * ولذلك يحمل الزر `print:hidden` بنفسه: لا يوجد سياق تُطبع فيه أداة الطباعة.
 */
export function PrintButton({ label = "طباعة الإيصال", className = "" }: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`dashboard-button px-4 py-2 text-sm print:hidden ${className}`}
    >
      {label}
    </button>
  );
}
