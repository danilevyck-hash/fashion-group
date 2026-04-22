"use client";

// Fase 3: home de Marketing es una lista de proyectos directa (sin grid
// de marcas). Filtros: búsqueda por texto, pill de estado (Activos default),
// y dropdown de marca. Marcas se derivan de mk_factura_marcas.

import { useCallback, useEffect, useState } from "react";
import type { MkMarca } from "@/lib/marketing/types";
import { EstadoBadge } from "@/components/marketing";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import { useToast } from "@/components/ToastSystem";
import { ConfirmModal } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { useDescargarZip } from "@/lib/marketing/useDescargarZip";

type FiltroEstado =
  | "activos"
  | "todos"
  | "abierto"
  | "enviado";

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
  marcas: Array<{ id: string; nombre: string; codigo: string }>;
  por_cobrar_total: number;
  por_cobrar_por_marca: Array<{
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
  onOpenHistorial: () => void;
  refreshKey: number;
}

const PILLS: Array<{ key: FiltroEstado; label: string }> = [
  { key: "activos", label: "Activos" },
  { key: "todos", label: "Todos" },
  { key: "abierto", label: "Abiertos" },
  { key: "enviado", label: "Enviados" },
];

function colorParaMarca(codigo: string): string {
  if (codigo === "TH") return "bg-red-50 text-red-700 border-red-200";
  if (codigo === "CK") return "bg-gray-100 text-gray-800 border-gray-300";
  if (codigo === "RBK") return "bg-blue-50 text-blue-700 border-blue-200";
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
  onOpenHistorial,
  refreshKey,
}: Props) {
  const { toast } = useToast();
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("activos");
  const [marcaIdFiltro, setMarcaIdFiltro] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  const [busquedaDebounced, setBusquedaDebounced] = useState<string>("");
  const [proyectos, setProyectos] = useState<ProyectoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [accionPendiente, setAccionPendiente] = useState<
    | {
        id: string;
        nombre: string;
        tipo: "enviado" | "cobrado" | "reabrir";
      }
    | null
  >(null);
  const [accionLoading, setAccionLoading] = useState(false);
  const { estados: zipEstados, descargar: descargarZip } = useDescargarZip();
  const [anularPendiente, setAnularPendiente] = useState<
    { id: string; nombre: string } | null
  >(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);

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
      if (marcaIdFiltro) qs.set("marca_id", marcaIdFiltro);
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
  }, [filtroEstado, marcaIdFiltro, busquedaDebounced]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  // Para contadores de cada pill: fetch aparte con filtro_estado=todos sin marca
  // ni búsqueda, para mostrar conteos correctos. Simpler: usamos el array actual
  // si filtroEstado==='todos' sin filtros extra; si no, omitimos contadores
  // exactos y mostramos solo la lista filtrada.
  const conteoActual = proyectos.length;

  const ejecutarTransicion = async () => {
    if (!accionPendiente) return;
    setAccionLoading(true);
    try {
      const endpoint =
        accionPendiente.tipo === "enviado"
          ? "marcar-enviado"
          : accionPendiente.tipo === "cobrado"
            ? "marcar-cobrado"
            : "reabrir";
      const res = await fetch(
        `/api/marketing/proyectos/${accionPendiente.id}/${endpoint}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo aplicar la acción");
      }
      const msg =
        accionPendiente.tipo === "enviado"
          ? "Proyecto marcado como enviado"
          : accionPendiente.tipo === "cobrado"
            ? "Proyecto archivado como cobrado"
            : "Proyecto reabierto";
      toast(msg, "success");
      setAccionPendiente(null);
      cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setAccionLoading(false);
    }
  };

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

  const tituloConfirm =
    accionPendiente?.tipo === "enviado"
      ? "Marcar como enviado"
      : accionPendiente?.tipo === "cobrado"
        ? "Marcar como cobrado"
        : "Reabrir proyecto";

  const mensajeConfirm =
    accionPendiente?.tipo === "enviado"
      ? `¿Confirmas que ya enviaste "${accionPendiente.nombre}" al proveedor?`
      : accionPendiente?.tipo === "cobrado"
        ? `¿Confirmas que ya recibiste el pago/NC de "${accionPendiente.nombre}"? Pasará al historial.`
        : accionPendiente
          ? `"${accionPendiente.nombre}" volverá a estado Enviado.`
          : "";

  const labelConfirm =
    accionPendiente?.tipo === "enviado"
      ? "Marcar enviado"
      : accionPendiente?.tipo === "cobrado"
        ? "Marcar cobrado"
        : "Reabrir";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Marketing</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gastos compartidos a marcas
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-sm">
          <button
            type="button"
            onClick={onOpenHistorial}
            className="text-gray-600 hover:text-black transition"
          >
            Historial
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
            onClick={onOpenAnulados}
            className="text-gray-600 hover:text-black transition"
          >
            Anulados
          </button>
          <button
            type="button"
            onClick={onNuevoProyecto}
            className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition ml-2"
          >
            + Nuevo proyecto
          </button>
        </div>
      </div>

      {/* Filtros: búsqueda + marca */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o tienda…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
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
      </div>

      {/* Pills de estado */}
      <div className="flex flex-wrap gap-2 items-center">
        {PILLS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setFiltroEstado(p.key)}
            className={`text-xs px-3 py-1 rounded-full transition ${
              filtroEstado === p.key
                ? "bg-black text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {p.label}
            {filtroEstado === p.key && (
              <span className="ml-1 opacity-60 tabular-nums">{conteoActual}</span>
            )}
          </button>
        ))}
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
            {busquedaDebounced || marcaIdFiltro
              ? "No hay proyectos que coincidan con el filtro."
              : filtroEstado === "activos"
                ? "No hay proyectos activos todavía."
                : "No hay proyectos todavía."}
          </div>
          {!busquedaDebounced && !marcaIdFiltro && (
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
              <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                <th className="text-left font-medium px-[18px] py-2.5">Proyecto</th>
                <th className="text-left font-medium px-[18px] py-2.5 w-[120px]">
                  Estado
                </th>
                <th className="text-left font-medium px-[18px] py-2.5 w-[120px] hidden md:table-cell">
                  Marcas
                </th>
                <th className="text-right font-medium px-[18px] py-2.5 w-[140px]">
                  Por cobrar
                </th>
                <th className="text-left font-medium px-[18px] py-2.5 w-[110px] hidden md:table-cell">
                  Fecha
                </th>
                <th className="text-right font-medium px-[18px] py-2.5 w-[180px]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {proyectos.map((p) => {
                const nombreVis = p.nombre || p.tienda;
                const fechaLabel =
                  p.estado === "cobrado" && p.fecha_cobrado
                    ? { label: "Cobrado", iso: p.fecha_cobrado }
                    : p.estado === "enviado" && p.fecha_enviado
                      ? { label: "Enviado", iso: p.fecha_enviado }
                      : { label: "Creado", iso: p.created_at };

                const desgloseTooltip = p.por_cobrar_por_marca.length > 0
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
                      <div className="font-semibold text-gray-900 truncate">
                        {nombreVis}
                      </div>
                      <div className="text-[12px] text-gray-500 truncate">
                        {p.tienda && p.tienda !== nombreVis ? `${p.tienda} · ` : ""}
                        {p.facturas_count}{" "}
                        {p.facturas_count === 1 ? "factura" : "facturas"} ·{" "}
                        {p.fotos_count}{" "}
                        {p.fotos_count === 1 ? "foto" : "fotos"}
                      </div>
                    </td>
                    {/* Estado */}
                    <td className="px-[18px] py-3 align-middle">
                      <EstadoBadge estado={p.estado} />
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
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-md border text-[11px] font-bold ${colorParaMarca(m.codigo)}`}
                            >
                              {inicial(m.nombre)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {/* Por cobrar */}
                    <td
                      className="px-[18px] py-3 align-middle text-right tabular-nums"
                      title={desgloseTooltip}
                    >
                      {p.facturas_count === 0 ? (
                        <span className="text-gray-300 text-xs">—</span>
                      ) : p.por_cobrar_total === 0 ? (
                        <span className="text-emerald-700 font-medium text-xs">
                          Todo cobrado
                        </span>
                      ) : (
                        <span className="font-semibold text-gray-900">
                          {formatearMonto(p.por_cobrar_total)}
                        </span>
                      )}
                    </td>
                    {/* Fecha */}
                    <td className="px-[18px] py-3 align-middle text-[12px] text-gray-500 hidden md:table-cell">
                      <div>{formatearFecha(fechaLabel.iso)}</div>
                      <div className="text-[11px] text-gray-400">
                        {fechaLabel.label}
                      </div>
                    </td>
                    {/* Acciones */}
                    <td
                      className="px-[18px] py-3 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        {!p.anulado_en && p.estado === "abierto" && (
                          <button
                            type="button"
                            onClick={() =>
                              setAccionPendiente({
                                id: p.id,
                                nombre: nombreVis,
                                tipo: "enviado",
                              })
                            }
                            className="hidden md:inline-flex text-xs rounded-md bg-black text-white px-3 py-1.5 active:scale-[0.97] transition"
                          >
                            Enviar
                          </button>
                        )}
                        {!p.anulado_en && p.estado === "enviado" && (
                          <button
                            type="button"
                            onClick={() =>
                              setAccionPendiente({
                                id: p.id,
                                nombre: nombreVis,
                                tipo: "cobrado",
                              })
                            }
                            className="hidden md:inline-flex text-xs rounded-md bg-black text-white px-3 py-1.5 active:scale-[0.97] transition"
                          >
                            Cobrar
                          </button>
                        )}
                        {!p.anulado_en && p.estado === "cobrado" && (
                          <button
                            type="button"
                            onClick={() =>
                              setAccionPendiente({
                                id: p.id,
                                nombre: nombreVis,
                                tipo: "reabrir",
                              })
                            }
                            className="hidden md:inline-flex text-xs rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-1.5 hover:bg-gray-50 active:scale-[0.97] transition"
                          >
                            Reabrir
                          </button>
                        )}
                        {!p.anulado_en && (
                          <OverflowMenu
                            items={[
                              ...(p.estado === "abierto"
                                ? [
                                    {
                                      label: "Marcar como enviado",
                                      onClick: () =>
                                        setAccionPendiente({
                                          id: p.id,
                                          nombre: nombreVis,
                                          tipo: "enviado" as const,
                                        }),
                                    },
                                  ]
                                : []),
                              ...(p.estado === "enviado"
                                ? [
                                    {
                                      label: "Marcar como cobrado",
                                      onClick: () =>
                                        setAccionPendiente({
                                          id: p.id,
                                          nombre: nombreVis,
                                          tipo: "cobrado" as const,
                                        }),
                                    },
                                  ]
                                : []),
                              ...(p.estado === "cobrado"
                                ? [
                                    {
                                      label: "Reabrir",
                                      onClick: () =>
                                        setAccionPendiente({
                                          id: p.id,
                                          nombre: nombreVis,
                                          tipo: "reabrir" as const,
                                        }),
                                    },
                                  ]
                                : []),
                              {
                                label: "Descargar ZIP",
                                onClick: () => descargarZip(p.id),
                                disabled:
                                  zipEstados[p.id]?.tipo === "trabajando" ||
                                  zipEstados[p.id]?.tipo === "exito",
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

      <ConfirmModal
        open={!!accionPendiente}
        onClose={() => !accionLoading && setAccionPendiente(null)}
        onConfirm={ejecutarTransicion}
        title={tituloConfirm}
        message={mensajeConfirm}
        confirmLabel={labelConfirm}
        loading={accionLoading}
      />

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
