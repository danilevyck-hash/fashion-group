"use client";

// Selector de rango con atajos, estilo iOS/macOS: se elige un período con un
// toque y solo se abre el calendario si hace falta una fecha suelta.
//
// Daniel lo pidió "estilo Apple". Lo que hace que se sienta así no es el
// aspecto: es que **el camino corto exista**. Nadie quiere elegir dos fechas
// para ver "esta quincena" — eso es lo que se mira el 95% de las veces.

import { useState } from "react";

const PANAMA_MS = 5 * 3600_000;
const iso = (d: Date) => new Date(d.getTime() - PANAMA_MS).toISOString().slice(0, 10);
const hoyPanama = () => iso(new Date());
const menos = (dias: number) => iso(new Date(Date.now() - dias * 86_400_000));

/** Quincena en curso: del 1 al 15, o del 16 al fin de mes. Es el período con
 *  el que se paga, así que es el atajo que más se usa. */
function quincena(actual: boolean): [string, string] {
  const h = new Date(Date.now() - PANAMA_MS);
  const y = h.getUTCFullYear(), m = h.getUTCMonth(), d = h.getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");
  const finMes = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (actual) {
    return d <= 15
      ? [`${y}-${p(m + 1)}-01`, `${y}-${p(m + 1)}-15`]
      : [`${y}-${p(m + 1)}-16`, `${y}-${p(m + 1)}-${p(finMes)}`];
  }
  if (d <= 15) {
    // La anterior es la segunda del mes pasado.
    const ant = new Date(Date.UTC(y, m, 0));
    const ay = ant.getUTCFullYear(), am = ant.getUTCMonth();
    return [`${ay}-${p(am + 1)}-16`, `${ay}-${p(am + 1)}-${p(ant.getUTCDate())}`];
  }
  return [`${y}-${p(m + 1)}-01`, `${y}-${p(m + 1)}-15`];
}

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function bonito(d: string): string {
  const [a, m, dd] = d.split("-").map(Number);
  return `${dd} ${MESES[m - 1]} ${a}`;
}

interface Props {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
}

export default function RangoFechas({ desde, hasta, onChange }: Props) {
  const [abierto, setAbierto] = useState(false);

  const atajos: Array<[string, () => [string, string]]> = [
    ["Quincena en curso", () => quincena(true)],
    ["Quincena anterior", () => quincena(false)],
    ["Últimos 15 días", () => [menos(14), hoyPanama()]],
    ["Últimos 30 días", () => [menos(29), hoyPanama()]],
  ];
  const activo = atajos.find(([, f]) => { const [d, h] = f(); return d === desde && h === hasta; })?.[0];

  return (
    <div className="min-w-[240px]">
      <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Período</label>

      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 text-left text-sm transition hover:border-gray-400"
      >
        <span className="text-gray-900">
          {activo ?? `${bonito(desde)} — ${bonito(hasta)}`}
        </span>
        <span className="text-gray-400">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && (
        <div className="mt-1 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
          <div className="flex flex-col">
            {atajos.map(([label, f]) => (
              <button
                key={label}
                type="button"
                onClick={() => { const [d, h] = f(); onChange(d, h); setAbierto(false); }}
                className={`min-h-[40px] rounded-md px-2 text-left text-sm transition hover:bg-gray-50 ${
                  activo === label ? "font-semibold text-gray-900" : "text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* El calendario queda abajo, no arriba: es la salida de emergencia,
              no el camino principal. */}
          <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
            <input type="date" value={desde} max={hasta} onChange={(e) => onChange(e.target.value, hasta)}
              className="min-h-[40px] w-full rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-black" />
            <span className="text-xs text-gray-400">a</span>
            <input type="date" value={hasta} min={desde} onChange={(e) => onChange(desde, e.target.value)}
              className="min-h-[40px] w-full rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-black" />
          </div>
        </div>
      )}
    </div>
  );
}
