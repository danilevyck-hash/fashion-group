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
  // 🔴 `contabilidad` va acá y no solo en `modules.ts` (25-ago-2026). MEDIDO:
  // `hasModuleAccess` mira PRIMERO esta lista y recién después cae a
  // `fg_modules` — y la lista guardada de contabilidad no trae `comisiones`,
  // así que sin este renglón la pantalla la seguía rebotando a `/home` con
  // "No tienes acceso a este modulo", ficha del menú o no.
  const { authChecked } = useAuth({ moduleKey: "comisiones", allowedRoles: ["admin", "contabilidad", "secretaria"] });
  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Comisiones" />
      {/* Sin título grande: "Comisiones" ya lo dicen el header sticky (móvil) y
          el breadcrumb (escritorio) — repetirlo costaba 44px de la primera
          pantalla del iPhone. Mismo criterio que el encabezado de CXC. */}
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-8 pt-2 md:px-7 md:pt-3">
        {/* La pestaña Configuración (solo admin) vive AQUÍ, en el módulo
            Comisiones, no en la pestaña Comisiones de Ventas. */}
        <ComisionesView availableYears={availableYears} avisoMontos={avisoMontos} conConfiguracion />
      </main>
    </div>
  );
}
