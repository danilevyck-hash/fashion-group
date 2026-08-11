"use client";

// El estado del mes, en pantalla.
//
// 🔑 ESTO ES LO MÁS IMPORTANTE DE LA PANTALLA. Un mes sin contabilidad NO puede
// verse como $0: si Daniel ve un cero cree que no gastó nada y decide con un
// número inventado. Sólo `cerrado` y `parcial` autorizan a mostrar el monto;
// `sin_cerrar` y `sin_datos` muestran su etiqueta y su explicación, nunca una
// cifra.
//
// Los textos NO se inventan acá: salen de `ETIQUETA_ESTADO` y
// `explicacionEstado`, que son la fuente única del módulo del mayor.

import { ETIQUETA_ESTADO, explicacionEstado, type EstadoMes } from "@/lib/mayor/gastos";
import { mesLargo } from "./tipos";

const COLOR: Record<EstadoMes, string> = {
  cerrado: "border-emerald-200 bg-emerald-50 text-emerald-800",
  parcial: "border-amber-200 bg-amber-50 text-amber-900",
  sin_cerrar: "border-gray-300 bg-gray-100 text-gray-700",
  sin_datos: "border-gray-200 bg-gray-50 text-gray-600",
};

/** ¿Se puede mostrar el monto de este mes como un hecho? */
export function muestraMonto(estado: EstadoMes): boolean {
  return estado === "cerrado" || estado === "parcial";
}

/** La explicación larga, ya con el último mes cerrado adentro. */
export function explicacionDe(estado: EstadoMes, ultimoMesCerrado: string | null): string {
  return explicacionEstado(estado, ultimoMesCerrado ? mesLargo(ultimoMesCerrado) : null);
}

export default function EstadoMesTag({ estado }: { estado: EstadoMes }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-sm font-medium ${COLOR[estado]}`}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}
