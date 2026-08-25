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
  fmtParticipacion,
  participacion,
  totalDeClientes,
  type ClienteDeProducto,
} from "@/lib/ventas/productos-clientes";
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

/** Las dos cosas que se ven ADENTRO de una descripción. */
type DrillTab = "clientes" | "codigos";
const PAGE = 20;

/** Valor por el que se ordena cada columna. El precio se calcula al vuelo. */
function valorOrden(p: ProductoNivel1, key: SortKey): number | null {
  return key === "precio" ? precioPromedio(p.venta, p.cantidad) : p[key];
}

// El selector de período: los CUATRO que pidió Daniel y nada más.
//
// ⛔ ACÁ VIVÍAN TAMBIÉN LOS 12 MESES SUELTOS (Ene 2026, Feb 2026, …). Daniel,
// textual (24-ago-2026): *"solo dejame las 4 primeras, las otras quítamelas que
// sobran, nunca te las pedí"*. Se fueron de la LISTA, no del sistema: el
// servidor sigue aceptando `?mes=6` y contestando exactamente lo mismo, así que
// nada que ya funcionara dejó de funcionar — simplemente la pantalla no lo pide
// más, y `productosRange(year, mes)` sigue intacta con sus candados.
//
// Los tres relativos están anclados en HOY y no en el año del selector global
// (ver la nota de `productosRangoPeriodo`), por eso la pantalla imprime siempre
// las dos fechas debajo del total.
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
  const [data, setData] = useState<ProductosResponse | null>(null);
  // Venta del MISMO período del año anterior por descripción → columna Δ.
  const [prevVenta, setPrevVenta] = useState<Record<string, number>>({});
  // 🩸 SIN VENTANA DE COMPARACIÓN, CADA RENGLÓN SALE "Nuevo" Y LA TABLA ENTERA
  // PARECE UN ESTRENO. Y eso pasa por DOS motivos que no son lo mismo:
  //
  //   "vacio" → la consulta funcionó y ese período no tuvo ni una venta. Es un
  //             HECHO del negocio (Joystep arranca en jul-2025, así que su "Año
  //             pasado" se compara contra un 2024 sin nada) y "Nuevo" es cierto.
  //   "fallo" → la consulta se cayó (un tropiezo de red, un timeout). NO
  //             sabemos si hubo ventas, así que decir "Nuevo" es AFIRMAR algo
  //             que no se midió — y antes salía sin ningún aviso, porque el
  //             cartel ámbar solo miraba el caso vacío. El catálogo entero se
  //             leía como estreno por un error de red.
  const [comparativo, setComparativo] = useState<"ok" | "vacio" | "fallo">("ok");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "venta", dir: "desc" });
  const [visible, setVisible] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [codigos, setCodigos] = useState<Record<string, ProductoCodigo[]>>({});
  // Quién compra cada descripción. `null` = la lectura falló (distinto de `[]`,
  // que es "no hay detalle"): son dos mensajes distintos y no se pueden mezclar.
  const [clientes, setClientes] = useState<Record<string, ClienteDeProducto[] | null>>({});
  const [codigosLoading, setCodigosLoading] = useState<string | null>(null);
  // Qué pestaña del desplegable se está mirando. Una sola fila se abre a la
  // vez, así que un solo valor alcanza. Arranca en CLIENTES porque es lo que
  // Daniel vino a buscar; los códigos quedan a un toque.
  const [drillTab, setDrillTab] = useState<DrillTab>("clientes");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ empresa, year: String(selectedYear), periodo });
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
      // Δ es informativo: si el año anterior falla, seguimos sin la columna —
      // pero la pantalla lo DICE, y la columna deja de afirmar "Nuevo".
      const prevMap: Record<string, number> = {};
      let estado: "ok" | "vacio" | "fallo" = "fallo";
      if (prevRes.ok) {
        const prevJson = (await prevRes.json()) as ProductosResponse;
        for (const p of prevJson.productos) prevMap[p.descripcion] = p.venta;
        estado = prevJson.productos.length === 0 ? "vacio" : "ok";
      }
      setPrevVenta(prevMap);
      setComparativo(estado);
      setData(json);
      setCodigos({});
      setClientes({});
      setExpanded(null);
      setVisible(PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error inesperado");
      setData(null);
      setComparativo("fallo");
    } finally {
      setLoading(false);
    }
  }, [empresa, periodo, selectedYear]);

  useEffect(() => { load(); }, [load]);

  // 🔴 CAMBIAR DE EMPRESA (O DE AÑO) NO BORRA LO QUE ELEGISTE. Antes esto
  // reseteaba el período a "Año en curso" y vaciaba el buscador: estabas
  // mirando "Últimos 12 meses" de una empresa, cambiabas a otra, y la pantalla
  // volvía sola al año sin decir nada. El único motivo real era que la empresa
  // nueva podía no tener el MES elegido — y desde que los meses sueltos ya no
  // están en el selector, ese motivo no existe. (Lo mismo al cambiar el año:
  // `VentasShell` ya no remonta la vista.)
  const onEmpresaChange = (key: string) => {
    setEmpresa(key);
  };

  // ⛔ ACÁ ABAJO VIVÍA EL GUARD QUE RESETEABA EL MES cuando la empresa nueva no
  // lo tenía (miraba `data.meses`). MUERE CON LOS MESES, y se cae porque su
  // motivo de existir desapareció: sin meses sueltos en el selector no hay
  // ninguna elección que pueda quedar inválida al cambiar de empresa. Los tres
  // períodos relativos no dependen ni de la empresa ni del año.
  //
  // Lo que SÍ se conserva de ese mismo cambio es lo de arriba: cambiar de
  // empresa YA NO borra el buscador ni te devuelve al año en curso.

  // Cuatro opciones y ninguna más. `esProductosPeriodo` sigue guardando la
  // puerta: un valor que no sea uno de los cuatro no cambia nada (antes acá
  // convivían los meses "1".."12", y `parseInt("12m")` = 12 convertía "Últimos
  // 12 meses" en diciembre en silencio — ese enredo ya no existe).
  const onPeriodoChange = (v: string) => {
    if (!esProductosPeriodo(v)) return;
    setPeriodo(v);
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

  // 🩸 ANTES ESTO ARRANCABA CON `if (p.num_codigos <= 1) return;` — un grupo de
  // un solo código no tenía nada que desplegar. Con la lista de clientes SÍ
  // tiene: en Joystep y en Active Wear las descripciones que más venden son
  // justo de UN código (medido), así que con aquella guarda "quién lo compra"
  // no se podía abrir precisamente donde más falta hace. Ahora abren todas.
  const toggleExpand = async (p: ProductoNivel1) => {
    const key = p.descripcion;
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    setDrillTab("clientes");
    if (!(key in codigos)) {
      setCodigosLoading(key);
      try {
        const qs = new URLSearchParams({ empresa, year: String(selectedYear), periodo, descripcion: key });
        const res = await fetch(`/api/ventas/productos/codigos?${qs.toString()}`, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as {
            codigos: ProductoCodigo[];
            clientes: ClienteDeProducto[] | null;
          };
          setCodigos(prev => ({ ...prev, [key]: json.codigos }));
          setClientes(prev => ({ ...prev, [key]: json.clientes ?? null }));
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

  // Unidades y precio promedio del período completo (no del Top 20 visible):
  // se suman TODAS las descripciones que devolvió el nivel 1, que es la misma
  // base con la que ya se calculan Venta y Margen del renglón de totales.
  const totalUnidades = data ? data.productos.reduce((acc, p) => acc + p.cantidad, 0) : 0;
  const totalPrecio = data ? precioPromedio(data.totales.venta, totalUnidades) : null;

  // El rótulo de la columna de cambio: para el año/mes sigue diciendo el año
  // contra el que compara (lo que se lee hoy); para las ventanas relativas no
  // hay un año que nombrar. Sin la "Δ", que es notación de matemática.
  const deltaLabel = periodo === "ytd" ? `vs ${selectedYear - 1}` : "vs año ant.";

  // 🔴 CON UN PERÍODO RELATIVO, EL SELECTOR DE AÑO DE ARRIBA NO HACE NADA — y
  // hasta hoy no lo decía. "Últimos 12 meses" y "Año pasado" se cuentan desde
  // HOY (ver `productosRangoPeriodo`: para esos tres el servidor ni mira el
  // año), así que había dos controles de tiempo en la misma pantalla y ninguno
  // aclaraba cuál manda. Ahora lo dice la pantalla, al lado de las fechas que
  // ya imprime — apagar el selector no se puede: es global de /ventas y lo
  // comparten los otros tres tabs, donde sí manda.
  const anioNoAplica = periodo !== "ytd";

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
        <Select value={periodo} onValueChange={onPeriodoChange}>
          <SelectTrigger className="h-11 w-auto min-w-[150px] text-xs" disabled={loading}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ytd" className="text-xs">{periodoLabel(selectedYear, null, "ytd")}</SelectItem>
            {PERIODOS_FIJOS.map(p => (
              <SelectItem key={p.key} value={p.key} className="text-xs">{p.nombre}</SelectItem>
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
                <span>comparado con {fmtDia(data.comparativo.desde)} – {fmtDia(data.comparativo.hasta)}</span>
              </>
            )}
          </p>
          {/* El aviso va JUNTO a las fechas, que son la prueba de lo que dice:
              el período impreso arranca en otro año que el del selector. */}
          {anioNoAplica && (
            <p data-anio-no-aplica className="mb-3 text-xs text-gray-500">
              El año {selectedYear} de arriba no se aplica a este período: «{periodoLabel(selectedYear, null, periodo)}»
              se cuenta desde hoy hacia atrás. Para mirar un año elegí «{periodoLabel(selectedYear, null, "ytd")}» o un mes.
            </p>
          )}
          {comparativo === "vacio" && data.comparativo && (
            <p data-sin-comparativo className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              El período de comparación ({fmtDia(data.comparativo.desde)} – {fmtDia(data.comparativo.hasta)}) no tiene
              ventas de esta empresa: la columna de cambio no está comparando contra nada.
            </p>
          )}
          {/* 🔴 "No se pudo cargar" NO es "no hubo ventas". Va en gris y no en
              ámbar —no hay nada roto en los datos, se cayó una consulta— y
              ofrece reintentar, que es lo único accionable. La columna de
              cambio, mientras tanto, muestra "—" en vez de "Nuevo". */}
          {comparativo === "fallo" && (
            <p data-comparativo-fallo className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              No se pudo cargar el período de comparación, así que la columna de cambio queda vacía. Los
              números de esta tabla no cambian.{" "}
              <button onClick={load} className="underline">Reintentar</button>
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
              {visibleRows.map(p => (
                <ProductoRow
                  key={p.descripcion}
                  p={p}
                  isOpen={expanded === p.descripcion}
                  onToggle={() => toggleExpand(p)}
                  codigos={codigos[p.descripcion]}
                  clientes={clientes[p.descripcion]}
                  codigosLoading={codigosLoading === p.descripcion}
                  prevVenta={prevVenta[p.descripcion]}
                  comparativoMedido={comparativo !== "fallo"}
                  tab={drillTab}
                  onTab={setDrillTab}
                />
              ))}
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

// Cambio contra el año anterior. Producto sin base comparable el año previo =
// "Nuevo". Antes bastaba con `prev > 0` y un producto que el año pasado vendió
// $2 salía con +50000%; ahora la regla es la única de la app (`variacionPct`).
//
// 🔴 `medido` DICE SI HUBO VENTANA DE COMPARACIÓN. Cuando la consulta del año
// anterior falló, no se midió nada: "Nuevo" sería afirmar que ese producto no
// existía, y con el catálogo entero en verde el error de red se lee como un
// dato. Sin medición, la celda va vacía ("—").
function DeltaCell({ curr, prev, medido }: { curr: number; prev: number | undefined; medido: boolean }) {
  if (!medido) {
    return <td data-col="delta" className="hidden px-1.5 py-2.5 text-right font-mono text-xs text-gray-300 sm:table-cell lg:px-3">—</td>;
  }
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
  p, isOpen, onToggle, codigos, clientes, codigosLoading, prevVenta, comparativoMedido, tab, onTab,
}: {
  p: ProductoNivel1;
  isOpen: boolean;
  onToggle: () => void;
  codigos: ProductoCodigo[] | undefined;
  clientes: ClienteDeProducto[] | null | undefined;
  codigosLoading: boolean;
  prevVenta: number | undefined;
  /** false cuando la consulta del período anterior falló: sin ventana medida,
   *  la columna de cambio no puede afirmar "Nuevo". */
  comparativoMedido: boolean;
  tab: DrillTab;
  onTab: (t: DrillTab) => void;
}) {
  return (
    <>
      {/* `data-fila-producto` es el ancla ESTABLE para el verificador. Buscar
          por clase de breakpoint (`.sm\\:table-cell`) es una trampa: si el corte
          se mueve, el selector no encuentra nada y la comparación "pasa" sin
          haber comparado una sola celda. */}
      <tr
        data-fila-producto={p.descripcion}
        className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
        onClick={onToggle}
      >
        <td data-col="descripcion" className="px-2 py-2.5 lg:px-3">
          <div className="flex items-center gap-1.5">
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            <span className="text-gray-800">{p.descripcion}</span>
          </div>
        </td>
        <td data-col="codigos" className="hidden px-1.5 py-2.5 text-right font-mono tabular-nums text-gray-500 sm:table-cell lg:px-3">{p.num_codigos}</td>
        <td data-col="cantidad" className="hidden px-1.5 py-2.5 text-right font-mono tabular-nums text-gray-600 sm:table-cell lg:px-3">{Math.round(p.cantidad).toLocaleString("en-US")}</td>
        <td data-col="venta" className="px-2 py-2.5 text-right font-mono tabular-nums text-gray-900 sm:px-1.5 lg:px-3">{fmtMoney(p.venta)}</td>
        <DeltaCell curr={p.venta} prev={prevVenta} medido={comparativoMedido} />
        <td data-col="precio" className="hidden px-1.5 py-2.5 text-right font-mono tabular-nums text-gray-700 sm:table-cell lg:px-3">{fmtPrecioProm(precioPromedio(p.venta, p.cantidad))}</td>
        <td data-col="margen" className="px-2 py-2.5 text-right font-mono tabular-nums text-gray-700 sm:px-1.5 lg:px-3">{fmtMargen(p.margen)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-gray-50/60">
          <td colSpan={7} className="px-2 py-0 lg:px-3">
            <div className="py-2 pl-5">
              {codigosLoading && <div className="py-2 text-xs text-gray-400">Cargando…</div>}
              {!codigosLoading && (
                <>
                  {/* 🩸 DOS BLOQUES UNO DEBAJO DEL OTRO NO SERVÍAN, y no es
                      cuestión de gusto: hay descripciones de 602 códigos
                      (vistana, "Men-T-Shirts S/S") y hasta de 842
                      (fashion_wear, "Women-Bags"). Con la lista de códigos
                      arriba, "quién lo compra" quedaba a 600 renglones de
                      scroll — o sea, no existía. Con pestañas las dos cosas
                      están a un toque y ninguna tapa a la otra.

                      Arranca en CLIENTES porque es lo que Daniel pidió; los
                      códigos siguen ahí, con su rótulo, sin perder nada. */}
                  <div className="mb-1 flex gap-1" role="tablist" aria-label="Detalle de la descripción">
                    <DrillTabBtn activa={tab === "clientes"} onClick={() => onTab("clientes")}>
                      Quién lo compra
                    </DrillTabBtn>
                    <DrillTabBtn activa={tab === "codigos"} onClick={() => onTab("codigos")}>
                      Códigos{codigos ? ` (${codigos.length})` : ""}
                    </DrillTabBtn>
                  </div>

                  {tab === "clientes" && <BloqueClientes clientes={clientes} />}
                  {tab === "codigos" && <BloqueCodigos codigos={codigos} />}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Pestaña del desplegable. 44 px de alto: se toca desde el iPhone. */
function DrillTabBtn({
  activa, onClick, children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      // El clic NO puede llegar a la fila de arriba: ahí vive el toggle que
      // cierra el desplegable, y cambiar de pestaña lo cerraría al instante.
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`min-h-[44px] rounded-md px-3 text-xs transition ${
        activa ? "bg-white font-medium text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * QUIÉN COMPRA ESTA DESCRIPCIÓN — lo que pidió Daniel el 24-ago-2026.
 *
 * Del que más compra al que menos, con unidades, venta y qué parte se lleva.
 * Todo NETO: la nota de crédito RESTA (el signo lo pone `agruparPorCliente` con
 * `signoDeTipo`, la única definición del repo). No es un detalle: City Mall
 * David devolvió el 58% de lo que se le facturó a $30, y en bruto saldría muy
 * por encima de donde va.
 */
function BloqueClientes({ clientes }: { clientes: ClienteDeProducto[] | null | undefined }) {
  if (clientes === null) {
    return <div className="py-2 text-xs text-gray-500">No se pudo cargar quién lo compra. Cerrá y volvé a abrir la fila.</div>;
  }
  if (!clientes) return <div className="py-2 text-xs text-gray-400">Cargando…</div>;
  if (clientes.length === 0) {
    // 🔴 NO dice "no lo compra nadie". Hoy mismo Fashion Wear está terminando de
    // bajar su detalle y sus descripciones saldrían todas vacías: afirmar que
    // nadie compra sería una respuesta falsa dicha con toda seguridad.
    return (
      <div className="py-2 text-xs text-gray-500">
        Todavía no tenemos el detalle por cliente de estas ventas.
      </div>
    );
  }

  const total = totalDeClientes(clientes);
  return (
    <>
      <table data-drill-clientes className="w-full text-xs">
        <tbody>
          {clientes.map(c => (
            <tr key={c.cliente_switch_id ?? c.cliente_nombre} className="border-b border-gray-100 last:border-0">
              <td className="py-1.5 pr-3 text-gray-700">{c.cliente_nombre}</td>
              {/* Mismo corte `sm` que la tabla de arriba: a 390 px sólo entran
                  el nombre, la venta y el %. */}
              <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-gray-500 sm:table-cell">
                {Math.round(c.cantidad).toLocaleString("en-US")}
              </td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-gray-800">{fmtMoney(c.venta)}</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-gray-500">
                {fmtParticipacion(participacion(c.venta, total.venta))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* El pie dice de dónde sale y por qué puede quedar por debajo de la fila
          de arriba. Se explica UNA vez acá en vez de dejar que se descubra
          sumando y se lea como un descuadre. */}
      <p data-pie-clientes className="mt-1.5 text-xs text-gray-500">
        <span className="font-mono tabular-nums text-gray-700">{clientes.length}</span>
        {clientes.length === 1 ? " cliente" : " clientes"}
        <span className="mx-1.5 text-gray-300">·</span>
        <span className="font-mono tabular-nums text-gray-700">{Math.round(total.cantidad).toLocaleString("en-US")}</span> piezas
        <span className="mx-1.5 text-gray-300">·</span>
        <span className="font-mono tabular-nums text-gray-700">{fmtMoney(total.venta)}</span>
        <span className="mx-1.5 text-gray-300">·</span>
        <span>sale de las facturas y notas de crédito; las ventas de mostrador no traen detalle, así que puede quedar un poco por debajo de la venta de la fila</span>
      </p>
    </>
  );
}

/** Los códigos de la descripción — los colores y tallas de ese modelo. */
function BloqueCodigos({ codigos }: { codigos: ProductoCodigo[] | undefined }) {
  if (!codigos) return <div className="py-2 text-xs text-gray-500">No se pudieron cargar los códigos.</div>;
  if (codigos.length === 0) return <div className="py-2 text-xs text-gray-400">Sin códigos.</div>;
  return (
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
            {/* El precio promedio del código: es el que explica por qué dos
                códigos de la misma descripción tienen márgenes distintos. */}
            <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-gray-700 sm:table-cell">{fmtPrecioProm(precioPromedio(c.venta, c.cantidad))}</td>
            <td className="py-1.5 text-right font-mono tabular-nums text-gray-600">{fmtMargen(c.margen)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
