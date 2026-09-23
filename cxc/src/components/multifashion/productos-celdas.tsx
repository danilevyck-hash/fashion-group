"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Multifashion › Productos — los formatos y las dos piezas chicas que comparten
// la pantalla de siempre (`ProductosSubtab`) y la mínima (`ProductosMinimo`,
// 23-sep-2026). Salieron de `ProductosSubtab.tsx` SIN cambiar una letra: una
// sola implementación para las dos pantallas, sin importaciones circulares.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtMoney } from "@/lib/ventas/format";
import { fmtVariacionPct } from "@/lib/variacion";
import { cn } from "@/lib/utils";
import type { Variacion } from "@/lib/multifashion/productos-resumen";

/** Unidades: la columna es `numeric(14,4)` pero en la práctica son piezas
 *  enteras. Se muestran sin decimales salvo que realmente los tengan. */
export function fmtUnidades(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Margen: SIN el "+" que le pone `fmtPct` a los deltas — aquí no es una
 *  variación contra nada, es una proporción. `null` → "—". */
export function fmtMargen(p: number | null): string {
  return p == null ? "—" : `${(p * 100).toFixed(1)}%`;
}

export function fmtPctTotal(p: number | null): string {
  return p == null ? "—" : `${(p * 100).toFixed(1)}%`;
}

/** Monto con signo. El menos es el signo tipográfico (−), no un guion. */
export function fmtMontoConSigno(n: number): string {
  return `${n >= 0 ? "+" : "−"}${fmtMoney(Math.abs(n))}`;
}

export function fmtUnidadesConSigno(n: number): string {
  return `${n >= 0 ? "+" : "−"}${fmtUnidades(Math.abs(n))}`;
}

/** "1 de septiembre de 2025" → "1 sep 2025". Fecha corta y en español simple. */
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${Number(d)} ${MES_CORTO[Number(m) - 1]} ${a}`;
}

/** El tono del cambio. Gris cuando no hay con qué comparar: un "—" en verde
 *  diría que algo mejoró. */
export function tonoVariacion(n: number | null): string {
  if (n == null) return "text-gray-500";
  if (n > 0) return "text-emerald-700";
  if (n < 0) return "text-rose-700";
  return "text-gray-500";
}

export function flechaVariacion(n: number | null): string {
  if (n == null || n === 0) return "";
  return n > 0 ? "▲" : "▼";
}

export function CeldaPulso({
  rotulo,
  valor,
  tono,
  delta,
  anterior,
  fmtAbs,
}: {
  rotulo: string;
  valor: string;
  /** "plata" va en el acento de la app; "volumen" en gris. Son unidades
   *  distintas y verlas iguales es la mitad del problema que se vino a
   *  arreglar (unidades y dólares compitiendo en la misma fila). */
  tono: "plata" | "volumen";
  delta: Variacion | null;
  anterior: string | null;
  fmtAbs: (n: number) => string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{rotulo}</p>
      <p
        className={cn(
          "mt-1 font-mono text-2xl font-medium leading-tight tabular-nums",
          tono === "plata" ? "text-teal-800" : "text-gray-950",
        )}
      >
        {valor}
      </p>
      {delta && anterior ? (
        <p className="mt-1 text-xs text-gray-500">
          <span className={cn("font-mono font-medium tabular-nums", tonoVariacion(delta.pct ?? delta.abs))}>
            {flechaVariacion(delta.pct ?? delta.abs)}{" "}
            {delta.pct != null ? fmtVariacionPct(delta.pct, true, 1) : fmtAbs(delta.abs)}
          </span>{" "}
          contra <span className="font-mono tabular-nums">{anterior}</span> el año pasado
        </p>
      ) : null}
    </div>
  );
}

export function Pill({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "-my-1.5 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition",
        activo
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900",
      )}
    >
      {children}
    </button>
  );
}
