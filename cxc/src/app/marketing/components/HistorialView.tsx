"use client";

// Fase 4: vista de Historial (proyectos en estado 'cobrado').
// Cards con acciones consistentes con la lista activa cuando un proyecto
// está cobrado: "Descargar ZIP" y "Reabrir" (vuelve a Enviado).

import { useCallback, useEffect, useState } from "react";
import type { MkMarca } from "@/lib/marketing/types";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import { useToast } from "@/components/ToastSystem";
import { ConfirmModal } from "@/components/ui";

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
  const [zipLoadingId, setZipLoadingId] = useState<string | null>(null);
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

  const descargarZip = async (id: string) => {
    setZipLoadingId(id);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${id}/datos-zip`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo preparar el ZIP");
      }
      const data = await res.json();
      const { generarZipProyecto } = await import(
        "@/lib/marketing/generar-zip"
      );
      await generarZipProyecto(data);
      toast("ZIP descargado", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Error descargando ZIP",
        "error",
      );
    } finally {
      setZipLoadingId(null);
    }
  };

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
        <div className="grid grid-cols-1 gap-2">
          {proyectos.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenProyecto(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenProyecto(p.id);
                }
              }}
              className="text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-black transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-black/20"
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
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 font-medium shrink-0">
                  Cobrado
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span>
                  {p.facturas_count} {p.facturas_count === 1 ? "factura" : "facturas"} ·{" "}
                  {p.fotos_count} {p.fotos_count === 1 ? "foto" : "fotos"}
                </span>
                {p.fecha_cobrado && (
                  <span className="text-emerald-700">
                    Cobrado el {formatearFecha(p.fecha_cobrado)}
                  </span>
                )}
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

              {p.cobrado_total > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2 text-xs">
                  <span className="text-gray-500">
                    Total cobrado:{" "}
                    <span className="font-mono tabular-nums font-semibold text-gray-900">
                      {formatearMonto(p.cobrado_total)}
                    </span>
                  </span>
                  {p.cobrado_por_marca.length > 1 && (
                    <span className="text-gray-500 text-[11px]">
                      (
                      {p.cobrado_por_marca
                        .map(
                          (d) =>
                            `${d.marca_nombre} ${formatearMonto(d.monto)}`,
                        )
                        .join(" + ")}
                      )
                    </span>
                  )}
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReabrirPendiente({
                      id: p.id,
                      nombre: p.nombre || p.tienda,
                    });
                  }}
                  className="text-xs rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-1.5 hover:bg-gray-50 active:scale-[0.97] transition"
                >
                  Reabrir
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    descargarZip(p.id);
                  }}
                  disabled={zipLoadingId === p.id}
                  className="text-xs rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 active:scale-[0.97] transition"
                >
                  {zipLoadingId === p.id ? "Descargando…" : "Descargar ZIP"}
                </button>
              </div>
            </div>
          ))}
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
