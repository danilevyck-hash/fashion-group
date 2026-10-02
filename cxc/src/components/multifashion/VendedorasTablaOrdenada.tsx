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
import { fmtMoney } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { variacionPctDesdeRatio } from "@/lib/variacion";
import { cn } from "@/lib/utils";
import { bonoDeFila, chipDeBono, totalAPagarMultifashion, totalDeFila } from "@/lib/multifashion/bono-linea";
import { nombreEnPantalla } from "@/lib/multifashion/nombres";
import { desgloseCanales } from "@/lib/multifashion/canales";
import { ChipBono } from "./BonosSection";

export type ClaveOrden = "tickets" | "ventas" | "delta_ventas" | "comision";

const TH = "border-b border-gray-200 px-3.5 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap";
const NUM = "px-3.5 py-3 text-right text-sm tabular-nums";
const FLECHA: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange: "text-red-600",
  stone: "text-gray-400",
};

function Encabezado({ col, children, ordenarPor, dir, onOrdenar }: {
  col?: ClaveOrden;
  children: React.ReactNode;
  ordenarPor: ClaveOrden;
  dir: "asc" | "desc";
  onOrdenar: (c: ClaveOrden) => void;
}) {
  const activa = col != null && ordenarPor === col;
  return (
    <th
      onClick={col ? () => onOrdenar(col) : undefined}
      aria-sort={activa ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={cn(TH, "text-right", col && "cursor-pointer select-none hover:text-gray-700")}
    >
      {children}
      {activa && <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

export function VendedorasTablaOrdenada({ filas, bonos, rotuloDelta, ordenarPor, dir, onOrdenar }: {
  filas: VendedoraDetalle[];
  /** Los bonos del mes CERRADO; `null` con el mes abierto o en un rango (sin Bono ni Total). */
  bonos: BonosMultifashion | null;
  rotuloDelta: string;
  ordenarPor: ClaveOrden;
  dir: "asc" | "desc";
  onOrdenar: (c: ClaveOrden) => void;
}) {
  const conPago = bonos != null;
  const pagar = conPago ? totalAPagarMultifashion(filas, bonos) : null;
  const h = { ordenarPor, dir, onOrdenar };
  return (
    <Card data-vista="tabla" data-tabla-ordenada className="hidden p-0 lg:block">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-gray-100">
              <th className={cn(TH, "w-10 text-right")}>#</th>
              <th className={cn(TH, "text-left")}>Vendedora</th>
              <Encabezado col="ventas" {...h}>Ventas</Encabezado>
              <Encabezado col="tickets" {...h}>Tickets</Encabezado>
              <Encabezado {...h}>Ticket prom.</Encabezado>
              <Encabezado col="delta_ventas" {...h}>{rotuloDelta}</Encabezado>
              <Encabezado col="comision" {...h}>Comisión</Encabezado>
              {conPago && <Encabezado {...h}>Bono</Encabezado>}
              {conPago && <Encabezado {...h}>Total a pagar</Encabezado>}
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
                        <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700">Gerente</span>
                      )}
                      <ChipBono chip={chipDeBono(v, bonos)} sinMonto />
                    </div>
                    {desglose && (
                      <p data-desglose-canal className="mt-0.5 text-xs text-gray-500 tabular-nums">{desglose}</p>
                    )}
                  </td>
                  <td data-celda="ventas" className={cn(NUM, "font-semibold text-gray-950")}>{fmtMoney(v.ventas)}</td>
                  <td data-celda="tickets" className={cn(NUM, "text-gray-500")}>{v.tickets.toLocaleString()}</td>
                  <td data-celda="ticket-promedio" className={cn(NUM, "text-gray-500")}>${v.ticket_promedio.toFixed(2)}</td>
                  <td data-celda="delta" className={cn(NUM, "text-gray-500")}>
                    {dv.arrow && <span className={cn("mr-1 text-xs", FLECHA[dv.tone])}>{dv.arrow}</span>}
                    {dv.displayValue}
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
