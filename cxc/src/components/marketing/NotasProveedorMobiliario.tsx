"use client";

// ============================================================================
// Marketing › Mobiliario — bloque "Notas del proveedor"
// ============================================================================
//
// 🔴 ESTO NO SUMA. Es una libreta con los costos que cobra el proveedor
//    (Changalo). Daniel, textual: "que no sume ni nada, solo info personal".
//    * NO hay total, ni promedio, ni "N renglones × precio".
//    * NO alimenta las métricas de la página (valor / entregado / disponible
//      / tiendas), que se calculan en `metricas` a partir de `productos` y
//      `entregas` y NO reciben nada de este componente.
//    * Si mañana alguien quiere agregarle un total abajo: NO. Preguntar
//      primero. El candado está en `marketing-notas-proveedor.test.ts`.
//
// 🔴 SOLO ADMIN. Este componente se monta solo con rol admin, pero eso es
//    cortesía: el candado de verdad vive en el servidor
//    (`requireRole(req, ["admin"])` en las 3 rutas de la API). La secretaria
//    entra a Mobiliario y no debe ver estos costos.
//
// 🩸 SIN TABLA, a propósito. Esta página ya tuvo un problema de recorte
//    documentado en su encabezado (dos tablas dentro de un contenedor con
//    overflow-hidden y sin scroller). El bloque es una lista fluida: la foto
//    y el precio tienen ancho fijo y el nombre se acomoda, así que no hay
//    ancho mínimo que forzar y no puede recortar ni arrastrar en 390, 834
//    ni 1440.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ConfirmDeleteModal } from "@/components/ui";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import {
  MAX_FOTOS_POR_RENGLON,
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
  /** Rutas ya subidas a Storage. */
  fotoPaths: string[];
  /** URLs para la vista previa, en el mismo orden. */
  fotoUrls: string[];
}

const VACIO: EdicionState = {
  id: null,
  producto: "",
  precio: "",
  nota: "",
  fotoPaths: [],
  fotoUrls: [],
};

