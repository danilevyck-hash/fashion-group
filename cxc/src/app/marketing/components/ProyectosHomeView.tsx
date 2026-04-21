"use client";

// Fase 3: home de Marketing es una lista de proyectos directa (sin grid
// de marcas). Filtros: búsqueda por texto, pill de estado (Activos default),
// y dropdown de marca. Marcas se derivan de mk_factura_marcas.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MkMarca } from "@/lib/marketing/types";
import { EstadoBadge } from "@/components/marketing";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";

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
  onOpenPapelera: () => void;
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
  onOpenPapelera,
  onOpenReportes,
  onOpenHistorial,
  refreshKey,
}: Props) {
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("activos");
  const [marcaIdFiltro, setMarcaIdFiltro] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  const [busquedaDebounced, setBusquedaDebounced] = useState<string>("");
  const [proyectos, setProyectos] = useState<ProyectoListItem[]>([]);
  const [loading, setLoading] = useState(true);

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
            onClick={onOpenPapelera}
            className="text-gray-600 hover:text-black transition"
          >
            Papelera
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
        <div className="grid grid-cols-1 gap-2">
          {proyectos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenProyecto(p.id)}
              className="text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-black transition"
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {p.nombre || p.tienda}
                  </div>
                  {p.nombre && p.tienda && p.tienda !== p.nombre && (
                    <div className="text-xs text-gray-500">
                      Tienda: {p.tienda}
                    </div>
                  )}
                </div>
                <EstadoBadge estado={p.estado} />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span>
                  {p.facturas_count} {p.facturas_count === 1 ? "factura" : "facturas"} ·{" "}
                  {p.fotos_count} {p.fotos_count === 1 ? "foto" : "fotos"}
                </span>
                <span>
                  {p.estado === "cobrado" && p.fecha_cobrado
                    ? `Cobrado el ${formatearFecha(p.fecha_cobrado)}`
                    : p.estado === "enviado" && p.fecha_enviado
                      ? `Enviado el ${formatearFecha(p.fecha_enviado)}`
                      : p.created_at
                        ? `Creado: ${formatearFecha(p.created_at)}`
                        : ""}
                </span>
              </div>

              {p.marcas.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Marcas:</span>
                  {p.marcas.map((m) => (
                    <span
                      key={m.id}
                      className={`inline-flex items-center gap-1 border rounded-md px-1.5 py-0.5 text-[11px] font-medium ${colorParaMarca(m.codigo)}`}
                      title={m.nombre}
                    >
                      <span className="font-semibold">[{inicial(m.nombre)}]</span>
                      {m.nombre}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2 text-xs">
                {p.facturas_count === 0 ? (
                  <span className="text-gray-400 italic">Sin facturas todavía</span>
                ) : p.por_cobrar_total === 0 ? (
                  <span className="text-emerald-700 font-medium">Todo cobrado</span>
                ) : (
                  <>
                    <span className="text-gray-500">
                      Por cobrar:{" "}
                      <span className="font-mono tabular-nums font-semibold text-gray-900">
                        {formatearMonto(p.por_cobrar_total)}
                      </span>
                    </span>
                    {p.por_cobrar_por_marca.length > 1 && (
                      <span className="text-gray-500 text-[11px]">
                        (
                        {p.por_cobrar_por_marca
                          .map(
                            (d) =>
                              `${d.marca_nombre} ${formatearMonto(d.monto)}`,
                          )
                          .join(" + ")}
                        )
                      </span>
                    )}
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
