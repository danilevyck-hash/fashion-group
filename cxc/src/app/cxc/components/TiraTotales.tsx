"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA TIRA DE TOTALES — pegada a la tabla y PARADA SOBRE SUS COLUMNAS.
//
// 🩸 QUÉ HABÍA (hasta el 5-sep-2026). Cuatro píldoras redondas flotando en su
// propia línea, con el nombre largo del tramo adentro ("Vencido reciente
// 91-120d $12,345.67 · 8"), a media pantalla de distancia de la columna que
// resumen. Eran uno de SEIS bloques que había que pasar antes de ver al primer
// cliente.
//
// Ahora son UNA tira gris en la MISMA grilla de 12 columnas que la tabla
// (4/2/2/2/2), así que cada total queda parado sobre su columna: el de 0-90d
// arriba de la columna 0-90d, el Total arriba de la columna Total. Se lee de
// arriba abajo sin buscar.
//
// 🔴 EL CHIP DICE SOLO EL RANGO ("0-90d"), no el nombre largo. En escritorio la
// columna de abajo YA dice lo mismo y el ancho es de 2/12: el nombre completo
// obligaba a envolver o a apretar el monto, que es lo que se viene a leer. El
// nombre largo NO desaparece del sistema — sigue en el celular, en el papel, en
// el correo y en el `title` de cada chip, que sale de `tramoLabel()`, la misma
// fuente única de siempre (`lib/cxc-aging.ts`). Se cambió DÓNDE se dice, no
// cuántos nombres hay.
//
// ⚠️ NI UN NÚMERO SE MOVIÓ: los tramos siguen siendo 0-90 / 91-120 / 121+, los
// conteos se cuentan igual y tocar un chip sigue avisando con su CLAVE.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConsolidatedClient } from "@/lib/types";
import { fmt } from "@/lib/format";
import { AGING, AGING_ORDER, tramoLabel, type AgingKey } from "@/lib/cxc-aging";
import { rotuloSinPagar, rotuloClientes, DIAS_SIN_PAGAR_UMBRAL } from "@/lib/cxc/sin-pagar";

type RiskFilter = "all" | AgingKey;

/** Fondo tenue del chip encendido, por tramo. */
const FONDO_ACTIVO: Record<RiskFilter, string> = {
  all: "bg-white",
  current: "bg-emerald-50",
  watch: "bg-amber-50",
  overdue: "bg-red-50",
};

const BORDE_ACTIVO: Record<RiskFilter, string> = {
  all: "border-gray-800",
  current: "border-emerald-600",
  watch: "border-amber-500",
  overdue: "border-red-500",
};

export interface AvisoSinPagar {
  /** Cuántos clientes llevan más de 90 días sin pagar (o nunca pagaron). */
  cuantos: number;
  /** Cuánto deben entre todos. */
  monto: number;
}

interface Props {
  roleClients: ConsolidatedClient[];
  riskFilter: RiskFilter;
  onRiskFilterChange: (filter: RiskFilter) => void;
  /** `null` o `cuantos === 0` → la celda 1 vuelve a decir «N clientes». */
  sinPagar: AvisoSinPagar | null;
  sinPagarActivo: boolean;
  onToggleSinPagar: () => void;
}

export default function TiraTotales({
  roleClients,
  riskFilter,
  onRiskFilterChange,
  sinPagar,
  sinPagarActivo,
  onToggleSinPagar,
}: Props) {
  const totalCxc = roleClients.reduce((s, c) => s + c.total, 0);
  const valores: Record<AgingKey, { valor: number; n: number }> = {
    current: {
      valor: roleClients.reduce((s, c) => s + c.current, 0),
      n: roleClients.filter((c) => c.overdue === 0 && c.watch === 0).length,
    },
    watch: {
      valor: roleClients.reduce((s, c) => s + c.watch, 0),
      n: roleClients.filter((c) => c.watch > 0).length,
    },
    overdue: {
      valor: roleClients.reduce((s, c) => s + c.overdue, 0),
      n: roleClients.filter((c) => c.overdue > 0).length,
    },
  };

  const hayAviso = !!sinPagar && sinPagar.cuantos > 0;

  return (
    <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border border-b-0 border-gray-200 rounded-t-lg">
      {/* Celda 1 — sobre «Cliente». El aviso de los que no pagan hace rato, o
          el conteo de siempre cuando no hay ninguno. */}
      <div className="col-span-4 flex items-center">
        {hayAviso && sinPagar ? (
          <button
            type="button"
            onClick={onToggleSinPagar}
            aria-pressed={sinPagarActivo}
            title={
              sinPagarActivo
                ? "Clic para volver a ver a todos"
                : `Clic para ver solo a los que llevan más de ${DIAS_SIN_PAGAR_UMBRAL} días sin pagar (o que nunca pagaron)`
            }
            className={`inline-flex flex-col items-start rounded-md px-2 py-1 min-h-[44px] justify-center text-left transition active:scale-[0.97] ${
              sinPagarActivo
                ? "border-2 border-red-500 bg-red-50"
                : "border border-transparent hover:bg-white hover:border-gray-300"
            }`}
          >
            <span className="text-xs font-semibold text-red-700">
              {rotuloSinPagar(sinPagar.cuantos)}
            </span>
            <span className="text-xs tabular-nums font-semibold text-red-700">
              ${fmt(sinPagar.monto)}
            </span>
          </button>
        ) : (
          <span className="text-xs text-gray-500 px-2">{rotuloClientes(roleClients.length)}</span>
        )}
      </div>

      {/* Celdas 2-4 — cada tramo parado sobre SU columna. */}
      {AGING_ORDER.map((k) => {
        const activo = riskFilter === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onRiskFilterChange(k)}
            aria-pressed={activo}
            title={
              activo
                ? `${tramoLabel(k)}: $${fmt(valores[k].valor)} · ${valores[k].n} clientes — clic para quitar el filtro`
                : `${tramoLabel(k)}: $${fmt(valores[k].valor)} · ${valores[k].n} clientes — clic para ver solo estos`
            }
            className={`col-span-2 flex flex-col items-end justify-center rounded-md px-2 py-1 min-h-[44px] transition active:scale-[0.97] ${
              activo ? `border-2 ${BORDE_ACTIVO[k]} ${FONDO_ACTIVO[k]}` : "border border-transparent hover:bg-white hover:border-gray-300"
            }`}
          >
            <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-gray-500">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${AGING[k].dot}`} />
              {AGING[k].colLabel}
            </span>
            <span className={`text-sm font-semibold tabular-nums ${AGING[k].text}`}>
              ${fmt(valores[k].valor)}
            </span>
            <span className="text-[11px] text-gray-400 tabular-nums">{valores[k].n}</span>
          </button>
        );
      })}

      {/* Celda 5 — sobre «Total». */}
      <button
        type="button"
        onClick={() => onRiskFilterChange("all")}
        aria-pressed={riskFilter === "all"}
        title={`Total pendiente: $${fmt(totalCxc)} · ${roleClients.length} clientes — clic para ver todos`}
        className={`col-span-2 flex flex-col items-end justify-center rounded-md px-2 py-1 min-h-[44px] transition active:scale-[0.97] ${
          riskFilter === "all" ? `border-2 ${BORDE_ACTIVO.all} ${FONDO_ACTIVO.all}` : "border border-transparent hover:bg-white hover:border-gray-300"
        }`}
      >
        <span className="text-[11px] uppercase tracking-wide text-gray-500">
          Total · {roleClients.length}
        </span>
        <span className="text-sm font-semibold tabular-nums text-gray-900">${fmt(totalCxc)}</span>
      </button>
    </div>
  );
}
