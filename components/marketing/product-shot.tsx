import Image from "next/image";
import landing from "./landing-page.module.css";

/**
 * لقطة ثانوية داخل قسم — **دليل لا زينة**.
 *
 * أخفّ من إطار الواجهة البطولية: بلا هالة ولا ميلان ولا حركة. توضع حيث يُقال
 * الادعاء الذي تُثبته، لا في معرض صور منفصل: معرضٌ في آخر الصفحة يُقرأ زينةً،
 * واللقطة تحت الجملة التي تصفها تُقرأ إثباتًا.
 *
 * مكوّن خادم — لا JS يصل المتصفح من أجل صورة ثابتة.
 */
export function ProductShot({
  src,
  alt,
  caption,
  priority = false,
}: {
  src: string;
  alt: string;
  caption: string;
  priority?: boolean;
}) {
  return (
    <figure className="m-0">
      <div className={landing.shotFrame}>
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 44rem, 92vw"
          className={landing.shotImage}
          draggable={false}
        />
      </div>
      <figcaption className="mt-3 text-center text-[11px] font-semibold leading-5 text-slate-400">
        {caption}
      </figcaption>
    </figure>
  );
}
