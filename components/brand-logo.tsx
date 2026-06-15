import Image from "next/image";

export function BrandLogo({
  className = "",
  imageClassName = "",
  priority = false,
}: {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ${className}`}>
      <Image
        src="/brand/tanal-logo.png"
        alt="حلاق تنال للحلاقة الرجالية"
        width={512}
        height={512}
        className={`h-full w-full object-cover ${imageClassName}`}
        priority={priority}
        sizes="(max-width: 768px) 80px, 120px"
      />
    </span>
  );
}
