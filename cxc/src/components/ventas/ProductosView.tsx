"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search, ChevronRight } from "lucide-react";
import { SkeletonTable } from "@/components/ui";
import { MONTHS, fmtMoney } from "@/lib/ventas/format";
import { variacionPct } from "@/lib/variacion";
import {
  PRODUCTOS_EMPRESAS,
  PRODUCTOS_EMPRESA_KEYS,
  DEFAULT_PRODUCTOS_EMPRESA,
  esProductosPeriodo,
  fmtMargen,
  fmtPrecioProm,
  precioPromedio,
  periodoLabel,
  exportProductosToExcel,
  type ProductosResponse,
  type ProductoNivel1,
  type ProductoCodigo,
  type ProductosPeriodo,
} from "@/lib/ventas/productos";

// "precio" NO es una columna de la RPC: sale de venta ÷ cantidad. Por eso el
// orden pasa por `valorOrden` y no por `p[sort.key]` — indexar un campo que no
// existe daba `undefined` y la tabla quedaba en el orden que venía, sin avisar.
type SortKey = "cantidad" | "venta" | "precio" | "margen";
const PAGE = 20;

/** Valor por el que se ordena cada columna. El precio se calcula al vuelo. */
function valorOrden(p: ProductoNivel1, key: SortKey): number | null {
  return key === "precio" ? precioPromedio(p.venta, p.cantidad) : p[key];
}

// El selector de período: lo que pidió Daniel, textual, más el mes suelto que ya
// estaba. Los tres relativos están anclados en HOY y no en el año del selector
// global (ver la nota de `productosRangoPeriodo`), por eso la pantalla imprime
// siempre las dos fechas debajo del total.
const PERIODOS_FIJOS: { key: ProductosPeriodo; nombre: string }[] = [
  { key: "6m", nombre: "Últimos 6 meses" },
  { key: "12m", nombre: "Últimos 12 meses" },
  { key: "anio_pasado", nombre: "Año pasado" },
];

