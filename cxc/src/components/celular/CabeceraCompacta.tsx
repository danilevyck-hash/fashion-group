"use client";

// ─────────────────────────────────────────────────────────────────────────────
// v3.2 (2-oct-2026) — LA CABECERA COMPACTA DE UNA PORTADA DEL CELULAR.
//
// Daniel, mirando Cuentas por cobrar: «se puede optimizar». El total medía
// 46 px de letra (≈64 px de alto), la línea de abajo ocupaba el ancho entero
// y los tres tramos eran pastillas de 54 px. Misma grilla de tres renglones:
//   1 · título-selector + 🔍 + «···»
//   2 · el total a 36 px, con UNA línea gris debajo
//   3 · un control segmentado delgado: 36 px a la vista, 44 al tocar.
//
// 🔴 Solo con `BARRA_CELULAR_2026_10` prendido; ningún número cambia.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";

/**
 * El total de una portada del celular: 36 px (era 46), a la izquierda.
 * v3.3 (2-oct-2026), Daniel: «que los números no sean en negrita, que no manden
 * tanto» → peso normal (400), gris oscuro, cifras de ancho fijo.
 */
export const CLASE_TOTAL_CELULAR =
  "block text-[36px] font-normal leading-none tracking-tight tabular-nums text-gray-800";

/** La línea gris bajo el total: UNA línea, nunca dos. */
export const CLASE_LINEA_TOTAL = "block truncate pt-1 text-[13px] text-gray-500";

export interface OpcionSegmentada<K extends string> {
  clave: K;
  rotulo: ReactNode;
  /** El tramo que avisa (+120 d): texto rojo, prendido o no. */
  rojo?: boolean;
}

/**
 * Control segmentado de todo el ancho: 36 px a la vista, 44 al tocar, una
 * línea por opción. Lo que pasa al tocar la opción prendida lo decide quien llama.
 */
export function SegmentadoCelular<K extends string>({
  opciones,
  activa,
  onElegir,
  etiqueta,
}: {
  opciones: readonly OpcionSegmentada<K>[];
  activa: K | null;
  onElegir: (k: K) => void;
  etiqueta: string;
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      data-segmentado-celular
      className="flex h-9 w-full gap-0.5 rounded-lg bg-[#E3E3E8] p-0.5"
    >
      {opciones.map((o) => {
        const prendida = o.clave === activa;
        return (
          <button
            key={o.clave}
            type="button"
            aria-pressed={prendida}
            onClick={() => onElegir(o.clave)}
            className={[
              // flex-auto y sin tabular-nums: medido a 390 px, los tres tramos suman
              // 303 px de texto (326 con tabular) en 350 de ancho; así ninguno se corta
              "relative min-w-0 flex-auto truncate whitespace-nowrap rounded-md px-1 text-[13px] transition",
              "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
              // v3.3: los montos en peso medio, prendido o no; lo prendido lo dice el fondo blanco
              "font-medium",
              prendida ? "bg-white shadow-sm" : "active:bg-white/60",
              o.rojo ? "text-[#A32D2D]" : "text-gray-900",
            ].join(" ")}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
