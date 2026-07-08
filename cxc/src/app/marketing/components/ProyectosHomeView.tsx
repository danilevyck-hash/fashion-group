"use client";

// Fase 3: home de Marketing es una lista de proyectos directa (sin grid
// de marcas). Filtros: búsqueda por texto, pill de estado (Activos default),
// y dropdown de marca. Marcas se derivan de mk_factura_marcas.

import { useCallback, useEffect, useState } from "react";
import { saveAs } from "file-saver";
import type { MkMarca } from "@/lib/marketing/types";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import { useToast } from "@/components/ToastSystem";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { useDescargarZip } from "@/lib/marketing/useDescargarZip";

// Solo usado para inicializar el estado fijo; ya no hay UI de filtro por estado.
type FiltroEstado = "todos";

interface ProyectoListItem {
  id: string;
  nombre: string | null;
  tienda: string;
  estado: string;
  created_at: string;
  anulado_en: string | null;
  fecha_enviado: string | null;
  fecha_cobrado: string | null;
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
  por_cobrar_por_marca: Array<{
    marca_id: string;
    marca_nombre: string;
    monto: number;
  }>;
  // Cobrable co-op por marca (alimenta SOLO el tooltip de desglose).
  cobrado_total?: number;
  cobrado_por_marca?: Array<{
    marca_id: string;
    marca_nombre: string;
    monto: number;
  }>;
}

