"use client";

// «Precio ▾» como un chip más, al lado de Género y Categoría
// (`CATALOGOS_APPLE_2026_10_B` · buscadorEnUnaFila, 2-oct-2026). Daniel: «al
// tocar filtro, precio desde/hasta ¿no debería estar al nivel de categoría? Y
// desde/hasta no combina con el módulo».
//
// 🔴 FILTRA LO MISMO que `FiltroPrecioExacto`: se manda el MISMO par
// {desde, hasta} y lo sigue decidiendo `precioEnFiltro`. Con solo «Desde»
// escrito, «Hasta» toma el mismo número (el espejo del 24-ago-2026: escribir
// un precio filtra ese precio exacto). Lo único nuevo es que se escribe en un
// panel y se aplica con «Aplicar».

import { useRef, useState } from "react";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import { mensajeFiltroPrecio, PRECIO_VACIO, type FiltroPrecio } from "@/lib/catalogo/filtros-extra";
import { precioAlAplicar, textoChipPrecio } from "@/lib/catalogo/catalogos-2026-10-b";

interface Props {
  precio: FiltroPrecio;
  onChange: (precio: FiltroPrecio) => void;
  precios: number[];
  chipActive: string;
  chipInactive: string;
  /** El tamaño del chip compacto de la v4. */
  tam?: string;
}

const CAMPO = "w-full min-h-[44px] rounded-md border border-gray-300 bg-white px-3 text-sm tabular-nums text-gray-900 outline-none focus:border-gray-900 placeholder:text-gray-400";

export default function FiltroPrecioChip({ precio, onChange, precios, chipActive, chipInactive, tam }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<FiltroPrecio>(precio);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const texto = textoChipPrecio(precio);
  const aviso = mensajeFiltroPrecio(borrador.desde, borrador.hasta || borrador.desde, precios);

  function abrir() {
    setBorrador(precio);
    setAbierto((a) => !a);
  }
  function aplicar() {
    onChange(precioAlAplicar(borrador));
    setAbierto(false);
  }
  function limpiar() {
    setBorrador(PRECIO_VACIO);
    onChange(PRECIO_VACIO);
    setAbierto(false);
  }

  return (
    <>
      <button
        ref={anclaRef}
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className={`inline-flex items-center gap-1 ${tam ?? "px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px]"} ${texto ? chipActive : chipInactive}`}
      >
        <span>{texto ?? "Precio"}</span>
        <svg className="w-3 h-3 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <DesplegableFlotante
        abierto={abierto}
        anclaRef={anclaRef}
        onCerrar={() => setAbierto(false)}
        marca="catalogo-filtro-precio"
        role="dialog"
        aria-label="Precio"
        anchoMinimo={260}
        className="bg-white rounded-lg border border-gray-200 shadow-lg p-3"
      >
        <form onSubmit={(e) => { e.preventDefault(); aplicar(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">Desde</span>
              <input value={borrador.desde} onChange={(e) => setBorrador({ ...borrador, desde: e.target.value })}
                inputMode="decimal" type="text" placeholder="$" aria-label="Precio desde" className={CAMPO} autoFocus />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">Hasta</span>
              <input value={borrador.hasta} onChange={(e) => setBorrador({ ...borrador, hasta: e.target.value })}
                inputMode="decimal" type="text" placeholder="$" aria-label="Precio hasta" className={CAMPO} />
            </label>
          </div>
          {aviso && <p role="status" className="text-xs text-amber-700">{aviso}</p>}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={limpiar} className="min-h-[44px] rounded-md px-3 text-sm text-gray-600 hover:text-gray-900">Limpiar</button>
            <button type="submit" className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-gray-800">Aplicar</button>
          </div>
        </form>
      </DesplegableFlotante>
    </>
  );
}
