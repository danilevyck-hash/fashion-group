"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LOS DOS BOTONES: SÍ y NO (10-sep-2026).
 *
 * Daniel: *«Dos botones: Sí y No. Se decide, y el renglón se va»*. Es el ÚNICO
 * control con el que se decide, en las dos vistas y en los tres niveles (la
 * persona, el día, la persona en un día). Reemplaza a la casilla.
 *
 * 🔴 Volver a tocar el que está prendido lo APAGA (vuelve a pendiente): un
 * toque de más no puede ser irreversible, y no hace falta un tercer botón.
 * 🔴 44 px de alto: se toca en el iPad.
 * ────────────────────────────────────────────────────────────────────────── */

import type { Decision } from "@/lib/asistencia/aprobaciones";

export function BotonesSiNo({
  decision,
  etiqueta,
  disabled,
  onDecidir,
}: {
  /** Lo que está decidido hoy (prende el botón). `null` = ninguno. */
  decision: Decision;
  /** De quién o de qué se decide: va en el `aria-label` («Sí a Kevin Lubo»). */
  etiqueta: string;
  disabled?: boolean;
  onDecidir: (decision: Decision) => void;
}) {
  const boton = (valor: "si" | "no") => {
    const prendido = decision === valor;
    const texto = valor === "si" ? "Sí" : "No";
    return (
      <button
        type="button"
        aria-label={`${texto} a ${etiqueta}`}
        aria-pressed={prendido}
        disabled={disabled}
        onClick={() => onDecidir(prendido ? null : valor)}
        className={`min-h-[44px] min-w-[52px] rounded-md border px-3 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-40 ${
          prendido
            ? valor === "si"
              ? "border-emerald-700 bg-emerald-700 text-white"
              : "border-gray-800 bg-gray-800 text-white"
            : valor === "si"
              ? "border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              : "border-gray-300 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {texto}
      </button>
    );
  };
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {boton("si")}
      {boton("no")}
    </span>
  );
}

/** «domingo» / «feriado» al lado de un día que no es hábil. Nada para la extra. */
export function ChipTipo({ tipo }: { tipo: "extra" | "domingo" | "feriado" }) {
  if (tipo === "extra") return null;
  return (
    <span
      className="shrink-0 rounded bg-amber-50 px-1.5 text-[11px] text-amber-800"
      title="Trabajado en un día que no es hábil: se paga con el recargo de domingo y feriado."
    >
      {tipo}
    </span>
  );
}

/** La flecha del ⌄ que abre los días. */
export function Flecha({ abierta }: { abierta: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 text-gray-400 transition-transform ${abierta ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
