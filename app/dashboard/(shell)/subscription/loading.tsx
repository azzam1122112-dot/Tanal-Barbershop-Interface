import { Skeleton } from "@/components/skeleton";

/** معاينة فورية لشكل صفحة الاشتراك أثناء جلب الباقات والفواتير. */
export default function SubscriptionLoading() {
  return (
    <div aria-busy="true" aria-label="جاري تحميل تفاصيل الاشتراك">
      <section className="dashboard-panel lux-edge px-5 py-6 lg:px-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-9 w-48" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="dashboard-panel p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>

      <section className="dashboard-panel mt-6 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-3 w-full max-w-md" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-56 w-full rounded-3xl" />)}
        </div>
      </section>
    </div>
  );
}
