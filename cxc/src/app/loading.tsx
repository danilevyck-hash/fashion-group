import DelayedSkeleton from "@/components/DelayedSkeleton";

// Esqueleto general (velocidad, 25-nov-2026): al tocar otro módulo la pantalla
// ya no se queda congelada mientras el servidor contesta. Neutro a propósito
// (sin encabezado falso ni colores de módulo) para que sirva igual a cualquier
// módulo y a las páginas públicas de catálogo y pedido. Los módulos que tienen
// su propio `loading.tsx` lo siguen usando. Solo aparece si la carga pasa de
// 300 ms (`DelayedSkeleton`).
export default function Loading() {
  return (
    <DelayedSkeleton>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6" role="status" aria-label="Cargando">
        <div className="h-6 w-44 bg-gray-100 rounded animate-pulse mb-6" />
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <div className="h-4 flex-1 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </DelayedSkeleton>
  );
}
