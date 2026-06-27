"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

type LinkItem = { key: string; label: string; href: string };

function CopyRow({ label, href, display }: { label: string; href: string; display: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // المتصفح منع النسخ — يمكن للمستخدم تحديد الرابط يدويًا.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-salon-line/70 bg-salon-pearl/70 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-salon-charcoal">{label}</p>
        <p className="mt-0.5 truncate text-xs font-medium text-salon-charcoal/70" dir="ltr">{display}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-salon-line bg-white px-3 py-2 text-xs font-bold text-salon-ink transition-colors hover:border-salon-gold/60"
      >
        <Icon name={copied ? "check" : "services"} className="h-4 w-4" />
        {copied ? "تم النسخ" : "نسخ"}
      </button>
    </div>
  );
}

export function TeamLoginLinks({ slug }: { slug: string }) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const paths: LinkItem[] = [
    { key: "dashboard", label: "رابط دخول الإدارة (مدراء/مشرفون)", href: `/dashboard/login?org=${slug}` },
    { key: "barber", label: "رابط دخول الحلاقين", href: `/barber/login?org=${slug}` },
  ];

  return (
    <section className="dashboard-panel relative mt-6 overflow-hidden p-5">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-gold-sheen" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">روابط دخول فريقك</h2>
          <p className="dashboard-muted mt-1">
            شارك هذه الروابط مع فريقك للدخول مباشرة إلى مؤسستك. معرّف مؤسستك:{" "}
            <span className="font-bold text-salon-gold" dir="ltr">{slug}</span>
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {paths.map((link) => (
          <CopyRow
            key={link.key}
            label={link.label}
            href={`${origin}${link.href}`}
            display={origin ? `${origin}${link.href}` : link.href}
          />
        ))}
      </div>
      <p className="mt-3 text-xs font-medium text-salon-charcoal/60">
        إن فعّلت نطاقك الفرعي لاحقًا، يدخل فريقك من <span dir="ltr">{slug}.tanal.com</span> ويترك حقل المعرّف فارغًا.
      </p>
    </section>
  );
}
