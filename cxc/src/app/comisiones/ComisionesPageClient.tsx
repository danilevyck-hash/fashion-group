"use client";

import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { ComisionesView } from "@/components/ventas/ComisionesView";

export function ComisionesPageClient({
  availableYears,
  avisoMontos,
}: {
  availableYears: number[];
  /** Lo que el guard dejó afuera de los cobros, ya redactado por el servidor. */
  avisoMontos?: string | null;
}) {
  const { authChecked } = useAuth({ moduleKey: "comisiones", allowedRoles: ["admin", "secretaria"] });
  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Comisiones" />
      {/* Sin título grande: "Comisiones" ya lo dicen el header sticky (móvil) y
          el breadcrumb (escritorio) — repetirlo costaba 44px de la primera
          pantalla del iPhone. Mismo criterio que el encabezado de CXC. */}
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-8 pt-2 md:px-7 md:pt-3">
        <ComisionesView availableYears={availableYears} avisoMontos={avisoMontos} />
      </main>
    </div>
  );
}
