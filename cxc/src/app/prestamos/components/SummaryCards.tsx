"use client";

import { fmt } from "@/lib/format";
import { progressColor, progressColorText } from "./types";

/**
 * LAS DOS CUENTAS, UNA DEBAJO DE OTRA, Y EL TOTAL AL PIE.
 *
 * Es el mockup que Daniel aprobó, tal cual:
 *
 *     Préstamo            $220.00
 *     Daño de mercancía    $50.00
 *     ──────────────────────────
 *     Debe                $270.00
 *     Préstamo $30 · Daño $10 por quincena
 *
 * 🔑 Cuando la persona debe UNA sola cuenta no se pintan las dos: dos renglones
 * de los cuales uno dice $0,00 son un renglón de ruido. La suma sigue siendo la
 * misma de siempre.
 *
 * 🔴 Y lo que ESPERA APROBACIÓN va en gris, aparte, fuera del total: no se
 * entregó, así que no es deuda — pero se ve. Esconderlo es lo que dejó $700 de
 * Luis Arroyo invisibles 22 días.
 */
interface Props {
  saldoPrestamo: number;
  saldoDano: number;
  cuotaPrestamo: number;
  cuotaDano: number;
  prestado: number;
  pagado: number;
  saldo: number;
  pct: number;
  pendiente: number;
  quincenaEstado?: "deducida" | "pendiente" | null;
}

export default function SummaryCards({
  saldoPrestamo, saldoDano, cuotaPrestamo, cuotaDano, prestado, pagado, saldo, pct, pendiente, quincenaEstado,
}: Props) {
  const saldoColor = saldo > 0 ? "text-red-600" : saldo < 0 ? "text-blue-600" : "text-gray-400";
  const dosCuentas = saldoPrestamo !== 0 && saldoDano !== 0;
  const cuotas = [
    cuotaPrestamo > 0 ? `Préstamo $${fmt(cuotaPrestamo)}` : null,
    cuotaDano > 0 ? `Daño $${fmt(cuotaDano)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="rounded-lg border border-gray-200 p-4 mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {dosCuentas && (
            <div className="mb-3 max-w-xs">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-gray-600">Préstamo</span>
                <span className="tabular-nums font-medium">${fmt(saldoPrestamo)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-gray-600">Daño de mercancía</span>
                <span className="tabular-nums font-medium">${fmt(saldoDano)}</span>
              </div>
              <div className="my-1 border-t border-gray-200" />
            </div>
          )}

          <div className="text-xs text-gray-400 uppercase tracking-wide">
            {saldo < 0 ? "Saldo a favor" : "Debe"}
          </div>
          <div className={`text-3xl font-semibold tabular-nums mt-0.5 ${saldoColor}`}>
            ${fmt(Math.abs(saldo))}
          </div>
          {cuotas && <div className="text-sm text-gray-500 mt-1 tabular-nums">{cuotas} por quincena</div>}
          <div className="text-sm text-gray-400 mt-1 tabular-nums">
            Prestado ${fmt(prestado)} · Pagado ${fmt(pagado)}
          </div>
          {pendiente > 0 && (
            <div className="text-sm text-gray-500 mt-2 tabular-nums">
              Esperando aprobación ${fmt(pendiente)}
            </div>
          )}
        </div>

        {quincenaEstado === "deducida" && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium">✓ Deducida esta quincena</span>
        )}
        {quincenaEstado === "pendiente" && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium">⚠ Deducción pendiente</span>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">Progreso de pago</span>
          <span className={`text-sm font-medium tabular-nums ${progressColorText(pct)}`}>{pct.toFixed(1)}%</span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${progressColor(pct)} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
