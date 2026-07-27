"use client";

// Selector CERRADO de cliente. COMPARTIDO: lo usan Guías y Cheques.
//
// Vivía en `app/guias/components/`. Se movió a `src/components/` en jul-2026,
// cuando Cheques pidió "que el cliente sea como en Guías": el componente ya era
// agnóstico (su API es value/codigo/onChange/topClientes, sin nada de guías), y
// tenerlo bajo una ruta de módulo obligaba a importarlo cruzado — que es lo que
// ya venía haciendo Marketing con su hermano `ClienteTypeahead`.
//
// La diferencia con el typeahead libre de antes (ClienteTypeahead, que sigue
// vivo para Marketing) es una sola, y es la que pidió Daniel:
//
//   > "quiero que solo se pueda poner un cliente de la lista … o que haya una
//      opción de otro para texto libre"
//
// Antes, lo que se tecleaba SE GUARDABA solo: escribir "city" y salirse dejaba
// la guía con el cliente "city", sin vínculo al directorio y sin que nadie lo
// decidiera. Acá lo que se teclea es SOLO una búsqueda (estado local `query`);
// el valor de la fila cambia únicamente cuando se elige algo:
//
//   • un cliente de la lista  → queda VINCULADO (guarda su código D-XXX)
//   • la opción "Otro"        → queda a mano, marcado como tal
//
// Cerrar sin elegir no cambia nada: el campo vuelve a mostrar lo que había.
//
// Buscar tecleando sigue siendo el camino rápido: el foco abre la lista, se
// escribe y se toca el resultado. No hay que scrollear 200 nombres.

import { useEffect, useRef, useState } from "react";
import { useBusquedaClientes, type ClienteHit } from "@/lib/hooks/useBusquedaClientes";

interface ClientePickerProps {
  /** Nombre ya guardado en la fila. */
  value: string;
  /** Código D-XXX ya guardado. "" = a mano ("Otro"). */
  codigo: string;
  /** Se llama SOLO cuando el usuario elige. `codigo` vacío = texto a mano. */
  onChange: (nombre: string, codigo: string) => void;
  /** Clientes más usados, para mostrar sin teclear nada. */
  topClientes?: ClienteHit[];
  /**
   * Mostrar el distintivo de cómo quedó el cliente: el código D-XXX en verde
   * (vinculado) o "Otro" en ámbar (a mano).
   *
   * Solo tiene sentido donde el código SE GUARDA. En Guías sí
   * (`guia_items.cliente_codigo`). En Cheques NO: la tabla `cheques` guarda el
   * nombre como texto y nada más, así que pintar un "D-126" verde prometería un
   * vínculo que no existe en la base — y al reabrir el cheque el mismo cliente
   * aparecería como "Otro". Ahí se apaga y el campo es, simplemente, el nombre.
   */
  mostrarVinculo?: boolean;
  hasError?: boolean;
  inputClassName?: string;
  id?: string;
}

