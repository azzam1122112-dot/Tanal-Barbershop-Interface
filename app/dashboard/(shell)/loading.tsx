import { CardGridSkeleton, Skeleton } from "@/components/skeleton";

/**
 * هيكل تحميل لمنطقة المحتوى فقط.
 *
 * الشريط الجانبي وشريط الجوال في التخطيط أعلى هذا الحد، فيبقيان ظاهرين وقابلين
 * للنقر أثناء انتقال الصفحة — كان الهيكل السابق يرسمهما وهميين فيختفي التنقّل
 * ويبدو الضغط على الروابط بلا أثر.
 */
export default function DashboardLoading() {
  return (
    <>
      <div className="dashboard-panel flex flex-col gap-3 px-5 py-5 lg:px-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="mt-6">
        <CardGridSkeleton count={10} />
      </div>
      <div className="dashboard-panel mt-6 p-5">
        <Skeleton className="h-5 w-40" />
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </>
  );
}