/** "24 ago 2026" — fecha corta y legible, sin depender de la zona del navegador. */
function fmtDia(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1].toLowerCase()} ${y}`;
}

export function ProductosView({ selectedYear }: { selectedYear: number }) {
  // Deep-link: /ventas?tab=productos&empresa=american_classic preselecciona la
  // empresa (ej. desde el link "Top productos" del módulo Multifashion). Es solo
  // semilla inicial; el usuario puede cambiarla con el selector después.
  const searchParams = useSearchParams();
  const initialEmpresa = (() => {
    const e = searchParams.get("empresa");
    return e && PRODUCTOS_EMPRESA_KEYS.includes(e) ? e : DEFAULT_PRODUCTOS_EMPRESA;
  })();
  const [empresa, setEmpresa] = useState(initialEmpresa);
  const [periodo, setPeriodo] = useState<ProductosPeriodo>("ytd");
  const [mes, setMes] = useState<number | null>(null); // null = el año entero
  const [data, setData] = useState<ProductosResponse | null>(null);
  // Venta del MISMO período del año anterior por descripción → columna Δ.
  const [prevVenta, setPrevVenta] = useState<Record<string, number>>({});
  // 🩸 Si la ventana de comparación NO TIENE NI UNA FILA, cada renglón sale
  // "Nuevo" y la tabla entera parece un estreno. Con esto la pantalla lo DICE en
  // vez de dejar que se lea como un dato (pasa de verdad: Joystep arranca en
  // jul-2025, así que su "Año pasado" se compara contra un 2024 vacío).
  const [comparativoVacio, setComparativoVacio] = useState(false);
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
      const qs = new URLSearchParams({ empresa, year: String(selectedYear), periodo });
      if (periodo === "ytd" && mes) qs.set("mes", String(mes));
      // Mismo período del año anterior (para Δ). Mismo endpoint, y el rango
      // comparativo lo resuelve EL SERVIDOR (`previo=1`): si lo rearmara el
      // cliente, los dos criterios divergen el día que uno de los dos cambie.
      const prevQs = new URLSearchParams(qs);
      prevQs.set("previo", "1");
      const [res, prevRes] = await Promise.all([
        fetch(`/api/ventas/productos?${qs.toString()}`, { cache: "no-store" }),
        fetch(`/api/ventas/productos?${prevQs.toString()}`, { cache: "no-store" }),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ProductosResponse;
      // Δ es informativo: si el año anterior falla, seguimos sin la columna.
      const prevMap: Record<string, number> = {};
      let vacio = false;
      if (prevRes.ok) {
        const prevJson = (await prevRes.json()) as ProductosResponse;
        for (const p of prevJson.productos) prevMap[p.descripcion] = p.venta;
        vacio = prevJson.productos.length === 0;
      }
      setPrevVenta(prevMap);
      setComparativoVacio(vacio);
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
  }, [empresa, periodo, mes, selectedYear]);

  useEffect(() => { load(); }, [load]);

  const onEmpresaChange = (key: string) => {
    setEmpresa(key);
    // La empresa nueva puede no tener el mes seleccionado → se vuelve al año.
    setMes(null);
    setPeriodo("ytd");
    setSearch("");
  };

  // Un solo selector para los cuatro períodos + el mes suelto. El valor "ytd"
  // y "1".."12" son los que ya existían; los otros tres son los nuevos.
  const valorPeriodo = periodo !== "ytd" ? periodo : mes ? String(mes) : "ytd";
  const onPeriodoChange = (v: string) => {
    // 🩸 Los períodos se preguntan PRIMERO, y no es un detalle de estilo:
    // `parseInt("12m", 10)` devuelve 12 y `parseInt("6m", 10)` devuelve 6, así
    // que preguntar por el mes primero convertía "Últimos 12 meses" en
    // diciembre y "Últimos 6 meses" en junio, en silencio.
    if (esProductosPeriodo(v)) {
      setPeriodo(v);
      setMes(null);
    } else {
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1 || n > 12) return;
      setPeriodo("ytd");
      setMes(n);
    }
    setVisible(PAGE);
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let r = data.productos;
    if (q) r = r.filter(p => p.descripcion.toLowerCase().includes(q));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...r].sort((a, b) => {
      // `?? -Infinity` es el criterio que esta tabla YA usaba para el margen sin
      // valor; el precio sin unidades netas entra por la misma puerta para que
      // ordenar por una columna u otra no siga dos reglas distintas.
      const av = valorOrden(a, sort.key) ?? -Infinity;
      const bv = valorOrden(b, sort.key) ?? -Infinity;
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
        const qs = new URLSearchParams({ empresa, year: String(selectedYear), periodo, descripcion: key });
        if (periodo === "ytd" && mes) qs.set("mes", String(mes));
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

  // Unidades y precio promedio del período completo (no del Top 20 visible):
  // se suman TODAS las descripciones que devolvió el nivel 1, que es la misma
  // base con la que ya se calculan Venta y Margen del renglón de totales.
  const totalUnidades = data ? data.productos.reduce((acc, p) => acc + p.cantidad, 0) : 0;
  const totalPrecio = data ? precioPromedio(data.totales.venta, totalUnidades) : null;

  // El rótulo del Δ: para el año/mes sigue diciendo el año contra el que compara
  // (lo que se lee hoy); para las ventanas relativas no hay un año que nombrar.
  const deltaLabel = periodo === "ytd" ? `Δ ${selectedYear - 1}` : "Δ año ant.";

  return (
    <div>
      {/* Toolbar — todos los controles a 44px de alto (h-11 / min-h-[44px]):
          los defaults del design system (h-9 en Select/Input, h-8 en
          size="sm") quedan 8-12px por debajo del mínimo táctil en iPhone. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={empresa} onValueChange={onEmpresaChange}>
          <SelectTrigger className="h-11 w-auto min-w-[150px] text-xs" disabled={loading}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRODUCTOS_EMPRESAS.map(e => (
              <SelectItem key={e.key} value={e.key} className="text-xs">{e.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Los 4 períodos de Daniel + el mes suelto de siempre, en un solo
            desplegable: dos controles de período uno al lado del otro obligan a
            adivinar cuál manda. */}
        <Select value={valorPeriodo} onValueChange={onPeriodoChange}>
          <SelectTrigger className="h-11 w-auto min-w-[150px] text-xs" disabled={loading}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ytd" className="text-xs">{periodoLabel(selectedYear, null, "ytd")}</SelectItem>
            {PERIODOS_FIJOS.map(p => (
              <SelectItem key={p.key} value={p.key} className="text-xs">{p.nombre}</SelectItem>
            ))}
            {meses.map(m => (
              <SelectItem key={m} value={String(m)} className="text-xs">{MONTHS[m - 1]} {selectedYear}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setVisible(PAGE); }}
            placeholder="Buscar descripción…"
            /* text-base en móvil: Safari hace zoom al enfocar un input con
               letra < 16px (text-xs = 12px). Desde sm vuelve al text-xs. */
            className="h-11 pl-8 text-base sm:text-xs"
          />
        </div>

        <Button variant="outline" size="sm" onClick={onExcel} disabled={!data || loading} className="min-h-[44px]">
          <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
        </Button>
      </div>

      {/* Totales — texto simple, sin cards.
          🔒 Este <p> NO se toca: es el que compara el verificador de "ningún
          número cambió" (scripts/_verif-productos-numeros.mjs). Lo nuevo va en
          la línea de abajo, que es un elemento aparte. */}
      {data && !loading && (
        <>
          <p data-totales-productos className="mb-1 text-sm text-gray-600">
            Venta <span className="font-mono font-semibold tabular-nums text-gray-900">{fmtMoney(data.totales.venta)}</span>
            <span className="mx-2 text-gray-300">·</span>
            Margen <span className="font-mono font-semibold tabular-nums text-gray-900">{fmtMargen(data.totales.margen)}</span>
          </p>
          {/* Las piezas y el precio promedio del período, y —clave para los
              períodos relativos— LAS DOS FECHAS. "Últimos 12 meses" sin fechas
              es el rótulo que se malinterpreta. */}
          <p data-resumen-productos className="mb-3 text-xs text-gray-500">
            <span className="font-mono tabular-nums text-gray-700">{Math.round(totalUnidades).toLocaleString("en-US")}</span> piezas
            <span className="mx-1.5 text-gray-300">·</span>
            Precio prom. <span className="font-mono tabular-nums text-gray-700">{fmtPrecioProm(totalPrecio)}</span>
            <span className="mx-1.5 text-gray-300">·</span>
            {/* 🩸 SIN `whitespace-nowrap`. Medido a 390 px: "Δ contra 1 ene 2025
                – 31 dic 2025" en una sola línea llegaba hasta el px 490 y se
                llevaba la PÁGINA ENTERA 100 px de lado. Que el renglón se parta
                en dos líneas en iPhone no le quita nada; que la página se vaya
                de lado, sí. */}
            <span>Del {fmtDia(data.desde)} al {fmtDia(data.hasta)}</span>
            {data.comparativo && (
              <>
                <span className="mx-1.5 text-gray-300">·</span>
                <span>Δ contra {fmtDia(data.comparativo.desde)} – {fmtDia(data.comparativo.hasta)}</span>
              </>
            )}
          </p>
          {comparativoVacio && data.comparativo && (
            <p data-sin-comparativo className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              El período de comparación ({fmtDia(data.comparativo.desde)} – {fmtDia(data.comparativo.hasta)}) no tiene
              ventas de esta empresa: la columna Δ no está comparando contra nada.
            </p>
          )}
        </>
      )}

      {error && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-700">
          No se pudieron cargar los productos. <button onClick={load} className="underline">Reintentar</button>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <SkeletonTable rows={6} cols={5} />
        </div>
      )}

      {/* Tabla nivel 1 */}
      {data && !loading && !error && (
        /* 🩸 SIN `min-w-[560px]`. Ese mínimo inventado era TODO el arrastre:
           medido en el navegador (scripts/_ancho-util-ventas.mjs), la tabla
           necesita 318 px en un iPhone de 390 (donde sólo se ven Descripción,
           Venta y Margen) contra 356 disponibles — ENTRA de sobra. Los 204 px
           que se arrastraban eran los 560 forzados, no los datos. Acá la tabla
           no pasa a tarjetas porque no hace falta: entra. */
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.04em] text-gray-400">
                <th className="px-2 py-2.5 font-normal lg:px-3">Descripción</th>
                <th className="hidden px-1.5 py-2.5 text-right font-normal sm:table-cell lg:px-3">Códigos</th>
                <SortableTh label="Cant" active={sort} sortKey="cantidad" onClick={toggleSort} className="hidden sm:table-cell" />
                <SortableTh label="Venta" active={sort} sortKey="venta" onClick={toggleSort} />
                <th className="hidden px-1.5 py-2.5 text-right font-normal sm:table-cell lg:px-3">{deltaLabel}</th>
                {/* Precio prom. entra ESCONDIDA bajo `sm`, igual que Cant y Δ.
                    A 390 px solo caben Descripción, Venta y Margen (medido:
                    scripts/_medir-productos-precio-anchos.mjs) y la regla es que
                    una columna más no puede agregar arrastre nuevo en iPhone. */}
                <SortableTh label="Precio prom." active={sort} sortKey="precio" onClick={toggleSort} className="hidden sm:table-cell" />
                <SortableTh label="Margen %" active={sort} sortKey="margen" onClick={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Sin productos para este filtro.</td></tr>
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
                    prevVenta={prevVenta[p.descripcion]}
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
          {/* size="sm" da 32px de alto — min-h-[44px] lo lleva al mínimo. */}
          <Button variant="outline" size="sm" onClick={() => setVisible(v => v + PAGE)} className="min-h-[44px]">
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
    /* `sm:px-1.5`: entre `sm` y `lg` cada columna numérica devuelve 4 px. Con la
       7a columna (Precio prom.) la tabla pedía 560 px contra los 552 de un iPad
       parado —medido, no supuesto— y arrastraba 8. Debajo de `sm` y desde `lg`
       el relleno es el de siempre. */
    <th className={`px-2 py-0 text-right font-normal sm:px-1.5 lg:px-3 ${className}`}>
      {/* El botón mide 44 px de alto (regla táctil de la casa): antes eran 18 y
          en iPhone ordenar era una lotería. El `py` se movió del th al button
          para que el alto lo dé el blanco tocable y no se sumen los dos. */}
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-end gap-0.5 hover:text-gray-700 ${isActive ? "text-gray-900" : ""}`}
      >
        {label}
        <span className="w-2 text-xs">{isActive ? (active.dir === "desc" ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );
}