/** Fila del desplegable. 44 px de alto: se toca desde el iPhone. */
function Opcion({
  onElegir,
  children,
  destacada = false,
}: {
  onElegir: () => void;
  children: React.ReactNode;
  destacada?: boolean;
}) {
  return (
    <button
      type="button"
      // onMouseDown (no onClick) para ganarle al onBlur del input.
      onMouseDown={(e) => {
        e.preventDefault();
        onElegir();
      }}
      className={`w-full text-left px-3 min-h-[44px] flex items-center justify-between gap-2 text-sm transition ${
        destacada ? "bg-amber-50/60 hover:bg-amber-100 text-amber-900" : "hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function ClientePicker({
  value,
  codigo,
  onChange,
  topClientes,
  mostrarVinculo = true,
  hasError = false,
  inputClassName = "",
  id,
}: ClientePickerProps) {
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const { hits, cargando } = useBusquedaClientes(query, abierto);

  const vinculado = mostrarVinculo && Boolean(value.trim() && codigo.trim());
  const aMano = mostrarVinculo && Boolean(value.trim() && !codigo.trim());
  const q = query.trim();

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  function elegir(nombre: string, cod: string) {
    onChange(nombre, cod);
    setQuery("");
    setAbierto(false);
  }

  // Lo que se ve en el campo: mientras está abierto es la BÚSQUEDA; cerrado, el
  // valor guardado. Por eso cerrar sin elegir no puede ensuciar la fila.
  const textoVisible = abierto ? query : value;
  const listaTop = q.length < 2 ? (topClientes ?? []) : [];

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={textoVisible}
        onChange={(e) => {
          setQuery(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => {
          setQuery("");
          setAbierto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && abierto) {
            // La capa de adentro gana: Escape cierra ESTA lista, no el modal que
            // la contiene. Sin esto, en Cheques un Escape para salir del
            // desplegable llegaba también al formulario.
            e.stopPropagation();
            setAbierto(false);
            setQuery("");
          }
          if (e.key === "Enter") {
            e.preventDefault();
            // Enter elige el primer resultado si hay uno; nunca guarda a mano
            // por accidente (para eso está "Otro", que hay que tocar).
            const primero = hits[0] ?? listaTop[0];
            if (primero) elegir(primero.nombre, primero.codigo);
          }
        }}
        placeholder={value ? value : "Buscar cliente…"}
        className={`${inputClassName} ${vinculado ? "pr-14" : aMano ? "pr-12" : ""}`}
      />

      {/* Cómo quedó: vinculado al directorio vs escrito a mano. Tienen que
          verse DISTINTO — es la señal de que el cliente no es de la lista. */}
      {!abierto && vinculado && (
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 text-xs px-1.5 py-0.5 rounded font-mono text-emerald-700 bg-emerald-50 pointer-events-none"
          title={`Vinculado al directorio (${codigo})`}
        >
          {codigo}
        </span>
      )}
      {!abierto && aMano && (
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 text-xs px-1.5 py-0.5 rounded text-amber-700 bg-amber-50 pointer-events-none"
          title="Escrito a mano — no está en el directorio"
        >
          Otro
        </span>
      )}

      {abierto && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-y-auto">
          {q.length >= 2 && cargando && (
            <div className="px-3 py-2 text-xs text-gray-400">Buscando…</div>
          )}

          {q.length >= 2 && !cargando && hits.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">
              No está en el directorio.
            </div>
          )}

          {q.length >= 2 &&
            !cargando &&
            hits.map((h) => (
              <Opcion key={h.codigo} onElegir={() => elegir(h.nombre, h.codigo)}>
                <span className="truncate">{h.nombre}</span>
                <span className="text-xs text-gray-400 font-mono shrink-0">{h.codigo}</span>
              </Opcion>
            ))}

          {listaTop.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-400">
                Más usados
              </div>
              {listaTop.map((h) => (
                <Opcion key={h.codigo} onElegir={() => elegir(h.nombre, h.codigo)}>
                  <span className="truncate">{h.nombre}</span>
                  <span className="text-xs text-gray-400 font-mono shrink-0">{h.codigo}</span>
                </Opcion>
              ))}
            </>
          )}

          {/* La salida de emergencia, SIEMPRE visible y siempre explícita. */}
          <div className="border-t border-gray-100">
            {q ? (
              <Opcion destacada onElegir={() => elegir(q, "")}>
                <span className="truncate">
                  Otro — guardar &ldquo;{q}&rdquo; a mano
                </span>
              </Opcion>
            ) : (
              <div className="px-3 py-2 text-xs text-gray-400">
                ¿No está en la lista? Escribe el nombre y elige &ldquo;Otro&rdquo;.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Solo para que el candado de 44px y los lectores de pantalla vean el
          estado sin abrir nada. */}
      <span className="sr-only">
        {!mostrarVinculo
          ? value.trim() ? `Cliente: ${value}` : "Sin cliente"
          : vinculado ? `Vinculado a ${codigo}` : aMano ? "Cliente escrito a mano" : "Sin cliente"}
      </span>
      {hasError ? <span className="sr-only">Campo obligatorio</span> : null}
    </div>
  );
}
