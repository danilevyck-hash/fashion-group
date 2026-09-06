"use client";

import { useSearchParams } from "next/navigation";
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
  // Un `?tab=` guardado (los valores de las 4 pestañas viejas: todas · empresa ·
  // multifashion · config) se resuelve a su vista nueva en `vistas.ts`. Ningún
  // enlace se rompe; nada se escribe de vuelta en la URL.
  const vistaPedida = useSearchParams().get("tab");
  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Comisiones" />
      {/* Sin título grande: "Comisiones" ya lo dicen el header sticky (móvil) y
          el breadcrumb (escritorio) — repetirlo costaba 44px de la primera
          pantalla del iPhone. Mismo criterio que el encabezado de CXC. */}
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-8 pt-2 md:px-7 md:pt-3">
        {/* El ⚙ de Configuración (solo admin) vive AQUÍ, en el módulo
            Comisiones, no en la pestaña Comisiones de Ventas. */}
        {/* `conMultifashion`: Multifashion es una opción más del selector y
            vive SOLO en este módulo (6-sep-2026). Ventas ya tiene su propia
            pestaña Multifashion. */}
        <ComisionesView
          availableYears={availableYears}
          avisoMontos={avisoMontos}
          conConfiguracion
          conMultifashion
          vistaPedida={vistaPedida}
        />
      </main>
    </div>
  );
}
