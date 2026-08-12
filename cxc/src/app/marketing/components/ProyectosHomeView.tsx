"use client";

// Lista de proyectos de UNA MARCA (el bloque que se tocó en el inicio).
// La MARCA es la unidad del módulo desde el rediseño de ago-2026: período,
// cierre y ZIP van por marca, y el proyecto es solo la agrupación por cliente
// (se autocrea al registrar un gasto).
//
// 🔴 EL PROYECTO YA NO TIENE ESTADO VISIBLE. "Cerrar proyecto" se retiró el
// 11-ago-2026: era un estado cosmético que al lado de "Cerrar período"
// confundía — dos "cerrar" distintos en la misma pantalla. Lo que congela
// plata es el PERÍODO cerrado, nunca el proyecto. No volver a dibujar un
// badge/filtro/acción de estado de proyecto acá.
//
// La única acción destructiva de la fila es "Registrado por error — eliminar"
// (la mecánica de anular de siempre: esconde el proyecto, sus gastos dejan de
// contar, y el aviso con "Deshacer" queda hasta que la persona lo cierre).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MkMarca } from "@/lib/marketing/types";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import { indiceBloquePorMarcaId } from "@/lib/marketing/bloques";
import { useToast } from "@/components/ToastSystem";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { useDescargarZip } from "@/lib/marketing/useDescargarZip";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";

interface ProyectoListItem {
  id: string;
  nombre: string | null;
  tienda: string;
  created_at: string;
  anulado_en: string | null;
  facturas_count: number;
  fotos_count: number;
  entregas_count?: number;
  marcas: Array<{
    id: string;
    nombre: string;
    codigo: string;
    tipo?: "externa" | "interna";
  }>;
  // Gasto bruto real (Σ factura.total con ITBMS + entregas), sin ponderar
  // por co-op. Es el número de la columna "Gastado".
  gasto_real?: number;
  por_cobrar_total: number;
  // Cobrable co-op por marca (alimenta SOLO el tooltip de desglose).
  por_cobrar_por_marca: Array<{
    marca_id: string;
    marca_nombre: string;
    monto: number;
  }>;
}

interface Props {
  marcas: MkMarca[];
  onOpenProyecto: (id: string) => void;
  onRegistrarGasto: () => void;
  onOpenReportes: () => void;
  onOpenImpulsadoras: () => void;
  onOpenInventario: () => void;
  refreshKey: number;
  /**
   * Bloque del inicio del que se entró: el CÓDIGO de la marca (`TH` | `CK` |
   * `KL` | `RBK` | `J`) o `multifashion` | `sin_bloque`. La lista queda acotada
   * a sus proyectos. Esta vista SIEMPRE se abre desde un bloque del inicio —
   * el modo "todas las marcas" con dropdown era del modelo viejo y se retiró.
   */
  bloque: string;
  bucketLabel: string;
  onBack: () => void;
}


function colorParaMarca(codigo: string): string {
  if (codigo === "TH") return "bg-red-50 text-red-700 border-red-200";
  if (codigo === "CK") return "bg-gray-100 text-gray-800 border-gray-300";
  if (codigo === "RBK") return "bg-blue-50 text-blue-700 border-blue-200";
  if (codigo === "J") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
}

function inicial(s: string): string {
  return (s || "?").charAt(0).toUpperCase();
}

