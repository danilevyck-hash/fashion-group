import { SkeletonKPI } from "@/components/ui";
import DelayedSkeleton from "@/components/DelayedSkeleton";

// Loading instantáneo de App Router: se muestra al navegar a /multifashion
// mientras el server resuelve las RPCs. Espeja la estructura: header, 4 KPIs y
// el gráfico de línea.
export default function Loading() {
  return (
    <DelayedSkeleton>
      <div className="min-h-screen bg-gray-50">
      <div className="h-14 border-b border-gray-200 bg-white" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="h-6 w-56 bg-gray-100 rounded animate-pulse mb-6" />
        <SkeletonKPI count={4} />
        <div className="h-72 bg-gray-100 rounded-lg animate-pulse mt-2" />
      </div>
      </div>
    </DelayedSkeleton>
  );
}
