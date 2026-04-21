"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { exportarExcelReporte } from "@/lib/marketing/reportes";
import type { ReporteTiendaItem } from "@/lib/marketing/reportes";

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = [ANIO_ACTUAL, ANIO_ACTUAL - 1, ANIO_ACTUAL - 2];

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

export function ReportePorTiendaView() {
  const { toast } = useToast();
  const [anio, setAnio] = useState<number | "todos">(ANIO_ACTUAL);
  const [items, setItems] = useState<ReporteTiendaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroTienda, setFiltroTienda] = useState<string>("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        anio === "todos"
          ? "/api/marketing/reportes/tienda"
          : `/api/marketing/reportes/tienda?anio=${anio}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: ReporteTiendaItem[] };
      setItems(json.items ?? []);
    } catch (err) {
      console.error("Error cargando reporte por tienda:", err);
      toast("No se pudo cargar el reporte. Intenta de nuevo.", "error");
    } finally {
      setLoading(false);
    }
  }, [anio, toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Marcas únicas detectadas en todas las filas (para columnas dinámicas)
  const marcasColumnas = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      for (const nombre of Object.keys(it.porMarca)) set.add(nombre);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [items]);

  const tiendas = useMemo(
    () => items.map((it) => it.tienda).sort((a, b) => a.localeCompare(b, "es")),
    [items]
  );

  const itemsVisibles = useMemo(() => {
    const q = filtroTienda.trim().toLocaleLowerCase("es");
    if (!q) return items;
    return items.filter((it) => it.tienda.toLocaleLowerCase("es").includes(q));
  }, [items, filtroTienda]);

  const totalGlobal = useMemo(
    () => itemsVisibles.reduce((acc, it) => acc + it.total, 0),
    [itemsVisibles]
  );

  function exportar() {
    try {
      const blob = exportarExcelReporte("tienda", itemsVisibles);
      const suf = anio === "todos" ? "todos" : String(anio);
      descargarBlob(blob, `Marketing-PorTienda-${suf}.xlsx`);
      toast("Excel listo — revisa tu carpeta de descargas", "success");
    } catch (err) {
      console.error("Error exportando Excel:", err);
      toast("No se pudo exportar. Intenta de nuevo.", "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">
          Año
          <select
            value={anio === "todos" ? "todos" : String(anio)}
            onChange={(e) =>
              setAnio(e.target.value === "todos" ? "todos" : parseInt(e.target.value, 10))
            }
            className="ml-2 px-3 py-1.5 rounded-md border border-gray-200 text-sm bg-white"
          >
            <option value="todos">Todos</option>
            {ANIOS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <input
          type="text"
          value={filtroTienda}
          onChange={(e) => setFiltroTienda(e.target.value)}
          placeholder="Filtrar por tienda..."
          list="mk-tiendas-options"
          className="px-3 py-1.5 rounded-md border border-gray-200 text-sm bg-white min-w-[200px]"
        />
        <datalist id="mk-tiendas-options">
          {tiendas.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <button
          onClick={exportar}
          disabled={loading || itemsVisibles.length === 0}
          className="ml-auto px-3 py-1.5 rounded-md text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.97] disabled:opacity-50"
        >
          Exportar Excel
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-500">
          Cargando...
        </div>
      ) : itemsVisibles.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-600">Sin datos para este periodo.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 sticky top-0">
              <tr>
                <th className="text-left font-medium px-4 py-2">Tienda</th>
                {marcasColumnas.map((m) => (
                  <th
                    key={m}
                    className="text-right font-medium px-4 py-2 whitespace-nowrap"
                  >
                    {m}
                  </th>
                ))}
                <th className="text-right font-medium px-4 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {itemsVisibles.map((it) => (
                <tr
                  key={it.tienda}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-gray-900">{it.tienda}</td>
                  {marcasColumnas.map((m) => (
                    <td
                      key={m}
                      className="px-4 py-3 text-right tabular-nums text-gray-700"
                    >
                      {it.porMarca[m] ? fmtMoney(it.porMarca[m]) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                    {fmtMoney(it.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td
                  className="px-4 py-2 text-sm font-medium text-gray-700"
                  colSpan={marcasColumnas.length + 1}
                >
                  Total general
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {fmtMoney(totalGlobal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default ReportePorTiendaView;
