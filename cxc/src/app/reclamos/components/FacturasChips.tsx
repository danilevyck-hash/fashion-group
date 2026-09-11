"use client";

import { useState } from "react";
import { facturasDe } from "@/lib/reclamos/facturas";

interface Props {
  facturas: string[];
  onChange: (facturas: string[]) => void;
  /** Cómo se llama el campo (rótulo). */
  rotulo?: string;
}

/**
 * Las facturas de un reclamo, una por chip. Se agrega con «+ otra factura»
 * (Enter o el botón); se quita con la ×. Lo que se pega con separadores
 * («3000013660 - 3000013658») se parte solo con la MISMA regla que la base
 * (`facturasDe`), así no vuelven a nacer dos facturas pegadas.
 */
export default function FacturasChips({ facturas, onChange, rotulo = "Factura(s) *" }: Props) {
  const [nueva, setNueva] = useState("");

  function agregar() {
    const partes = facturasDe(nueva);
    if (partes.length === 0) return;
    const set = new Set(facturas);
    onChange([...facturas, ...partes.filter((p) => !set.has(p))]);
    setNueva("");
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{rotulo}</label>
      <div className="flex flex-wrap items-center gap-2">
        {facturas.map((f) => (
          <span key={f} className="inline-flex items-center gap-1 rounded-md border border-gray-900 px-2 text-sm tabular-nums min-h-[36px]">
            {f}
            <button
              type="button"
              aria-label={`Quitar la factura ${f}`}
              onClick={() => onChange(facturas.filter((x) => x !== f))}
              className="text-gray-400 hover:text-black inline-flex items-center justify-center min-w-[32px] min-h-[36px] -mr-2"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
          onBlur={agregar}
          placeholder={facturas.length ? "+ otra factura" : "Ej. 3000012593"}
          aria-label={facturas.length ? "Otra factura" : "Factura"}
          className="border-b border-gray-200 py-3 xl:py-1.5 text-base xl:text-sm text-black outline-none min-w-[160px] flex-1"
        />
      </div>
    </div>
  );
}
