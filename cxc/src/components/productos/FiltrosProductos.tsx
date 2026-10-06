"use client";

// PRODUCTOS, la MISMA pantalla en Ventas y en Multifashion (PRODUCTOS_FILTROS_2026_10).
//
// Computadora, UNA línea:
//   ‹ Oct 2026 › · Rango · Empresa ▾ · Departamento ▾ · Género ▾ · Descripción ▾ · 🔍
// Celular (barra v3.3): «Productos» y 🔍 · ‹ Oct 2026 › · Rango · los chips en una
// fila que se desliza.
//
// Un chip elegido se pone oscuro, dice lo elegido y lleva ✕. Las opciones de
// cada chip dependen de lo ya elegido. Un chip sin opciones no se dibuja.
// Los totales y la lista «Por descripción» salen de los códigos que quedan.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import { vidrioSobre } from "@/lib/ui/vidrio";
import { CHIP_V4 } from "@/lib/catalogo/catalogos-2026-10-b";
import { FILA_QUE_SE_DESLIZA } from "@/lib/catalogo/orden-celular";
import { BuscarEnLaBarra, EnLaBarra } from "@/components/celular/BarraDeControles";
import { fmtMoney } from "@/lib/ventas/format";
import { fmtPorcentaje } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";
import { OrdenarEnLaBarra, ThOrden, useOrdenTabla, type OrdenTablaApi } from "@/components/ui/OrdenTabla";
import {
  coberturaDe,
  filtrarArticulos,
  hayFiltro,
  opcionesDe,
  podarElegidos,
  partesDelCodigo,
  porDescripcion,
  totalesDe,
  type ArticuloVendido,
  type ChipFiltro,
  type Elegidos,
  type RenglonDescripcion,
  type TotalesFiltro,
} from "@/lib/productos/filtros";

const CHIP_ACTIVO = "bg-gray-900 text-white";
const CHIP_INACTIVO = "bg-white text-gray-700 border border-gray-200 hover:border-gray-300";

// ── El chip con su lista ────────────────────────────────────────────────────

