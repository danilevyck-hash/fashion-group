"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA TARJETA de un artículo del tab Ventas › Referencia — y su CUERPO, que el
// modo pedido reusa dentro de la fila expandida (una sola verdad en pantalla).
//
// 🔴 LA JERARQUÍA LA CORRIGIÓ DANIEL (12-ago-2026), textual: *"el numero
// importante estan chiquito. cuanto compre es importante, cuanto vendi en total
// es importante… me queda 2 meses de venta / vendo 11u mes es lo que mas llama
// la atencion y no es lo mas importante ya que un mes puedo vender mucho y
// otros meses no, vendo b2b al por mayor no retail"*. La tarjeta quedó así:
//   1. LOS CUATRO GRANDES: **Compré · Vendí · Stock · Meses** (en grande).
//      Compré trae debajo la lista de compras aprobada (4 fechas + "y N más");
//      Vendí dice qué % de lo comprado es; Stock es `existencia` de Switch;
//      Meses es el tiempo de venta desde la llegada (el ancla del 90%).
//      ⚠️ NO SE FUERZA EL CUADRE entre los tres: los avisos de descuadre que ya
//      existen explican los huecos (ajuste, venta sin compra, robo).
//   2. LA LÍNEA DE VENTA — cuánto tiempo de venta y qué % va (la regla del 90%
//      SE FUE del módulo entero el 12-ago-2026 — Daniel: *"debe de ser cuanto
//      tiempo de venta tiene y % de la venta, asi en todo el modulo"*): "Se
//      vendió todo en 2 meses" (agotado) / "En 10 meses va el 80% de la
//      compra" (única viva) / el agregado rotulado cuando hay varias vivas.
//      El "vendo N u por mes" quedó de dato chiquito al final.
//   3. Las barras ANCLADAS A LA LLEGADA cuando hay una sola compra (con el
//      acumulado en verde debajo: compré 120, ¿en cuánto se me van?), o los
//      últimos 12 meses con cada llegada marcada con ▲ cuando hay varias.
//      Oct·nov·dic resaltados y la línea de temporada se conservan siempre.
//   4. La fila de plata AGRUPADA — *"precio prom y precio lista porque estan
//      separado"*: precios juntos | costos juntos | margen. Y la palabra
//      "(calculado)" se fue del rótulo del FOB (*"esta de mas"*) — el ⓘ explica
//      que es CIF ÷ 1,10.
//
// 🩸 LA CAJA DE COMPRAS DEJÓ DE INTERPRETAR (11-ago-2026). Decía *"Mi última
// compra · todavía no se acaba · llegó 180 el 19 feb · van 0"*, y ese "van 0"
// venía de repartir las ventas entre las compras (FIFO). Cuando llega mercancía
// SOBRE stock que todavía no se acaba, ese reparto es INVENTADO — nadie marcó
// las cajas. Ahora dice FECHA y CANTIDAD y él saca la conclusión.
//
// 🩸 LO QUE SE FUE, Y POR QUÉ NO VUELVE:
//   · Las cajas grandes "Vendo por mes" y "Me queda para" (12-ago-2026): eran
//     lo que más llamaba la atención y no es lo más importante.
//   · La tabla con UNA FILA POR COMPRA. *"la ultima me basta"*.
//   · La columna DESC. (descuento). Textual: *"no sirve"*.
//   · Los pies "Hay N compras más viejas de 3 años…" y "Lo que queda en bodega
//     es de Switch, al …".
//   · Y de antes: "Se te acaba en ~46 meses", "compra ~138 unidades", los
//     veredictos SE AGOTÓ / DESCONTINUADO y la pestaña "Varias · pegar lista".
//
// Toda la matemática viene de los módulos PUROS (@/lib/ventas/resumen-articulo,
// compras y referencia) — acá no se suma, no se divide y no se firma nada.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useMemo } from "react";
import { Ayuda } from "@/components/shared/Ayuda";
import { colorDe } from "@/lib/ventas/referencia";
import type { ArticuloCompras } from "@/lib/ventas/compras";
import {
  armarFicha,
  fmtFechaCorta,
  fmtMesCorto,
  leyendaLlegadas,
  pieGrandeMeses,
  subDesdeLlegada,
  textoCompra,
  textoLineaVenta,
  textoLlegadaAnterior,
  textoParteVendida,
  textoRestantes,
  textoSinMargen,
  tituloDesdeLlegada,
  valorGrandeMeses,
  type FichaArticulo,
  type ListaCompras,
  type MesBarra,
} from "@/lib/ventas/resumen-articulo";

