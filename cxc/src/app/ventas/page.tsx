import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchVentasResumen, fetchClientes, fetchMultifashion, fetchAvailableYears } from "@/lib/ventas/queries";
import { VentasShell } from "./VentasShell";

export const dynamic = "force-dynamic";

// Ventas es admin-only. Guard SSR (antes de cargar data) para que ningún otro
// rol (ej. secretaria) vea Resumen/Clientes ni escribiendo la URL.
function sessionRole(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    return parsed?.role ?? null;
  } catch {
    return null;
  }
}

export default async function VentasPage() {
  const role = sessionRole((await cookies()).get("cxc_session")?.value);
  if (!role) redirect("/");
  if (role !== "admin") redirect("/home");

  const now = new Date();
  const year = now.getFullYear();
  // mes 1-indexed = mes en curso del calendario. multifashion_mensual_v6
  // suma WHERE mes <= p_mes para los KPIs YTD (retail.ytdVentas, ticketProm,
  // margen tienda completa, etc.) — pasarlo como mes en curso garantiza que la data parcial
  // del mes (ej. mayo 1–9) entra al YTD. retail.meses[mes_en_curso] marca
  // es_periodo_parcial=true así que el footer / label sub muestran el corte.
  const mes = now.getMonth() + 1;

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
    // Suspense boundary requerido por useSearchParams (vía useUrlState en
    // VentasShell) en Next 14 App Router. Mismo patrón que reclamos/upload.
    <Suspense>
      <VentasShell
        year={year}
        availableYears={availableYears}
        resumen={resumen}
        clientes={clientes}
        multi={multi}
      />
    </Suspense>
  );
}
