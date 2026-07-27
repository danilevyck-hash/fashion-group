"use client";

// Typeahead de cliente contra el directorio (clientes_master vía /api/clientes).
// Al seleccionar un cliente del dropdown, guarda su código D-XXX (onSelect).
// Si el usuario escribe libre sin elegir, queda "sin vincular" (codigo = "")
// y el texto se conserva tal cual — no se rompe nada con guías legacy.
//
// GUÍAS YA NO LO USA (jul-2026): ahí el cliente pasó a ser un selector CERRADO
// con opción "Otro" explícita — ver src/components/ClientePicker.tsx. Este queda
// para Marketing (ProyectoForm y EditarProyectoModal), donde escribir libre es
// el comportamiento deseado. La búsqueda es la misma en los dos
// (`useBusquedaClientes`).

import { useEffect, useRef, useState } from "react";
import { useBusquedaClientes, type ClienteHit } from "@/lib/hooks/useBusquedaClientes";

interface ClienteTypeaheadProps {
  value: string;
  codigo: string;
  onSelect: (nombre: string, codigo: string) => void;
  onFreeText: (texto: string) => void;
  onBlur?: () => void;
  inputClassName?: string;
  hasError?: boolean;
  placeholder?: string;
  // OPCIONAL y aditivo: clientes más usados a mostrar arriba cuando el input
  // está vacío (query < 2). Si no se pasa (ej. Marketing), el comportamiento es
  // idéntico al previo: el dropdown solo aparece al teclear ≥ 2 caracteres.
  topClientes?: ClienteHit[];
}

export default function ClienteTypeahead({
  value,
  codigo,
  onSelect,
  onFreeText,
  onBlur,
  inputClassName = "",
  hasError = false,
  placeholder = "Buscar cliente…",
  topClientes,
}: ClienteTypeaheadProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const { hits, cargando: loading } = useBusquedaClientes(query, open);

  // Cerrar al hacer click afuera.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          // Texto libre → se conserva, se desvincula el código.
          onFreeText(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery(value);
          setOpen(true);
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        className={inputClassName}
      />

      {/* Indicador de vínculo */}
      {value.trim() && (
        <span
          className={`absolute right-1 top-1/2 -translate-y-1/2 text-xs px-1 rounded pointer-events-none ${
            codigo
              ? "text-emerald-700 bg-emerald-50"
              : "text-gray-400"
          }`}
          title={codigo ? `Vinculado a ${codigo}` : "Sin vincular al directorio"}
        >
          {codigo || "sin vincular"}
        </span>
      )}

      {/* Búsqueda (≥2 chars). Comportamiento original. */}
      {open && (query.trim().length >= 2) && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
          {loading ? (
            <div className="px-3 py-2 text-xs text-gray-400">Buscando…</div>
          ) : hits.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">
              Sin resultados — se guardará como texto libre (sin vincular).
            </div>
          ) : (
            hits.map((h) => (
              <button
                key={h.codigo}
                type="button"
                onMouseDown={(e) => {
                  // onMouseDown (no onClick) para ganarle al onBlur del input.
                  e.preventDefault();
                  onSelect(h.nombre, h.codigo);
                  setOpen(false);
                }}
                className="w-full text-left px-3 min-h-[44px] hover:bg-gray-50 flex items-center justify-between gap-2"
              >
                <span className="truncate">{h.nombre}</span>
                <span className="text-xs text-gray-400 font-mono shrink-0">{h.codigo}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Más usados (input vacío). Solo si el caller pasó topClientes. Aditivo:
          sin el prop, este bloque nunca se renderiza. */}
      {open &&
        query.trim().length < 2 &&
        topClientes &&
        topClientes.length > 0 && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
            <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-400">
              Más usados
            </div>
            {topClientes.map((h) => (
              <button
                key={h.codigo}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(h.nombre, h.codigo);
                  setOpen(false);
                }}
                className="w-full text-left px-3 min-h-[44px] hover:bg-gray-50 flex items-center justify-between gap-2"
              >
                <span className="truncate">{h.nombre}</span>
                <span className="text-xs text-gray-400 font-mono shrink-0">{h.codigo}</span>
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
