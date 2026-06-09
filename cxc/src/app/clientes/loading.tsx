import { SkeletonTable } from "@/components/ui";

// Loading instantáneo de /clientes (carga SSR del directorio).
// Espeja: header, barra de búsqueda y la tabla.
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-14 border-b border-gray-200 bg-white" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="h-6 w-40 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-10 w-full max-w-sm bg-gray-100 rounded-md animate-pulse mb-6" />
        <SkeletonTable rows={10} cols={5} />
      </div>
    </div>
  );
}
