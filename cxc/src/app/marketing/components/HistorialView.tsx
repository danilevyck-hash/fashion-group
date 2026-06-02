"use client";

// Fase 4: vista de Historial (proyectos en estado 'cobrado').
// Cards con acciones consistentes con la lista activa cuando un proyecto
// está cobrado: "Descargar ZIP" y "Reabrir" (vuelve a Enviado).

import { useCallback, useEffect, useState } from "react";
import type { MkMarca } from "@/lib/marketing/types";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import { useToast } from "@/components/ToastSystem";
import { ConfirmModal } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { useDescargarZip } from "@/lib/marketing/useDescargarZip";

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
  marcas: Array<{ id: string; nombre: string; codigo: string }>;
  por_cobrar_total: number;
  por_cobrar_por_marca: Array<{
    marca_id: string;
    marca_nombre: string;
    monto: number;
  }>;
  cobrado_total: number;
  cobrado_por_marca: Array<{
    marca_id: string;
    marca_nombre: string;
    monto: number;
  }>;
}

interface Props {
  marcas: MkMarca[];
  onOpenProyecto: (id: string) => void;
  onChange: () => void;
  refreshKey: number;
}

function colorParaMarca(codigo: string): string {
  if (codigo === "TH") return "bg-red-50 text-red-700 border-red-200";
  if (codigo === "CK") return "bg-gray-100 text-gray-800 border-gray-300";
  if (codigo === "RBK") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
}

function inicial(s: string): string {
  return (s || "?").charAt(0).toUpperCase();
}

export default function HistorialView({
  marcas,
  onOpenProyecto,
  onChange,
  refreshKey,
}: Props) {
  const { toast } = useToast();
  const [marcaIdFiltro, setMarcaIdFiltro] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  const [busquedaDebounced, setBusquedaDebounced] = useState<string>("");
  const [proyectos, setProyectos] = useState<ProyectoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { estados: zipEstados, descargar: descargarZip } = useDescargarZip();
  const [reabrirPendiente, setReabrirPendiente] = useState<
    { id: string; nombre: string } | null
  >(null);
  const [reabriendo, setReabriendo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("filtro_estado", "historial");
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
  }, [marcaIdFiltro, busquedaDebounced]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  const ejecutarReabrir = async () => {
    if (!reabrirPendiente) return;
    setReabriendo(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${reabrirPendiente.id}/reabrir`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo reabrir");
      }
      toast("Proyecto reabierto", "success");
      setReabrirPendiente(null);
      cargar();
      onChange();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setReabriendo(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Historial</h1>
        <p className="text-sm text-gray-500 mt-0.5">Proyectos cobrados</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por proyecto, tienda o N° de factura…"
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

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : proyectos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <div className="text-sm text-gray-600">
            {busquedaDebounced || marcaIdFiltro
              ? "No hay proyectos cobrados que coincidan con el filtro."
              : "Aún no hay proyectos cobrados."}
          </div>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e5e5e5] overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                <th className="text-left font-medium px-[18px] py-2.5">Proyecto</th>
                <th className="text-left font-medium px-[18px] py-2.5 w-[120px] hidden md:table-cell">
                  Marcas
                </th>
                <th className="text-right font-medium px-[18px] py-2.5 w-[150px]">
                  Total cobrado
                </th>
                <th className="text-left font-medium px-[18px] py-2.5 w-[110px] hidden md:table-cell">
                  Cobrado el
                </th>
                <th className="text-right font-medium px-[18px] py-2.5 w-[170px]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {proyectos.map((p) => {
                // Cliente (tienda) arriba; tipo de gasto (nombre) al subtítulo.
                const tituloVis = p.tienda || p.nombre || "";
                const subtituloTipo = p.nombre && p.nombre !== p.tienda ? p.nombre : "";
                const nombreVis = tituloVis;
                const desgloseTooltip = p.cobrado_por_marca.length > 0
                  ? p.cobrado_por_marca
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
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-md border text-[11px] font-bold ${colorParaMarca(m.codigo)}`}
                            >
                              {inicial(m.nombre)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {/* Total cobrado */}
                    <td
                      className="px-[18px] py-3 align-middle text-right tabular-nums"
                      title={desgloseTooltip}
                    >
                      {p.cobrado_total > 0 ? (
                        <span className="font-semibold text-gray-900">
                          {formatearMonto(p.cobrado_total)}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    {/* Cobrado el */}
                    <td className="px-[18px] py-3 align-middle text-[12px] text-gray-500 hidden md:table-cell">
                      {p.fecha_cobrado ? formatearFecha(p.fecha_cobrado) : "—"}
                    </td>
                    {/* Acciones */}
                    <td
                      className="px-[18px] py-3 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setReabrirPendiente({
                              id: p.id,
                              nombre: nombreVis,
                            })
                          }
                          className="hidden md:inline-flex text-xs rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-1.5 hover:bg-gray-50 active:scale-[0.97] transition"
                        >
                          Reabrir
                        </button>
                        <OverflowMenu
                          items={[
                            {
                              label: "Reabrir",
                              onClick: () =>
                                setReabrirPendiente({
                                  id: p.id,
                                  nombre: nombreVis,
                                }),
                            },
                            {
                              label: "Descargar ZIP",
                              onClick: () => descargarZip(p.id),
                              disabled:
                                zipEstados[p.id]?.tipo === "trabajando" ||
                                zipEstados[p.id]?.tipo === "exito",
                            },
                          ]}
                        />
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
        open={!!reabrirPendiente}
        onClose={() => !reabriendo && setReabrirPendiente(null)}
        onConfirm={ejecutarReabrir}
        title="Reabrir proyecto"
        message={
          reabrirPendiente
            ? `"${reabrirPendiente.nombre}" volverá a estado Enviado y saldrá del Historial.`
            : ""
        }
        confirmLabel="Reabrir"
        loading={reabriendo}
      />
    </div>
  );
}
