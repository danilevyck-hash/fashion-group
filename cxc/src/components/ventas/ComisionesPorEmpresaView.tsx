"use client";

// Vista "Por empresa" del tab Comisiones (B2B / mayoreo): una empresa a la vez.
// El período (mes/año) lo controla el shell; aquí solo el selector de empresa,
// que RECUERDA la última empresa usada (localStorage fg_last_comision_empresa).
//
// Regla (server, RPC comision_b2b_v5): base = facturas con utilidad>20% − todas
// las NC, excluyendo intercompañía/clientes internos; comisión = base × tasa
// del VENDEDOR DE LA FACTURA (v5 jul-2026, retroactivo; la NC usa su propio
// vendedor; cobros siguen por cartera). Muestra a todos los vendedores activos
// aunque base=$0; los sin actividad se colapsan a una línea al pie.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
import { Card } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings } from "lucide-react";
import type { ExcelApi } from "./ComisionesView";
import { EMPRESA_KEY_TO_NAME, B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fmtMoney } from "@/lib/ventas/format";
import { exportComisionesResumen } from "@/lib/ventas/comisionExcel";
import { ComisionesConfigModal } from "./ComisionesConfigModal";
import { ComisionesDetalleModal } from "./ComisionesDetalleModal";
import { ComisionesTarjetasPorEmpresa } from "./ComisionesTarjetas";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Joystep NO comisiona — fuera del selector de ESTE tab únicamente.
const EMPRESAS = B2B_EMPRESA_KEYS.filter((k) => k !== "joystep");

interface ComisionVendedor {
  vendedor: string;
  base: number;
  tasa: number;
  comision: number;
  base_cobro: number;
  tasa_cobro: number;
  comision_cobro: number;
  comision_total: number;
}
interface ComisionResp {
  empresa_key: string;
  year: number;
  mes: number;
  vendedores: ComisionVendedor[];
}

interface Props {
  year: number;
  mes: number;
  /** El botón Excel vive en la barra del shell (ver ComisionesView): esta vista
   *  sigue siendo la dueña del cálculo y solo registra su función acá. */
  onExcel?: (api: ExcelApi | null) => void;
  /** Cambia cuando "Actualizar ahora" termina: fuerza re-pedir los datos. */
  refreshKey?: number;
}

