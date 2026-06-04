"use client";

// Sub-tab Comisiones del módulo Ventas (empresas B2B / mayoreo).
// Patrón visual del subtab Vendedoras de Multifashion: tabla simple por período.
//
// Regla (server, RPC comision_b2b_v2): base = facturas con utilidad>20% − todas
// las NC, excluyendo intercompañía/clientes internos; comisión = base × tasa
// GLOBAL del vendedor (default 0.50%). Muestra a TODOS los vendedores activos de
// la empresa aunque base=$0. Fuente: reporte de utilidad de Switch + maestro de
// vendedores. Joystep NO comisiona → fuera del selector.

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, Info, Settings } from "lucide-react";
import { EMPRESA_KEY_TO_NAME, B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fmtMoney } from "@/lib/ventas/format";
import { ComisionesConfigModal } from "./ComisionesConfigModal";
import { ComisionesDetalleModal } from "./ComisionesDetalleModal";

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

interface ComisionesViewProps {
  availableYears: number[];
}

export function ComisionesView({ availableYears }: ComisionesViewProps) {
  const now = new Date();
  const [empresa, setEmpresa] = useState<string>(EMPRESAS[0]);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [data, setData] = useState<ComisionResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canConfig, setCanConfig] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [detalleVendedor, setDetalleVendedor] = useState<string | null>(null);

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    setCanConfig(r === "admin" || r === "director");
  }, []);

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
  }, [empresa, year, mes]);

  useEffect(() => {
    void load();
  }, [load]);

  const vendedores = data?.vendedores ?? [];
  const totalBase = vendedores.reduce((a, v) => a + (v.base ?? 0), 0);
  const totalComision = vendedores.reduce((a, v) => a + (v.comision ?? 0), 0);
  const totalCobroBase = vendedores.reduce((a, v) => a + (v.base_cobro ?? 0), 0);
  const totalComisionCobro = vendedores.reduce((a, v) => a + (v.comision_cobro ?? 0), 0);
  const totalGeneral = vendedores.reduce((a, v) => a + (v.comision_total ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Selectores + acción */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={empresa} onValueChange={setEmpresa}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EMPRESAS.map((k) => (
              <SelectItem key={k} value={k}>{EMPRESA_KEY_TO_NAME[k] ?? k}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v, 10))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {availableYears.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canConfig && (
          <button
            onClick={() => setConfigOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
          >
            <Settings className="h-3.5 w-3.5" /> Configurar
          </button>
        )}
      </div>

      {savedMsg && (
        <p className="text-xs text-teal-700">{savedMsg}</p>
      )}

      {/* Nota de la regla (visible, requerida) */}
      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p>
          <b>Venta:</b> facturas con utilidad &gt;20% menos notas de crédito.{" "}
          <b>Cobro:</b> recibos del mes, excluyendo retenciones de ITBMS. Ambas
          excluyen intercompañía y clientes internos, y se asignan al vendedor
          dueño del cliente. Fuente: reportes de Switch.
        </p>
      </div>

      {/* Tabla */}
      <Card className="overflow-hidden rounded-lg border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Cargando…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-rose-600">{error}</div>
        ) : vendedores.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Sin vendedores para {MESES[mes - 1]} {year}.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 font-medium">Vendedor</th>
                <th className="px-4 py-2 text-right font-medium">Ventas</th>
                <th className="px-4 py-2 text-right font-medium">Com. venta</th>
                <th className="px-4 py-2 text-right font-medium">Cobros</th>
                <th className="px-4 py-2 text-right font-medium">Com. cobro</th>
                <th className="px-4 py-2 text-right font-medium">Com. total</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((v) => (
                <tr
                  key={v.vendedor}
                  onClick={() => setDetalleVendedor(v.vendedor)}
                  className="cursor-pointer border-b border-gray-100 last:border-0 transition hover:bg-gray-50"
                  title="Ver reporte detallado"
                >
                  <td className="px-4 py-2.5 font-medium text-gray-900 underline-offset-2 hover:underline">{v.vendedor}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtMoney(v.base)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtMoney(v.comision)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtMoney(v.base_cobro)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtMoney(v.comision_cobro)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">{fmtMoney(v.comision_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-900">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(totalBase)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(totalComision)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(totalCobroBase)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(totalComisionCobro)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(totalGeneral)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-gray-400">
        <Coins className="h-3.5 w-3.5" />
        Todos los vendedores activos aparecen aquí, aunque no hayan vendido en el mes.
      </p>

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
