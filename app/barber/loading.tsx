import { Skeleton } from "@/components/skeleton";

export default function BarberLoading() {
  return (
    <main className="barber-shell">
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

        <div className="barber-grid mt-4">
          <div className="space-y-4">
            <div className="barber-card p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-16 w-full" />
              <Skeleton className="mt-3 h-14 w-full" />
            </div>
            <div className="barber-card space-y-2 p-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-14 w-full" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="barber-card p-5">
              <Skeleton className="h-10 w-40" />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
            <div className="barber-card space-y-2 p-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
