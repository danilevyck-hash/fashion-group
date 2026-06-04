"use client";

// Sub-tab Comisiones del módulo Ventas (empresas B2B / mayoreo).
// Patrón visual del subtab Vendedoras de Multifashion: tabla simple por período.
//
// Regla (server, RPC comision_b2b): base = facturas con utilidad>20% − todas las
// NC, excluyendo intercompañía/clientes internos; comisión = base × tasa por
// cartera (vendedor dueño del cliente). Fuente: reporte de utilidad de Switch.

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, Info } from "lucide-react";
import { EMPRESA_KEY_TO_NAME, B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fmtMoney } from "@/lib/ventas/format";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface ComisionVendedor {
  vendedor: string;
  base: number;
  tasa: number | null;
  comision: number | null;
  tiene_tasa: boolean;
  facturas_comisionables: number;
  notas_credito: number;
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
  const [empresa, setEmpresa] = useState<string>(B2B_EMPRESA_KEYS[0]);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [data, setData] = useState<ComisionResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const totalComision = vendedores.reduce((a, v) => a + (v.comision ?? 0), 0);
  const totalBase = vendedores.reduce((a, v) => a + (v.base ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Selectores */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={empresa} onValueChange={setEmpresa}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {B2B_EMPRESA_KEYS.map((k) => (
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
      </div>

      {/* Nota de la regla (visible, requerida) */}
      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p>
          Comisiona: facturas con utilidad &gt;20% menos notas de crédito. Excluye
          intercompañía y clientes internos. Se asigna al vendedor dueño del cliente.
          Fuente: reporte de utilidad de Switch.
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
            Sin comisiones para {MESES[mes - 1]} {year}.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 font-medium">Vendedor</th>
                <th className="px-4 py-2 text-right font-medium">Ventas (base)</th>
                <th className="px-4 py-2 text-right font-medium">% aplicado</th>
                <th className="px-4 py-2 text-right font-medium">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((v) => (
                <tr key={v.vendedor} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5 text-gray-900">{v.vendedor}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtMoney(v.base)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {v.tiene_tasa ? `${(v.tasa! * 100).toFixed(2)}%` : (
                      <span className="text-amber-600">sin tasa</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900">
                    {v.comision != null ? fmtMoney(v.comision) : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-900">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(totalBase)}</td>
                <td className="px-4 py-2.5"></td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(totalComision)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-gray-400">
        <Coins className="h-3.5 w-3.5" />
        Vendedores sin tasa configurada aparecen con comisión en blanco (no se asume ningún %).
      </p>
    </div>
  );
}
