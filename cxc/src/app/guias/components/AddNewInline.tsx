"use client";

// "＋" para sumar una opción a una lista corta (quién despacha, destinos).
//
// Se escapó de la auditoría iPhone (#318) porque es un control que aparece
// dentro de un label: sus tres botones medían ~13×16 y el input iba en `text-xs`
// (Safari hace zoom al enfocar cualquier campo por debajo de 16px). Ahora los
// tres son 44×44 y el campo va en text-base en móvil.

import { useState } from "react";

interface AddNewInlineProps {
  onAdd: (v: string) => void;
  placeholder: string;
  /** Qué agrega, en español simple. Va a aria-label: un "＋" solo no dice nada. */
  etiqueta?: string;
}

/**
 * 🩸 ACÁ VIVÍA UN `textoBoton` — el rótulo VISIBLE al lado del "＋", agregado el
 * 25-ago-2026 porque Daniel abrió el control en el iPhone y no entendió qué era.
 * Murió el 26-ago-2026, con su único uso: el problema NO era que faltara texto,
 * era que el "＋" estaba lejos del campo que lo explica. Pegado al campo de
 * Dirección se entiende sin leer, y el rótulo pasaba a ser el ruido que Daniel
 * fue a sacar (*"se ve ruidoso ahí"*). Si vuelve a hacer falta un texto acá, la
 * pregunta correcta es dónde está el botón, no qué dice.
 */
export default function AddNewInline({ onAdd, placeholder, etiqueta = "Agregar nuevo" }: AddNewInlineProps) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");

  function confirmar() {
    if (!val.trim()) return;
    onAdd(val.trim());
    setVal("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={etiqueta}
        title={etiqueta}
        className="transition text-base inline-flex items-center justify-center min-w-[44px] min-h-[44px] -my-3 text-gray-300 hover:text-gray-500"
      >
        ＋
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 -my-3">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); confirmar(); }
          if (e.key === "Escape") { setVal(""); setOpen(false); }
        }}
        placeholder={placeholder}
        aria-label={etiqueta}
        /* text-base en móvil: con menos de 16px Safari hace zoom al enfocar. */
        className="border-b border-gray-300 px-1 text-base sm:text-xs outline-none focus:border-black w-28 min-h-[44px]"
        autoFocus
      />
      <button
        type="button"
        onClick={confirmar}
        aria-label="Guardar"
        className="text-xs text-gray-500 hover:text-black inline-flex items-center justify-center min-w-[44px] min-h-[44px]"
      >
        OK
      </button>
      <button
        type="button"
        onClick={() => { setVal(""); setOpen(false); }}
        aria-label="Cancelar"
        className="text-xs text-gray-300 hover:text-black inline-flex items-center justify-center min-w-[44px] min-h-[44px]"
      >
        ×
      </button>
    </span>
  );
}
