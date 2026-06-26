"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

type SalonOption = { id: string; name: string };

export function SalonSwitcher({ salons, activeSalonId }: { salons: SalonOption[]; activeSalonId: string | null }) {
  const [pending, setPending] = useState(false);

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
    if (!salonId || pending) return;
    setPending(true);
    const response = await fetch("/api/dashboard/salon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salonId }),
    });
    if (response.ok) {
      window.location.reload();
      return;
    }
    setPending(false);
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-eyebrow text-white/40">الصالون النشط</span>
      <select
        value={activeSalonId ?? ""}
        disabled={pending}
        onChange={(event) => switchSalon(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm font-bold text-white outline-none transition focus:border-salon-gold/50 disabled:opacity-60"
      >
        {activeSalonId ? null : <option value="">اختر صالونًا</option>}
        {salons.map((salon) => (
          <option key={salon.id} value={salon.id} className="text-salon-ink">
            {salon.name}
          </option>
        ))}
      </select>
    </label>
  );
}
