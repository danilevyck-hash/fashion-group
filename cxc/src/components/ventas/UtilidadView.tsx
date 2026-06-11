"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search } from "lucide-react";
import { SkeletonTable } from "@/components/ui";
import {
  fmtMargen,
  fmtMoneySigned,
  exportUtilidadToExcel,
  type UtilidadClienteResponse,
  type UtilidadClienteRow,
} from "@/lib/ventas/utilidad-cliente";

type SortKey = "ventas" | "utilidad" | "margen";
const PAGE = 25;

export function UtilidadView({ selectedYear }: { selectedYear: number }) {
  const [data, setData] = useState<UtilidadClienteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "utilidad", dir: "desc" });
  const [visible, setVisible] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ventas/utilidad-cliente?year=${selectedYear}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as UtilidadClienteResponse;
      setData(json);
      setVisible(PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error inesperado");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let r = data.rows;
    if (q) r = r.filter((c) => c.cliente.toLowerCase().includes(q) || c.empresa.toLowerCase().includes(q));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...r].sort((a, b) => {
      // null margen al fondo siempre (independiente de dir).
      if (sort.key === "margen") {
        if (a.margen == null && b.margen == null) return 0;
        if (a.margen == null) return 1;
        if (b.margen == null) return -1;
      }
      const av = (a[sort.key] ?? -Infinity) as number;
      const bv = (b[sort.key] ?? -Infinity) as number;
      return (av - bv) * dir;
    });
  }, [data, search, sort]);

  const visibleRows = rows.slice(0, visible);
  const negativos = data?.rows.filter((r) => r.utilidad < 0).length ?? 0;

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };

  const onExcel = async () => { if (data) await exportUtilidadToExcel(data); };

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisible(PAGE); }}
            placeholder="Buscar cliente o empresa…"
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" onClick={onExcel} disabled={!data || loading}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
        </Button>
      </div>

      {/* Totales + alcance */}
      {data && !loading && (
        <p className="mb-3 text-sm text-stone-600">
          Ventas <span className="font-mono font-semibold tabular-nums text-stone-900">{fmtMoneySigned(data.totales.ventas)}</span>
          <span className="mx-2 text-stone-300">·</span>
          Utilidad <span className="font-mono font-semibold tabular-nums text-stone-900">{fmtMoneySigned(data.totales.utilidad)}</span>
          <span className="mx-2 text-stone-300">·</span>
          Margen <span className="font-mono font-semibold tabular-nums text-stone-900">{fmtMargen(data.totales.margen)}</span>
        </p>
      )}

      <p className="mb-3 text-[11px] text-stone-400">
        Costo real por documento (5 empresas B2B). {negativos > 0 && (
          <span className="text-rose-600">{negativos} cliente{negativos === 1 ? "" : "s"} con utilidad negativa (devoluciones netas).</span>
        )}
      </p>

      {error && (
        <div className="rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-700">
          No se pudo cargar la utilidad por cliente. <button onClick={load} className="underline">Reintentar</button>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <SkeletonTable rows={8} cols={6} />
        </div>
      )}

      {data && !loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-[0.04em] text-stone-400">
                <th className="px-3 py-2.5 font-normal">Cliente</th>
                <th className="hidden px-3 py-2.5 font-normal sm:table-cell">Empresa</th>
                <SortableTh label="Ventas" active={sort} sortKey="ventas" onClick={toggleSort} />
                <th className="hidden px-3 py-2.5 text-right font-normal md:table-cell">Costo</th>
                <SortableTh label="Utilidad" active={sort} sortKey="utilidad" onClick={toggleSort} />
                <SortableTh label="Margen %" active={sort} sortKey="margen" onClick={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-stone-400">Sin clientes para este filtro.</td></tr>
              )}
              {visibleRows.map((r) => (
                <UtilidadRow key={`${r.empresaKey}|${r.clienteSwitchId ?? r.cliente}`} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && !loading && !error && rows.length > visible && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE)}>
            Mostrar más ({rows.length - visible} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label, active, sortKey, onClick, className = "",
}: {
  label: string;
  active: { key: SortKey; dir: "asc" | "desc" };
  sortKey: SortKey;
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = active.key === sortKey;
  return (
    <th className={`px-3 py-2.5 text-right font-normal ${className}`}>
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-0.5 hover:text-stone-700 ${isActive ? "text-stone-900" : ""}`}
      >
        {label}
        <span className="w-2 text-[9px]">{isActive ? (active.dir === "desc" ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );
}

function UtilidadRow({ r }: { r: UtilidadClienteRow }) {
  const neg = r.utilidad < 0;
  // Negativo = devolución neta. Se ve claro (rojo) pero NO como error.
  const utilCls = neg ? "text-rose-600" : "text-stone-900";
  const margenCls = r.margen == null ? "text-stone-400" : r.margen < 0 ? "text-rose-600" : "text-stone-700";
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50">
      <td className="px-3 py-2.5">
        <span className="text-stone-800">{r.cliente}</span>
        {neg && (
          <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600" title="Devoluciones netas: las notas de crédito superan las ventas del período">
            dev. neta
          </span>
        )}
      </td>
      <td className="hidden px-3 py-2.5 text-stone-500 sm:table-cell">{r.empresa}</td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-stone-700">{fmtMoneySigned(r.ventas)}</td>
      <td className="hidden px-3 py-2.5 text-right font-mono tabular-nums text-stone-500 md:table-cell">{fmtMoneySigned(r.costo)}</td>
      <td className={`px-3 py-2.5 text-right font-mono font-medium tabular-nums ${utilCls}`}>{fmtMoneySigned(r.utilidad)}</td>
      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${margenCls}`}>{fmtMargen(r.margen)}</td>
    </tr>
  );
}
