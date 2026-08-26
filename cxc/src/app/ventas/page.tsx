import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchVentasResumen, fetchClientes, fetchMultifashion, fetchAvailableYears } from "@/lib/ventas/queries";
import { lineaDeRechazos } from "@/lib/rechazos-de-switch";
import { VentasShell } from "./VentasShell";
import { verifySession } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";
// El SSR de esta página cruza el empalme switch_facturas/ventas_raw (blend
// pesado) y en caché fría pasa de 10s. Sin maxDuration explícito, la función
// se corta antes de que el reintento de withDbRetry alcance a salvarla.
export const maxDuration = 60;

// Ventas es admin-only. Guard SSR (antes de cargar data) para que ningún otro
// rol (ej. secretaria) vea Resumen/Clientes ni escribiendo la URL.
function sessionRole(raw: string | undefined): string | null {
  return verifySession(raw)?.role ?? null;
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

  // ⚠️ El aviso de montos va DENTRO del mismo Promise.all: en serie le sumaría
  // ~380 ms a una pantalla que ya es la más pesada del sistema. Es UNA consulta
  // acotada (corridas exitosas con rechazo, 7 días) sobre una tabla de 7.680
  // filas — y falla al silencio, así que nunca puede tumbar la página.
  const [resumen, clientes, multi, availableYears, avisoMontos, avisoRecibos] = await Promise.all([
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
    // Las 4 familias del guard que alimentan este módulo. Sin `empresas`: acá se
    // miran las 8, que es justo lo que la pantalla suma.
    lineaDeRechazos({ familias: ["factura", "utilidad", "costo_diario", "articulo_diario"] }),
    // La familia de COMISIONES, aparte (25-ago-2026). La comisión sobre cobro
    // lee `switch_recibos`, que NO está en las 4 de arriba — es lo mismo que
    // pedía `/comisiones` y viaja SOLO al tab Comisiones. Va en el MISMO
    // Promise.all: en serie le sumaría una consulta a la pantalla más pesada
    // del sistema. Falla al silencio, como las otras.
    lineaDeRechazos({ familias: ["recibo"] }),
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
        avisoMontos={avisoMontos}
        avisoRecibos={avisoRecibos}
      />
    </Suspense>
  );
}
