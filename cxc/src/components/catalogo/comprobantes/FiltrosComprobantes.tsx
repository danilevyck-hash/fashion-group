"use client";

// Los dos filtros de Comprobantes, con el MISMO aspecto: dos grupos de
// píldoras, cada uno con su rótulo chico. Lo que decide qué chips existen y
// cuánto vale cada conteo vive en `lib/catalogo/chips-comprobantes.ts` —
// escribirlo acá sería una segunda definición de la misma pregunta.

import type { Chip, GrupoChips } from "@/lib/catalogo/chips-comprobantes";

function GrupoDeChips<K extends string>({
  grupo,
  onElegir,
  medir,
}: {
  grupo: GrupoChips<K>;
  onElegir: (clave: K) => void;
  medir: string;
}) {
  if (grupo.opciones.length === 0) return null;
  return (
    <div data-medir={medir}>
      <p className="text-xs text-gray-400 mb-1.5">{grupo.rotulo}</p>
      <div className="flex flex-wrap gap-2">
        {grupo.opciones.map((c: Chip<K>) => (
          <button
            key={c.clave}
            onClick={() => onElegir(c.clave)}
            aria-pressed={c.activo}
            className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full border text-sm font-medium whitespace-nowrap transition ${
              c.activo
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            {c.label}
            <span className={`tabular-nums text-xs ${c.activo ? "text-white/70" : "text-gray-400"}`}>
              {c.conteo}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FiltrosComprobantes<O extends string, V extends string>({
  origen,
  vista,
  onOrigen,
  onVista,
}: {
  origen: GrupoChips<O>;
  vista: GrupoChips<V>;
  onOrigen: (clave: O) => void;
  onVista: (clave: V) => void;
}) {
  return (
    <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:gap-8">
      <GrupoDeChips grupo={origen} onElegir={onOrigen} medir="filtro-origen-comprobante" />
      <GrupoDeChips grupo={vista} onElegir={onVista} medir="filtro-tipo-comprobante" />
    </div>
  );
}