// ─── Formato ─────────────────────────────────────────────────────────────────

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

/** Las cifras bajo las barras viven en una columna de ~28 px a 390. Con 12 px
 *  de letra (el piso de la casa) tres dígitos entran; cuatro no. Por eso desde
 *  mil se abrevia — abreviar es la única salida que NO baja el tamaño. */
function fmtBarra(n: number): string {
  if (n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${n < 0 ? "-" : ""}${(abs / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

const EMPRESAS: Record<string, string> = {
  vistana: "Vistana",
  fashion_wear: "Fashion Wear",
  fashion_shoes: "Fashion Shoes",
  active_shoes: "Active Shoes",
  active_wear: "Active Wear",
  joystep: "Joystep",
};

export function etiquetaEmpresa(k: string): string {
  return EMPRESAS[k] ?? k;
}

/** "1 unidad" / "3 unidades". Un "1 unidades" en una pantalla que Daniel mira
 *  todos los días se lee como descuido. */
function unidades(n: number): string {
  return `${fmtInt(n)} ${Math.abs(n) === 1 ? "unidad" : "unidades"}`;
}

// ─── La tarjeta y su cuerpo ──────────────────────────────────────────────────

export function TarjetaArticulo({
  art,
  hoyMes,
  mostrarMargen = true,
}: {
  art: ArticuloCompras;
  hoyMes: string;
  mostrarMargen?: boolean;
}) {
  const color = colorDe(art.codigo);

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-gray-200 px-3.5 py-3">
        <h4 className="font-mono text-sm font-semibold text-gray-900">{art.codigo}</h4>
        {color && <span className="text-xs text-gray-600">color {color}</span>}
        <span className="text-sm text-gray-700">{art.descripcion || "—"}</span>
        <span className="ml-auto text-xs text-gray-600">{etiquetaEmpresa(art.empresa)}</span>
      </header>
      <CuerpoArticulo art={art} hoyMes={hoyMes} mostrarMargen={mostrarMargen} />
    </section>
  );
}

/** El cuerpo entero de la tarjeta, SIN el encabezado. Es lo que el modo pedido
 *  muestra al expandir una fila: la MISMA vista, no un resumen distinto.
 *  `mostrarMargen=false` (vendedor/bodega — Daniel: *"quita margen, lo demas
 *  dejalo"*) esconde SOLO el margen; el resto no cambia. */
export function CuerpoArticulo({
  art,
  hoyMes,
  mostrarMargen = true,
}: {
  art: ArticuloCompras;
  hoyMes: string;
  mostrarMargen?: boolean;
}) {
  // 🔴 Hooks ANTES de cualquier return condicional (regla de React de la casa).
  const ficha = useMemo(() => armarFicha(art, hoyMes), [art, hoyMes]);

  return (
    <>
      <CuatroGrandes art={art} ficha={ficha} />
      <LineaVenta ficha={ficha} />
      <MesAMes ficha={ficha} hoyMes={hoyMes} />
      <FilaPlata art={art} ficha={ficha} mostrarMargen={mostrarMargen} />
      <Avisos art={art} />
    </>
  );
}

// ─── Los CUATRO GRANDES: Compré · Vendí · Stock · Meses ─────────────────────
//
// 🔴 LOS NÚMEROS QUE DECIDEN, EN GRANDE. Daniel (12-ago-2026), textual: *"que
// me diga cuanto tiempo lleva alado de los 3 kpi. deberia de ser: compre,
// vendi, stock, meses (de venta) y abajo u/mes"*. Y sobre el tercero: *"¿por
// qué 'me quedan' en vez de stock?"* — es SU palabra, así que la caja se llama
// Stock (el pie "en bodega" se queda). El u/mes vive abajo, en la línea
// secundaria, no como número grande.
//
// A 390 px van 2×2 (cuatro apilados alargan la tarjeta al doble); desde xl las
// cuatro en una fila. Debajo de Compré va la lista de compras que él aprobó.
//
// ⚠️ NO SE FUERZA EL CUADRE: `Compré − Vendí` no siempre da `Stock` (ajustes,
// ventas sin compra registrada, robos). Cada número dice su verdad y los
// avisos de abajo explican los huecos.

function CuatroGrandes({ art, ficha }: { art: ArticuloCompras; ficha: FichaArticulo }) {
  const g = ficha.grandes;
  const r = ficha.ritmo;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-4 px-3.5 py-4 xl:grid-cols-4">
      <Grande rotulo="Compré" valor={g.comprado != null ? fmtInt(g.comprado) : "—"} unidad={g.comprado != null}>
        <PieCompras art={art} lista={ficha.compras} />
      </Grande>
      <Grande rotulo="Vendí" valor={fmtInt(g.vendido)} unidad>
        <p className="text-xs text-gray-600">{pieDeVendido(art, g.parteVendida)}</p>
      </Grande>
      <Grande rotulo="Stock" valor={g.quedan != null ? fmtInt(g.quedan) : "—"} unidad={g.quedan != null}>
        <p className="text-xs text-gray-600">
          {g.quedan != null ? "en bodega" : "Switch no tiene este código en el catálogo"}
        </p>
      </Grande>
      <Grande rotulo="Meses" valor={valorGrandeMeses(r)}>
        <p className="text-xs text-gray-600">{pieGrandeMeses(r)}</p>
      </Grande>
    </dl>
  );
}

function Grande({
  rotulo,
  valor,
  unidad,
  children,
}: {
  rotulo: string;
  valor: string;
  unidad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-600">{rotulo}</dt>
      <dd className="mt-1 text-[34px] font-semibold leading-none tracking-tight text-gray-900 tabular-nums">
        {valor}
        {unidad && <span className="ml-1 text-lg font-normal text-gray-500">u</span>}
      </dd>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * El pie de Compré: la lista aprobada — `19 feb 2026 · 180 u`, una por línea,
 * hasta cuatro, y UNA línea gris `y N compras más` que NO se despliega. Con una
 * sola compra dice la fecha y "única compra" (la cantidad ya es el número
 * grande de arriba: repetirla sería ruido).
 *
 * 🔴 CERO INTERPRETACIÓN. No dice cuánto tardó, ni cuántas van, ni si se acabó:
 * nada de eso se sabe por compra.
 */
function PieCompras({ art, lista }: { art: ArticuloCompras; lista: ListaCompras }) {
  if (art.sinCompraRegistrada) {
    // El texto honesto de siempre: no se rellena con una adivinanza. Lo que
    // vendió ya lo dice el número grande de Vendí, al lado.
    return (
      <p className="text-xs text-gray-600">
        sin compra registrada — no aparece en los ingresos de mercancía, así que no se puede decir cuándo
        llegó ni cuánto llegó
      </p>
    );
  }
  if (lista.unica && lista.visibles[0]) {
    return <p className="text-xs text-gray-600">{fmtFechaCorta(lista.visibles[0].fecha)} · única compra</p>;
  }
  const restantes = textoRestantes(lista.restantes);
  return (
    <div>
      <ul className="text-sm leading-6 text-gray-900 tabular-nums">
        {lista.visibles.map((c) => (
          <li key={`${c.fecha}·${c.documento}`}>{textoCompra(c)}</li>
        ))}
      </ul>
      {restantes && <p className="text-xs text-gray-600">{restantes}</p>}
    </div>
  );
}

/** El subtítulo de Vendí: qué parte de lo comprado es. Cuando no hay porcentaje
 *  honesto que decir, se dice OTRA verdad — nunca un número inventado. */
function pieDeVendido(art: ArticuloCompras, parte: number | null): string {
  const texto = textoParteVendida(parte);
  if (texto) return texto;
  if (art.cuadre.vendido < 0) return "más devoluciones que ventas";
  if (art.cuadre.vendido === 0) return "sin ventas registradas";
  // Vendió pero no hay compras contra las cuales comparar.
  return "neto, con devoluciones restadas";
}

// ─── La línea de venta ───────────────────────────────────────────────────────
//
// 🔴 REEMPLAZA AL "VENDO POR MES" COMO PROTAGONISTA (12-ago-2026): cuánto
// tiempo de venta tiene y qué % va. El texto entero sale del módulo puro
// (`textoLineaVenta`) — acá no se arma ni media frase.
//
// 🔴 Cuando la bodega quedó en 0 y VOLVIÓ a llegar mercancía (2+ llegadas
// sobre bodega en 0), la protagonista es la frase de la ÚLTIMA llegada —
// redacción aprobada por Daniel, sin la palabra "tanda":
//
//   Llegaron 36 u en mar 2026 → va el 69% en 5 meses → me quedan 11 u
//
// y debajo, en gris, la historia: "La anterior (oct 2025): 36 u — se vendió
// toda en 2 meses" (+ "y N llegadas anteriores" si hubo más). Viva = gris (en
// curso); agotada = negro (cerrada), como en la tabla del modo pedido.

function LineaVenta({ ficha }: { ficha: FichaArticulo }) {
  const texto = textoLineaVenta(ficha.avance, ficha.ritmo, ficha.tandas);
  const anterior = textoLlegadaAnterior(ficha.tandas);
  if (!texto) return null;
  const cerrada = ficha.tandas != null && (ficha.tandas[ficha.tandas.length - 1]?.cerrada ?? false);
  return (
    <div className="border-t border-gray-100 px-3.5 py-2.5">
      <p className={`text-sm ${cerrada ? "font-medium text-gray-900" : "text-gray-700"}`}>{texto}</p>
      {anterior && <p className="mt-0.5 text-xs text-gray-500">{anterior}</p>}
    </div>
  );
}

// ─── Mes a mes ───────────────────────────────────────────────────────────────
//
// 🔴 CON UNA SOLA COMPRA las barras arrancan EL MES QUE LLEGÓ (mockup aprobado)
// y debajo corre el ACUMULADO en verde: compré 120, ¿en cuánto se me van?,
// contestado mes a mes. CON VARIAS se quedan los últimos 12 meses y cada
// llegada se marca con ▲ bajo su mes, con la leyenda al pie.
//
// El mes EN CURSO nunca se dibuja, y oct·nov·dic siguen resaltados. La línea de
// temporada usa SIEMPRE la ventana de 12 meses (ficha.temporada): es una frase
// sobre el año, no sobre la ventana que se esté dibujando.

function MesAMes({ ficha, hoyMes }: { ficha: FichaArticulo; hoyMes: string }) {
  const v = ficha.vista;
  const barras = v.barras;
  const pico = Math.max(1, ...barras.map((b) => Math.max(0, b.unidades)));
  const t = ficha.temporada;
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, barras.length)}, minmax(0, 1fr))` };
  const marcas = new Map(v.llegadas.map((l) => [l.mes, Math.min(l.cantidades.length, 3)]));
  const leyenda = leyendaLlegadas(v.llegadas);

  return (
    <div className="border-t border-gray-100 px-3.5 py-3">
      {v.modo === "desde-llegada" && v.llegada ? (
        <>
          <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-gray-600">
            {tituloDesdeLlegada(v.llegada)}
          </p>
          <p className="mb-2 text-xs text-gray-600">{subDesdeLlegada(v, hoyMes)}</p>
        </>
      ) : (
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-600">Mes a mes · unidades</p>
      )}

      <div className="grid items-end gap-[2px]" style={{ ...cols, height: 44 }} aria-hidden="true">
        {barras.map((b) => (
          <Barra key={b.mes} b={b} pico={pico} />
        ))}
      </div>

      <div className="mt-1 grid gap-[2px]" style={cols}>
        {barras.map((b) => (
          <span
            key={b.mes}
            className={`overflow-hidden text-center text-xs ${b.fuerte ? "font-semibold text-gray-900" : "text-gray-500"}`}
          >
            {fmtMesCorto(b.mes)}
          </span>
        ))}
      </div>

      {/* ▲ bajo su mes — la marca de cada llegada (solo con varias compras). */}
      {marcas.size > 0 && (
        <div className="grid gap-[2px]" style={cols} aria-hidden="true">
          {barras.map((b) => (
            <span key={b.mes} className="overflow-hidden text-center text-xs leading-4 text-emerald-700">
              {"▲".repeat(marcas.get(b.mes) ?? 0)}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-[2px]" style={cols}>
        {barras.map((b) => (
          <span
            key={b.mes}
            className="overflow-hidden text-center text-xs tabular-nums text-gray-900"
            title={`${b.mes}: ${fmtInt(b.unidades)} u`}
          >
            {b.antesDeEmpezar ? "" : fmtBarra(b.unidades)}
          </span>
        ))}
      </div>

      {/* El acumulado en verde: "a marzo ya llevaba 72". Solo desde la llegada. */}
      {v.acumulado && (
        <div className="mt-1 grid gap-[2px] border-t border-dashed border-gray-200 pt-1" style={cols}>
          {v.acumulado.map((a, i) => (
            <span
              key={barras[i]?.mes ?? i}
              className="overflow-hidden text-center text-xs tabular-nums text-emerald-700"
              title={`acumulado a ${barras[i]?.mes}: ${fmtInt(a)} u`}
            >
              {fmtBarra(a) === "—" ? "0" : fmtBarra(a)}
            </span>
          ))}
        </div>
      )}

      {leyenda && <p className="mt-2 text-xs text-emerald-800">{leyenda}</p>}

      <p className="mt-2 text-xs text-gray-600">
        {t.todaviaNoPaso
          ? "Todavía no ha pasado por su temporada fuerte (oct–dic)."
          : t.parte == null
            ? "No vendió nada en estos 12 meses."
            : t.unidades <= 0
              ? "Oct · nov · dic no vendieron nada."
              : `Oct · nov · dic fueron ${fmtInt(t.unidades)} unidades — el ${fmtPct(t.parte)} del año en tres meses.`}
      </p>
    </div>
  );
}

function Barra({ b, pico }: { b: MesBarra; pico: number }) {
  // Un mes anterior a su primera venta NO es un cero de venta: es un mes en el
  // que el artículo no estaba en la calle. Se dibuja distinto a propósito.
  if (b.antesDeEmpezar) {
    return <span className="block h-[2px] self-end rounded-sm bg-gray-100" />;
  }
  const alto = b.unidades > 0 ? Math.max(3, Math.round((b.unidades / pico) * 44)) : 3;
  return (
    <span
      className={`block rounded-t-sm ${b.unidades > 0 ? (b.fuerte ? "bg-gray-900" : "bg-gray-400") : "bg-gray-200"}`}
      style={{ height: alto }}
    />
  );
}

// ─── La fila de plata: UNA sola, agrupada con lógica ─────────────────────────
//
// 🔴 ES LA MITAD DE LA DECISIÓN. Daniel no compra si *"vendi a margen bajo o
// negativo"*. El precio de LISTA no es a lo que vendió: los descuentos se lo
// comen. Y desde el 12-ago-2026 la fila va AGRUPADA — Daniel: *"precio prom y
// precio lista porque estan separado"*:
//
//   Precio prom $26.92 · lista $27.00 | Costo CIF $16.56 · FOB $15.05 | margen 39%
//
// Los PRECIOS juntos (¿estoy descontando?), los COSTOS juntos (¿cuánto me
// cuesta?), el margen al final. Un grupo sin datos no deja un "|" colgado.
//
// 🩸 ERAN DOS FILAS Y REPETÍAN EL MISMO NÚMERO TRES VECES: "me costó", "CIF de
// hoy" y "FOB" decían $16.56 los tres (el FOB porque Switch lo manda igual al
// CIF en el 93% de las líneas). Daniel: *"me gusta pero no se siente simple,
// facil"*.
//
// 🔴 La palabra "(calculado)" SE FUE del rótulo del FOB — Daniel: *"la palabra
// calculado esta de mas"*. Sigue siendo una cuenta nuestra (CIF ÷ 1,10, nunca
// el FOB de Switch) y el ⓘ lo explica. El "(antes $…)" del CIF cuando cambió
// SE QUEDA, pegado al Costo CIF — es la señal de que te subieron el costo.

function FilaPlata({
  art,
  ficha,
  mostrarMargen,
}: {
  art: ArticuloCompras;
  ficha: FichaArticulo;
  mostrarMargen: boolean;
}) {
  const m = ficha.margen;
  const lista = ficha.ultima?.costos.lista ?? art.precioEtiqueta;
  const cambio = ficha.cambioCosto;

  const precios: React.ReactNode[] = [];
  if (m.precioReal != null) precios.push(<Plata key="prom" k="Precio prom" v={fmtMoney(m.precioReal)} />);
  if (lista != null) precios.push(<Plata key="lista" k="lista" v={fmtMoney(lista)} />);

  const costos: React.ReactNode[] = [];
  if (m.costo != null) {
    costos.push(
      <Plata
        key="cif"
        k="Costo CIF"
        v={fmtMoney(m.costo)}
        extra={
          cambio && (
            // 🔴 La señal de que te subieron el costo. Sin cambio no va nada.
            // El espacio va en el TEXTO (no solo en el margen) para que la fila
            // se lea igual copiada que en pantalla.
            <span className={`font-semibold ${cambio.subio ? "text-red-700" : "text-emerald-700"}`}>
              {" "}
              (antes {fmtMoney(cambio.anterior)} {cambio.subio ? "↑" : "↓"})
            </span>
          )
        }
      />,
    );
  }
  if (ficha.fobCalculado != null) {
    costos.push(<Plata key="fob" k="FOB" v={fmtMoney(ficha.fobCalculado)} />);
  }

  // 🔴 Daniel: *"quita margen, lo demas dejalo"* — para vendedor/bodega el
  // margen NO se dibuja (ni su "por qué no hay margen"). El resto queda igual.
  const margen: React.ReactNode[] = [];
  if (mostrarMargen && m.margen != null) {
    margen.push(<Plata key="margen" k="margen" v={fmtPct(m.margen)} rojo={m.margen < 0} />);
  }

  const grupos = [precios, costos, margen].filter((g) => g.length > 0);
  if (!grupos.length && !(mostrarMargen && m.motivo)) return null;

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-3.5 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        {grupos.map((g, gi) => (
          <Fragment key={gi}>
            {gi > 0 && (
              // El espacio va en el TEXTO para que la fila se lea igual copiada
              // que en pantalla — misma regla que el " · ".
              <span className="text-gray-300" aria-hidden="true">
                {" | "}
              </span>
            )}
            {g.map((p, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="text-gray-400"> · </span>}
                {p}
              </Fragment>
            ))}
          </Fragment>
        ))}
        <Ayuda titulo="De dónde salen estos números">
          <b>Precio prom</b> es la venta real dividida entre las unidades reales de los últimos{" "}
          {ficha.promedio.meses} {ficha.promedio.meses === 1 ? "mes completo" : "meses completos"} — con los
          descuentos ya adentro y las devoluciones (notas de crédito) ya restadas. El precio de lista no es a lo
          que vendiste: van juntos justamente para ver de un vistazo si estás descontando.
          {mostrarMargen && (
            <>
              <br />
              <br />
              <b>El margen se calcula contra el Costo CIF</b> de tu última compra, que es lo que costó de verdad
              poner la pieza en bodega (mercancía + flete + seguro).
            </>
          )}
          <br />
          <br />
          <b>El FOB es una cuenta, no un dato traído:</b> Costo CIF ÷ 1,10. El FOB que manda Switch llega
          igual al CIF en 93 de cada 100 líneas por un error de carga conocido, así que no distingue nada.
          <br />
          <br />
          Cuando la última compra costó distinto que la anterior, al lado del Costo CIF aparece{" "}
          <b>(antes $…)</b>. Si no cambió, no se muestra nada.
        </Ayuda>
      </div>
      {mostrarMargen && m.motivo && (
        <p className="mt-1 text-sm text-gray-700">{textoSinMargen(m.motivo, ficha.promedio.meses)}</p>
      )}
    </div>
  );
}

function Plata({
  k,
  v,
  extra,
  rojo,
}: {
  k: string;
  v: string;
  extra?: React.ReactNode;
  rojo?: boolean;
}) {
  return (
    <span className="text-gray-700">
      {k} <span className={`font-semibold tabular-nums ${rojo ? "text-red-700" : "text-gray-900"}`}>{v}</span>
      {extra}
    </span>
  );
}

// ─── Avisos del artículo ─────────────────────────────────────────────────────

/** Lo que NO cierra se DICE, en chico y sin alarmismo. Nada de esto es un
 *  veredicto: son huecos de los registros, y esconderlos haría creer que los
 *  números de arriba explican toda la vida del artículo. Son la válvula del
 *  "no se fuerza el cuadre" de los tres grandes. */
function Avisos({ art }: { art: ArticuloCompras }) {
  const avisos: string[] = [];
  // Con CERO compras registradas, la tarjeta ya dijo lo único que se puede
  // decir. Agregarle "se vendieron N antes de la primera compra" se contradice
  // con el renglón de arriba: no hay primera compra.
  if (!art.sinCompraRegistrada) {
    if (art.vendidoAntes > 0) {
      avisos.push(
        `Se vendieron ${unidades(art.vendidoAntes)} antes de la primera compra que tenemos registrada — falta una compra anterior, así que esa parte no está contada en ninguna fila.`,
      );
    }
    if (art.vendidoDeMas > 0) {
      avisos.push(
        `Se vendieron ${unidades(art.vendidoDeMas)} más de las que llegaron según los ingresos registrados.`,
      );
    }
    if (art.stockSinRespaldo > 0) {
      avisos.push(`Hay ${unidades(art.stockSinRespaldo)} en bodega que no salen de ninguna compra registrada.`);
    }
  }
  // 🔴 EL AJUSTE DE INVENTARIO SE QUEDA EN PANTALLA. Daniel: *"si hay menos es
  // porq robaron"* — es plata que se fue, no metodología, y no se esconde
  // detrás de un ⓘ. Va una vez por artículo, sumado: sale del CUADRE del
  // artículo entero (comprado − vendido − existencia), no de repartirle
  // faltantes a cada compra, que era la atribución que se eliminó.
  const perdido = art.cuadre.ajusteConfiable ? (art.cuadre.residuo ?? 0) : 0;
  if (perdido > 0) {
    avisos.push(
      `De las ${fmtInt(art.cuadre.comprado)} unidades que llegaron, ${fmtInt(perdido)} ${perdido === 1 ? "se perdió" : "se perdieron"} en ajuste de inventario.`,
    );
  }

  if (!avisos.length) return null;
  return (
    <div className="border-t border-gray-100 px-3.5 py-2">
      {avisos.map((a) => (
        <p key={a} className="text-xs text-gray-600">
          {a}
        </p>
      ))}
    </div>
  );
}
