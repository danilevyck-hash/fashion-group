"use client";

// De dónde sale el número. DOS botones, uno encendido a la vez.
//
// 🔴 NO ES UN FILTRO COSMÉTICO: es lo que impide sumar dos fuentes que miden
// cosas distintas (ver `tipos.tsx`). Por eso son EXCLUYENTES —no dos casillas
// que se puedan encender juntas— y por eso debajo va, siempre, la frase que
// dice qué es la fuente elegida. Un número de plata sin decir de dónde viene es
// exactamente lo que este módulo vino a arreglar.

import { FUENTES, type FuenteGastos } from "./tipos";

interface Props {
  fuente: FuenteGastos;
  onCambiar: (f: FuenteGastos) => void;
}

export default function SelectorFuente({ fuente, onCambiar }: Props) {
  const activa = FUENTES.find((f) => f.clave === fuente) ?? FUENTES[0];

  return (
    <div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="De dónde sale el número"
      >
        {FUENTES.map((f) => {
          const encendida = f.clave === fuente;
          return (
            <button
              key={f.clave}
              type="button"
              onClick={() => onCambiar(f.clave)}
              aria-pressed={encendida}
              className={`min-h-[44px] rounded-md border px-3 py-2 text-sm transition active:scale-[0.97] ${
                encendida
                  ? "border-gray-900 bg-gray-900 font-semibold text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
              }`}
            >
              {f.etiqueta}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-gray-600">{activa.explicacion}</p>
    </div>
  );
}
