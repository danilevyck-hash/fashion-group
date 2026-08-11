"use client";

// ============================================================================
// Marketing › Mobiliario — UN SOLO "?" con los precios del proveedor
// ============================================================================
//
// Daniel, textual: *"con ? global que muestre los precios reales que son los
// que estan en nota proveedor (…) el ? global es solo para saber el precio
// real de cada articulo, todo en un solo ?, y que ese precio que aparece en ?
// no se calcule en ningun lado, es solo nota personal"*. Y sobre poder
// corregirlos desde acá: *"sii"*.
//
// 🔴 ESTO NO SUMA, NO PROMEDIA Y NO ENTRA EN NINGÚN TOTAL. Es una libreta
//    personal con lo que le cobra el proveedor (Changalo), y son OTROS precios
//    que los de la tabla de Productos (ahí está lo que el mueble vale para
//    Daniel). Por eso este componente:
//      * no exporta ni calcula ningún agregado — ni un `.reduce(` de precios,
//        ni un total, ni un promedio, ni "N renglones × precio";
//      * no recibe ni devuelve nada de la página: es un botón que abre su
//        propia ventana. Las métricas de Mobiliario (valor / entregado /
//        disponible / tiendas) se calculan en `metricas` a partir de
//        `productos` y `entregas`, y este archivo no las toca.
//    Poder EDITAR no cambió nada de esto: se edita el precio anotado, y ese
//    precio sigue sin entrar en ninguna cuenta. Si mañana alguien quiere
//    ponerle un total abajo: NO. Preguntar primero. El candado vive en
//    `src/__tests__/lib/marketing-precios-proveedor.test.ts`.
//
// 🔴 UN SOLO "?", ARRIBA. No uno por fila. Daniel: *"todo en un solo ?"*.
//
// 🔴 SOLO ADMIN, y el candado de verdad está en el SERVIDOR
//    (`requireRole(req, ["admin"])` en las 4 rutas que se usan acá). La
//    secretaria entra a Mobiliario y no debe ver estos costos. Esconder el
//    botón en el cliente es cortesía — es el error del `allowedRoles`
//    decorativo de Catálogos.
//
// 🩸 TODO PASA ADENTRO DE ESTA VENTANA: editar, agregar y borrar son EN LÍNEA,
//    sin abrir un segundo modal encima. Dos razones, y las dos son concretas:
//      1. `ConfirmDeleteModal` monta `ModalOverlay`, que es `z-50`. Esta
//         ventana es `z-[70]`, así que la confirmación habría quedado DEBAJO
//         del cuadro: invisible, con la pantalla trabada.
//      2. `ConfirmDeleteModal` engancha su propio Escape en `document`. Con
//         los dos escuchando, un Escape cerraba los DOS de una.
//    Sin modal anidado, ninguno de los dos problemas existe.
//
// 🩸 NO VUELVE LA TABLA DE "NOTAS DEL PROVEEDOR". Daniel pidió eliminarla de
//    la vista y sigue eliminada: esto es la MISMA lista del "?", que ahora
//    además se puede corregir. El componente viejo
//    (`NotasProveedorMobiliario.tsx`) sigue sin montarse en ningún lado.
//
// 🩸 LAS FOTOS NO SE TOCAN DESDE ACÁ, A PROPÓSITO — ver el bloque "LA FOTO"
//    más abajo, antes de agregarle un botón de foto a esta ventana.
//
// 🩸 SE LEE AL ABRIR, NO AL CARGAR LA PÁGINA. Mobiliario ya dispara 3 fetch
//    al entrar; un cuarto para un dato que casi nunca se mira es trabajo de
//    más contra una base que ya se cayó por saturación.
// ============================================================================
//
// ── LA FOTO ─────────────────────────────────────────────────────────────────
// 🔴 ESTA VENTANA NO EDITA FOTOS, Y NO ES UN OLVIDO.
//
// Hay UNA foto por mueble y vive en `mk_inventario_productos.foto_path`: es la
// que se ve en la tabla de Productos y la que sale impresa en la nota de
// entrega. Se cambia desde "Editar producto", que ya existe y ya funciona.
//
// `mk_mobiliario_notas_proveedor.foto_paths` es de donde salieron esas fotos
// (backfill 20260811150000) y se conserva intacta como origen. Si además se
// pudiera cambiar la foto DESDE ACÁ habría dos lugares para cambiar la misma
// foto, y se desincronizarían: Daniel vería una foto en la tabla y otra
// distinta en el "?", sin ninguna forma de saber cuál es la buena. Se prefiere
// que haya UN solo lugar donde se cambia la foto antes que dos que hay que
// mantener de acuerdo.
//
// 🔴 Y POR ESO EL PUT NO PUEDE MENCIONAR `fotoPaths`. La validación del
//    servidor convierte un `fotoPaths` ausente en `[]`, y `[]` guardado
//    significa "este renglón no tiene fotos": mandarlo borraría las rutas de
//    donde salieron las fotos que hoy se ven. La ruta lo resuelve con
//    `traeFotoPaths(body)` → "no hablaron de fotos, no las toques". Acá el
//    cuerpo se arma con exactamente tres campos y ninguno es de fotos.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useToast } from "@/components/ToastSystem";
import {
  formatearPrecioNota,
  precioParaInput,
  validarNotaProveedor,
  type NotaProveedorRenglon,
} from "@/lib/marketing/notas-proveedor";

