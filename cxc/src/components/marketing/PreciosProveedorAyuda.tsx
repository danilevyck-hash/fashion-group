"use client";

// ============================================================================
// Marketing › Mobiliario — UN SOLO "?" con los precios del proveedor
// ============================================================================
//
// Daniel, textual: *"con ? global que muestre los precios reales que son los
// que estan en nota proveedor (…) el ? global es solo para saber el precio
// real de cada articulo, todo en un solo ?, y que ese precio que aparece en ?
// no se calcule en ningun lado, es solo nota personal"*.
//
// 🔴 ESTO NO SUMA, NO PROMEDIA Y NO ENTRA EN NINGÚN TOTAL. Es una libreta
//    personal con lo que le cobra el proveedor (Changalo), y son OTROS precios
//    que los de la tabla de Productos (ahí está lo que el mueble vale para
//    Daniel). Por eso este componente:
//      * no exporta ni calcula ningún agregado — ni un `.reduce(` de precios,
//        ni un total, ni un promedio, ni "N renglones × precio";
//      * no recibe ni devuelve nada de la página: es un botón que abre una
//        lista de solo lectura. Las métricas de Mobiliario (valor / entregado
//        / disponible / tiendas) se calculan en `metricas` a partir de
//        `productos` y `entregas`, y este archivo no las toca.
//    Si mañana alguien quiere ponerle un total abajo: NO. Preguntar primero.
//    El candado vive en `src/__tests__/lib/marketing-precios-proveedor.test.ts`.
//
// 🔴 UN SOLO "?", ARRIBA. No uno por fila. Daniel: *"todo en un solo ?"*.
//    Seis signos de pregunta en una tabla que ya tuvo un problema de recorte
//    documentado serían seis columnas de ruido para el mismo dato.
//
// 🔴 SOLO ADMIN, y el candado de verdad está en el SERVIDOR
//    (`requireRole(req, ["admin"])` en la ruta que se lee acá). La secretaria
//    entra a Mobiliario y no debe ver estos costos. Esconder el botón en el
//    cliente es cortesía — es el error del `allowedRoles` decorativo de
//    Catálogos —, así que además de no montarlo, la lectura falla del lado
//    del servidor si no es admin.
//
// 🩸 SE LEE AL ABRIR, NO AL CARGAR LA PÁGINA. Mobiliario ya dispara 3 fetch
//    al entrar; un cuarto para un dato que casi nunca se mira es trabajo de
//    más contra una base que ya se cayó por saturación. Se guarda en estado
//    para que abrirlo dos veces no vuelva a pedirlo.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import {
  formatearPrecioNota,
  type NotaProveedorRenglon,
} from "@/lib/marketing/notas-proveedor";

interface RespuestaNotas {
  notas: NotaProveedorRenglon[];
  ddlPendiente: boolean;
}

export default function PreciosProveedorAyuda() {
  const [abierto, setAbierto] = useState(false);
  const [notas, setNotas] = useState<NotaProveedorRenglon[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const [montado, setMontado] = useState(false);

  useBodyScrollLock(abierto);

  // createPortal necesita el DOM: en el render del servidor no existe.
  useEffect(() => setMontado(true), []);

  const cerrar = useCallback(() => {
    setAbierto(false);
    // Devolver el foco a quien abrió: sin esto, con teclado uno queda al
    // principio de la página después de cerrar.
    botonRef.current?.focus();
  }, []);

  // Escape.
  useEffect(() => {
    if (!abierto) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [abierto, cerrar]);

  // Foco dentro del cuadro al abrir. Va al botón "Entendido", que es la única
  // acción: no hay campos, así que no hay teclado que se abra solo en iOS.
  useEffect(() => {
    if (!abierto) return;
    cerrarRef.current?.focus();
  }, [abierto]);

  const abrir = useCallback(async () => {
    setAbierto(true);
    if (notas !== null || cargando) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/mobiliario/notas-proveedor", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("No se pudieron cargar los precios");
      const data = (await res.json()) as RespuestaNotas;
      // Con la migración sin correr la lista viene vacía: se dice, no se
      // muestra un cuadro en blanco.
      setNotas(data.ddlPendiente ? [] : (data.notas ?? []));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar los precios",
      );
    } finally {
      setCargando(false);
    }
  }, [notas, cargando]);

  const cuadro = (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="precios-proveedor-titulo"
        className="relative w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 max-h-[85vh] overflow-y-auto"
      >
        <h3
          id="precios-proveedor-titulo"
          className="text-base font-semibold text-gray-900"
        >
          Precios del proveedor
        </h3>
        {/* Que quede dicho en pantalla, no solo en el código. */}
        <p className="mt-1 text-xs text-gray-500">
          Nota personal. No se suma ni entra en ningún cálculo.
        </p>

        <div className="mt-4">
          {cargando ? (
            <p className="py-4 text-center text-sm text-gray-400">Cargando…</p>
          ) : error ? (
            <p className="py-4 text-center text-sm text-gray-500">{error}</p>
          ) : notas && notas.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {notas.map((n) => (
                <li
                  key={n.id}
                  data-fg-nota={n.id}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <span className="min-w-0 text-sm text-gray-900 break-words">
                    {n.producto}
                    {n.nota && (
                      <span className="ml-1.5 text-xs text-gray-400">
                        {n.nota}
                      </span>
                    )}
                  </span>
                  <span
                    data-fg-precio-proveedor
                    className="shrink-0 text-sm text-gray-700 tabular-nums"
                  >
                    {formatearPrecioNota(n.precio)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-gray-400">
              Todavía no hay precios anotados.
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            ref={cerrarRef}
            type="button"
            onClick={cerrar}
            className="rounded-md bg-black text-white px-4 min-h-[44px] text-sm font-medium active:scale-[0.97] transition"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 min-h-[44px] text-xs text-gray-500 hover:text-black hover:border-gray-400 active:scale-[0.97] transition shrink-0"
      >
        <span
          aria-hidden
          className="inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-bold leading-none"
        >
          ?
        </span>
        <span className="whitespace-nowrap">Precios del proveedor</span>
      </button>
      {abierto && montado && createPortal(cuadro, document.body)}
    </>
  );
}