export default function ProyectosHomeView({
  marcas,
  onOpenProyecto,
  onRegistrarGasto,
  onOpenReportes,
  onOpenImpulsadoras,
  onOpenInventario,
  refreshKey,
  bloque,
  bucketLabel,
  onBack,
}: Props) {
  const { toast } = useToast();
  const [busqueda, setBusqueda] = useState<string>("");
  const [busquedaDebounced, setBusquedaDebounced] = useState<string>("");
  const [proyectos, setProyectos] = useState<ProyectoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { estados: zipEstados, descargar: descargarZip } = useDescargarZip();
  const [anularPendiente, setAnularPendiente] = useState<
    { id: string; nombre: string } | null
  >(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  // 🩸 ELIMINAR ERA UNA PUERTA DE UNA SOLA MANO. La pantalla "Anulados" era el
  // ÚNICO lugar desde donde se podía restaurar un proyecto, y se retiró: sin
  // esto, eliminar por error dejaría el proyecto fuera de Marketing para
  // siempre (la API `papelera/restaurar` sigue viva, pero nadie llega a ella
  // desde la app). El aviso se queda hasta que la persona lo cierre — nada de
  // 5 segundos: el error se descubre al mirar la lista y ver que falta.
  const [deshacerAnular, setDeshacerAnular] = useState<
    { id: string; nombre: string } | null
  >(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  // Total de impulsadoras de ESTA marca. Se muestra como línea aparte para
  // que el detalle visible cuadre con el bloque del inicio, ya que los pagos de
  // impulsadora son gastos sueltos (no aparecen como proyectos en la lista).
  const [impulsadoraTotal, setImpulsadoraTotal] = useState(0);

  // marca_id → bloque. Fuente única: lib/marketing/bloques.ts.
  const bloquePorMarca = useMemo(
    () => indiceBloquePorMarcaId(marcas),
    [marcas],
  );

  // Clic fuera + Escape para el modal de anular. Como lleva un motivo escrito,
  // si el usuario ya tipeó algo NO cierra (se sale con Cancelar).
  const cerrarAnular = useCallback(() => setAnularPendiente(null), []);
  const anularDismiss = useFormModalDismiss(
    anularPendiente !== null,
    cerrarAnular,
    !anulando,
  );

  // Debounce de búsqueda
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("bloque", bloque);
      if (busquedaDebounced) qs.set("busqueda", busquedaDebounced);
      const res = await fetch(`/api/marketing/proyectos-lista?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ProyectoListItem[];
      setProyectos(Array.isArray(data) ? data : []);
    } catch {
      setProyectos([]);
    } finally {
      setLoading(false);
    }
  }, [bloque, busquedaDebounced]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  // Total de impulsadoras de la marca (para la línea de cuadre).
  useEffect(() => {
    if (!bloque || bloque === "multifashion") {
      setImpulsadoraTotal(0);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/marca-resumen", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          impulsadoraPorMarca?: Record<string, { count: number; total: number }>;
        };
        if (cancelado) return;
        let suma = 0;
        for (const [mid, v] of Object.entries(data.impulsadoraPorMarca ?? {})) {
          if (bloquePorMarca.get(String(mid)) === bloque) suma += v?.total ?? 0;
        }
        setImpulsadoraTotal(Number(suma.toFixed(2)));
      } catch {
        // Silencioso: la línea de impulsadoras es informativa, no bloquea la lista.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [bloque, bloquePorMarca, refreshKey]);

  const ejecutarAnular = async () => {
    if (!anularPendiente || !anularMotivo.trim()) return;
    setAnulando(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${anularPendiente.id}/anular`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: anularMotivo.trim() }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar");
      }
      toast("Proyecto eliminado", "success");
      setDeshacerAnular({ id: anularPendiente.id, nombre: anularPendiente.nombre });
      setAnularPendiente(null);
      setAnularMotivo("");
      cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    } finally {
      setAnulando(false);
    }
  };

  const ejecutarDeshacerAnular = async () => {
    if (!deshacerAnular) return;
    setDeshaciendo(true);
    try {
      const res = await fetch("/api/marketing/papelera/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "proyecto", id: deshacerAnular.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo devolver el proyecto");
      }
      toast("Listo, el proyecto volvió", "success");
      setDeshacerAnular(null);
      cargar();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "No se pudo devolver el proyecto",
        "error",
      );
    } finally {
      setDeshaciendo(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Back a las cards de marca */}
      <button
        type="button"
        onClick={onBack}
        /* Volver era texto suelto (~20 px de alto); -my-1 para no separar de la lista. */
        className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1 min-h-[44px] -my-1"
      >
        ← Marketing
      </button>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {bucketLabel || "Marketing"}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Proyectos con gasto de esta marca
          </p>
        </div>
        {/* Eran textos sueltos de 18-21 px de alto. 44 px de área táctil en
            cada uno; -my-1 evita que la fila empuje el título al crecer. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm w-full sm:w-auto sm:shrink-0 -my-1">
          <button
            type="button"
            onClick={onOpenInventario}
            className="text-gray-600 hover:text-black transition min-h-[44px] inline-flex items-center"
          >
            Mobiliario
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={onOpenReportes}
            className="text-gray-600 hover:text-black transition min-h-[44px] inline-flex items-center"
          >
            Reportes
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={onOpenImpulsadoras}
            className="text-gray-600 hover:text-black transition min-h-[44px] inline-flex items-center"
          >
            Impulsadoras
          </button>
          <button
            type="button"
            onClick={onRegistrarGasto}
            className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition ml-auto sm:ml-2"
          >
            + Registrar gasto
          </button>
        </div>
      </div>

      {/* La vuelta atrás de anular. Ver el comentario del state. */}
      {deshacerAnular && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm text-amber-900">
            Eliminaste &ldquo;{deshacerAnular.nombre}&rdquo;. Ya no aparece en Marketing.
          </span>
          <button
            type="button"
            onClick={ejecutarDeshacerAnular}
            disabled={deshaciendo}
            className="text-sm font-semibold text-amber-900 underline min-h-[44px] inline-flex items-center disabled:opacity-50"
          >
            {deshaciendo ? "Devolviendo…" : "Deshacer"}
          </button>
          <button
            type="button"
            onClick={() => setDeshacerAnular(null)}
            className="text-sm text-amber-800 min-h-[44px] min-w-[44px] inline-flex items-center justify-center ml-auto"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}

      {/* Búsqueda */}
      <div className="grid grid-cols-1 gap-2">
        {/* text-base en mobile: con text-sm (14px) Safari hace zoom al enfocar
            el campo y descuadra la página. min-h-[44px] para el toque. */}
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por proyecto, tienda o N° de factura…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none"
        />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : proyectos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <div className="text-sm text-gray-600 mb-1">
            {busquedaDebounced
              ? "No hay proyectos que coincidan con el filtro."
              : "Todavía no hay gasto de esta marca. Registra el primero."}
          </div>
          {!busquedaDebounced && (
            <button
              type="button"
              onClick={onRegistrarGasto}
              className="text-sm text-fuchsia-600 hover:text-fuchsia-800 min-h-[44px] inline-flex items-center mt-2"
            >
              Registrar el primero
            </button>
          )}
        </div>
      ) : (
        /* El div interno es el SCROLLER: sin él, el `overflow-hidden` del
           borde redondeado recorta la tabla sin salida (medido 11-ago-2026:
           176 px a 390 y 147 px a 834, o sea PRE-EXISTENTES). Se vuelve
           visible desde que los bloques del inicio abren una lista con
           proyectos adentro. */
        <div className="rounded-[10px] border border-[#e5e5e5] overflow-hidden bg-white">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-xs uppercase tracking-wide text-gray-500">
                <th className="text-left font-medium px-[18px] py-2.5">Proyecto</th>
                <th className="text-left font-medium px-[18px] py-2.5 w-[120px] hidden md:table-cell">
                  Marcas
                </th>
                <th className="text-right font-medium px-[18px] py-2.5 w-[140px]">
                  Gastado
                </th>
                <th className="text-left font-medium px-[18px] py-2.5 w-[110px] hidden md:table-cell">
                  Fecha
                </th>
                <th className="text-right font-medium px-[18px] py-2.5 w-[140px]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {proyectos.map((p) => {
                // Cliente (tienda) es el ancla visual principal; el tipo de
                // gasto (nombre) cae al subtítulo junto con los contadores.
                // nombreVis se sigue usando como etiqueta canónica en
                // confirmaciones, ARIA y menús — refleja lo que el usuario
                // está viendo en la fila.
                const tituloVis = p.tienda || p.nombre || "";
                const subtituloTipo = p.nombre && p.nombre !== p.tienda ? p.nombre : "";
                const nombreVis = tituloVis;
                // Archivo plano: solo fecha de creación, sin label de transición.
                const fechaIso = p.created_at;

                // "Gastado" = lo que se pagó de verdad (Σ factura.total con
                // ITBMS + entregas), SIN ponderar por co-op. El tooltip de
                // abajo sí muestra el cobrable por marca (co-op). Fallback al
                // cálculo viejo por si llega una respuesta cacheada sin gasto_real.
                const totalGastado = p.gasto_real ?? (p.por_cobrar_total || 0);
                const desgloseTooltip =
                  p.por_cobrar_por_marca.length > 0
                    ? p.por_cobrar_por_marca
                        .map((d) => `${d.marca_nombre}: ${formatearMonto(d.monto)}`)
                        .join("\n")
                    : undefined;

                return (
                  <tr
                    key={p.id}
                    onClick={() => onOpenProyecto(p.id)}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    {/* Proyecto */}
                    <td className="px-[18px] py-3 align-middle">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-gray-900 truncate">
                          {tituloVis}
                        </span>
                        {(p.entregas_count ?? 0) > 0 && (
                          <span
                            title="Este proyecto tiene entregas de muebles"
                            className="inline-flex items-center gap-1 shrink-0 bg-white border border-teal-300 text-teal-700 rounded-md px-2 py-0.5 text-xs"
                          >
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M16.5 9.4l-9-5.19" />
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                              <path d="M12 22.08V12" />
                            </svg>
                            Muebles
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-gray-500 truncate">
                        {subtituloTipo ? `${subtituloTipo} · ` : ""}
                        {p.facturas_count}{" "}
                        {p.facturas_count === 1 ? "factura" : "facturas"}
                        {(p.entregas_count ?? 0) > 0 && (
                          <>
                            {" · "}
                            {p.entregas_count}{" "}
                            {p.entregas_count === 1 ? "entrega" : "entregas"}
                          </>
                        )}
                        {" · "}
                        {p.fotos_count}{" "}
                        {p.fotos_count === 1 ? "foto" : "fotos"}
                      </div>
                    </td>
                    {/* Marcas */}
                    <td className="px-[18px] py-3 align-middle hidden md:table-cell">
                      {p.marcas.length === 0 ? (
                        <span className="text-gray-300 text-xs">—</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          {p.marcas.map((m) => (
                            <span
                              key={m.id}
                              title={m.nombre}
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-md border text-xs font-bold ${colorParaMarca(m.codigo)}`}
                            >
                              {inicial(m.nombre)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {/* Gastado */}
                    <td
                      className="px-[18px] py-3 align-middle text-right tabular-nums"
                      title={desgloseTooltip}
                    >
                      {totalGastado === 0 ? (
                        <span className="text-gray-300 text-xs">—</span>
                      ) : (
                        <span className="font-semibold text-gray-900">
                          {formatearMonto(totalGastado)}
                        </span>
                      )}
                    </td>
                    {/* Fecha */}
                    <td className="px-[18px] py-3 align-middle text-[12px] text-gray-500 hidden md:table-cell">
                      {formatearFecha(fechaIso)}
                    </td>
                    {/* Acciones: Editar (abre overlay), ZIP, y el "anular" de
                        siempre con su nombre nuevo. "Cerrar proyecto" se retiró
                        (ver el encabezado del archivo). */}
                    <td
                      className="px-[18px] py-3 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        {!p.anulado_en && (
                          <OverflowMenu
                            items={[
                              {
                                label: "Editar",
                                onClick: () => onOpenProyecto(p.id),
                              },
                              {
                                label: "Descargar ZIP",
                                onClick: () => descargarZip(p.id),
                                disabled:
                                  zipEstados[p.id]?.tipo === "trabajando" ||
                                  zipEstados[p.id]?.tipo === "exito",
                              },
                              {
                                label: "Registrado por error — eliminar",
                                onClick: () => {
                                  setAnularPendiente({
                                    id: p.id,
                                    nombre: nombreVis,
                                  });
                                  setAnularMotivo("");
                                },
                                destructive: true,
                              },
                            ]}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Línea de cuadre: los pagos de impulsadora de esta marca son
          gastos sueltos (no proyectos) → se muestran aparte para que el
          detalle visible sume igual que el total del bloque del inicio. */}
      {impulsadoraTotal > 0 && (
        <button
          type="button"
          onClick={onOpenImpulsadoras}
          className="w-full flex items-center justify-between rounded-[10px] border border-[#e5e5e5] bg-white px-[18px] py-3 hover:border-gray-400 transition text-left"
        >
          <span className="text-sm text-gray-700">
            Impulsadoras <span className="text-gray-400">· esta marca</span>
          </span>
          <span className="text-sm font-medium tabular-nums text-gray-900">
            {formatearMonto(impulsadoraTotal)} ›
          </span>
        </button>
      )}

      {anularPendiente && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" {...anularDismiss.backdrop} />
          <div
            ref={anularDismiss.panelRef}
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">
              Registrado por error — eliminar
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Vas a eliminar &ldquo;{anularPendiente.nombre}&rdquo;. Deja de
              aparecer en Marketing y su gasto no se le reporta a nadie. Si te
              equivocás, podés devolverlo enseguida desde el aviso que queda en
              la lista.
            </p>
            <label
              htmlFor="mk-motivo-anular-card"
              className="block text-sm text-gray-600 mb-1"
            >
              Motivo<span className="text-red-500 ml-0.5">*</span>
            </label>
            <textarea
              id="mk-motivo-anular-card"
              rows={3}
              value={anularMotivo}
              onChange={(e) => setAnularMotivo(e.target.value)}
              placeholder="Explica qué pasó"
              /* text-base en mobile para que Safari no haga zoom al enfocar. */
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm focus:border-black focus:outline-none mb-4"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={ejecutarAnular}
                disabled={anulando || anularMotivo.trim().length === 0}
                className="flex-1 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {anulando ? "Eliminando…" : "Eliminar"}
              </button>
              <button
                type="button"
                onClick={() => setAnularPendiente(null)}
                disabled={anulando}
                className="flex-1 border border-gray-200 text-gray-600 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
