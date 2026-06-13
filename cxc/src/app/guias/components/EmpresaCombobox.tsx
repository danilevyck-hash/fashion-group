"use client";

// Combobox de empresa para el ítem de guía: escribible + scrolleable, filtra al
// teclear contra las 8 empresas canónicas (vienen ordenadas por frecuencia de
// uso desde /api/guias/frecuencias). Al elegir una opción guarda el nombre
// canónico. Permite texto libre para que las guías viejas (texto sucio:
// "VISTANA", "VISTANA / FASHION WEAR") sigan mostrándose sin romperse.

import { useEffect, useRef, useState } from "react";

interface EmpresaComboboxProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  onBlur?: () => void;
  inputClassName?: string;
  placeholder?: string;
}

export default function EmpresaCombobox({
  value,
  onChange,
  options,
  onBlur,
  inputClassName = "",
  placeholder = "Empresa…",
}: EmpresaComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  // Con input vacío (o recién abierto) se muestran las 8 en orden de frecuencia;
  // al teclear se filtra por substring.
  const filtradas = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options;

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          // Texto libre permitido (compat legacy); también filtra el dropdown.
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        className={inputClassName}
      />

      {open && filtradas.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
          {filtradas.map((o) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => {
                // onMouseDown (no onClick) para ganarle al onBlur del input.
                e.preventDefault();
                onChange(o);
                setQuery("");
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                o === value ? "bg-gray-50 font-medium" : ""
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
