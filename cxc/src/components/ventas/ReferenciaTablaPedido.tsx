"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MODO PEDIDO del tab Ventas › Referencia (mockup aprobado, 12-ago-2026).
//
// Daniel pega hasta 50 códigos cuando arma un pedido y escribe las cantidades
// en un Excel aparte. 50 tarjetas apiladas no sirven para escanear: con VARIOS
// códigos pegados sale UNA TABLA, una fila por color, EN EL ORDEN EN QUE LOS
// PEGÓ — para leerla con su Excel al lado. Un código solo sigue mostrando la
// tarjeta completa; la pantalla decide sola por lo que pegó.
//
//   Código · Compré · Vendí · Stock · Vendido · Meses · Margen · Últ. compra
//
// 🔴 TOCAR EL ENCABEZADO ORDENA (25-ago-2026), y es un OVERRIDE del orden
// pegado, no un reemplazo: 1er toque ordena · 2do invierte · 3ro devuelve el
// orden en que Daniel pegó los códigos, que es el default y el que le sirve
// para leer la tabla con su Excel al lado. La regla vive en
// `lib/ventas/referencia-orden.ts` y ordena por los valores que la fila YA
// calculó — acá no se vuelve a medir nada.
//   ⚠️ El "Bajar a Excel" sigue exportando el ORDEN PEGADO (`articulosOrdenados`
//   en `ReferenciaView`): es una decisión anterior y no se cambió de paso.
//
// 🔴 TOCAR UNA FILA ABRE EL DETALLE AHÍ MISMO, sin navegar y sin perder el
// orden de la lista. El detalle es el CUERPO REAL de la tarjeta
// (`CuerpoArticulo`) — no un resumen aparte que pueda decir otra cosa.
//
// 🔴 LA TABLA SCROLLEA ELLA SOLA si no cabe (overflow-x-auto); el body nunca.
// El detalle expandido va FUERA del scroller, a lo ancho de la pantalla: si
// viviera adentro, a 390 px habría que arrastrar de lado para leerlo. Por eso
// la tabla se parte en segmentos alrededor de la fila abierta, con `colgroup`
// de anchos FIJOS — sin eso, cada segmento calcularía sus columnas y quedarían
// desalineadas.
//
// 🔴 "Quedan 0" va en ROJO: es la fila que decide una compra.
//
// 🔴 COMPRÉ · VENDÍ · VENDIDO · MESES son de la ÚLTIMA LLEGADA cuando la bodega
// quedó en 0 y volvió a llegar mercancía — las MISMAS cifras que la ficha que se
// abre al tocar la fila (salen de `armarFicha`, no del cuadre crudo). STOCK es
// siempre la existencia real de bodega. Con una sola llegada en toda la historia
// no cambia nada: esa llegada ES el histórico.
//
// 🔴 VENDIDO · MESES reemplazan a "90% en" (12-ago-2026). Daniel: "va el 29%"
// no decía cuánto tiempo llevaba. Las DOS celdas salen de UNA función
// (`medirVendidoMeses`, la misma del Excel): VENDIDO es SIEMPRE el % real
// (Vendí÷Compré — Daniel cazó el "90%" congelado: *"como stock 0 y vendido
// 90%?"*); MESES es el tiempo de venta — hasta la última venta si está AGOTADO
// (cerrado ahí, negro) o desde la llegada hasta hoy si sigue vivo (gris); lo
// que no se puede afirmar dice "—". Acá no se calcula nada — solo se pinta.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { colorDe } from "@/lib/ventas/referencia";
import {
  ordenarFilas,
  siguienteOrden,
  type ColumnaPedido,
  type OrdenPedido,
  type ValoresOrden,
} from "@/lib/ventas/referencia-orden";
import type { ArticuloCompras } from "@/lib/ventas/compras";
import {
  armarFicha,
  fmtMesAnio,
  medirVendidoMeses,
  textoMesesCelda,
  textoVendidoCelda,
} from "@/lib/ventas/resumen-articulo";
import { CuerpoArticulo, etiquetaEmpresa, fmtInt, fmtPct } from "./ReferenciaTarjeta";

/** Anchos FIJOS por columna: los segmentos de tabla alrededor del detalle
 *  abierto tienen que quedar alineados entre sí. La suma es el min-width.
 *  "Stock" es la palabra de Daniel (*"¿por qué 'me quedan' en vez de
 *  stock?"*); la columna Margen NO existe para vendedor/bodega (*"quita
 *  margen, lo demas dejalo"*). */