export default function NotasProveedorMobiliario() {
  const { toast } = useToast();
  const [notas, setNotas] = useState<NotaProveedorRenglon[]>([]);
  const [ddlPendiente, setDdlPendiente] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [edicion, setEdicion] = useState<EdicionState | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [borrar, setBorrar] = useState<NotaProveedorRenglon | null>(null);
  const [borrando, setBorrando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cerrarEdicion = useCallback(() => setEdicion(null), []);
  const dismiss = useFormModalDismiss(
    edicion !== null,
    cerrarEdicion,
    !guardando && !subiendoFoto,
  );
  useBodyScrollLock(edicion !== null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(
        "/api/marketing/mobiliario/notas-proveedor",
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("No se pudieron cargar las notas");
      const data = (await res.json()) as RespuestaNotas;
      setNotas(data.notas ?? []);
      setDdlPendiente(Boolean(data.ddlPendiente));
      setErrorCarga(null);
    } catch (err) {
      setErrorCarga(
        err instanceof Error ? err.message : "No se pudieron cargar las notas",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const puedeGuardar = useMemo(
    () => edicion !== null && edicion.producto.trim() !== "",
    [edicion],
  );

  // ── Subir una foto: URL firmada → PUT directo a Storage ──────────────────
  const subirFoto = async (file: File) => {
    if (!edicion) return;
    if (edicion.fotoPaths.length >= MAX_FOTOS_POR_RENGLON) {
      toast(`Máximo ${MAX_FOTOS_POR_RENGLON} fotos por renglón.`, "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast("Ese archivo no es una foto.", "error");
      return;
    }
    setSubiendoFoto(true);
    try {
      const urlRes = await fetch(
        "/api/marketing/mobiliario/notas-proveedor/upload-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name }),
        },
      );
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo preparar la subida");
      }
      const { uploadUrl, path } = (await urlRes.json()) as {
        uploadUrl: string;
        path: string;
      };
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("No se pudo subir la foto");

      // Vista previa local: la URL firmada de lectura llega al recargar.
      setEdicion((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              fotoPaths: [...prev.fotoPaths, path],
              fotoUrls: [...prev.fotoUrls, URL.createObjectURL(file)],
            },
      );
      toast("Foto lista", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo subir", "error");
    } finally {
      setSubiendoFoto(false);
    }
  };

  const quitarFoto = (i: number) => {
    setEdicion((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            fotoPaths: prev.fotoPaths.filter((_, j) => j !== i),
            fotoUrls: prev.fotoUrls.filter((_, j) => j !== i),
          },
    );
  };

  const guardar = async () => {
    if (!edicion) return;
    // La MISMA validación que corre el servidor (módulo puro compartido):
    // así el mensaje que se ve es el mismo, sin dos verdades posibles.
    const validada = validarNotaProveedor({
      producto: edicion.producto,
      precio: edicion.precio,
      nota: edicion.nota,
      fotoPaths: edicion.fotoPaths,
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
        body: JSON.stringify({
          producto: edicion.producto,
          precio: edicion.precio,
          nota: edicion.nota,
          fotoPaths: edicion.fotoPaths,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo guardar");
      }
      toast("Listo, guardado", "success");
      setEdicion(null);
      await cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setGuardando(false);
    }
  };

  const ejecutarBorrado = async () => {
    if (!borrar) return;
    setBorrando(true);
    try {
      const res = await fetch(
        `/api/marketing/mobiliario/notas-proveedor/${borrar.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar");
      }
      toast("Renglón eliminado", "success");
      setBorrar(null);
      await cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setBorrando(false);
    }
  };

  return (
    <section className="space-y-1.5" data-vista="notas-proveedor">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
            Notas del proveedor
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setEdicion({ ...VACIO })}
          className="text-xs text-gray-500 hover:text-black underline min-h-[44px] px-1 shrink-0"
        >
          + Agregar renglón
        </button>
      </div>

      {/* Que quede dicho también en pantalla, no solo en el código. */}
      <p className="text-xs text-gray-400">
        Precios que cobra el proveedor. Es solo información — no se suma ni
        entra en los totales de arriba.
      </p>

      <div className="rounded-[10px] border border-gray-200 bg-white overflow-hidden">
        {cargando ? (
          <div className="px-3 py-6 text-center text-gray-400 text-sm">
            Cargando…
          </div>
        ) : errorCarga ? (
          <div className="px-3 py-6 text-center text-sm text-gray-500">
            {errorCarga}
          </div>
        ) : ddlPendiente ? (
          // Degradación limpia: la migración la corre Daniel a mano.
          <div className="px-3 py-6 text-center text-sm text-gray-500">
            Las notas del proveedor todavía no están activas.
            <br />
            <span className="text-xs text-gray-400">
              Falta correr en Supabase la migración
              <br />
              20260808120000_mk_mobiliario_notas_proveedor.sql
            </span>
          </div>
        ) : notas.length === 0 ? (
          <div className="px-3 py-6 text-center text-gray-400 text-sm">
            Todavía no hay nada anotado.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notas.map((n) => (
              <li key={n.id} className="flex items-center gap-3 px-3 py-2">
                {/* Fotos: hasta 2 se ven de a lado; el resto suma un "+N". */}
                <div className="flex shrink-0 -space-x-2">
                  {n.fotoUrls.length === 0 ? (
                    <div className="h-14 w-14 rounded-md border border-gray-200 bg-gray-50" />
                  ) : (
                    n.fotoUrls.slice(0, 2).map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt={n.producto}
                        loading="lazy"
                        className="h-14 w-14 rounded-md border border-white ring-1 ring-gray-200 object-cover bg-gray-50"
                        style={{ zIndex: 2 - i }}
                      />
                    ))
                  )}
                  {n.fotoUrls.length > 2 && (
                    <div className="h-14 w-14 rounded-md border border-white ring-1 ring-gray-200 bg-gray-100 flex items-center justify-center text-xs text-gray-600">
                      +{n.fotoUrls.length - 2}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-900 break-words">
                    {n.producto}
                  </div>
                  <div className="text-sm text-gray-600 tabular-nums">
                    {formatearPrecioNota(n.precio)}
                    {n.nota && (
                      <span className="text-xs text-gray-400 ml-1.5">
                        {n.nota}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setEdicion({
                        id: n.id,
                        producto: n.producto,
                        precio: precioParaInput(n.precio),
                        nota: n.nota ?? "",
                        fotoPaths: [...n.fotoPaths],
                        fotoUrls: [...n.fotoUrls],
                      })
                    }
                    className="min-h-[44px] min-w-[44px] px-2 text-xs text-gray-500 hover:text-black"
                    aria-label={`Editar ${n.producto}`}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setBorrar(n)}
                    className="min-h-[44px] min-w-[44px] px-2 text-xs text-gray-400 hover:text-red-600"
                    aria-label={`Eliminar ${n.producto}`}
                  >
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Modal agregar / editar renglón ─────────────────────────────── */}
      {edicion && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" {...dismiss.backdrop} />
          <div
            ref={dismiss.panelRef}
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">
              {edicion.id ? "Editar renglón" : "Nuevo renglón"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Producto<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={edicion.producto}
                  onChange={(e) =>
                    setEdicion({ ...edicion, producto: e.target.value })
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Precio
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={edicion.precio}
                  onChange={(e) =>
                    setEdicion({ ...edicion, precio: e.target.value })
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Si todavía no sabes el precio, déjalo vacío.
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Aclaración
                </label>
                <input
                  type="text"
                  value={edicion.nota}
                  onChange={(e) =>
                    setEdicion({ ...edicion, nota: e.target.value })
                  }
                  placeholder="Ej: el par completo"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Fotos</label>
                <div className="flex flex-wrap gap-2">
                  {edicion.fotoUrls.map((url, i) => (
                    <div key={`${url}-${i}`} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="h-20 w-20 rounded-md border border-gray-200 object-cover bg-gray-50"
                      />
                      <button
                        type="button"
                        onClick={() => quitarFoto(i)}
                        aria-label="Quitar foto"
                        className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-white border border-gray-300 text-gray-600 text-xs leading-none hover:bg-gray-50"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) subirFoto(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={
                    subiendoFoto ||
                    edicion.fotoPaths.length >= MAX_FOTOS_POR_RENGLON
                  }
                  className="mt-2 rounded-md border border-gray-300 bg-white text-gray-700 px-3 min-h-[44px] text-sm hover:bg-gray-50 active:scale-[0.97] transition disabled:opacity-50"
                >
                  {subiendoFoto ? "Subiendo…" : "+ Agregar foto"}
                </button>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEdicion(null)}
                disabled={guardando || subiendoFoto}
                className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 min-h-[44px] text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || subiendoFoto || !puedeGuardar}
                className="rounded-md bg-black text-white px-4 min-h-[44px] text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={borrar !== null}
        title={borrar ? `Eliminar ${borrar.producto}` : "Eliminar renglón"}
        description="Se borra de la nota del proveedor. Esta acción no se puede deshacer."
        onConfirm={ejecutarBorrado}
        onCancel={() => setBorrar(null)}
        loading={borrando}
      />
    </section>
  );
}
