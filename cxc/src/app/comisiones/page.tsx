import { Suspense } from "react";
import { fetchAvailableYears } from "@/lib/ventas/queries";
import { lineaDeRechazos } from "@/lib/rechazos-de-switch";
import { ComisionesPageClient } from "./ComisionesPageClient";

export const dynamic = "force-dynamic";

// Módulo propio de Comisiones (fuera de Ventas). Reusa ComisionesView.
// Acceso: admin, secretaria (gateado en el cliente + en modules.ts).
export default async function ComisionesPage() {
  const year = new Date().getFullYear();
  // En paralelo. La familia es `recibo`: la comisión sobre cobro lee
  // `switch_recibos`, y ésta es la pantalla donde ese número se ve.
  const [availableYears, avisoMontos] = await Promise.all([
    fetchAvailableYears().catch(() => [year]),
    lineaDeRechazos({ familias: ["recibo"] }),
  ]);
  return (
    <Suspense>
      <ComisionesPageClient availableYears={availableYears} avisoMontos={avisoMontos} />
    </Suspense>
  );
}