function colsPedido(
  mostrarMargen: boolean,
): { titulo: string; px: number; derecha?: boolean; col?: ColumnaPedido }[] {
  return [
    { titulo: "Código", px: 210, col: "codigo" },
    { titulo: "Compré", px: 72, derecha: true, col: "compre" },
    { titulo: "Vendí", px: 72, derecha: true, col: "vendi" },
    { titulo: "Stock", px: 72, derecha: true, col: "stock" },
    { titulo: "Vendido", px: 84, derecha: true, col: "vendido" },
    { titulo: "Meses", px: 64, derecha: true, col: "meses" },
    ...(mostrarMargen ? [{ titulo: "Margen", px: 66, derecha: true, col: "margen" as ColumnaPedido }] : []),
    { titulo: "Últ. compra", px: 92, derecha: true, col: "ultima" },
    // El chevron no es una columna: no se ordena por él.
    { titulo: "", px: 36 },
  ];
}

interface FilaPedido {
  art: ArticuloCompras;
  clave: string;
  color: string | null;
  /** 🔴 De LOS GRANDES de la ficha, no del cuadre crudo: con varias llegadas
   *  sobre bodega en 0 son los de la ÚLTIMA, igual que la tarjeta que se abre
   *  al tocar la fila. */
  compre: string;
  vendi: string;
  /** La existencia REAL de bodega (nunca recortada a una llegada). */
  stock: number | null;
  vendido: string;
  meses: string;
  /** `false` = agotado (tiempo cerrado): negro. `true` = en curso: gris. */
  enCurso: boolean;
  margen: string;
  ultCompra: string;
  /** Los números que la fila YA calculó, para ordenar sin volver a medir. */
  valores: ValoresOrden;
}

function armarFila(art: ArticuloCompras, hoyMes: string): FilaPedido {
  // 🔴 La MISMA ficha de la tarjeta (`armarFicha`) — acá no se calcula nada
  // nuevo, solo se abrevia. Si la fila dijera otra cosa que el detalle que se
  // abre debajo, la tabla se desmentiría a sí misma.
  const f = armarFicha(art, hoyMes);
  const vm = medirVendidoMeses(f);
  return {
    art,
    clave: `${art.empresa}·${art.codigo}`,
    color: colorDe(art.codigo),
    compre: f.grandes.comprado != null ? fmtInt(f.grandes.comprado) : "—",
    vendi: fmtInt(f.grandes.vendido),
    stock: f.grandes.quedan,
    vendido: textoVendidoCelda(vm),
    meses: textoMesesCelda(vm),
    enCurso: !vm.terminado,
    margen: fmtPct(f.margen.margen),
    ultCompra: f.ultima ? fmtMesAnio(f.ultima.fecha.slice(0, 7)) : "—",
    // 🔑 Los MISMOS valores que se acaban de pintar. Ordenar no vuelve a medir.
    valores: {
      codigo: art.codigo,
      compre: f.grandes.comprado,
      vendi: f.grandes.vendido,
      stock: f.grandes.quedan,
      vendido: vm.parte,
      meses: vm.meses,
      margen: f.margen.margen,
      ultima: f.ultima?.fecha ?? null,
    },
  };
}

