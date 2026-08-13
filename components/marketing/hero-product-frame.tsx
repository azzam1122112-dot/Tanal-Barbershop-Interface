import Image from "next/image";
import landing from "./landing-page.module.css";

/**
 * مسرح الواجهة البطولية: **صورة واحدة**.
 *
 * كان هنا عارضٌ يدوّر ثلاث لقطات كل ٥٫٢ ثانية بأزرار تبويب. مشكلتاه:
 *
 * 1. **التدوير يسرق الانتباه ولا يمنح معلومة.** الزائر يقرأ الجملة فتتحرّك
 *    الصورة تحت عينه، ولا أحد ينتظر اللقطة الثالثة. الحركة التلقائية تُقاطع
 *    القراءة بدل أن تخدمها.
 * 2. **التقسيم (نص · صورة) هو القالب الافتراضي** لكل صفحة هبوط تُبنى اليوم،
 *    فيقرأه الزائر كقالب لا كمنتج.
 *
 * صورة واحدة ثابتة تحتها الجملة: يرى المنتج أولًا، ثم تأتي الجملة تعليقًا على
 * ما رآه — إثبات قبل وعد. وهذه نسخة **خادم** بلا `"use client"`: لا مؤقّت ولا
 * حالة ولا أي JS يصل المتصفح من أجل الواجهة البطولية.
 */
export function HeroProductFrame() {
  return (
    <div className={landing.productShowcase}>
      <div className={landing.productAura} aria-hidden="true" />
      <div className={landing.productWindow}>
        <div className={landing.productWindowBar}>
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-violet-300/70" />
            <span className="h-2 w-2 rounded-full bg-white/25" />
            <span className="h-2 w-2 rounded-full bg-white/15" />
          </div>
        </div>

        <div className={landing.productViewport}>
          <Image
            src="/marketing/platform-dashboard.png"
            alt="مركز إدارة المؤسسة في منصة إكس مانس إكس XMANSX — تنبيهات التشغيل ومؤشرات اليوم في شاشة واحدة"
            fill
            priority
            sizes="(min-width: 1024px) 62rem, 94vw"
            className={landing.productImage}
            draggable={false}
          />
          <div className={landing.productShade} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
