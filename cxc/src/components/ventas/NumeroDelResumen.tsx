"use client";

// 🔴 VENTAS_APPLE_2026_10 · el número grande del Resumen (celular y computadora).
// La venta del período grande, su ▲/▼ al lado y el resto de la tira en UNA línea
// gris. Recibe las cifras ya escritas por `numerosDelResumen`: no calcula nada.

import type { ReactNode } from "react";
import { CLASE_LINEA_TOTAL, CLASE_TOTAL_CELULAR } from "@/components/celular/CabeceraCompacta";
import { colorDelSigno } from "@/components/celular/Piezas";
import type { NumeroDelResumen as Numero } from "@/lib/ventas/resumen-mes";
import { lineaBajoElNumero } from "@/lib/ventas/ventas-apple";

export function NumeroDelResumen({
  numeros,
  forma,
  derecha,
}: {
  numeros: Numero[];
  forma: "celular" | "computadora";
  /** Computadora: la línea de frescura, a la derecha del número. */
  derecha?: ReactNode;
}) {
  const [ventas, ...resto] = numeros;
  if (!ventas) return null;
  const numero = (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className={forma === "celular" ? CLASE_TOTAL_CELULAR : "text-[40px] font-normal leading-none tracking-tight tabular-nums text-gray-800"}>
          {ventas.valor}
        </span>
        {ventas.cambio && <span className={`text-[15px] ${colorDelSigno(ventas.signo)}`}>{ventas.cambio}</span>}
      </div>
      <span className={forma === "celular" ? CLASE_LINEA_TOTAL : "mt-1.5 block text-sm text-gray-500"}>{lineaBajoElNumero(resto)}</span>
    </div>
  );
  if (forma === "celular") return <div data-numero-del-resumen className="px-4 pt-3">{numero}</div>;
  return (
    <div data-numero-del-resumen className="mb-5 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-gray-200 bg-white p-5">
      {numero}
      {derecha}
    </div>
  );
}
