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
// 🔴 VENDIDO · MESES reemplazan a "90% en" (12-ago-2026). Daniel: "va el 29%"
// no decía cuánto tiempo llevaba. Las DOS celdas salen de UNA función
// (`medirVendidoMeses`, la misma del Excel): terminado (cruzó el 90%) queda
// CONGELADO en 90% y los meses del cruce, en negro; vivo muestra el % actual
// (Vendí÷Compré) y los meses calendario desde la llegada, en gris; lo que no
// se puede afirmar dice "—". Acá no se calcula nada — solo se pinta.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useMemo, useState } from "react";
import { colorDe } from "@/lib/ventas/referencia";
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
function colsPedido(mostrarMargen: boolean): { titulo: string; px: number; derecha?: boolean }[] {
  return [
    { titulo: "Código", px: 210 },
    { titulo: "Compré", px: 72, derecha: true },
    { titulo: "Vendí", px: 72, derecha: true },
    { titulo: "Stock", px: 72, derecha: true },
    { titulo: "Vendido", px: 84, derecha: true },
    { titulo: "Meses", px: 64, derecha: true },
    ...(mostrarMargen ? [{ titulo: "Margen", px: 66, derecha: true }] : []),
    { titulo: "Últ. compra", px: 92, derecha: true },
    { titulo: "", px: 36 },
  ];
}

interface FilaPedido {
  art: ArticuloCompras;
  clave: string;
  color: string | null;
  vendido: string;
  meses: string;
  /** `false` = terminado (cruzó el 90%): negro. `true` = en curso: gris. */
  enCurso: boolean;
  margen: string;
  ultCompra: string;
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
    vendido: textoVendidoCelda(vm),
    meses: textoMesesCelda(vm),
    enCurso: !vm.terminado,
    margen: fmtPct(f.margen.margen),
    ultCompra: f.ultima ? fmtMesAnio(f.ultima.fecha.slice(0, 7)) : "—",
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
  const filas = useMemo(() => articulos.map((a) => armarFila(a, hoyMes)), [articulos, hoyMes]);
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
                          // text-xs y no menos: la letra no baja de 12 px (regla de la casa).
                          className={`whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600 ${c.derecha ? "text-right" : "text-left"}`}
                        >
                          {c.titulo}
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
  const g = f.art.cuadre;
  const quedan = f.art.existencia;
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
      <td className="px-3 py-2.5 text-right tabular-nums">
        {f.art.sinCompraRegistrada ? "—" : fmtInt(g.comprado)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(g.vendido)}</td>
      <td
        className={`px-3 py-2.5 text-right text-[15px] font-semibold tabular-nums ${
          quedan === 0 ? "text-red-700" : "text-gray-900"
        }`}
      >
        {quedan != null ? fmtInt(quedan) : "—"}
      </td>
      {/* Terminado va en NEGRO (dato cerrado); vivo en GRIS (en curso). */}
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
