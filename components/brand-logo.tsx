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
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#09070f] ${className}`}>
      <Image
        src="/brand/xmansx-mark.png"
        alt="شعار مؤسسة إكس مانس إكس XMANSX"
        width={1254}
        height={1254}
        className={`h-full w-full object-contain p-[6%] ${imageClassName}`}
        priority={priority}
        sizes="(max-width: 768px) 80px, 120px"
      />
    </span>
  );
}
