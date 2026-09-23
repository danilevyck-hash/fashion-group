"use client";

// ============================================================================
// Reporte POR MARCA.
//
// 🔴 Con `MARKETING_PORTADA_REDISENO` (22-sep-2026): cada marca muestra UN
// total —lo que se reporta— y, en gris, lo apagado con «¿Se reporta a la
// marca?». Daniel: *«los gastos de las marcas NUNCA se suman entre sí en un
// total del grupo»* → no hay pie con la suma. Multifashion no es marca: no
// tiene fila. Con el interruptor apagado, la tabla de antes (con su pie).
//
// 🩸 «Exportar Excel» se retiró el 22-sep-2026: el Excel de una marca vive en
// el ZIP de su período (pieza D). Candado: `marketing-portada-y-cierre`.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import type { ReporteMarcaItem } from "@/lib/marketing/reportes";
import type { ReporteMarcaFila } from "@/lib/marketing/reportes-rediseno";
import { MARKETING_PORTADA_REDISENO } from "@/lib/marketing/portada-rediseno";
import { hoyPanama } from "@/lib/fecha-panama";
import { MarcaBadge } from "@/components/marketing/MarcaBadge";

const ANIO_ACTUAL = Number(hoyPanama().slice(0, 4));
const ANIOS = [ANIO_ACTUAL, ANIO_ACTUAL - 1, ANIO_ACTUAL - 2];

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const CON_BADGE = new Set(["TH", "CK", "RBK", "J"]);

/** Una fila común a los dos caminos: lo que se dibuja. */
interface FilaVista {
  key: string;
  codigo: string;
  nombre: string;
  reportado: number;
  noReportado: number;
  cantidadNoReportada: number;
}

function filaDeAntes(it: ReporteMarcaItem): FilaVista {
  return {
    key: it.marca.id,
    codigo: it.marca.codigo,
    nombre: it.marca.nombre,
    reportado: it.gasto,
    noReportado: 0,
    cantidadNoReportada: 0,
  };
}

function filaDelRediseno(f: ReporteMarcaFila): FilaVista {
  return {
    key: f.codigo,
    codigo: f.codigo,
    nombre: f.nombre,
    reportado: f.reportado,
    noReportado: f.noReportado,
    cantidadNoReportada: f.cantidadNoReportada,
  };
}

export function ReportePorMarcaView() {
  const { toast } = useToast();
  const [anio, setAnio] = useState<number | "todos">(ANIO_ACTUAL);
  const [filas, setFilas] = useState<FilaVista[]>([]);
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
      const json = (await res.json()) as {
        items: Array<ReporteMarcaItem | ReporteMarcaFila>;
        rediseno?: boolean;
      };
      const items = json.items ?? [];
      setFilas(
        json.rediseno
          ? (items as ReporteMarcaFila[]).map(filaDelRediseno)
          : (items as ReporteMarcaItem[]).map(filaDeAntes),
      );
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

  // Solo para la tabla DE ANTES (interruptor apagado): la suma al pie.
  const totalDeAntes = useMemo(
    () => (MARKETING_PORTADA_REDISENO ? null : filas.reduce((acc, f) => acc + f.reportado, 0)),
    [filas],
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
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-500">
          Cargando...
        </div>
      ) : filas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-600">Sin datos para este periodo.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left font-medium px-4 py-2">Marca</th>
                <th className="text-right font-medium px-4 py-2">
                  {MARKETING_PORTADA_REDISENO ? "Reportado" : "Gasto"}
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.key} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">{f.nombre}</span>
                      {CON_BADGE.has(f.codigo) && (
                        <MarcaBadge codigo={f.codigo as "TH" | "CK" | "RBK" | "J"} size="sm" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {fmtMoney(f.reportado)}
                    {f.cantidadNoReportada > 0 && (
                      <div className="text-xs text-gray-500">
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
                  <td className="px-4 py-2 text-sm font-medium text-gray-700">Total</td>
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

export default ReportePorMarcaView;
