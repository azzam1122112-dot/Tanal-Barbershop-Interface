"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import landing from "./landing-page.module.css";

const productScreens: Array<{
  src: string;
  label: string;
  title: string;
  description: string;
  icon: IconName;
}> = [
  {
    src: "/marketing/platform-dashboard.png",
    label: "مركز المتابعة",
    title: "ما يحتاج انتباهك الآن",
    description: "تنبيهات التشغيل ومؤشرات اليوم واختصارات الإدارة في شاشة واحدة.",
    icon: "home",
  },
  {
    src: "/marketing/platform-visits.png",
    label: "سجل الزيارات",
    title: "كل زيارة لها أثر واضح",
    description: "الخدمة والحلاق والدفع والإيصال والتعديلات محفوظة في سجل واحد.",
    icon: "visits",
  },
  {
    src: "/marketing/platform-appointments.png",
    label: "المواعيد",
    title: "جدول اليوم أمام الفريق",
    description: "المواعيد والحضور والحجز الجديد مرتبطة مباشرة بالفرع والحلاق.",
    icon: "calendar",
  },
];

export function HeroProductShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % productScreens.length);
    }, 5200);

    return () => window.clearInterval(timer);
  }, [paused]);

  const current = productScreens[active];

  return (
    <div
      className={landing.productShowcase}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className={landing.productAura} aria-hidden="true" />
      <div className={landing.productWindow}>
        <div className={landing.productWindowBar}>
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-violet-300/70" />
            <span className="h-2 w-2 rounded-full bg-white/25" />
            <span className="h-2 w-2 rounded-full bg-white/15" />
          </div>

        </div>

        <div className={landing.productViewport} aria-live="off">
          {productScreens.map((screen, index) => (
            <div
              key={screen.src}
              className={`${landing.productSlide} ${index === active ? landing.productSlideActive : ""}`}
              aria-hidden={index !== active}
            >
              <Image
                src={screen.src}
                alt={index === active ? `${screen.label} — لقطة فعلية من منصة إكس مانس إكس` : ""}
                fill
                priority={index === 0}
                sizes="(min-width: 1024px) 48vw, 92vw"
                className={landing.productImage}
                draggable={false}
              />
            </div>
          ))}
          <div className={landing.productShade} aria-hidden="true" />
          <div className={landing.productCaption}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-violet-200">
              <Icon name={current.icon} className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white sm:text-base">{current.title}</p>
              <p className="mt-1 hidden text-[11px] leading-5 text-slate-300 sm:block">{current.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className={landing.productTabs} aria-label="اختر شاشة من المنصة">
        {productScreens.map((screen, index) => (
          <button
            key={screen.label}
            type="button"
            className={`${landing.productTab} ${index === active ? landing.productTabActive : ""}`}
            onClick={() => setActive(index)}
            aria-pressed={index === active}
          >
            <Icon name={screen.icon} className="h-4 w-4" aria-hidden="true" />
            <span>{screen.label}</span>
            <span className={landing.productTabProgress} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
