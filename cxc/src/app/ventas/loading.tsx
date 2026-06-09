import { SkeletonKPI } from "@/components/ui";

// Loading instantáneo de /ventas mientras el server resuelve las RPCs del
// resumen. Espeja: header, KPIs y el gráfico.
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-14 border-b border-gray-200 bg-white" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="h-6 w-48 bg-gray-100 rounded animate-pulse mb-6" />
        <SkeletonKPI count={4} />
        <div className="h-72 bg-gray-100 rounded-lg animate-pulse mt-2" />
      </div>
    </div>
  );
}
