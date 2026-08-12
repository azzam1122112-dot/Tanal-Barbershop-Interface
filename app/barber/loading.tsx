import { Skeleton } from "@/components/skeleton";

export default function BarberLoading() {
  return (
    // الهيكل يرسم تبويب «العمل» وحده: هو ما سيظهر فعلًا عند اكتمال التحميل،
    // ورسم عمودين ثم الانتقال إلى عمود بتبويبات قفزةٌ تحت عين المنتظر.
    <main className="barber-shell">
      <section className="barber-container is-app">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-5 w-36" />
            </div>
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
        <div className="flex gap-2 pb-3">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>

        <div className="mt-4 space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="barber-card p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-16 w-full" />
            <Skeleton className="mt-3 h-14 w-full" />
          </div>
          <div className="barber-card p-4">
            <Skeleton className="h-10 w-40" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