export function ComisionesPorEmpresaView({ year, mes, onExcel, refreshKey = 0 }: Props) {
  // Filtro de empresa con memoria — hook centralizado useLastUsed (igual que
  // CXC, Préstamos y Packing). Key fg_last_comision_empresa (misma de antes).
  const [empresa, setEmpresa] = useLastUsed("comision_empresa", EMPRESAS[0]);
  const [data, setData] = useState<ComisionResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canConfig, setCanConfig] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [detalleVendedor, setDetalleVendedor] = useState<string | null>(null);

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    setCanConfig(r === "admin");
  }, []);

  // useLastUsed ya persiste en localStorage al setear.
  const handleEmpresa = (k: string) => setEmpresa(k);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ventas/comisiones?empresa=${empresa}&year=${year}&mes=${mes}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as ComisionResp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar. Intenta de nuevo.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [empresa, year, mes, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const vendedores = data?.vendedores ?? [];
  const totalBase = vendedores.reduce((a, v) => a + (v.base ?? 0), 0);
  const totalComision = vendedores.reduce((a, v) => a + (v.comision ?? 0), 0);
  const totalCobroBase = vendedores.reduce((a, v) => a + (v.base_cobro ?? 0), 0);
  const totalComisionCobro = vendedores.reduce((a, v) => a + (v.comision_cobro ?? 0), 0);
  const totalGeneral = vendedores.reduce((a, v) => a + (v.comision_total ?? 0), 0);

  const isInactivo = (v: ComisionVendedor) =>
    (v.base ?? 0) === 0 && (v.base_cobro ?? 0) === 0 && (v.comision_total ?? 0) === 0;
  const activos = vendedores.filter((v) => !isInactivo(v));
  const inactivos = vendedores.filter(isInactivo);

  const handleExport = () => {
    if (vendedores.length === 0) return;
    void exportComisionesResumen({
      empresaKey: empresa,
      empresaNombre: EMPRESA_KEY_TO_NAME[empresa] ?? empresa,
      year,
      mes,
      vendedores,
    });
  };

  // El shell dispara el Excel de la vista activa (ver ComisionesView).
  const exportRef = useRef(handleExport);
  exportRef.current = handleExport;
  useEffect(() => {
    onExcel?.({ run: () => exportRef.current(), disabled: vendedores.length === 0 });
    return () => onExcel?.(null);
  }, [onExcel, vendedores.length]);

  return (
    <div className="space-y-2">
      {/* Esta fila es SOLO del modo "Por empresa" (el Excel subió a la barra del
          shell). Selector de empresa a la izquierda, Configurar —solo admin— a
          la derecha. */}
      <div className="flex items-center gap-2">
        <Select value={empresa} onValueChange={handleEmpresa}>
          {/* min-h-[44px] pisa el h-9 (36 px) del SelectTrigger compartido. */}
          <SelectTrigger className="w-[200px] min-h-[44px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EMPRESAS.map((k) => (
              <SelectItem key={k} value={k}>{EMPRESA_KEY_TO_NAME[k] ?? k}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canConfig && (
          <button
            onClick={() => setConfigOpen(true)}
            className="ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
          >
            <Settings className="h-4 w-4 shrink-0" /> Configurar
          </button>
        )}
      </div>

      {savedMsg && <p className="text-xs text-teal-700">{savedMsg}</p>}

      {loading ? (
        <Card className="overflow-hidden rounded-lg border border-gray-200">
          <div className="p-3"><SkeletonTable rows={6} cols={5} /></div>
        </Card>
      ) : error ? (
        <Card className="overflow-hidden rounded-lg border border-gray-200">
          <div className="p-8 text-center text-sm">
            <p className="text-rose-600">{error}</p>
            <button
              onClick={() => void load()}
              className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
            >
              Reintentar
            </button>
          </div>
        </Card>
      ) : vendedores.length === 0 ? (
        <Card className="overflow-hidden rounded-lg border border-gray-200">
          <div className="p-8 text-center text-sm text-gray-500">
            Sin vendedores para {MESES[mes - 1]} {year}.
          </div>
        </Card>
      ) : (
        <>
          {/* Celular: TARJETAS. Esta tabla es la que fallaba PEOR — 636px de
              contenido dentro de un `Card` con overflow-hidden, así que a 390px
              quedaban 279px RECORTADOS y "Com. cobro" y "Com. total" no se
              podían ver ni arrastrando. */}
          <ComisionesTarjetasPorEmpresa
            activos={activos}
            inactivos={inactivos}
            total={totalGeneral}
            onDetalle={setDetalleVendedor}
          />

          {/* iPad y escritorio: la tabla. El `overflow-x-auto` es nuevo — sin
              él, a 834px se perdían 83px sin aviso ni forma de alcanzarlos. */}
          <Card className="hidden overflow-hidden rounded-lg border border-gray-200 lg:block">
            <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium xl:px-4">Vendedor</th>
                <th className="px-3 py-2 text-right font-medium xl:px-4">Ventas</th>
                <th className="px-3 py-2 text-right font-medium xl:px-4">Com. venta</th>
                <th className="px-3 py-2 text-right font-medium xl:px-4">Cobros</th>
                <th className="px-3 py-2 text-right font-medium xl:px-4">Com. cobro</th>
                <th className="px-3 py-2 text-right font-medium xl:px-4">Com. total</th>
              </tr>
            </thead>
            <tbody>
              {activos.map((v) => (
                <tr
                  key={v.vendedor}
                  onClick={() => setDetalleVendedor(v.vendedor)}
                  className="cursor-pointer border-b border-gray-100 last:border-0 transition hover:bg-gray-50"
                  title="Ver reporte detallado"
                >
                  <td className="px-3 py-2.5 font-medium text-gray-900 underline-offset-2 hover:underline xl:px-4">{v.vendedor}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 xl:px-4">{fmtMoney(v.base)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600 xl:px-4">{fmtMoney(v.comision)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 xl:px-4">{fmtMoney(v.base_cobro)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600 xl:px-4">{fmtMoney(v.comision_cobro)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900 xl:px-4">{fmtMoney(v.comision_total)}</td>
                </tr>
              ))}
              {inactivos.length > 0 && (
                <tr className="border-b border-gray-100 last:border-0">
                  <td colSpan={6} className="px-3 py-2 text-center text-xs italic text-gray-400 xl:px-4">
                    {inactivos.length} {inactivos.length === 1 ? "vendedor" : "vendedores"} sin actividad este mes
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-900">
                <td className="px-3 py-2.5 xl:px-4">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums xl:px-4">{fmtMoney(totalBase)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums xl:px-4">{fmtMoney(totalComision)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums xl:px-4">{fmtMoney(totalCobroBase)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums xl:px-4">{fmtMoney(totalComisionCobro)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums xl:px-4">{fmtMoney(totalGeneral)}</td>
              </tr>
            </tfoot>
          </table>
            </div>
          </Card>
        </>
      )}

      {canConfig && (
        <ComisionesConfigModal
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          onSaved={(msg) => {
            setSavedMsg(msg);
            void load();
            window.setTimeout(() => setSavedMsg(null), 3000);
          }}
        />
      )}

      {detalleVendedor && (
        <ComisionesDetalleModal
          empresa={empresa}
          empresaNombre={EMPRESA_KEY_TO_NAME[empresa] ?? empresa}
          year={year}
          mes={mes}
          vendedor={detalleVendedor}
          onClose={() => setDetalleVendedor(null)}
        />
      )}
    </div>
  );
}
