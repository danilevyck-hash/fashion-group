import { SkeletonTable } from "@/components/ui";

// Loading instantáneo de /cheques (carga SSR + agrupado por período).
// Espeja: header, 2 chips de resumen y la lista agrupada.
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-14 border-b border-gray-200 bg-white" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="h-6 w-52 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="flex gap-2 mb-6">
          <div className="h-8 w-28 bg-gray-100 rounded-md animate-pulse" />
          <div className="h-8 w-28 bg-gray-100 rounded-md animate-pulse" />
        </div>
        <SkeletonTable rows={8} cols={4} />
      </div>
    </div>
  );
}
