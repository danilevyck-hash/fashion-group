"use client";

// ─────────────────────────────────────────────────────────────────────────────
// COMISIONES › MULTIFASHION · LA TABLA ORDENADA (2-oct-2026,
// `MULTIFASHION_TOTAL_PERSONA_2026_10`). Daniel, sobre la primera propuesta:
// *«me gusta, pero siento que debe estar más ordenado; tickets, total y ticket
// promedio se ven diferentes, no se siente ordenado»*.
//
//   · Las columnas van de lo que vendió a lo que se paga: # · Vendedora ·
//     Ventas · Tickets · Ticket prom. · Δ · Comisión · Bono · Total a pagar.
//   · UNA tipografía para todo número (la del sistema, `tabular-nums`, a la
//     derecha y del mismo peso); solo Ventas y Total a pagar en negrita.
//   · Lo secundario (Tickets, Ticket prom., Δ) en gris; la plata en negro.
//   · Encabezados de un solo estilo, alineados como su columna.
//   · El pie, bajo sus columnas.
//
// 🔴 Solo cambia la pantalla: los números son los mismos (`bonoDeFila`,
// `totalDeFila`, `totalAPagarMultifashion`, los del Excel).
// ─────────────────────────────────────────────────────────────────────────────

import type { BonosMultifashion, VendedoraDetalle } from "@/components/ventas/types";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtPorcentaje } from "@/lib/ventas/format";
import { participacion, type DeltaAnioPasado } from "@/lib/multifashion/vendedoras-vs-anio";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { variacionPctDesdeRatio } from "@/lib/variacion";
import { cn } from "@/lib/utils";
import { bonoDeFila, chipDeBono, totalAPagarMultifashion, totalDeFila } from "@/lib/multifashion/bono-linea";
import { nombreEnPantalla } from "@/lib/multifashion/nombres";
import { desgloseCanales } from "@/lib/multifashion/canales";
import { ChipBono } from "./BonosSection";
import { ThOrden, type OrdenTablaApi } from "@/components/ui/OrdenTabla";

/** Las columnas que ordenan (6-oct-2026: TODAS, con la regla común). */
export type ClaveOrden = "nombre" | "ventas" | "tickets" | "ticket_promedio" | "delta_ventas" | "comision" | "bono" | "total";


const TH = "border-b border-gray-200 px-3.5 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap";
const NUM = "px-3.5 py-3 text-right text-sm tabular-nums";
const FLECHA: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange: "text-red-600",
  stone: "text-gray-400",
};


export function VendedorasTablaOrdenada({ filas, bonos, rotuloDelta, orden, deltas, ventasTotal }: {
  filas: VendedoraDetalle[];
  /** Δ contra el mismo mes del año pasado (2-oct-2026); «nueva» = no vendió ese mes. */
  deltas?: Map<string, DeltaAnioPasado>;
  /** La venta del mes, para la parte de cada una («34%»). */
  ventasTotal?: number;
  /** Los bonos del mes CERRADO; `null` con el mes abierto o en un rango (sin Bono ni Total). */
  bonos: BonosMultifashion | null;
  rotuloDelta: string;
  orden: Pick<OrdenTablaApi<ClaveOrden>, "orden" | "tocar">;
}) {
  const conPago = bonos != null;
  const pagar = conPago ? totalAPagarMultifashion(filas, bonos) : null;
  const h = { api: orden, derecha: true, className: TH };
  const parte = (ventas: number) => (ventasTotal != null ? participacion(ventas, ventasTotal) : null);
  return (
    <Card data-vista="tabla" data-tabla-ordenada className="hidden p-0 lg:block">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-gray-100">
              <th className={cn(TH, "w-10 text-right")}>#</th>
              <ThOrden col="nombre" api={orden} className={TH}>Vendedora</ThOrden>
              <ThOrden col="ventas" {...h}>Ventas</ThOrden>
              <ThOrden col="tickets" {...h}>Tickets</ThOrden>
              <ThOrden col="ticket_promedio" {...h}>Ticket prom.</ThOrden>
              <ThOrden col="delta_ventas" {...h}>{rotuloDelta}</ThOrden>
              <ThOrden col="comision" {...h}>Comisión</ThOrden>
              {conPago && <ThOrden col="bono" {...h}>Bono</ThOrden>}
              {conPago && <ThOrden col="total" {...h}>Total a pagar</ThOrden>}
            </tr>
          </thead>
          <tbody>
            {filas.map((v, i) => {
              const dv = formatDeltaRatio(variacionPctDesdeRatio(v.ventas, v.delta_ventas_pct));
              const desglose = desgloseCanales(v.ventas, v.por_canal, v.nombre);
              const bono = conPago ? bonoDeFila(v, bonos) : 0;
              return (
                <tr key={v.nombre} className="border-b border-gray-200 last:border-b-0">
                  <td className={cn(NUM, "text-gray-500")}>{i + 1}</td>
                  <td className="px-3.5 py-3 text-sm text-gray-950">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{nombreEnPantalla(v.nombre)}</span>
                      {v.manager && (
                        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Gerente</span>
                      )}
                      <ChipBono chip={chipDeBono(v, bonos)} sinMonto />
                    </div>
                    {desglose && (
                      <p data-desglose-canal className="mt-0.5 text-xs text-gray-500 tabular-nums">{desglose}</p>
                    )}
                  </td>
                  <td data-celda="ventas" className={cn(NUM, "font-semibold text-gray-950")}>
                    {fmtMoney(v.ventas)}
                    {parte(v.ventas) != null && (
                      <span data-parte className="block text-xs font-normal text-gray-500">{fmtPorcentaje(parte(v.ventas))}</span>
                    )}
                  </td>
                  <td data-celda="tickets" className={cn(NUM, "text-gray-500")}>{v.tickets.toLocaleString()}</td>
                  <td data-celda="ticket-promedio" className={cn(NUM, "text-gray-500")}>${v.ticket_promedio.toFixed(2)}</td>
                  <td data-celda="delta" className={cn(NUM, "text-gray-500")}>
                    {deltas?.get(v.nombre)?.tipo === "nueva" ? "Nueva" : (
                      <>
                        {dv.arrow && <span className={cn("mr-1 text-xs", FLECHA[dv.tone])}>{dv.arrow}</span>}
                        {dv.displayValue}
                      </>
                    )}
                  </td>
                  <td data-celda="comision" className={cn(NUM, "text-gray-950")}>${v.comision.toFixed(2)}</td>
                  {conPago && (
                    <td data-celda="bono" className={cn(NUM, bono > 0 ? "text-gray-950" : "text-gray-400")}>
                      {bono > 0 ? fmtMoney(bono) : "—"}
                    </td>
                  )}
                  {conPago && (
                    <td data-celda="total-a-pagar" className={cn(NUM, "font-semibold text-gray-950")}>
                      {fmtMoney(totalDeFila(v, bonos))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {pagar && (
            <tfoot data-pie-total-persona>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={6} className={cn(NUM, "text-xs font-medium uppercase tracking-wide text-gray-500")}>Total</td>
                <td className={cn(NUM, "text-gray-950")}>{fmtMoney(pagar.comisiones)}</td>
                <td className={cn(NUM, "text-gray-950")}>{fmtMoney(pagar.bonos)}</td>
                <td className={cn(NUM, "font-semibold text-gray-950")}>{fmtMoney(pagar.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
