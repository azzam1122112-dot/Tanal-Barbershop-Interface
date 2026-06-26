import { Skeleton, CardGridSkeleton } from "@/components/skeleton";

export default function DashboardLoading() {
  return (
    <main className="dashboard-page">
      <div className="mx-auto grid max-w-[1680px] gap-0 lg:grid-cols-[320px_1fr]">
        <aside className="hidden bg-sidebar-onyx px-5 py-5 lg:flex lg:min-h-screen lg:flex-col lg:gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <div className="flex items-center gap-3">
              <span className="skeleton h-12 w-12 rounded-lg bg-white/10" />
              <div className="flex-1 space-y-2">
                <span className="skeleton block h-2.5 w-16 bg-white/10" />
                <span className="skeleton block h-3.5 w-24 bg-white/10" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <span key={index} className="skeleton block h-12 w-full rounded-xl bg-white/[0.06]" />
            ))}
          </div>
        </aside>

        <section className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
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
        </section>
      </div>
    </main>
  );
}
