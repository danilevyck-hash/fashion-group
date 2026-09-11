"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * «YA DECIDIDAS (N) ▸» — abajo y plegado (10-sep-2026).
 *
 * Los renglones que ya no tienen ningún día pendiente. Cada uno: nombre ·
 * Sí / No / «Sí y No» · horas · «cambiar», que abre sus días con los mismos
 * botones para volver atrás (tocar el prendido lo deja pendiente; tocar el otro
 * cambia la decisión). Un toque de más no puede ser irreversible.
 * ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { hm, resumenDecision, type PersonaAprobacion } from "@/lib/asistencia/aprobaciones-vistas";
import { DiasDePersona, type PropsVista } from "./PorColaborador";

export default function YaDecididas({
  personas, onDecidir, enVuelo, bloqueado,
}: Pick<PropsVista, "onDecidir" | "enVuelo" | "bloqueado"> & { personas: readonly PersonaAprobacion[] }) {
  const [abierto, setAbierto] = useState(false);
  const [cambiando, setCambiando] = useState<ReadonlySet<string>>(new Set());
  if (personas.length === 0) return null;
  return (
    <div className="mt-6 border-t border-gray-200 pt-3" data-testid="ya-decididas">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex min-h-[44px] items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <span aria-hidden="true" className={`inline-block transition-transform ${abierto ? "rotate-90" : ""}`}>▸</span>
        Ya decididas ({personas.length})
      </button>
      {abierto && (
        <div className="mt-2">
          {personas.map((p) => {
            const cambia = cambiando.has(p.codigo);
            const resumen = resumenDecision(p.dias);
            return (
              <div key={p.codigo} className="mb-1.5 overflow-hidden rounded-[10px] border border-gray-200 bg-white">
                <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-1 tabular-nums">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{p.etiqueta}</span>
                  <span className={`text-sm font-semibold ${resumen === "No" ? "text-gray-600" : "text-emerald-700"}`}>
                    {resumen}
                  </span>
                  <span className="text-sm text-gray-600">{hm(p.minutos)} h</span>
                  <button
                    type="button"
                    aria-expanded={cambia}
                    onClick={() =>
                      setCambiando((s) => {
                        const n = new Set(s);
                        if (n.has(p.codigo)) n.delete(p.codigo); else n.add(p.codigo);
                        return n;
                      })
                    }
                    className="min-h-[44px] text-sm text-gray-500 underline underline-offset-2 hover:text-gray-900"
                  >
                    {cambia ? "cerrar" : "cambiar"}
                  </button>
                </div>
                {cambia && <DiasDePersona p={p} onDecidir={onDecidir} enVuelo={enVuelo} bloqueado={bloqueado} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
