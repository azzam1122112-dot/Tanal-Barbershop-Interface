"use client";

import { useState } from "react";

export function LogoutButton({ className = "" }: { className?: string }) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    const response = await fetch("/api/auth/logout", { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { redirectTo?: string };
    window.location.href = data.redirectTo ?? "/dashboard/login";
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className={`rounded-md border border-salon-line px-4 py-2 text-sm font-semibold text-salon-charcoal transition hover:border-salon-gold disabled:opacity-60 ${className}`}
    >
      {loading ? "جاري الخروج..." : "تسجيل الخروج"}
    </button>
  );
}