interface Props {
  marcas: MkMarca[];
  onOpenProyecto: (id: string) => void;
  onNuevoProyecto: () => void;
  onOpenAnulados: () => void;
  onOpenReportes: () => void;
  onOpenImpulsadoras: () => void;
  onOpenInventario: () => void;
  refreshKey: number;
  // Modo bucket (rediseño por marca): al entrar desde una card. El filtro de
  // marca queda FIJO por el bucket y se oculta el dropdown.
  grupo?: "legacy" | "marca";
  marcaIdFijo?: string;
  bucketLabel?: string;
  bucketEsLegacy?: boolean;
  onBack?: () => void;
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
  onNuevoProyecto,
  onOpenAnulados,
  onOpenReportes,
  onOpenImpulsadoras,
  onOpenInventario,
  refreshKey,
  grupo,
  marcaIdFijo,
  bucketLabel,
  bucketEsLegacy,
  onBack,
}: Props) {
  const { toast } = useToast();
  const enBucket = !!onBack; // renderizado desde una card (Nivel 2)
  // Archivo plano: ya no hay filtros por estado en la UI. Forzamos "todos"
  // para que la query backend devuelva la lista completa sin condicionar.
  const [filtroEstado] = useState<FiltroEstado>("todos");
  const [marcaIdFiltro, setMarcaIdFiltro] = useState<string>("");
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
  const [exportando, setExportando] = useState(false);

  // Exporta los gastos visibles (respeta búsqueda + marca; sin filtro baja todo)
  // a un ZIP: carpeta por cliente → proyecto → fotos + gasto, con Excel resumen.
  const exportarZip = useCallback(async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const res = await fetch("/api/marketing/export-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busqueda: busquedaDebounced || undefined,
          marca_id: marcaIdFijo || marcaIdFiltro || null,
          grupo: grupo || undefined,
        }),
      });
      if (!res.ok) {
        const msg =
          res.status === 404
            ? "No hay gastos para exportar con el filtro actual."
            : "No se pudo generar el ZIP. Intenta de nuevo en unos segundos.";
        toast(msg, "error");
        return;
      }
      const blob = await res.blob();
      const fecha = new Date().toISOString().slice(0, 10);
      saveAs(blob, `Gastos-Marketing-${fecha}.zip`);
      const omit = Number(res.headers.get("X-Fotos-Omitidas") || 0);
      toast(
        omit > 0
          ? `ZIP listo — revisa tus descargas (${omit} foto(s) no se pudieron incluir).`
          : "ZIP listo — revisa tu carpeta de descargas.",
        "success",
      );
    } catch {
      toast("No se pudo generar el ZIP. Verifica tu conexión.", "error");
    } finally {
      setExportando(false);
    }
  }, [exportando, busquedaDebounced, marcaIdFiltro, marcaIdFijo, grupo, toast]);

  // Debounce de búsqueda
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("filtro_estado", filtroEstado);
      // Bucket fijo (rediseño): legacy o marca. Sin bucket, cae al dropdown legacy-compat.
      if (grupo === "legacy") {
        qs.set("grupo", "legacy");
      } else if (marcaIdFijo) {
        qs.set("grupo", "marca");
        qs.set("marca_id", marcaIdFijo);
      } else if (marcaIdFiltro) {
        qs.set("marca_id", marcaIdFiltro);
      }
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
  }, [filtroEstado, marcaIdFiltro, marcaIdFijo, grupo, busquedaDebounced]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

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
        throw new Error(err?.error ?? "No se pudo anular");
      }
      toast("Proyecto anulado", "success");
      setAnularPendiente(null);
      setAnularMotivo("");
      cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al anular", "error");
    } finally {
      setAnulando(false);
    }
  };

  const cambiarEstado = async (
    id: string,
    accion: "cerrar" | "reabrir",
    nombre: string,
  ) => {
    try {
      const res = await fetch(`/api/marketing/proyectos/${id}/${accion}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo actualizar");
      }
      toast(
        accion === "cerrar"
          ? `"${nombre}" se cerró`
          : `"${nombre}" se reabrió`,
        "success",
      );
      cargar();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Error al cambiar estado",
        "error",
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Back a las cards de marca (modo bucket) */}
      {enBucket && (
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1"
        >
          ← Marcas
        </button>
      )}
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {enBucket ? bucketLabel || "Marketing" : "Marketing"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {bucketEsLegacy
              ? "Archivo congelado (Tommy + Calvin) · solo lectura"
              : "Registro de gastos de mercadeo por cliente"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm w-full sm:w-auto sm:shrink-0">
          <button
            type="button"
            onClick={onOpenInventario}
            className="text-gray-600 hover:text-black transition"
          >
            Mobiliario
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={onOpenReportes}
            className="text-gray-600 hover:text-black transition"
          >
            Reportes
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={onOpenImpulsadoras}
            className="text-gray-600 hover:text-black transition"
          >
            Impulsadoras
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={onOpenAnulados}
            className="text-xs text-gray-400 hover:text-gray-700 transition"
          >
            Anulados
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={exportarZip}
            disabled={exportando}
            className="text-gray-600 hover:text-black transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportando ? "Generando ZIP…" : "Exportar"}
          </button>
          {!bucketEsLegacy && (
            <button
              type="button"
              onClick={onNuevoProyecto}
              className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition ml-auto sm:ml-2"
            >
              + Nuevo proyecto
            </button>
          )}
        </div>
      </div>

      {/* Filtros: búsqueda (+ dropdown de marca solo fuera del modo bucket) */}
      <div className={`grid grid-cols-1 gap-2 ${enBucket ? "" : "sm:grid-cols-[1fr_200px]"}`}>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por proyecto, tienda o N° de factura…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
        {!enBucket && (
          <select
            value={marcaIdFiltro}
            onChange={(e) => setMarcaIdFiltro(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:border-black focus:outline-none"
          >
            <option value="">Todas las marcas</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        )}
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
              : bucketEsLegacy
                ? "No hay gastos en el archivo Tommy y Calvin."
                : enBucket
                  ? "Aún no hay gastos de esta marca. Crea un proyecto y registra su primera factura."
                  : marcaIdFiltro
                    ? "No hay proyectos que coincidan con el filtro."
                    : "No hay proyectos todavía."}
          </div>
          {!busquedaDebounced && !marcaIdFiltro && !bucketEsLegacy && (
            <button
              type="button"
              onClick={onNuevoProyecto}
              className="text-sm text-fuchsia-600 hover:text-fuchsia-800 mt-2"
            >
              Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e5e5e5] overflow-hidden bg-white">
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
                const totalGastado =
                  p.gasto_real ?? ((p.por_cobrar_total || 0) + (p.cobrado_total || 0));
                const desgloseFuente =
                  p.por_cobrar_por_marca.length > 0
                    ? p.por_cobrar_por_marca
                    : p.cobrado_por_marca;
                const desgloseTooltip = desgloseFuente && desgloseFuente.length > 0
                  ? desgloseFuente
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
                        {p.estado === "cerrado" && (
                          <span
                            title="Proyecto cerrado"
                            className="inline-flex items-center shrink-0 bg-gray-100 border border-gray-300 text-gray-600 rounded-md px-2 py-0.5 text-xs"
                          >
                            Cerrado
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
                    {/* Acciones — archivo plano: Editar (abre overlay), ZIP, Anular */}
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
                              p.estado === "cerrado"
                                ? {
                                    label: "Reabrir proyecto",
                                    onClick: () =>
                                      cambiarEstado(p.id, "reabrir", nombreVis),
                                  }
                                : {
                                    label: "Cerrar proyecto",
                                    onClick: () =>
                                      cambiarEstado(p.id, "cerrar", nombreVis),
                                  },
                              {
                                label: "Anular proyecto",
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
      )}

      {anularPendiente && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          onClick={() => !anulando && setAnularPendiente(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">Anular proyecto</h3>
            <p className="text-sm text-gray-500 mb-4">
              Vas a anular &ldquo;{anularPendiente.nombre}&rdquo;. Podrás
              restaurarlo desde Anulados.
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
              placeholder="Explica por qué se anula"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none mb-4"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={ejecutarAnular}
                disabled={anulando || anularMotivo.trim().length === 0}
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {anulando ? "Anulando…" : "Anular proyecto"}
              </button>
              <button
                type="button"
                onClick={() => setAnularPendiente(null)}
                disabled={anulando}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition"
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
