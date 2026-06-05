"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search, ChevronRight } from "lucide-react";
import { MONTHS, fmtMoney } from "@/lib/ventas/format";
import {
  PRODUCTOS_EMPRESAS,
  DEFAULT_PRODUCTOS_EMPRESA,
  fmtMargen,
  exportProductosToExcel,
  type ProductosResponse,
  type ProductoNivel1,
  type ProductoCodigo,
} from "@/lib/ventas/productos";

type SortKey = "cantidad" | "venta" | "margen";
const PAGE = 20;

export function ProductosView({ selectedYear }: { selectedYear: number }) {
  const [empresa, setEmpresa] = useState(DEFAULT_PRODUCTOS_EMPRESA);
  const [mes, setMes] = useState<number | null>(null); // null = YTD
  const [data, setData] = useState<ProductosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "venta", dir: "desc" });
  const [visible, setVisible] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [codigos, setCodigos] = useState<Record<string, ProductoCodigo[]>>({});
  const [codigosLoading, setCodigosLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ empresa, year: String(selectedYear) });
      if (mes) qs.set("mes", String(mes));
      const res = await fetch(`/api/ventas/productos?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ProductosResponse;
      setData(json);
      setCodigos({});
      setExpanded(null);
      setVisible(PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error inesperado");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [empresa, mes, selectedYear]);

  useEffect(() => { load(); }, [load]);

  const onEmpresaChange = (key: string) => {
    setEmpresa(key);
    setMes(null); // la empresa nueva puede no tener el mes seleccionado → YTD
    setSearch("");
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let r = data.productos;
    if (q) r = r.filter(p => p.descripcion.toLowerCase().includes(q));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...r].sort((a, b) => {
      const av = a[sort.key] ?? -Infinity;
      const bv = b[sort.key] ?? -Infinity;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [data, search, sort]);

  const visibleRows = rows.slice(0, visible);

  const toggleSort = (key: SortKey) => {
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };

  const toggleExpand = async (p: ProductoNivel1) => {
    if (p.num_codigos <= 1) return; // grupo de 1 código: nada que desplegar
    const key = p.descripcion;
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    if (!codigos[key]) {
      setCodigosLoading(key);
      try {
        const qs = new URLSearchParams({ empresa, year: String(selectedYear), descripcion: key });
        if (mes) qs.set("mes", String(mes));
        const res = await fetch(`/api/ventas/productos/codigos?${qs.toString()}`, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { codigos: ProductoCodigo[] };
          setCodigos(prev => ({ ...prev, [key]: json.codigos }));
        }
      } catch {
        /* el render muestra "no se pudo cargar" si queda sin data */
      } finally {
        setCodigosLoading(null);
      }
    }
  };

  const onExcel = async () => {
    if (data) await exportProductosToExcel(data);
  };

  const meses = data?.meses ?? [];

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={empresa} onValueChange={onEmpresaChange}>
          <SelectTrigger className="h-9 w-auto min-w-[150px] text-xs" disabled={loading}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRODUCTOS_EMPRESAS.map(e => (
              <SelectItem key={e.key} value={e.key} className="text-xs">{e.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mes ? String(mes) : "ytd"} onValueChange={v => { setMes(v === "ytd" ? null : parseInt(v, 10)); setVisible(PAGE); }}>
          <SelectTrigger className="h-9 w-auto min-w-[120px] text-xs font-mono tabular-nums" disabled={loading}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ytd" className="text-xs">YTD {selectedYear}</SelectItem>
            {meses.map(m => (
              <SelectItem key={m} value={String(m)} className="text-xs">{MONTHS[m - 1]} {selectedYear}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setVisible(PAGE); }}
            placeholder="Buscar descripción…"
            className="h-9 pl-8 text-xs"
          />
        </div>

        <Button variant="outline" size="sm" onClick={onExcel} disabled={!data || loading}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
        </Button>
      </div>

      {/* Totales — texto simple, sin cards */}
      {data && !loading && (
        <p className="mb-3 text-sm text-stone-600">
          Venta <span className="font-mono font-semibold tabular-nums text-stone-900">{fmtMoney(data.totales.venta)}</span>
          <span className="mx-2 text-stone-300">·</span>
          Margen <span className="font-mono font-semibold tabular-nums text-stone-900">{fmtMargen(data.totales.margen)}</span>
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-700">
          No se pudieron cargar los productos. <button onClick={load} className="underline">Reintentar</button>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">Cargando…</div>
      )}

      {/* Tabla nivel 1 */}
      {data && !loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-[0.04em] text-stone-400">
                <th className="px-3 py-2.5 font-normal">Descripción</th>
                <th className="hidden px-3 py-2.5 text-right font-normal sm:table-cell">Códigos</th>
                <SortableTh label="Cant" active={sort} sortKey="cantidad" onClick={toggleSort} className="hidden sm:table-cell" />
                <SortableTh label="Venta" active={sort} sortKey="venta" onClick={toggleSort} />
                <SortableTh label="Margen %" active={sort} sortKey="margen" onClick={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-stone-400">Sin productos para este filtro.</td></tr>
              )}
              {visibleRows.map(p => {
                const drillable = p.num_codigos > 1;
                const isOpen = expanded === p.descripcion;
                return (
                  <ProductoRow
                    key={p.descripcion}
                    p={p}
                    drillable={drillable}
                    isOpen={isOpen}
                    onToggle={() => toggleExpand(p)}
                    codigos={codigos[p.descripcion]}
                    codigosLoading={codigosLoading === p.descripcion}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mostrar más */}
      {data && !loading && !error && rows.length > visible && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={() => setVisible(v => v + PAGE)}>
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

function ProductoRow({
  p, drillable, isOpen, onToggle, codigos, codigosLoading,
}: {
  p: ProductoNivel1;
  drillable: boolean;
  isOpen: boolean;
  onToggle: () => void;
  codigos: ProductoCodigo[] | undefined;
  codigosLoading: boolean;
}) {
  return (
    <>
      <tr
        className={`border-b border-stone-100 ${drillable ? "cursor-pointer hover:bg-stone-50" : ""}`}
        onClick={drillable ? onToggle : undefined}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {drillable ? (
              <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className="text-stone-800">{p.descripcion}</span>
          </div>
        </td>
        <td className="hidden px-3 py-2.5 text-right font-mono tabular-nums text-stone-500 sm:table-cell">{p.num_codigos}</td>
        <td className="hidden px-3 py-2.5 text-right font-mono tabular-nums text-stone-600 sm:table-cell">{Math.round(p.cantidad).toLocaleString("en-US")}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-stone-900">{fmtMoney(p.venta)}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-stone-700">{fmtMargen(p.margen)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-stone-50/60">
          <td colSpan={5} className="px-3 py-0">
            <div className="py-2 pl-5">
              {codigosLoading && <div className="py-2 text-xs text-stone-400">Cargando códigos…</div>}
              {!codigosLoading && codigos && codigos.length > 0 && (
                <table className="w-full text-xs">
                  <tbody>
                    {codigos.map(c => (
                      <tr key={c.codigo} className="border-b border-stone-100 last:border-0">
                        <td className="py-1.5 pr-3 font-mono text-stone-500">{c.codigo}</td>
                        <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-stone-500 sm:table-cell">{Math.round(c.cantidad).toLocaleString("en-US")}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-stone-800">{fmtMoney(c.venta)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-stone-600">{fmtMargen(c.margen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!codigosLoading && codigos && codigos.length === 0 && (
                <div className="py-2 text-xs text-stone-400">Sin códigos.</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
