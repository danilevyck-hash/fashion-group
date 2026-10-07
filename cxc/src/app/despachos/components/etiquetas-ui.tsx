"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › ETIQUETAS — las piezas de pantalla que comparten la pestaña de antes
// («Una a la vez») y la de envíos (1-oct-2026). Salieron de `EtiquetasView.tsx`
// tal cual, sin cambiar una clase: así las dos pantallas se ven iguales y el
// interruptor `ETIQUETAS_POR_ENVIO` no cambia nada más que lo que tiene que
// cambiar.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState, type ReactNode } from "react";
import { ControlSegmentado } from "@/components/ventas/ControlSegmentado";
import {
  FORMATO_POR_DEFECTO,
  OPCIONES_FORMATO,
  type FormatoEtiquetas,
} from "@/lib/guias/etiquetas";
import type { FacturaDelCliente } from "@/lib/guias/atajos-facturas";

export const BOTON_NEGRO =
  "inline-flex items-center justify-center gap-2 bg-black text-white rounded-md px-4 text-sm font-medium " +
  "transition hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40 min-h-[44px]";
export const BOTON_BLANCO =
  "inline-flex items-center justify-center gap-2 border border-gray-200 text-gray-700 rounded-md px-4 text-sm " +
  "transition hover:bg-gray-50 active:scale-[0.97] disabled:opacity-40 min-h-[44px]";
export const CHIP =
  "inline-flex items-center rounded-full border px-3.5 text-sm transition min-h-[44px] " +
  "md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1.5";

export function fmtMonto(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function claveFactura(f: Pick<FacturaDelCliente, "empresa_key" | "secuencial">): string {
  return `${f.empresa_key}-${f.secuencial}`;
}

/**
 * 🔴 EL PAPEL SE RECUERDA POR NAVEGADOR (30-sep-2026): la computadora que está
 * al lado de la impresora de etiquetas queda en un papel y la de la oficina en
 * otro, sin elegir cada vez.
 *
 * 🔴 1-oct-2026, Daniel: *«Se imprimirá SIEMPRE en 4 de ancho y 6 de alto
 * pulgadas, vertical. Y ponlo como default»*. Sin nada recordado (o sin
 * memoria: privado, bloqueado) sale la etiqueta 4×6; quien ELIGIÓ carta a
 * propósito la sigue teniendo.
 */
const CLAVE_FORMATO = "fg_guias_etiquetas_formato";

function formatoRecordado(): FormatoEtiquetas {
  try {
    const v = localStorage.getItem(CLAVE_FORMATO);
    return v === "carta" || v === "4x6" ? v : FORMATO_POR_DEFECTO;
  } catch {
    return FORMATO_POR_DEFECTO;
  }
}

export function useFormatoEtiquetas(): [FormatoEtiquetas, (f: FormatoEtiquetas) => void] {
  // ⚠️ El panel y el modal nacen con un toque, nunca en el HTML del servidor:
  // leer la memoria al arrancar no descuadra la hidratación.
  const [formato, setFormato] = useState<FormatoEtiquetas>(formatoRecordado);
  const elegir = useCallback((f: FormatoEtiquetas) => {
    setFormato(f);
    try { localStorage.setItem(CLAVE_FORMATO, f); } catch { /* sin memoria: solo esta vez */ }
  }, []);
  return [formato, elegir];
}

export function ElegirPapel({ formato, onElegir }: { formato: FormatoEtiquetas; onElegir: (f: FormatoEtiquetas) => void }) {
  return (
    <ControlSegmentado
      options={OPCIONES_FORMATO}
      active={formato}
      onChange={onElegir}
      ariaLabel="Papel de las etiquetas"
      ancho="contenido"
      className="mb-3"
    />
  );
}

export function Paso({ n, titulo, ayuda }: { n: number; titulo: string; ayuda: string }) {
  return (
    <div className="mb-2.5 flex items-start gap-3">
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-gray-900 tabular-nums text-[12px] font-semibold text-white">
        {n}
      </span>
      <div>
        <div className="text-[13.5px] font-semibold">{titulo}</div>
        <div className="mt-0.5 text-[12.5px] text-gray-600">{ayuda}</div>
      </div>
    </div>
  );
}

export function Opcion({
  elegida,
  onElegir,
  titulo,
  detalle,
  children,
}: {
  elegida: boolean;
  onElegir: () => void;
  titulo: string;
  detalle: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={elegida}
      tabIndex={0}
      onClick={onElegir}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onElegir(); } }}
      className={`mb-2 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
        elegida ? "border-gray-900 bg-gray-50" : "border-gray-200"
      }`}
    >
      <span className={`mt-0.5 h-[17px] w-[17px] shrink-0 rounded-full ${elegida ? "border-[5px] border-gray-900" : "border border-gray-400"}`} />
      <div>
        <div className="text-[13.5px] font-medium">{titulo}</div>
        <div className="mt-0.5 text-[12.5px] text-gray-600">{detalle}</div>
        {children}
      </div>
    </div>
  );
}