// Δ vs año anterior. Producto sin base comparable el año previo = "Nuevo".
// Antes bastaba con `prev > 0` y un producto que el año pasado vendió $2 salía
// con +50000%; ahora la regla es la única de la app (`variacionPct`).
function DeltaCell({ curr, prev }: { curr: number; prev: number | undefined }) {
  const ratio = variacionPct(curr, prev);
  if (ratio == null) {
    return <td data-col="delta" className="hidden px-1.5 py-2.5 text-right font-mono text-xs text-teal-700 sm:table-cell lg:px-3">Nuevo</td>;
  }
  const pct = ratio * 100;
  const up = pct >= 0;
  return (
    <td data-col="delta" className={`hidden px-1.5 py-2.5 text-right font-mono tabular-nums sm:table-cell lg:px-3 ${up ? "text-emerald-700" : "text-rose-600"}`}>
      {up ? "+" : ""}{pct.toFixed(0)}%
    </td>
  );
}

function ProductoRow({
  p, drillable, isOpen, onToggle, codigos, codigosLoading, prevVenta,
}: {
  p: ProductoNivel1;
  drillable: boolean;
  isOpen: boolean;
  onToggle: () => void;
  codigos: ProductoCodigo[] | undefined;
  codigosLoading: boolean;
  prevVenta: number | undefined;
}) {
  return (
    <>
      {/* `data-fila-producto` es el ancla ESTABLE para el verificador. Buscar
          por clase de breakpoint (`.sm\\:table-cell`) es una trampa: si el corte
          se mueve, el selector no encuentra nada y la comparación "pasa" sin
          haber comparado una sola celda. */}
      <tr
        data-fila-producto={p.descripcion}
        className={`border-b border-gray-100 ${drillable ? "cursor-pointer hover:bg-gray-50" : ""}`}
        onClick={drillable ? onToggle : undefined}
      >
        <td data-col="descripcion" className="px-2 py-2.5 lg:px-3">
          <div className="flex items-center gap-1.5">
            {drillable ? (
              <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className="text-gray-800">{p.descripcion}</span>
          </div>
        </td>
        <td data-col="codigos" className="hidden px-1.5 py-2.5 text-right font-mono tabular-nums text-gray-500 sm:table-cell lg:px-3">{p.num_codigos}</td>
        <td data-col="cantidad" className="hidden px-1.5 py-2.5 text-right font-mono tabular-nums text-gray-600 sm:table-cell lg:px-3">{Math.round(p.cantidad).toLocaleString("en-US")}</td>
        <td data-col="venta" className="px-2 py-2.5 text-right font-mono tabular-nums text-gray-900 sm:px-1.5 lg:px-3">{fmtMoney(p.venta)}</td>
        <DeltaCell curr={p.venta} prev={prevVenta} />
        <td data-col="precio" className="hidden px-1.5 py-2.5 text-right font-mono tabular-nums text-gray-700 sm:table-cell lg:px-3">{fmtPrecioProm(precioPromedio(p.venta, p.cantidad))}</td>
        <td data-col="margen" className="px-2 py-2.5 text-right font-mono tabular-nums text-gray-700 sm:px-1.5 lg:px-3">{fmtMargen(p.margen)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-gray-50/60">
          <td colSpan={7} className="px-2 py-0 lg:px-3">
            <div className="py-2 pl-5">
              {codigosLoading && <div className="py-2 text-xs text-gray-400">Cargando códigos…</div>}
              {!codigosLoading && codigos && codigos.length > 0 && (
                <table data-drill-codigos className="w-full text-xs">
                  <tbody>
                    {codigos.map(c => (
                      <tr key={c.codigo} className="border-b border-gray-100 last:border-0">
                        <td className="py-1.5 pr-3">
                          <span className="font-mono text-gray-500">{c.codigo}</span>
                          {c.descripcion && <span className="ml-2 text-gray-400">{c.descripcion}</span>}
                        </td>
                        <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-gray-500 sm:table-cell">{Math.round(c.cantidad).toLocaleString("en-US")}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-gray-800">{fmtMoney(c.venta)}</td>
                        {/* El precio promedio del código: es el que explica por
                            qué dos códigos de la misma descripción tienen
                            márgenes distintos. Mismo corte `sm` que arriba. */}
                        <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-gray-700 sm:table-cell">{fmtPrecioProm(precioPromedio(c.venta, c.cantidad))}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-gray-600">{fmtMargen(c.margen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!codigosLoading && codigos && codigos.length === 0 && (
                <div className="py-2 text-xs text-gray-400">Sin códigos.</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
