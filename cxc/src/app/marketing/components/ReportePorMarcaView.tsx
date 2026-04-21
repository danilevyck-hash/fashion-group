"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { exportarExcelReporte } from "@/lib/marketing/reportes";
import type { ReporteMarcaItem } from "@/lib/marketing/reportes";
import { MarcaBadge } from "@/components/marketing/MarcaBadge";

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

export function ReportePorMarcaView() {
  const { toast } = useToast();
  const [anio, setAnio] = useState<number | "todos">(ANIO_ACTUAL);
  const [items, setItems] = useState<ReporteMarcaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        anio === "todos"
          ? "/api/marketing/reportes/marca"
          : `/api/marketing/reportes/marca?anio=${anio}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: ReporteMarcaItem[] };
      setItems(json.items ?? []);
    } catch (err) {
      console.error("Error cargando reporte por marca:", err);
      toast("No se pudo cargar el reporte. Intenta de nuevo.", "error");
    } finally {
      setLoading(false);
    }
  }, [anio, toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totales = useMemo(() => {
    return items.reduce(
      (acc, it) => ({
        gastado: acc.gastado + it.gastadoYtd,
        cobrado: acc.cobrado + it.cobradoYtd,
        pendiente: acc.pendiente + it.pendiente,
      }),
      { gastado: 0, cobrado: 0, pendiente: 0 }
    );
  }, [items]);

  function exportar() {
    try {
      const blob = exportarExcelReporte("marca", items);
      const suf = anio === "todos" ? "todos" : String(anio);
      descargarBlob(blob, `Marketing-PorMarca-${suf}.xlsx`);
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
          <p className="text-sm text-gray-600">Sin datos para este periodo.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left font-medium px-4 py-2">Marca</th>
                <th className="text-right font-medium px-4 py-2">Gastado</th>
                <th className="text-right font-medium px-4 py-2">Cobrado</th>
                <th className="text-right font-medium px-4 py-2">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.marca.id}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">{it.marca.nombre}</span>
                      {(it.marca.codigo === "TH" ||
                        it.marca.codigo === "CK" ||
                        it.marca.codigo === "RBK") && (
                        <MarcaBadge
                          codigo={it.marca.codigo as "TH" | "CK" | "RBK"}
                          size="sm"
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {fmtMoney(it.gastadoYtd)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                    {fmtMoney(it.cobradoYtd)}
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
                <td className="px-4 py-2 text-sm font-medium text-gray-700">
                  Total
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {fmtMoney(totales.gastado)}
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

export default ReportePorMarcaView;