interface RespuestaNotas {
  notas: NotaProveedorRenglon[];
  ddlPendiente: boolean;
}

interface EdicionState {
  /** null = renglón nuevo. */
  id: string | null;
  producto: string;
  precio: string;
  nota: string;
}

const VACIO: EdicionState = { id: null, producto: "", precio: "", nota: "" };

function deRenglon(n: NotaProveedorRenglon): EdicionState {
  return {
    id: n.id,
    producto: n.producto,
    precio: precioParaInput(n.precio),
    nota: n.nota ?? "",
  };
}

function iguales(a: EdicionState, b: EdicionState): boolean {
  return (
    a.producto === b.producto && a.precio === b.precio && a.nota === b.nota
  );
}

export default function PreciosProveedorAyuda() {
  const { toast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [notas, setNotas] = useState<NotaProveedorRenglon[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [edicion, setEdicion] = useState<EdicionState | null>(null);
  /** Los valores con los que se abrió la edición, para saber si tocó algo. */
  const [original, setOriginal] = useState<EdicionState | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  const botonRef = useRef<HTMLButtonElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const [montado, setMontado] = useState(false);

  useBodyScrollLock(abierto);
  useEffect(() => setMontado(true), []);

  const hayCambios = useMemo(
    () => edicion !== null && original !== null && !iguales(edicion, original),
    [edicion, original],
  );

  const ocupado = guardando || borrando;

  const cerrarTodo = useCallback(() => {
    setAbierto(false);
    setEdicion(null);
    setOriginal(null);
    setConfirmarBorrado(null);
    // Devolver el foco a quien abrió: sin esto, con teclado uno queda al
    // principio de la página después de cerrar.
    botonRef.current?.focus();
  }, []);

  /**
   * Escape, en ESCALERA — se deshace lo último que se abrió, nunca todo junto.
   * Sin esta jerarquía, un Escape mientras se confirma un borrado cerraría la
   * ventana entera y dejaría al usuario sin saber si borró o no.
   */
  const alEscape = useCallback(() => {
    if (ocupado) return; // hay una escritura en vuelo: no se cancela a medias
    if (confirmarBorrado !== null) {
      setConfirmarBorrado(null);
      return;
    }
    if (edicion !== null) {
      // Con cambios sin guardar NO se cierra: se sale con Cancelar. Misma
      // regla que los modales con formulario del repo (useFormModalDismiss).
      if (hayCambios) return;
      setEdicion(null);
      setOriginal(null);
      return;
    }
    cerrarTodo();
  }, [ocupado, confirmarBorrado, edicion, hayCambios, cerrarTodo]);

  useEffect(() => {
    if (!abierto) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") alEscape();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [abierto, alEscape]);

  // Foco dentro del cuadro al abrir. Va al botón "Entendido", que es la única
  // acción de la vista de solo lectura: así no se abre el teclado solo en iOS
  // (por eso ningún campo del formulario lleva autoFocus).
  useEffect(() => {
    if (!abierto) return;
    cerrarRef.current?.focus();
  }, [abierto]);

  const cargar = useCallback(async () => {
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
  }, []);

  const abrir = useCallback(() => {
    setAbierto(true);
    if (notas === null && !cargando) cargar();
  }, [notas, cargando, cargar]);

  // ── Guardar (alta o edición) ────────────────────────────────────────────
  const guardar = async () => {
    if (!edicion) return;
    // La MISMA validación que corre el servidor (módulo puro compartido): así
    // el mensaje que se ve es el mismo, sin dos verdades posibles.
    const validada = validarNotaProveedor({
      producto: edicion.producto,
      precio: edicion.precio,
      nota: edicion.nota,
    });
    if (!validada.ok) {
      toast(validada.error, "error");
      return;
    }
    setGuardando(true);
    try {
      const url = edicion.id
        ? `/api/marketing/mobiliario/notas-proveedor/${edicion.id}`
        : "/api/marketing/mobiliario/notas-proveedor";
      const res = await fetch(url, {
        method: edicion.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        // 🔴 Tres campos y NINGUNO es de fotos — ver el bloque "LA FOTO".
        body: JSON.stringify({
          producto: edicion.producto,
          precio: edicion.precio,
          nota: edicion.nota,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo guardar");
      }
      toast("Listo, guardado", "success");
      setEdicion(null);
      setOriginal(null);
      await cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setGuardando(false);
    }
  };

  // ── Borrar ──────────────────────────────────────────────────────────────
  const borrar = async (id: string) => {
    setBorrando(true);
    try {
      const res = await fetch(
        `/api/marketing/mobiliario/notas-proveedor/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar");
      }
      toast("Precio eliminado", "success");
      setConfirmarBorrado(null);
      setEdicion(null);
      setOriginal(null);
      await cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setBorrando(false);
    }
  };

  const abrirEdicion = (n: NotaProveedorRenglon) => {
    const e = deRenglon(n);
    setEdicion(e);
    setOriginal(e);
    setConfirmarBorrado(null);
  };

  const abrirNuevo = () => {
    setEdicion({ ...VACIO });
    setOriginal({ ...VACIO });
    setConfirmarBorrado(null);
  };

  const cancelarEdicion = () => {
    setEdicion(null);
    setOriginal(null);
  };

  // ── Formulario en línea ─────────────────────────────────────────────────
  const formulario = edicion && (
    <div className="rounded-md border border-gray-300 bg-gray-50 p-3 space-y-2.5">
      <div>
        <label className="block text-xs text-gray-600 mb-1">
          Producto<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          type="text"
          value={edicion.producto}
          onChange={(e) => setEdicion({ ...edicion, producto: e.target.value })}
          disabled={ocupado}
          className="w-full rounded-md border border-gray-300 px-3 min-h-[44px] text-sm focus:border-black focus:outline-none disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Precio</label>
        <input
          type="text"
          inputMode="decimal"
          value={edicion.precio}
          onChange={(e) => setEdicion({ ...edicion, precio: e.target.value })}
          disabled={ocupado}
          placeholder="Déjalo vacío si todavía no lo sabes"
          className="w-full rounded-md border border-gray-300 px-3 min-h-[44px] text-sm tabular-nums focus:border-black focus:outline-none disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Aclaración</label>
        <input
          type="text"
          value={edicion.nota}
          onChange={(e) => setEdicion({ ...edicion, nota: e.target.value })}
          disabled={ocupado}
          placeholder="Ej: el par completo"
          className="w-full rounded-md border border-gray-300 px-3 min-h-[44px] text-sm focus:border-black focus:outline-none disabled:opacity-60"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={guardar}
          disabled={ocupado || edicion.producto.trim() === ""}
          className="rounded-md bg-black text-white px-4 min-h-[44px] text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={cancelarEdicion}
          disabled={ocupado}
          className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 min-h-[44px] text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        {edicion.id && (
          <button
            type="button"
            onClick={() => setConfirmarBorrado(edicion.id)}
            disabled={ocupado}
            className="ml-auto rounded-md border border-red-200 bg-white text-red-600 px-3 min-h-[44px] text-sm hover:bg-red-50 disabled:opacity-50"
          >
            Borrar
          </button>
        )}
      </div>
    </div>
  );

  // ── Confirmación de borrado, EN LÍNEA (nada de modal encima) ────────────
  const confirmacion = (n: NotaProveedorRenglon) => (
    <div className="rounded-md border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-gray-900">
        ¿Borrar el precio de <strong>{n.producto}</strong>?
      </p>
      <p className="mt-1 text-xs text-gray-600">
        Se borra solo este precio anotado. La foto del mueble en la tabla de
        Productos no se toca.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => borrar(n.id)}
          disabled={ocupado}
          className="rounded-md bg-red-600 text-white px-4 min-h-[44px] text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
        >
          {borrando ? "Borrando…" : "Sí, borrar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmarBorrado(null)}
          disabled={ocupado}
          className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 min-h-[44px] text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  const cuadro = (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // Clic afuera: la MISMA escalera que el Escape. Con un formulario
        // abierto o una confirmación en curso no cierra nada — un clic
        // accidental no puede borrarle lo escrito ni dejar el borrado a medias.
        if (e.target !== e.currentTarget) return;
        if (ocupado || confirmarBorrado !== null) return;
        if (edicion !== null) return;
        cerrarTodo();
      }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="precios-proveedor-titulo"
        className="relative w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 max-h-[85vh] overflow-y-auto"
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
              {notas.map((n) => {
                if (confirmarBorrado === n.id) {
                  return (
                    <li key={n.id} data-fg-nota={n.id} className="py-2">
                      {confirmacion(n)}
                    </li>
                  );
                }
                if (edicion?.id === n.id) {
                  return (
                    <li key={n.id} data-fg-nota={n.id} className="py-2">
                      {formulario}
                    </li>
                  );
                }
                return (
                  <li
                    key={n.id}
                    data-fg-nota={n.id}
                    className="flex items-center justify-between gap-2 py-1"
                  >
                    <span className="min-w-0 text-sm text-gray-900 break-words">
                      {n.producto}
                      {n.nota && (
                        <span className="ml-1.5 text-xs text-gray-400">
                          {n.nota}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span
                        data-fg-precio-proveedor
                        className="text-sm text-gray-700 tabular-nums"
                      >
                        {formatearPrecioNota(n.precio)}
                      </span>
                      <button
                        type="button"
                        onClick={() => abrirEdicion(n)}
                        disabled={ocupado}
                        aria-label={`Editar el precio de ${n.producto}`}
                        className="min-h-[44px] min-w-[44px] px-2 text-xs text-gray-500 hover:text-black disabled:opacity-50"
                      >
                        Editar
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-gray-400">
              Todavía no hay precios anotados.
            </p>
          )}

          {/* Alta: el formulario en línea al final de la lista. */}
          {edicion !== null && edicion.id === null && (
            <div className="mt-3">{formulario}</div>
          )}
          {edicion === null && !cargando && !error && (
            <button
              type="button"
              onClick={abrirNuevo}
              className="mt-2 text-xs text-gray-500 hover:text-black underline min-h-[44px] px-1"
            >
              + Agregar precio
            </button>
          )}
        </div>

        {/* Dónde se cambia la foto. Sin esto, alguien la buscaría acá. */}
        <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
          La foto de cada mueble se cambia con “Editar” en la tabla de
          Productos.
        </p>

        <div className="mt-4 flex justify-end">
          <button
            ref={cerrarRef}
            type="button"
            onClick={cerrarTodo}
            disabled={ocupado}
            className="rounded-md bg-black text-white px-4 min-h-[44px] text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
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
