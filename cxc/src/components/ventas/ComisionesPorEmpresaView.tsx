"use client";

// Vista "Por empresa" del tab Comisiones (B2B / mayoreo): una empresa a la vez.
// El período (mes/año) lo controla el shell; aquí solo el selector de empresa,
// que RECUERDA la última empresa usada (localStorage fg_last_comision_empresa).
//
// Regla (server, RPC comision_b2b_v4): base = facturas con utilidad>20% − todas
// las NC, excluyendo intercompañía/clientes internos; comisión = base × tasa
// del vendedor dueño del cliente. Muestra a todos los vendedores activos aunque
// base=$0; los sin actividad se colapsan a una línea al pie.

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, FileSpreadsheet, Settings } from "lucide-react";
import { EMPRESA_KEY_TO_NAME, B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fmtMoney } from "@/lib/ventas/format";
import { exportComisionesResumen } from "@/lib/ventas/comisionExcel";
import { ComisionesConfigModal } from "./ComisionesConfigModal";
import { ComisionesDetalleModal } from "./ComisionesDetalleModal";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Joystep NO comisiona — fuera del selector de ESTE tab únicamente.
const EMPRESAS = B2B_EMPRESA_KEYS.filter((k) => k !== "joystep");
const LAST_EMPRESA_KEY = "fg_last_comision_empresa";

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
}

export function ComisionesPorEmpresaView({ year, mes }: Props) {
  const [empresa, setEmpresa] = useState<string>(EMPRESAS[0]);
  const [data, setData] = useState<ComisionResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canConfig, setCanConfig] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [detalleVendedor, setDetalleVendedor] = useState<string | null>(null);

  // Recuerda la última empresa seleccionada (smart default).
  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    setCanConfig(r === "admin");
    const saved = localStorage.getItem(LAST_EMPRESA_KEY);
    if (saved && (EMPRESAS as readonly string[]).includes(saved)) setEmpresa(saved);
  }, []);

  const handleEmpresa = (k: string) => {
    setEmpresa(k);
    localStorage.setItem(LAST_EMPRESA_KEY, k);
  };

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={empresa} onValueChange={handleEmpresa}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EMPRESAS.map((k) => (
              <SelectItem key={k} value={k}>{EMPRESA_KEY_TO_NAME[k] ?? k}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={vendedores.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </button>
          {canConfig && (
            <button
              onClick={() => setConfigOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
            >
              <Settings className="h-3.5 w-3.5" /> Configurar
            </button>
          )}
        </div>
      </div>

      {savedMsg && <p className="text-xs text-teal-700">{savedMsg}</p>}

      <Card className="overflow-hidden rounded-lg border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Cargando…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm">
            <p className="text-rose-600">{error}</p>
            <button
              onClick={() => void load()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
            >
              Reintentar
            </button>
          </div>
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
              {activos.map((v) => (
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
              {inactivos.length > 0 && (
                <tr className="border-b border-gray-100 last:border-0">
                  <td colSpan={6} className="px-4 py-2 text-center text-xs italic text-gray-400">
                    {inactivos.length} {inactivos.length === 1 ? "vendedor" : "vendedores"} sin actividad este mes
                  </td>
                </tr>
              )}
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
        Los vendedores sin venta ni cobro del mes se agrupan en una línea al pie.
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
