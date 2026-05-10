import { fetchVentasResumen, fetchClientes, fetchMultifashion, fetchAvailableYears } from "@/lib/ventas/queries";
import { VentasShell } from "./VentasShell";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const now = new Date();
  const year = now.getFullYear();
  // mes 1-indexed; mes "actual" para Multifashion = mes anterior cerrado, salvo enero
  const mes = Math.max(1, now.getMonth()); // getMonth() es 0-11, así mes anterior

  const [resumen, clientes, multi, availableYears] = await Promise.all([
    fetchVentasResumen({ year }).catch(err => {
      console.error("[ventas] resumen error", err);
      return null;
    }),
    fetchClientes({ year }).catch(err => {
      console.error("[ventas] clientes error", err);
      return null;
    }),
    fetchMultifashion({ year, mes }).catch(err => {
      console.error("[ventas] multifashion error", err);
      return null;
    }),
    fetchAvailableYears().catch(err => {
      console.error("[ventas] años error", err);
      return [year];
    }),
  ]);

  return (
    <VentasShell
      year={year}
      availableYears={availableYears}
      resumen={resumen}
      clientes={clientes}
      multi={multi}
    />
  );
}
