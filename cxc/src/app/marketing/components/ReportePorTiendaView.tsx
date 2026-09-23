"use client";

// ============================================================================
// Reporte POR TIENDA.
//
// 🔴 Con `MARKETING_PORTADA_REDISENO` (22-sep-2026): la tienda es la del GASTO
// (código del directorio), «General» junta lo que no es de ninguna y va al
// final, cada fila trae UNA columna por marca y su total (lo reportado); lo
// apagado se dice en gris. Multifashion (D-108) es una tienda más. 🔴 Sin pie
// que sume todas las tiendas: sería sumar las marcas entre sí. Con el
// interruptor apagado, la tabla de antes (por proyecto, con su pie).
//
// 🩸 «Exportar Excel» se retiró el 22-sep-2026: el Excel de una marca vive en
// el ZIP de su período (pieza D). Candado: `marketing-portada-y-cierre`.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import type { ReporteTiendaItem } from "@/lib/marketing/reportes";
import type { ReporteTiendaFila } from "@/lib/marketing/reportes-rediseno";
import { MARKETING_PORTADA_REDISENO } from "@/lib/marketing/portada-rediseno";
import { hoyPanama } from "@/lib/fecha-panama";

const ANIO_ACTUAL = Number(hoyPanama().slice(0, 4));
const ANIOS = [ANIO_ACTUAL, ANIO_ACTUAL - 1, ANIO_ACTUAL - 2];

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Una fila común a los dos caminos: lo que se dibuja. */
interface FilaVista {
  key: string;
  tienda: string;
  porMarca: Record<string, number>;
  total: number;
  noReportado: number;
  esGeneral: boolean;
}

function filaDeAntes(it: ReporteTiendaItem): FilaVista {
  return { key: it.tienda, tienda: it.tienda, porMarca: it.porMarca, total: it.total, noReportado: 0, esGeneral: false };
}

function filaDelRediseno(f: ReporteTiendaFila): FilaVista {
  return {
    key: f.tiendaCodigo ?? "general",
    tienda: f.tienda,
    porMarca: f.porMarca,
    total: f.total,
    noReportado: f.noReportado,
    esGeneral: f.tiendaCodigo === null,
  };
}

export function ReportePorTiendaView() {
  const { toast } = useToast();
  const [anio, setAnio] = useState<number | "todos">(ANIO_ACTUAL);
  const [filas, setFilas] = useState<FilaVista[]>([]);
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
      const json = (await res.json()) as {
        items: Array<ReporteTiendaItem | ReporteTiendaFila>;
        rediseno?: boolean;
      };
      const items = json.items ?? [];
      setFilas(
        json.rediseno
          ? (items as ReporteTiendaFila[]).map(filaDelRediseno)
          : (items as ReporteTiendaItem[]).map(filaDeAntes),
      );
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
    for (const f of filas) {
      for (const nombre of Object.keys(f.porMarca)) set.add(nombre);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [filas]);

  const tiendas = useMemo(
    () => filas.map((f) => f.tienda).sort((a, b) => a.localeCompare(b, "es")),
    [filas],
  );

  const filasVisibles = useMemo(() => {
    const q = filtroTienda.trim().toLocaleLowerCase("es");
    if (!q) return filas;
    return filas.filter((f) => f.tienda.toLocaleLowerCase("es").includes(q));
  }, [filas, filtroTienda]);

  // Solo para la tabla DE ANTES (interruptor apagado): la suma al pie.
  const totalDeAntes = useMemo(
    () =>
      MARKETING_PORTADA_REDISENO ? null : filasVisibles.reduce((acc, f) => acc + f.total, 0),
    [filasVisibles],
  );

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

        <input
          type="text"
          value={filtroTienda}
          onChange={(e) => setFiltroTienda(e.target.value)}
          placeholder="Filtrar por tienda..."
          list="mk-tiendas-options"
          className="px-3 py-1.5 min-h-[44px] rounded-md border border-gray-200 text-sm bg-white min-w-[200px]"
        />
        <datalist id="mk-tiendas-options">
          {tiendas.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-500">
          Cargando...
        </div>
      ) : filasVisibles.length === 0 ? (
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
                <th className="text-right font-medium px-4 py-2">
                  {MARKETING_PORTADA_REDISENO ? "Reportado" : "Gasto"}
                </th>
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map((f) => (
                <tr
                  key={f.key}
                  className={`border-t border-gray-100 hover:bg-gray-50 ${f.esGeneral ? "bg-gray-50/60" : ""}`}
                >
                  <td className="px-4 py-3 text-gray-900">{f.tienda}</td>
                  {marcasColumnas.map((m) => (
                    <td
                      key={m}
                      className="px-4 py-3 text-right tabular-nums text-gray-700"
                    >
                      {f.porMarca[m] ? fmtMoney(f.porMarca[m]) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                    {fmtMoney(f.total)}
                    {f.noReportado > 0 && (
                      <div className="text-xs font-normal text-gray-500">
                        No se reporta: {fmtMoney(f.noReportado)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {totalDeAntes !== null && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td
                    className="px-4 py-2 text-sm font-medium text-gray-700"
                    colSpan={marcasColumnas.length + 1}
                  >
                    Gasto (total)
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {fmtMoney(totalDeAntes)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

export default ReportePorTiendaView;
