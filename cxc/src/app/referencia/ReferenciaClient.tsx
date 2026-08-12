"use client";

// La cara de /referencia: el MISMO buscador del tab Ventas › Referencia
// (`ReferenciaView`), con su header de módulo. Acá no hay lógica propia — si
// esta pantalla dijera algo distinto que el tab de Ventas, serían dos verdades.

import AppHeader from "@/components/AppHeader";
import { ReferenciaView } from "@/components/ventas/ReferenciaView";

export default function ReferenciaClient() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Referencia" />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-[env(safe-area-inset-bottom)]">
        <div className="mb-5">
          {/* Sin título grande: "Referencia" ya lo dicen la barra sticky
              (celular) y el breadcrumb (escritorio). Queda sr-only para no
              dejar la página sin encabezado. La bajada se QUEDA: dice qué se
              busca y qué devuelve, no repite el nombre. */}
          <h1 className="sr-only">Referencia</h1>
          <p className="text-sm text-gray-600">
            Buscá un código o pegá tu lista: cuánto llegó, cuánto se vendió y qué hay en stock.
          </p>
        </div>
        <ReferenciaView />
      </main>
    </div>
  );
}