export function ReferenciaTablaPedido({
  articulos,
  hoyMes,
  mostrarMargen = true,
}: {
  articulos: ArticuloCompras[];
  hoyMes: string;
  mostrarMargen?: boolean;
}) {
  // Una sola fila abierta a la vez (acordeón): el detalle es la tarjeta entera
  // y dos abiertas a la vez vuelven la tabla una pila de tarjetas otra vez.
  const [abierta, setAbierta] = useState<string | null>(null);
  // 🔴 `null` = el ORDEN PEGADO, el default de siempre. El sort es un override.
  const [orden, setOrden] = useState<OrdenPedido>(null);
  const filasSinOrdenar = useMemo(() => articulos.map((a) => armarFila(a, hoyMes)), [articulos, hoyMes]);
  const filas = useMemo(
    () => ordenarFilas(filasSinOrdenar, orden, (f) => f.valores),
    [filasSinOrdenar, orden],
  );
  const COLS = useMemo(() => colsPedido(mostrarMargen), [mostrarMargen]);
  const ANCHO_MIN = COLS.reduce((s, c) => s + c.px, 0);

  // La tabla se parte en segmentos alrededor de la fila abierta para que el
  // detalle quede FUERA del scroller horizontal.
  const segmentos: { filas: FilaPedido[]; detalle: FilaPedido | null }[] = [];
  let actual: FilaPedido[] = [];
  for (const f of filas) {
    actual.push(f);
    if (f.clave === abierta) {
      segmentos.push({ filas: actual, detalle: f });
      actual = [];
    }
  }
  segmentos.push({ filas: actual, detalle: null });

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {segmentos.map((seg, si) => (
        <Fragment key={si}>
          {seg.filas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm" style={{ minWidth: ANCHO_MIN }}>
                <colgroup>
                  {COLS.map((c) => (
                    <col key={c.titulo || "chevron"} style={{ width: c.px }} />
                  ))}
                </colgroup>
                {si === 0 && (
                  <thead>
                    <tr className="border-b border-gray-200">
                      {COLS.map((c) => (
                        <th
                          key={c.titulo || "chevron"}
                          aria-sort={
                            c.col == null || orden?.col !== c.col
                              ? "none"
                              : orden.dir === "asc"
                                ? "ascending"
                                : "descending"
                          }
                          // text-xs y no menos: la letra no baja de 12 px (regla de la casa).
                          className={`whitespace-nowrap p-0 text-xs font-semibold uppercase tracking-wide text-gray-600 ${c.derecha ? "text-right" : "text-left"}`}
                        >
                          {c.col ? (
                            <button
                              type="button"
                              onClick={() => setOrden((o) => siguienteOrden(o, c.col!))}
                              title={
                                orden?.col === c.col
                                  ? orden.dir === (c.col === "codigo" ? "asc" : "desc")
                                    ? "Tocar de nuevo lo invierte"
                                    : "Tocar de nuevo vuelve al orden en que los pegaste"
                                  : `Ordenar por ${c.titulo}`
                              }
                              // min-h-[44px]: el encabezado acá no es un rótulo,
                              // es el BOTÓN de ordenar, y esta tabla se usa en
                              // el iPad con dedo.
                              className={`flex min-h-[44px] w-full items-center gap-1 px-3 py-2.5 uppercase transition hover:text-gray-900 ${
                                c.derecha ? "justify-end" : "justify-start"
                              } ${orden?.col === c.col ? "text-gray-900" : ""}`}
                            >
                              {c.titulo}
                              {orden?.col === c.col &&
                                (orden.dir === "asc" ? (
                                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <ArrowDown className="h-3 w-3" aria-hidden="true" />
                                ))}
                            </button>
                          ) : (
                            <span className="block px-3 py-2.5">{c.titulo}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {seg.filas.map((f) => (
                    <FilaTabla
                      key={f.clave}
                      f={f}
                      abierta={f.clave === abierta}
                      mostrarMargen={mostrarMargen}
                      onToggle={() => setAbierta(f.clave === abierta ? null : f.clave)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {seg.detalle && (
            <div className="border-b border-gray-200 bg-emerald-50/40">
              <CuerpoArticulo art={seg.detalle.art} hoyMes={hoyMes} mostrarMargen={mostrarMargen} />
            </div>
          )}
        </Fragment>
      ))}
    </section>
  );
}

function FilaTabla({
  f,
  abierta,
  mostrarMargen,
  onToggle,
}: {
  f: FilaPedido;
  abierta: boolean;
  mostrarMargen: boolean;
  onToggle: () => void;
}) {
  const quedan = f.stock;
  return (
    <tr
      onClick={onToggle}
      aria-expanded={abierta}
      className={`cursor-pointer border-b border-gray-100 last:border-b-0 ${abierta ? "bg-emerald-50/40" : "hover:bg-gray-50"}`}
    >
      <td className="px-3 py-2.5 align-top">
        <span className="block truncate font-mono text-[13px] font-semibold text-gray-900">{f.art.codigo}</span>
        <span className="block truncate text-xs text-gray-600">
          {f.art.descripcion || "—"}
          {f.color ? ` · ${f.color}` : ""} · {etiquetaEmpresa(f.art.empresa)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{f.compre}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{f.vendi}</td>
      <td
        className={`px-3 py-2.5 text-right text-[15px] font-semibold tabular-nums ${
          quedan === 0 ? "text-red-700" : "text-gray-900"
        }`}
      >
        {quedan != null ? fmtInt(quedan) : "—"}
      </td>
      {/* Agotado va en NEGRO (tiempo cerrado); vivo en GRIS (en curso). */}
      <td
        className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${
          f.enCurso ? "text-gray-500" : "text-gray-900"
        }`}
      >
        {f.vendido}
      </td>
      <td
        className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${
          f.enCurso ? "text-gray-500" : "text-gray-900"
        }`}
      >
        {f.meses}
      </td>
      {mostrarMargen && <td className="px-3 py-2.5 text-right tabular-nums">{f.margen}</td>}
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{f.ultCompra}</td>
      <td className="px-3 py-2.5 text-right text-gray-500" aria-hidden="true">
        {abierta ? "⌄" : "›"}
      </td>
    </tr>
  );
}
