import { Suspense } from "react";
import { fetchAvailableYears } from "@/lib/ventas/queries";
import { ComisionesPageClient } from "./ComisionesPageClient";

export const dynamic = "force-dynamic";

// Módulo propio de Comisiones (fuera de Ventas). Reusa ComisionesView.
// Acceso: admin, secretaria (gateado en el cliente + en modules.ts).
export default async function ComisionesPage() {
  const year = new Date().getFullYear();
  const availableYears = await fetchAvailableYears().catch(() => [year]);
  return (
    <Suspense>
      <ComisionesPageClient availableYears={availableYears} />
    </Suspense>
  );
}
