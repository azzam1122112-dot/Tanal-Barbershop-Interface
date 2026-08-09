"use client";

export function PrintButton({ label = "طباعة الإيصال" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="dashboard-button px-4 py-2 text-sm">
      {label}
    </button>
  );
}
