"use client";

// Los cuatro tramos (0-90 d · 91-120 d · 121-365 d · +1 año) de Proveedores
// «como lo haría Apple», v2 (6-oct-2026). En el celular, UNA lista vertical
// —rótulo a la izquierda, monto a la derecha, uno por renglón— porque cuatro
// montos de siete cifras en una fila se encimaban; desde `sm`, la fila de
// cuatro de siempre. Mismos números (`Tramos`), nunca rojo: es EDAD.

import { fmt } from "@/lib/format";
import { TRAMOS, type Tramos } from "@/lib/proveedores/tramos";
import { textoDeMonto, tonoDeMonto } from "@/lib/proveedores/tono";
import { TONO_A_FAVOR_APPLE } from "@/lib/proveedores/apple-2026-10";

export const tonoApple = (v: number) => (v < 0 ? TONO_A_FAVOR_APPLE : tonoDeMonto(v));

export default function TramosApple({ tramos, className = "" }: { tramos: Tramos; className?: string }) {
  const peso = (k: string, v: number) => (k === "tMas365" && v !== 0 ? "font-medium" : "");
  return (
    <div data-tramos-apple className={className}>
      <dl className="divide-y divide-gray-100 sm:hidden">
        {TRAMOS.map((t) => (
          <div key={t.key} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
            <dt className="text-gray-500">{t.label}</dt>
            <dd className={`tabular-nums ${tonoApple(tramos[t.key])} ${peso(t.key, tramos[t.key])}`}>{textoDeMonto(tramos[t.key], fmt)}</dd>
          </div>
        ))}
      </dl>
      <div className="hidden grid-cols-4 gap-3 sm:grid">
        {TRAMOS.map((t) => (
          <div key={t.key}>
            <div className="text-xs text-gray-400">{t.label}</div>
            <div className={`mt-0.5 text-sm tabular-nums ${tonoApple(tramos[t.key])} ${peso(t.key, tramos[t.key])}`}>{textoDeMonto(tramos[t.key], fmt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
