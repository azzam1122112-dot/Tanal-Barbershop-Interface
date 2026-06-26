import { Skeleton } from "@/components/skeleton";

export default function BarberLoading() {
  return (
    <main className="barber-shell pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <section className="barber-container">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-5 w-36" />
            </div>
          </div>
          <Skeleton className="h-9 w-20" />
        </div>

        <div className="barber-card mt-5 p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-16 w-full" />
          <Skeleton className="mt-3 h-14 w-full" />
        </div>

        <div className="barber-card mt-4 p-5">
          <Skeleton className="h-10 w-40" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>

        <div className="barber-card mt-4 p-4 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </section>
    </main>
  );
}