export function ChipLista({
  etiqueta, valor, opciones, onCambiar, conBuscador = false, sinQuitar = false,
}: {
  etiqueta: string;
  valor: string;
  opciones: readonly { valor: string; etiqueta: string }[];
  onCambiar: (v: string) => void;
  conBuscador?: boolean;
  /** Empresa: siempre hay una elegida («Todas» incluida), no lleva ✕. */
  sinQuitar?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const ancla = useRef<HTMLButtonElement>(null);
  const activo = !!valor && !sinQuitar;
  const texto = opciones.find(o => o.valor === valor)?.etiqueta ?? etiqueta;
  const visibles = q.trim() ? opciones.filter(o => o.etiqueta.toLowerCase().includes(q.trim().toLowerCase())) : opciones;
  return (
    <>
      <button
        ref={ancla}
        type="button"
        data-chip={etiqueta}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto(a => !a)}
        className={cn(CHIP_V4, "gap-1", activo ? CHIP_ACTIVO : CHIP_INACTIVO)}
      >
        <span>{valor ? texto : etiqueta}</span>
        {activo ? (
          <span
            role="button"
            aria-label={`Quitar ${etiqueta}`}
            onClick={e => { e.stopPropagation(); onCambiar(""); }}
            // 🔴 `relative z-[1]`: el ::before de CHIP_V4 (absoluto, para los 44 px
            // de toque) tapaba la ✕ y el clic abría la lista (Daniel, 5-oct-2026).
            className="relative z-[1] -mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/20"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <svg className="h-3 w-3 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      <DesplegableFlotante
        abierto={abierto}
        anclaRef={ancla}
        onCerrar={() => { setAbierto(false); setQ(""); }}
        marca={`productos-chip-${etiqueta.toLowerCase()}`}
        role="listbox"
        aria-label={etiqueta}
        anchoMinimo={240}
        className={vidrioSobre("max-h-[60vh] overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg")}
      >
        {conBuscador && (
          <div className="bg-white px-2 pb-1 pt-1">
            <input
              autoFocus
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={`Buscar ${etiqueta.toLowerCase()}`}
              aria-label={`Buscar ${etiqueta.toLowerCase()}`}
              className="h-10 w-full rounded-md bg-gray-100 px-3 text-base text-gray-900 outline-none sm:text-sm"
            />
          </div>
        )}
        {visibles.map(o => (
          <button
            key={o.valor || "todos"}
            type="button"
            role="option"
            aria-selected={o.valor === valor}
            onClick={() => { onCambiar(o.valor); setAbierto(false); setQ(""); }}
            className={cn(
              "flex min-h-[44px] w-full items-center justify-between gap-2 px-4 text-left text-sm transition hover:bg-black/5",
              o.valor === valor ? "font-semibold" : "text-gray-700",
            )}
          >
            <span>{o.etiqueta}</span>
          </button>
        ))}
        {visibles.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">Sin resultados</p>}
      </DesplegableFlotante>
    </>
  );
}

// ── La pantalla ─────────────────────────────────────────────────────────────

type Modo = "todo" | "sin90" | "agotados";

export interface PantallaProductosProps {
  articulos: ArticuloVendido[] | null;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  chips: readonly ChipFiltro[];
  /** Lo que va ANTES de los chips en la línea: el período (computadora) y Empresa ▾. */
  antes?: ReactNode;
  /** Los chips de antes en el celular (Empresa ▾); el período va en la barra. */
  antesCelular?: ReactNode;
  /** Al final de la línea en la computadora (frescura). */
  despues?: ReactNode;
  /** Con inventario: la columna «Stock» y los dos chips de atención. */
  conInventario: boolean;
  /** Multifashion: la columna «Stock» sin los chips «Sin venta en 90 días» · «Agotados». */
  sinAtencion?: boolean;
  /** Sin ningún filtro, los totales de siempre (el Resumen). */
  totalesSinFiltro?: TotalesFiltro | null;
  notaTotales?: ReactNode;
  /** Ventas en el celular: el 🔍 y los chips van a la barra v3.3. */
  enBarra?: boolean;
  /** Con una descripción elegida, cuánto vende cada valor de este campo
   *  («Women-Sandals → Fashion Shoes $X · Vistana $Y»). Ventas: «empresa». */
  desglosePor?: string;
  /** «Descargar en Excel» con lo que está en pantalla (filtros incluidos). */
  onDescargar?: (renglones: RenglonDescripcion[], totales: TotalesFiltro) => void;
}

const TANDA = 100;

// 🔴 6-oct-2026 (Daniel): «Quiero poder ordenar por Descripción, Unidades,
// Venta, Margen y Stock». Abre como siempre (por venta) y sin flecha; los
// artículos de una descripción abierta siguen el MISMO orden.
const COLUMNAS_ORDEN = ["descripcion", "unidades", "venta", "margen", "stock"] as const;
type ColOrden = (typeof COLUMNAS_ORDEN)[number];
const ROTULOS_ORDEN: Record<ColOrden, string> = {
  descripcion: "Descripción", unidades: "Unidades", venta: "Venta", margen: "Margen", stock: "Stock",
};
function valorRenglon(r: RenglonDescripcion, c: ColOrden) {
  return c === "descripcion" ? r.descripcion : c === "stock" ? r.existencia : r[c];
}
function valorArticulo(a: ArticuloVendido, c: ColOrden) {
  if (c === "descripcion") return a.codigo;
  if (c === "stock") return a.existencia ?? null;
  return c === "margen" ? totalesDe([a]).margen : a[c];
}
const fmtU = (n: number) => Math.round(n).toLocaleString("en-US");

export function PantallaProductos(p: PantallaProductosProps) {
  const [modo, setModo] = useState<Modo>("todo");
  const [codigo, setCodigo] = useState("");
  const [elegidos, setElegidos] = useState<Elegidos>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(TANDA);

  // El universo del modo: lo vendido en el período, lo agotado o lo quieto.
  const delModo = useMemo(() => {
    const todos = p.articulos ?? [];
    if (modo === "sin90") return todos.filter(a => (a.existencia ?? 0) > 0 && !a.vendio90);
    const vendidos = todos.filter(a => a.unidades !== 0 || a.venta !== 0);
    return modo === "agotados" ? vendidos.filter(a => a.existencia != null && a.existencia <= 0) : vendidos;
  }, [p.articulos, modo]);

  const filtrados = useMemo(() => filtrarArticulos(delModo, codigo, elegidos), [delModo, codigo, elegidos]);
  const chipsVisibles = useMemo(
    () => p.chips
      .filter(c => c.cobertura == null || coberturaDe(delModo, c.campo) >= c.cobertura)
      .map(c => ({ chip: c, opciones: opcionesDe(delModo, c.campo, codigo, elegidos) }))
      .filter(x => elegidos[x.chip.campo] || x.opciones.length > 0),
    [p.chips, delModo, codigo, elegidos],
  );
  const orden = useOrdenTabla<ColOrden>("productos", { columnas: COLUMNAS_ORDEN, textos: ["descripcion"] });
  const renglones = useMemo(() => {
    const rs = orden.ordenar(porDescripcion(filtrados), valorRenglon);
    return orden.orden ? rs.map(r => ({ ...r, articulos: orden.ordenar(r.articulos, valorArticulo) })) : rs;
  }, [filtrados, orden]);
  const opcionesOrden = COLUMNAS_ORDEN
    .filter(c => c !== "stock" || p.conInventario)
    .map(c => ({ col: c, rotulo: ROTULOS_ORDEN[c] }));
  const ordenarCelular = <OrdenarEnLaBarra api={orden} opciones={opcionesOrden} />;
  const filtro = hayFiltro(codigo, elegidos) || modo !== "todo";
  const totales = !filtro && p.totalesSinFiltro ? p.totalesSinFiltro : totalesDe(filtrados);
  const existenciaTotal = filtrados.reduce((s, a) => s + Math.max(a.existencia ?? 0, 0), 0);
  // Una descripción elegida que venden varias empresas: cuánto cada una.
  const desglose = useMemo(() => {
    if (!p.desglosePor || !elegidos.descripcion) return null;
    const por = new Map<string, number>();
    for (const a of filtrados) {
      const k = a.campos[p.desglosePor] ?? "";
      if (k) por.set(k, (por.get(k) ?? 0) + a.venta);
    }
    return por.size > 1 ? [...por.entries()].sort((x, y) => y[1] - x[1]) : null;
  }, [p.desglosePor, elegidos.descripcion, filtrados]);
  const descargar = p.onDescargar && (
    <button
      type="button"
      onClick={() => p.onDescargar!(renglones, totales)}
      className="min-h-[44px] shrink-0 px-1 text-sm text-blue-600 hover:text-blue-800"
    >
      Descargar en Excel
    </button>
  );

  // Quitar o cambiar un chip limpia los que dependían de él y quedan sin opción.
  const elegir = (campo: string, v: string) => {
    setElegidos(e => podarElegidos(delModo, codigo, { ...e, [campo]: v }, campo));
    setVisibles(TANDA); setAbierta(null);
  };

  const chipsNodo = (
    <>
      {chipsVisibles.map(({ chip, opciones }) => (
        <ChipLista
          key={chip.campo}
          etiqueta={chip.etiqueta}
          valor={elegidos[chip.campo] ?? ""}
          opciones={opciones.map(o => ({ valor: o, etiqueta: o }))}
          onCambiar={v => elegir(chip.campo, v)}
          conBuscador={chip.conBuscador}
        />
      ))}
    </>
  );
  const buscarCodigo = (
    <div className="relative w-40 shrink-0">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={codigo}
        onChange={e => { setCodigo(e.target.value); setVisibles(TANDA); }}
        placeholder="Código"
        aria-label="Buscar un código"
        className="h-9 w-full rounded-full border border-gray-200 bg-white pl-8 pr-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none sm:text-[13px]"
      />
    </div>
  );

  const atencion = p.conInventario && !p.sinAtencion && (
    <div className="flex items-center gap-2" data-chips-atencion>
      {([["sin90", "Sin venta en 90 días"], ["agotados", "Agotados"]] as const).map(([m, rotulo]) => (
        <button
          key={m}
          type="button"
          aria-pressed={modo === m}
          onClick={() => { setModo(x => (x === m ? "todo" : m)); setVisibles(TANDA); setAbierta(null); }}
          className={cn(CHIP_V4, modo === m ? CHIP_ACTIVO : CHIP_INACTIVO)}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );

  return (
    <div data-pantalla-productos className="space-y-3">
      {p.enBarra ? (
        <EnLaBarra
          pestana="productos"
          iconos={<BuscarEnLaBarra valor={codigo} onCambiar={v => { setCodigo(v); setVisibles(TANDA); }} placeholder="Buscar un código…" etiqueta="Buscar un código" />}
          filaIzq={<div data-filtros-productos className={cn(FILA_QUE_SE_DESLIZA, "min-w-0 flex-[1_1_100%] items-center py-1")}>{p.antesCelular}{chipsNodo}</div>}
          filaDer={ordenarCelular}
          menu={descargar}
        />
      ) : (
        <div data-filtros-productos className={cn(FILA_QUE_SE_DESLIZA, "items-center py-1 sm:flex-wrap sm:overflow-visible")}>
          {p.antes}
          <span className="contents sm:hidden">{ordenarCelular}</span>
          {chipsNodo}
          {buscarCodigo}
          {p.despues && <span className="hidden flex-1 sm:block" />}
          {p.despues && <span className="hidden sm:contents">{p.despues}</span>}
          {descargar && <span className="hidden sm:contents">{descargar}</span>}
        </div>
      )}

      {p.error && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-700">
          No se pudieron cargar los productos. <button onClick={p.onReintentar} className="text-blue-600 hover:text-blue-800">Reintentar</button>
        </div>
      )}

      {!p.error && (
        <div className={cn("space-y-3", p.cargando && "opacity-60 transition-opacity")}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p data-totales-productos className="text-sm text-gray-600">
              {modo === "sin90" ? (
                <>Stock <b className="tabular-nums text-gray-900">{fmtU(existenciaTotal)}</b> u en <b className="tabular-nums text-gray-900">{fmtU(filtrados.length)}</b> artículos</>
              ) : (
                <>
                  <b className="tabular-nums text-gray-900">{fmtU(totales.unidades)}</b> unidades
                  <span className="mx-1.5 text-gray-300">·</span>Venta <b className="tabular-nums text-gray-900">{fmtMoney(totales.venta)}</b>
                  <span className="mx-1.5 text-gray-300">·</span>Utilidad <b className="tabular-nums text-gray-900">{fmtMoney(totales.utilidad)}</b>
                  <span className="mx-1.5 text-gray-300">·</span>Margen <b className="tabular-nums text-gray-900">{fmtPorcentaje(totales.margen)}</b>
                </>
              )}
              {!filtro && p.notaTotales}
            </p>
            {atencion}
          </div>
          {desglose && (
            <p data-desglose className="text-sm text-gray-600">
              {desglose.map(([k, v], i) => (
                <span key={k}>{i > 0 && <span className="mx-1.5 text-gray-300">·</span>}{k} <b className="tabular-nums text-gray-900">{fmtMoney(v)}</b></span>
              ))}
            </p>
          )}

          {p.cargando && !p.articulos ? (
            <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-busy="true" />
          ) : (
            <ListaPorDescripcion
              renglones={renglones.slice(0, visibles)}
              total={renglones.length}
              onVerMas={() => setVisibles(v => v + TANDA)}
              abierta={abierta}
              onAbrir={d => setAbierta(a => (a === d ? null : d))}
              conInventario={p.conInventario}
              orden={orden}
              vacio={filtro ? "Sin resultados para este filtro." : "Sin ventas en el período."}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── La lista ────────────────────────────────────────────────────────────────

function Cifras({ unidades, venta, margen, existencia, conInventario, className = "" }: {
  unidades: number; venta: number; margen: number | null; existencia: number | null;
  conInventario: boolean; className?: string;
}) {
  return (
    <>
      <td className={cn("px-3 py-2.5 text-right tabular-nums", className)}>{fmtU(unidades)}</td>
      <td className={cn("px-3 py-2.5 text-right tabular-nums", className)}>{fmtMoney(venta)}</td>
      <td className={cn("px-3 py-2.5 text-right tabular-nums", className)}>{fmtPorcentaje(margen)}</td>
      {conInventario && (
        <td className={cn("px-3 py-2.5 text-right tabular-nums", className)}>{existencia == null ? "—" : fmtU(existencia)}</td>
      )}
    </>
  );
}

function Foto({ url }: { url?: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md border border-gray-100 bg-white object-contain" /> : null;
}

function NombreCodigo({ a }: { a: ArticuloVendido }) {
  const { modelo, color } = partesDelCodigo(a.codigo);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Foto url={a.foto} />
      <span className="min-w-0">
        <span className="block truncate tabular-nums text-[13px] text-gray-900">{modelo}</span>
        {color && <span className="block text-xs text-gray-500">Color {color}</span>}
      </span>
    </span>
  );
}

function ListaPorDescripcion({ renglones, total, onVerMas, abierta, onAbrir, conInventario, orden, vacio }: {
  renglones: RenglonDescripcion[]; total: number; onVerMas: () => void;
  abierta: string | null; onAbrir: (d: string) => void;
  conInventario: boolean; orden: OrdenTablaApi<ColOrden>; vacio: string;
}) {
  if (renglones.length === 0) {
    return <p className="rounded-lg border border-gray-200 bg-white px-3 py-8 text-center text-sm text-gray-500">{vacio}</p>;
  }
  return (
    <>
      {/* Computadora: la tabla. */}
      <div data-vista="tabla" className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
              <ThOrden col="descripcion" api={orden} className="px-3 py-2.5 font-normal">Descripción</ThOrden>
              <ThOrden col="unidades" api={orden} derecha className="px-3 py-2.5 font-normal">Unidades</ThOrden>
              <ThOrden col="venta" api={orden} derecha className="px-3 py-2.5 font-normal">Venta</ThOrden>
              <ThOrden col="margen" api={orden} derecha className="px-3 py-2.5 font-normal">Margen</ThOrden>
              {conInventario && <ThOrden col="stock" api={orden} derecha className="px-3 py-2.5 font-normal">Stock</ThOrden>}
            </tr>
          </thead>
          <tbody>
            {renglones.map(r => (
              <FilaDescripcion key={r.descripcion} r={r} abierta={abierta === r.descripcion} onAbrir={() => onAbrir(r.descripcion)} conInventario={conInventario} />
            ))}
          </tbody>
        </table>
      </div>
      {/* Celular: dos renglones por descripción. */}
      <ul data-vista="tarjetas" className="space-y-2 sm:hidden">
        {renglones.map(r => (
          <li key={r.descripcion} className="rounded-lg border border-gray-200 bg-white">
            <button type="button" onClick={() => onAbrir(r.descripcion)} aria-expanded={abierta === r.descripcion} className="flex min-h-[44px] w-full items-start gap-2 px-3 py-2.5 text-left">
              <ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform", abierta === r.descripcion && "rotate-90")} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] text-gray-900">{r.descripcion}</span>
                  <span className="shrink-0 text-[15px] tabular-nums text-gray-900">{fmtMoney(r.venta)}</span>
                </span>
                <span className="block text-xs text-gray-500">
                  {fmtU(r.unidades)} u · margen {fmtPorcentaje(r.margen)}
                  {conInventario && <> · stock {r.existencia == null ? "—" : fmtU(r.existencia)}</>}
                </span>
              </span>
            </button>
            {abierta === r.descripcion && (
              <ul data-articulos className="border-t border-gray-100">
                {r.articulos.map(a => (
                  <li key={a.codigo} className="flex items-center justify-between gap-2 px-3 py-2">
                    <NombreCodigo a={a} />
                    <span className="shrink-0 text-right text-xs text-gray-500">
                      <span className="block text-[13px] tabular-nums text-gray-900">{fmtMoney(a.venta)}</span>
                      {fmtU(a.unidades)} u{conInventario && <> · stock {a.existencia == null ? "—" : fmtU(a.existencia)}</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {total > renglones.length && (
        <button type="button" onClick={onVerMas} className="min-h-[44px] w-full rounded-lg border border-gray-200 bg-white text-sm text-blue-600 hover:text-blue-800">
          Ver más · {fmtU(total - renglones.length)} descripciones
        </button>
      )}
    </>
  );
}

function FilaDescripcion({ r, abierta, onAbrir, conInventario }: {
  r: RenglonDescripcion; abierta: boolean; onAbrir: () => void; conInventario: boolean;
}) {
  return (
    <>
      <tr onClick={onAbrir} className={cn("cursor-pointer border-b border-gray-100 hover:bg-gray-50", abierta && "bg-gray-50")} aria-expanded={abierta}>
        <td className="px-3 py-2.5 text-gray-900">
          <span className="flex items-center gap-1.5">
            <ChevronRight className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", abierta && "rotate-90")} />
            {r.descripcion}
            <span className="text-xs text-gray-400">{r.articulos.length}</span>
          </span>
        </td>
        <Cifras unidades={r.unidades} venta={r.venta} margen={r.margen} existencia={r.existencia} conInventario={conInventario} className="text-gray-900" />
      </tr>
      {abierta && r.articulos.map(a => {
        const t = totalesDe([a]);
        return (
          <tr key={a.codigo} data-articulo className="border-b border-gray-100 bg-gray-50/60">
            <td className="py-1.5 pl-10 pr-3"><NombreCodigo a={a} /></td>
            <Cifras unidades={a.unidades} venta={a.venta} margen={t.margen} existencia={a.existencia ?? null} conInventario={conInventario} className="py-1.5 text-gray-700" />
          </tr>
        );
      })}
    </>
  );
}
