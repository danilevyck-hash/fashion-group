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
  /**
   * 🔴 EL RÓTULO VISIBLE al lado del "＋" (7-sep-2026). Sin él, lo único que
   * dice qué hace el botón es el `title`, que **solo aparece pasando el mouse
   * por encima — y en el iPad no hay mouse**. Daniel lo pidió de vuelta para el
   * "＋" del campo Dirección. Opcional: sin rótulo, el control es el de antes.
   */
  textoBoton?: string;
}

/**
 * 🩸 `textoBoton` —el rótulo VISIBLE al lado del "＋"— nació el 25-ago-2026,
 * murió el 26-ago (*"se ve ruidoso ahí"*, y el diagnóstico entonces fue que el
 * problema era la POSICIÓN del botón, no su texto) y **volvió el 7-sep-2026**,
 * esta vez solo para el "＋" del campo Dirección.
 *
 * Por qué vuelve, y esta vez con razón medida: pegado al campo se entiende
 * dónde está, pero **no qué hace** — lo único que lo explicaba era el `title`,
 * y un `title` solo aparece pasando el mouse por encima. En el iPad, que es
 * donde se arman las guías, no hay mouse: el control era un símbolo gris sin
 * nombre. Regla de la casa: *nada que dependa de pasar el mouse por encima*.
 *
 * ⚠️ Sigue siendo OPCIONAL. El "＋" de «quién despacha» no lo lleva: ese vive
 * debajo de un rótulo que ya dice qué es.
 */
export default function AddNewInline({ onAdd, placeholder, etiqueta = "Agregar nuevo", textoBoton }: AddNewInlineProps) {
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
        className={`transition text-base inline-flex items-center justify-center gap-1 min-w-[44px] min-h-[44px] -my-3 text-gray-400 hover:text-black ${
          textoBoton ? "px-2" : ""
        }`}
      >
        ＋
        {/* El rótulo, chico y en gris: dice qué hace sin competir con el campo. */}
        {textoBoton && <span className="text-xs whitespace-nowrap">{textoBoton}</span>}
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
