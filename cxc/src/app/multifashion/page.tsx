import { Suspense } from "react";
import { fetchMultifashion, fetchAvailableYears } from "@/lib/ventas/queries";
import { MultifashionShell } from "./MultifashionShell";

export const dynamic = "force-dynamic";

export default async function MultifashionPage() {
  const now = new Date();
  const year = now.getFullYear();
  // mes 1-indexed = mes en curso. multifashion_mensual_v6 suma WHERE mes <= p_mes
  // para los KPIs YTD del overview; el mes en curso garantiza incluir la data
  // parcial del mes y marca es_periodo_parcial en retail.meses[mes].
  const mes = now.getMonth() + 1;

  const [multi, availableYears] = await Promise.all([
    fetchMultifashion({ year, mes }).catch(err => {
      console.error("[multifashion] overview error", err);
      return null;
    }),
    fetchAvailableYears().catch(err => {
      console.error("[multifashion] años error", err);
      return [year];
    }),
  ]);

  return (
    // Suspense requerido por useSearchParams (vía useUrlState en MultifashionView)
    // en Next 14 App Router. Mismo patrón que /ventas.
    <Suspense>
      <MultifashionShell year={year} availableYears={availableYears} multi={multi} />
    </Suspense>
  );
}
