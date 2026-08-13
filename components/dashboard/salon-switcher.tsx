"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { handOffNotice } from "@/lib/ui/handoff-notice";
import { safeFetch } from "@/lib/http/safe-fetch";

type SalonOption = { id: string; name: string };

export function SalonSwitcher({
  salons,
  activeSalonId,
  allLabel = "كل الفروع",
}: {
  salons: SalonOption[];
  activeSalonId: string | null;
  /** نص خيار العرض المجمّع: «كل الفروع» للمالك/المدير، «كل فروعي» للمشرف. */
  allLabel?: string;
}) {
  const [pending, setPending] = useState(false);
  // الفشل كان يُطفئ `pending` ويصمت: يختار المدير فرعًا، ترتدّ القائمة إلى
  // الفرع السابق بلا كلمة، فيظنّ أنه يقرأ أرقام فرع وهو يقرأ أرقام آخر.
  const [error, setError] = useState("");

  if (salons.length === 0) return null;

  // صالون واحد فقط: نعرضه كتسمية ثابتة دون مبدّل.
  if (salons.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-white/80">
        <Icon name="home" className="h-4 w-4 text-salon-goldlight" />
        <span className="truncate">{salons[0].name}</span>
      </div>
    );
  }

  async function switchSalon(salonId: string) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await safeFetch("/api/dashboard/salon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId: salonId || null }),
      });
      if (response.ok) {
        // التأكيد يعبر إعادة التحميل: بدونه يتبدّل النطاق بلا إعلان، وتغيّرُ
        // الأرقام وحده لا يقول أي فرع يُعرض الآن.
        const target = salons.find((salon) => salon.id === salonId);
        handOffNotice(`العرض الآن: ${target ? target.name : allLabel}`);
        window.location.reload();
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setError(data.message ?? "تعذر تبديل الفرع — لم يتغيّر العرض");
    } catch {
      setError("انقطع الاتصال — لم يتغيّر الفرع المعروض");
    }
    setPending(false);
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-eyebrow text-white/40">الصالون النشط</span>
      <select
        value={activeSalonId ?? "all"}
        disabled={pending}
        onChange={(event) => switchSalon(event.target.value === "all" ? "" : event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm font-bold text-white outline-none transition focus:border-salon-gold/50 disabled:opacity-60"
      >
        <option value="all" className="text-salon-ink">{allLabel}</option>
        {salons.map((salon) => (
          <option key={salon.id} value={salon.id} className="text-salon-ink">
            {salon.name}
          </option>
        ))}
      </select>
      {error ? (
        <span role="alert" className="mt-1.5 block rounded-lg bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-200">
          {error}
        </span>
      ) : null}
    </label>
  );
}
