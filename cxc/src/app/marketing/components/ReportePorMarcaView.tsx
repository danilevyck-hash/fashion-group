"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
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

  const totalGasto = useMemo(
    () => items.reduce((acc, it) => acc + it.gasto, 0),
    [items]
  );

  async function exportar() {
    try {
      const { exportarExcelReporte } = await import("@/lib/marketing/reportes");
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
            className="ml-2 min-h-[44px] px-3 py-1.5 rounded-md border border-gray-200 text-sm bg-white"
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
          className="ml-auto inline-flex min-h-[44px] items-center px-3 py-1.5 rounded-md text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.97] disabled:opacity-50"
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
                <th className="text-right font-medium px-4 py-2">Gasto</th>
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
                    {fmtMoney(it.gasto)}
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
                  {fmtMoney(totalGasto)}
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
