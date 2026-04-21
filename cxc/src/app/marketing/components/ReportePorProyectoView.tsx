"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { exportarExcelReporte } from "@/lib/marketing/reportes";
import type { ReporteProyectoItem } from "@/lib/marketing/reportes";
import { fmtDate } from "@/lib/format";
import type { EstadoProyecto, MkMarca } from "@/lib/marketing/types";
import { EstadoBadge } from "@/components/marketing/EstadoBadge";

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = [ANIO_ACTUAL, ANIO_ACTUAL - 1, ANIO_ACTUAL - 2];

const ESTADOS: Array<{ value: "todos" | EstadoProyecto; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "abierto", label: "Abierto" },
  { value: "por_cobrar", label: "Por cobrar" },
  { value: "enviado", label: "Enviado" },
  { value: "cobrado", label: "Cobrado" },
];

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function descargarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportePorProyectoView() {
  const { toast } = useToast();
  const [anio, setAnio] = useState<number | "todos">(ANIO_ACTUAL);
  const [marcaId, setMarcaId] = useState<string>("");
  const [tienda, setTienda] = useState<string>("");
  const [estado, setEstado] = useState<"todos" | EstadoProyecto>("todos");

  const [marcas, setMarcas] = useState<MkMarca[]>([]);
  const [tiendas, setTiendas] = useState<string[]>([]);

  const [items, setItems] = useState<ReporteProyectoItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Cargar marcas (catálogo) y tiendas desde el endpoint de reporte de tiendas,
  // que ya devuelve el set único.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [mkRes, tdRes] = await Promise.all([
          fetch("/api/marketing/marcas", { cache: "no-store" }),
          fetch("/api/marketing/reportes/tienda", { cache: "no-store" }),
        ]);
        if (mkRes.ok) {
          const json = (await mkRes.json()) as { marcas?: MkMarca[]; items?: MkMarca[] };
          const lista = json.marcas ?? json.items ?? [];
          if (!cancel) setMarcas(lista);
        }
        if (tdRes.ok) {
          const json = (await tdRes.json()) as { tiendas?: string[] };
          if (!cancel) setTiendas(json.tiendas ?? []);
        }
      } catch (err) {
        console.error("Error cargando catálogos de filtros:", err);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (anio !== "todos") params.set("anio", String(anio));
      if (marcaId) params.set("marca_id", marcaId);
      if (tienda.trim()) params.set("tienda", tienda.trim());
      if (estado !== "todos") params.set("estado", estado);
      const url = `/api/marketing/reportes/proyecto${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: ReporteProyectoItem[] };
      setItems(json.items ?? []);
    } catch (err) {
      console.error("Error cargando reporte por proyecto:", err);
      toast("No se pudo cargar el reporte. Intenta de nuevo.", "error");
    } finally {
      setLoading(false);
    }
  }, [anio, marcaId, tienda, estado, toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totales = useMemo(
    () =>
      items.reduce(
        (acc, it) => ({
          gasto: acc.gasto + it.gastoTotal,
          cobrado: acc.cobrado + it.cobrado,
          pendiente: acc.pendiente + it.pendiente,
        }),
        { gasto: 0, cobrado: 0, pendiente: 0 }
      ),
    [items]
  );

  function exportar() {
    try {
      const blob = exportarExcelReporte("proyecto", items);
      const suf = anio === "todos" ? "todos" : String(anio);
      descargarBlob(blob, `Marketing-PorProyecto-${suf}.xlsx`);
      toast("Excel listo — revisa tu carpeta de descargas", "success");
    } catch (err) {
      console.error("Error exportando Excel:", err);
      toast("No se pudo exportar. Intenta de nuevo.", "error");
    }
  }

  function limpiarFiltros() {
    setMarcaId("");
    setTienda("");
    setEstado("todos");
    setAnio(ANIO_ACTUAL);
  }

  const hayFiltros =
    marcaId !== "" || tienda.trim() !== "" || estado !== "todos" || anio !== ANIO_ACTUAL;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-600">
          <div className="mb-1">Año</div>
          <select
            value={anio === "todos" ? "todos" : String(anio)}
            onChange={(e) =>
              setAnio(e.target.value === "todos" ? "todos" : parseInt(e.target.value, 10))
            }
            className="px-3 py-1.5 rounded-md border border-gray-200 text-sm bg-white"
          >
            <option value="todos">Todos</option>
            {ANIOS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-600">
          <div className="mb-1">Marca</div>
          <select
            value={marcaId}
            onChange={(e) => setMarcaId(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-gray-200 text-sm bg-white"
          >
            <option value="">Todas</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-600">
          <div className="mb-1">Tienda</div>
          <input
            type="text"
            value={tienda}
            onChange={(e) => setTienda(e.target.value)}
            placeholder="Cualquier tienda"
            list="mk-proy-tiendas"
            className="px-3 py-1.5 rounded-md border border-gray-200 text-sm bg-white min-w-[200px]"
          />
          <datalist id="mk-proy-tiendas">
            {tiendas.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>

        <label className="text-sm text-gray-600">
          <div className="mb-1">Estado</div>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as "todos" | EstadoProyecto)}
            className="px-3 py-1.5 rounded-md border border-gray-200 text-sm bg-white"
          >
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        {hayFiltros && (
          <button
            onClick={limpiarFiltros}
            className="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-50"
          >
            Limpiar
          </button>
        )}

        <button
          onClick={exportar}
          disabled={loading || items.length === 0}
          className="ml-auto px-3 py-1.5 rounded-md text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.97] disabled:opacity-50"
        >
          Exportar Excel
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-500">
          Cargando...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-600">Sin proyectos para estos filtros.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 sticky top-0">
              <tr>
                <th className="text-left font-medium px-4 py-2">Proyecto</th>
                <th className="text-left font-medium px-4 py-2">Tienda</th>
                <th className="text-left font-medium px-4 py-2">Inicio</th>
                <th className="text-left font-medium px-4 py-2">Estado</th>
                <th className="text-left font-medium px-4 py-2">Marcas</th>
                <th className="text-right font-medium px-4 py-2">Gasto</th>
                <th className="text-right font-medium px-4 py-2">Cobrado</th>
                <th className="text-right font-medium px-4 py-2">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.proyecto.id}
                  className="border-t border-gray-100 hover:bg-gray-50 align-top"
                >
                  <td className="px-4 py-3 text-gray-900">
                    {it.proyecto.nombre ?? it.proyecto.tienda}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{it.proyecto.tienda}</td>
                  <td
                    className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap"
                    title={it.proyecto.fecha_inicio}
                  >
                    {fmtDate(it.proyecto.fecha_inicio)}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge tipo="proyecto" estado={it.proyecto.estado} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {it.marcas.length === 0 ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      it.marcas
                        .map((m) => `${m.nombre} (${m.porcentaje.toFixed(0)}%)`)
                        .join(", ")
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {fmtMoney(it.gastoTotal)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                    {fmtMoney(it.cobrado)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      it.pendiente > 0 ? "text-amber-700" : "text-gray-500"
                    }`}
                  >
                    {fmtMoney(it.pendiente)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td
                  className="px-4 py-2 text-sm font-medium text-gray-700"
                  colSpan={5}
                >
                  Total
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {fmtMoney(totales.gasto)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-emerald-700">
                  {fmtMoney(totales.cobrado)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-amber-700">
                  {fmtMoney(totales.pendiente)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default ReportePorProyectoView;
