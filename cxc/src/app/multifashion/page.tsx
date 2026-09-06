import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchMultifashion, fetchAvailableYears } from "@/lib/ventas/queries";
import { verifySession } from "@/lib/session-cookie";
import { puedeAbrirMultifashion } from "@/lib/multifashion/acceso";
import { MultifashionShell } from "./MultifashionShell";

export const dynamic = "force-dynamic";
// El SSR de esta página cruza el empalme switch_facturas/ventas_raw (blend
// pesado) y en caché fría pasa de 10s. Sin maxDuration explícito, la función
// se corta antes de que el reintento de withDbRetry alcance a salvarla.
export const maxDuration = 60;

// 🩸 ESTA PÁGINA NO COMPROBABA NINGÚN ROL (hasta el 6-sep-2026). `/ventas`
// manda a casa a quien no es admin en dos líneas; ésta no tenía ninguna, y el
// middleware solo valida que la sesión EXISTA. O sea: cualquiera con sesión
// —bodega, un vendedor, contabilidad— abría esta dirección y el resumen de la
// tienda le llegaba **ya escrito en el HTML**, antes de que el cliente pudiera
// rebotarlo. El guard va ANTES de cargar la data, como en /ventas.
// La lista de roles vive en UN solo lugar y se deriva de `src/lib/modules.ts`.
function sessionRole(raw: string | undefined): string | null {
  return verifySession(raw)?.role ?? null;
}

export default async function MultifashionPage() {
  const role = sessionRole((await cookies()).get("cxc_session")?.value);
  if (!role) redirect("/");
  if (!puedeAbrirMultifashion(role)) redirect("/home");

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
