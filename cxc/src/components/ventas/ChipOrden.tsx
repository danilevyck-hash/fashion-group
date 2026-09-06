"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL CHIP DE ORDENAR — UNO SOLO, DE UN SOLO COLOR (5-sep-2026).
//
// 🩸 QUÉ VINO A ARREGLAR. El chip activo era NEGRO en Productos
// (`bg-gray-800`) y VERDE en Utilidad (`bg-teal-700`), en el mismo módulo y a
// una pestaña de distancia. Dos colores para el mismo estado enseñan que el
// color significa algo, y acá no significaba nada: era que cada vista se
// escribió por su lado.
//
// Gana el teal, que es el color con el que este módulo ya marca lo activo (las
// píldoras de empresa de Clientes y la pestaña activa de la tira). Ahora hay UN
// componente: para que vuelvan a divergir habría que borrarlo.
//
// 🔴 44 px de alto, la regla táctil de la casa: estos chips reemplazan al
// encabezado de columna cuando la tabla se vuelve tarjetas, y ordenar mal
// porque el dedo erró no es gratis.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils";

export interface OrdenActivo<K extends string> {
  key: K;
  dir: "asc" | "desc";
}

export function ChipOrden<K extends string>({
  label,
  sortKey,
  active,
  onClick,
}: {
  label: string;
  sortKey: K;
  active: OrdenActivo<K>;
  onClick: (k: K) => void;
}) {
  const isActive = active.key === sortKey;
  return (
    <button
      type="button"
      data-orden-chip={sortKey}
      aria-pressed={isActive}
      onClick={() => onClick(sortKey)}
      className={cn(
        "inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3.5 text-xs font-medium transition active:scale-[0.97]",
        isActive
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-gray-200 bg-white text-gray-700",
      )}
    >
      {label}
      <span className="w-2" aria-hidden>
        {isActive ? (active.dir === "desc" ? "▼" : "▲") : ""}
      </span>
    </button>
  );
}

/** La tira completa: el rótulo «Ordenar por» + los chips. */
export function TiraOrden<K extends string>({
  criterios,
  active,
  onClick,
  className,
}: {
  criterios: readonly { key: K; label: string }[];
  active: OrdenActivo<K>;
  onClick: (k: K) => void;
  className?: string;
}) {
  return (
    <div
      data-orden-tarjetas
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      role="group"
      aria-label="Ordenar por"
    >
      <span className="flex min-h-[44px] items-center pr-0.5 text-xs text-gray-500">Ordenar por</span>
      {criterios.map((c) => (
        <ChipOrden key={c.key} label={c.label} sortKey={c.key} active={active} onClick={onClick} />
      ))}
    </div>
  );
}
