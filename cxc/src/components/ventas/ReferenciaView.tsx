"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tab "Referencia" de /ventas (solo admin — el guard real es el SSR de la
// página + requireRole en el API; esta vista es solo la cara).
//
// 🔴 LA ESPECIFICACIÓN ES UNA FRASE DE DANIEL, y la pantalla no muestra nada más:
//   *"yo lo que quiero ver en cuanto tiempo se me mueve el articulo, para saber
//    si con el stock actual que tengo debo de comprar mas, menos o no comprar.
//    pero no quiero que decidas tu, lo decido yo con la data que me extraigas"*
// Tres cajas por artículo (color) — Compras · Vendo por mes · Me queda para —,
// las barras de los 12 meses completos con oct·nov·dic resaltados, y UNA fila de
// plata. Se usa PARA HACER PEDIDO: mira, decide y escribe la cantidad en su
// Excel.
//
// 🩸 LA PLATA ERA DOS FILAS Y EL MISMO NÚMERO SALÍA TRES VECES (11-ago-2026, de
// noche). "me costó", "CIF de hoy" y "FOB" decían los tres $16.56 en el artículo
// que Daniel más mira — el FOB porque Switch lo manda IGUAL al CIF en el 93% de
// las líneas. Daniel: *"me gusta pero no se siente simple, facil"*. Quedó una
// sola fila, el FOB pasó a ser CALCULADO (CIF ÷ 1,10, su fórmula) y rotulado
// como tal, y el CIF de la compra anterior aparece SOLO cuando cambió.
//
// 🩸 Y SE FUERON LOS DOS PIES DE PÁGINA: "Hay N compras más viejas de 3 años…"
// (la caja de Compras ya dice "y N compras más", y el total de bodega no sale de
// las compras sino de `existencia` de Switch) y "Lo que queda en bodega es de
// Switch, al …" (una hora que no cambia ninguna decisión).
//
// 🩸 LA PRIMERA CAJA DEJÓ DE INTERPRETAR (11-ago-2026). Decía *"Mi última
// compra · todavía no se acaba · llegó 180 el 19 feb · van 0"*, y ese "van 0"
// venía de repartir las ventas entre las compras. Cuando llega mercancía SOBRE
// stock que todavía no se acaba, ese reparto es INVENTADO —nadie marcó las
// cajas— y en `NB2570001`, el artículo que Daniel más mira, la caja terminaba
// diciendo literalmente **"van 0 de 180"** mientras el artículo vendía 28 u/mes.
// Ahora dice FECHA y CANTIDAD, la más reciente arriba, y él saca la conclusión.
// La línea "Esta: … · Anterior: …" se fue por lo mismo.
//
// 🩸 LO QUE SE FUE ANTES, Y POR QUÉ NO VUELVE:
//   · La tabla con UNA FILA POR COMPRA. *"la ultima me basta"*.
//   · La línea "En bodega 345 u · Ya se acabaron 2 compras…".
//   · La columna DESC. (descuento). Textual: *"no sirve"*.
//   · Y de antes: "Se te acaba en ~46 meses", "compra ~138 unidades", los
//     veredictos SE AGOTÓ / DESCONTINUADO y la pestaña "Varias · pegar lista".
//
// 🔴 LO QUE ENTRÓ, Y ES LA MITAD DE SU DECISIÓN: el PRECIO REAL DE VENTA y el
// MARGEN. Daniel no compra si *"vendi a margen bajo o negativo"*, y ese número
// no existía: la pantalla mostraba el precio de LISTA, que no es a lo que
// vendió (los descuentos se lo comen). El precio real sale de
// `venta_total ÷ cantidad_total` con las NC restadas; el margen, contra el CIF.
//
// Toda la matemática viene de los módulos PUROS (@/lib/ventas/resumen-articulo,
// compras y referencia) — acá no se suma, no se divide y no se firma nada.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Ayuda } from "@/components/shared/Ayuda";
import { Download, Search } from "lucide-react";
import { fetchJsonWithRetry, describeFetchError } from "@/lib/fetch-retry";
import { colorDe, modeloDe, MAX_CODIGOS_MULTI } from "@/lib/ventas/referencia";
import type { ArticuloCompras, ComprasApiResp } from "@/lib/ventas/compras";
import {
  armarFicha,
  fmtMesCorto,
  textoCompra,
  textoMeses,
  textoRestantes,
  textoSinMargen,
  MESES_VENTANA,
  type FichaArticulo,
  type ListaCompras,
  type MesBarra,
} from "@/lib/ventas/resumen-articulo";
import { exportComprasToExcel } from "@/lib/ventas/referencia-excel";

// ─── Formato ─────────────────────────────────────────────────────────────────

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number | null | undefined): string {
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

function etiquetaEmpresa(k: string): string {
  return EMPRESAS[k] ?? k;
}

/** "1 unidad" / "3 unidades". Un "1 unidades" en una pantalla que Daniel mira
 *  todos los días se lee como descuido. */
function unidades(n: number): string {
  return `${fmtInt(n)} ${Math.abs(n) === 1 ? "unidad" : "unidades"}`;
}

// ─── Vista ───────────────────────────────────────────────────────────────────

export function ReferenciaView() {
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<ComprasApiResp | null>(null);

  const buscar = async (q: string) => {
    const query = q.trim();
    if (query.length < 3) {
      setError("Escribe al menos 3 caracteres.");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setResp(await fetchJsonWithRetry<ComprasApiResp>(`/api/ventas/referencia?q=${encodeURIComponent(query)}`));
    } catch (err) {
      setError(describeFetchError(err));
    } finally {
      setCargando(false);
    }
  };

  // Los colores de un mismo modelo se muestran juntos: Daniel ve POR COLOR,
  // pero compara contra los hermanos del mismo modelo.
  const porModelo = useMemo(() => {
    const arts = resp?.articulos ?? [];
    const grupos = new Map<string, ArticuloCompras[]>();
    for (const a of arts) {
      const m = modeloDe(a.codigo);
      grupos.set(m, [...(grupos.get(m) ?? []), a]);
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [resp]);

  const hayResultados = (resp?.articulos.length ?? 0) > 0;

  return (
    <div>
      <form
        className="rounded-xl border border-gray-200 bg-white p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(texto);
        }}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Código, modelo o descripción — podés pegar varios"
            aria-label="Buscar referencia"
            className="min-h-[44px] flex-1 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-gray-900"
          />
          <Button type="submit" disabled={cargando} className="min-h-[44px] shrink-0">
            <Search className="mr-1.5 h-4 w-4" />
            {cargando ? "Buscando…" : "Buscar"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Un código trae todos sus colores. Podés pegar hasta {MAX_CODIGOS_MULTI} códigos juntos, separados por
          espacios, comas o uno por línea.
        </p>
      </form>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {resp?.comprasDisponibles === false && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Todavía no están cargados los ingresos de mercancía, así que no se puede decir qué llegó ni cuándo. Las
          ventas de abajo sí son reales.
        </p>
      )}

      {resp?.coincidencias && resp.coincidencias.length > 0 && (
        <Coincidencias
          items={resp.coincidencias}
          onElegir={(modelo) => {
            setTexto(modelo);
            void buscar(modelo);
          }}
        />
      )}

      {resp && resp.noEncontrados.length > 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          No encontré {resp.noEncontrados.length === 1 ? "el código" : "los códigos"}{" "}
          <span className="font-medium">{resp.noEncontrados.join(", ")}</span> — ni en ventas ni en compras.
        </p>
      )}

      {hayResultados && (
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => void exportComprasToExcel(resp!.articulos, resp!.hoyMes)}
          >
            <Download className="mr-1.5 h-4 w-4" /> Bajar a Excel
          </Button>
        </div>
      )}

      {porModelo.map(([modelo, arts]) => (
        <div key={modelo} className="mt-4">
          {/* "N colores" se cuenta por CÓDIGO distinto, no por tarjeta: el
              mismo código puede aparecer en varias empresas y llamarle color a
              eso sería contar empresas. */}
          {arts.length > 1 && <TituloModelo modelo={modelo} arts={arts} />}
          <div className="space-y-4">
            {arts.map((a) => (
              <TarjetaArticulo key={`${a.empresa}·${a.codigo}`} art={a} hoyMes={resp!.hoyMes} />
            ))}
          </div>
        </div>
      ))}

      {resp && !hayResultados && !resp.coincidencias?.length && resp.noEncontrados.length === 0 && (
        <p className="mt-4 text-sm text-gray-600">No hay nada con eso.</p>
      )}
    </div>
  );
}

function TituloModelo({ modelo, arts }: { modelo: string; arts: ArticuloCompras[] }) {
  const colores = new Set(arts.map((a) => a.codigo)).size;
  const empresas = new Set(arts.map((a) => a.empresa)).size;
  return (
    <h3 className="mb-2 text-sm font-semibold text-gray-900">
      Modelo {modelo}
      {colores > 1 && ` · ${colores} colores`}
      {empresas > 1 && ` · en ${empresas} empresas`}
    </h3>
  );
}

// ─── Un artículo ─────────────────────────────────────────────────────────────

function TarjetaArticulo({ art, hoyMes }: { art: ArticuloCompras; hoyMes: string }) {
  // 🔴 Hooks ANTES de cualquier return condicional (regla de React de la casa).
  const ficha = useMemo(() => armarFicha(art, hoyMes), [art, hoyMes]);

  const color = colorDe(art.codigo);

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-gray-200 px-3.5 py-3">
        <h4 className="font-mono text-sm font-semibold text-gray-900">{art.codigo}</h4>
        {color && <span className="text-xs text-gray-600">color {color}</span>}
        <span className="text-sm text-gray-700">{art.descripcion || "—"}</span>
        <span className="ml-auto text-xs text-gray-600">{etiquetaEmpresa(art.empresa)}</span>
      </header>

      <TresNumeros art={art} ficha={ficha} />

      <MesAMes ficha={ficha} />

      <FilaPlata art={art} ficha={ficha} />

      <Avisos art={art} />
    </section>
  );
}

// ─── Las tres cajas ──────────────────────────────────────────────────────────
//
// 🔴 LA PRIMERA CAJA NO CONCLUYE NADA: fecha y cantidad, la más reciente
// arriba. Antes decía "Mi última compra: todavía no se acaba · van 0 de 180",
// que salía de repartirle ventas a una llegada concreta — algo que NO se sabe
// cuando la mercancía llega sobre stock que todavía no se acaba.

function TresNumeros({ art, ficha }: { art: ArticuloCompras; ficha: FichaArticulo }) {
  if (!ficha.ultima) {
    return (
      <div className="px-3.5 py-4">
        <p className="text-sm text-gray-900">No hay ninguna compra registrada de este código.</p>
        <p className="mt-1 text-xs text-gray-600">
          {art.cuadre.vendido > 0
            ? `Vendió ${unidades(art.cuadre.vendido)}, pero`
            : art.cuadre.vendido < 0
              ? // Neto negativo = puras devoluciones. Decir "vendió −22" no es
                // castellano y encima suena a error de la pantalla.
                `Tiene ${unidades(-art.cuadre.vendido)} devueltas y ninguna venta, y`
              : "No registra ventas, y"}{" "}
          no aparece en los ingresos de mercancía, así que no se puede decir cuándo llegó ni cuánto llegó.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Numero
            rotulo="Vendo por mes"
            valor={ficha.promedio.porMes != null ? `${fmtInt(Math.round(ficha.promedio.porMes))} u` : "—"}
            pie={pieDelPromedio(ficha)}
          />
          <Numero
            rotulo="Me queda para"
            valor={ficha.alcance != null ? textoMeses(ficha.alcance) : "—"}
            pie={art.existencia != null ? `${fmtInt(art.existencia)} en bodega` : "sin existencia en Switch"}
          />
        </dl>
      </div>
    );
  }

  return (
    <dl className="grid gap-3 px-3.5 py-3.5 sm:grid-cols-3">
      <CajaCompras lista={ficha.compras} />
      <Numero
        rotulo="Vendo por mes"
        valor={ficha.promedio.porMes != null ? `${fmtInt(Math.round(ficha.promedio.porMes))} u` : "no vendió"}
        pie={pieDelPromedio(ficha)}
      />
      <Numero
        rotulo="Me queda para"
        // Con la bodega en cero, "menos de 1 mes" se lee como que todavía queda
        // algo. No queda nada, y eso se dice con una palabra.
        valor={ficha.alcance === 0 ? "nada" : ficha.alcance != null ? textoMeses(ficha.alcance) : "—"}
        pie={
          art.existencia != null
            ? `${fmtInt(art.existencia)} en bodega`
            : "Switch no tiene este código en el catálogo"
        }
      />
    </dl>
  );
}

/**
 * La caja de Compras: `19 feb 2026 · 180 u`, una por línea. Cuatro.
 *
 * 🔴 CERO INTERPRETACIÓN. No dice cuánto tardó, ni cuántas van, ni si se acabó:
 * nada de eso se sabe por compra.
 *
 * 🔴 Y NO SE DESPLIEGA. Antes había un botón "Ver las otras N compras" y, debajo,
 * un texto "y 2 más de hace años" — dos renglones para la misma idea, separados
 * por un detalle NUESTRO (unas venían en el payload y otras no). Ahora es UNA
 * línea gris: `y 3 compras más`. Daniel eligió ver cuatro; el resto es contexto,
 * no algo para abrir.
 */
function CajaCompras({ lista }: { lista: ListaCompras }) {
  const restantes = textoRestantes(lista.restantes);

  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-600">Compras</dt>
      <dd className="mt-0.5">
        <ul className="text-sm leading-6 text-gray-900 tabular-nums">
          {lista.visibles.map((c) => (
            <li key={`${c.fecha}·${c.documento}`}>{textoCompra(c)}</li>
          ))}
        </ul>
        {restantes && <p className="text-xs text-gray-600">{restantes}</p>}
        {lista.unica && <p className="text-xs text-gray-600">única compra</p>}
      </dd>
    </div>
  );
}

/** El pie del promedio DICE entre cuántos meses se dividió. Sin eso, un artículo
 *  que llegó en diciembre parecería vender la mitad de lo que vende. */
function pieDelPromedio(ficha: FichaArticulo): string {
  if (ficha.promedio.meses === 0) return "todavía no se vendía en estos meses";
  if (ficha.promedio.desdeQueEmpezo) {
    return `promedio desde que empezó a venderse · ${ficha.promedio.meses} ${ficha.promedio.meses === 1 ? "mes" : "meses"}`;
  }
  return `promedio de los últimos ${MESES_VENTANA} meses`;
}

function Numero({ rotulo, valor, pie }: { rotulo: string; valor: string; pie: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-600">{rotulo}</dt>
      <dd className="mt-0.5 text-xl font-semibold leading-tight tracking-tight text-gray-900 tabular-nums">
        {valor}
      </dd>
      <p className="mt-0.5 text-xs text-gray-600">{pie}</p>
    </div>
  );
}

// ─── Mes a mes ───────────────────────────────────────────────────────────────
//
// 🔴 SIEMPRE LOS 12 MESES COMPLETOS, aunque el artículo sea nuevo: si se
// recortaran, oct·nov·dic cambiarían de lugar de un artículo a otro y dejarían
// de servir para comparar de un vistazo. El mes EN CURSO nunca entra.

function MesAMes({ ficha }: { ficha: FichaArticulo }) {
  const pico = Math.max(1, ...ficha.barras.map((b) => Math.max(0, b.unidades)));
  const t = ficha.temporada;

  return (
    <div className="border-t border-gray-100 px-3.5 py-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-600">Mes a mes · unidades</p>

      <div className="grid grid-cols-12 items-end gap-[2px]" style={{ height: 44 }} aria-hidden="true">
        {ficha.barras.map((b) => (
          <Barra key={b.mes} b={b} pico={pico} />
        ))}
      </div>

      <div className="mt-1 grid grid-cols-12 gap-[2px]">
        {ficha.barras.map((b) => (
          <span
            key={b.mes}
            className={`overflow-hidden text-center text-xs ${b.fuerte ? "font-semibold text-gray-900" : "text-gray-500"}`}
          >
            {fmtMesCorto(b.mes)}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-[2px]">
        {ficha.barras.map((b) => (
          <span
            key={b.mes}
            className="overflow-hidden text-center text-xs tabular-nums text-gray-900"
            title={`${b.mes}: ${fmtInt(b.unidades)} u`}
          >
            {b.antesDeEmpezar ? "" : fmtBarra(b.unidades)}
          </span>
        ))}
      </div>

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

// ─── La fila de plata: UNA sola ──────────────────────────────────────────────
//
// 🔴 ES LA MITAD DE LA DECISIÓN. Daniel no compra si *"vendi a margen bajo o
// negativo"*. El precio de LISTA no es a lo que vendió: los descuentos se lo
// comen. Acá va lo que salió DE VERDAD, y todo en un renglón:
//
//   Precio prom $26.92 · Costo CIF $16.56 · Costo FOB $15.05 · margen 39% · lista $27.00
//
// 🩸 ERAN DOS FILAS Y REPETÍAN EL MISMO NÚMERO TRES VECES: "me costó", "CIF de
// hoy" y "FOB" decían $16.56 los tres (el FOB porque Switch lo manda igual al
// CIF en el 93% de las líneas). Daniel: *"me gusta pero no se siente simple,
// facil"*. El "CIF de hoy" se fue por duplicado; el FOB pasó a ser CALCULADO
// (CIF ÷ 1,10, su fórmula) y ROTULADO como tal; el "CIF de la compra anterior",
// que era una columna fija repitiendo casi siempre el mismo número, aparece
// pegado al costo SOLO cuando cambió — que es cuando dice algo.

function FilaPlata({ art, ficha }: { art: ArticuloCompras; ficha: FichaArticulo }) {
  const m = ficha.margen;
  const lista = ficha.ultima?.costos.lista ?? art.precioEtiqueta;
  const cambio = ficha.cambioCosto;

  const partes: React.ReactNode[] = [];
  if (m.precioReal != null) partes.push(<Plata key="prom" k="Precio prom" v={fmtMoney(m.precioReal)} />);
  if (m.costo != null) {
    partes.push(
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
    partes.push(<Plata key="fob" k="Costo FOB (calculado)" v={fmtMoney(ficha.fobCalculado)} />);
  }
  if (m.margen != null) {
    partes.push(
      <Plata key="margen" k="margen" v={fmtPct(m.margen)} rojo={m.margen < 0} />,
    );
  }
  if (lista != null) partes.push(<Plata key="lista" k="lista" v={fmtMoney(lista)} />);

  if (!partes.length && !m.motivo) return null;

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-3.5 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        {partes.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="text-gray-400"> · </span>}
            {p}
          </Fragment>
        ))}
        <Ayuda titulo="De dónde salen estos números">
          <b>Precio prom</b> es la venta real dividida entre las unidades reales de los últimos{" "}
          {ficha.promedio.meses} {ficha.promedio.meses === 1 ? "mes completo" : "meses completos"} — con los
          descuentos ya adentro y las devoluciones (notas de crédito) ya restadas. El precio de lista no es a lo
          que vendiste.
          <br />
          <br />
          <b>El margen se calcula contra el Costo CIF</b> de tu última compra, que es lo que costó de verdad poner
          la pieza en bodega (mercancía + flete + seguro).
          <br />
          <br />
          <b>El Costo FOB es una cuenta, no un dato traído:</b> Costo CIF ÷ 1,10. El FOB que manda Switch llega
          igual al CIF en 93 de cada 100 líneas por un error de carga conocido, así que no distingue nada.
          <br />
          <br />
          Cuando la última compra costó distinto que la anterior, al lado del Costo CIF aparece{" "}
          <b>(antes $…)</b>. Si no cambió, no se muestra nada.
        </Ayuda>
      </div>
      {m.motivo && (
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
 *  números de arriba explican toda la vida del artículo. */
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
  // 🩸 ACÁ VIVÍA "Hay N compras más viejas de 3 años que no se muestran — lo que
  // trajeron sí cuenta para lo que hay en bodega". Se fue el 11-ago-2026 porque
  // la caja de Compras YA lo dice con "y N compras más", y porque el total de
  // bodega NO depende de las compras que se ven: sale de `existencia` del
  // catálogo de Switch, medido tal cual. Explicar una cuenta que la pantalla no
  // hace era una nota al pie que nadie necesitaba.
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

// ─── Coincidencias por descripción ───────────────────────────────────────────

function Coincidencias({
  items,
  onElegir,
}: {
  items: { modelo: string; descripcion: string; empresa: string; colores: number }[];
  onElegir: (modelo: string) => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3.5">
      <p className="mb-2 text-sm text-gray-700">Elegí el modelo:</p>
      <div className="flex flex-col gap-1.5">
        {items.map((c) => (
          <button
            key={`${c.empresa}·${c.modelo}`}
            onClick={() => onElegir(c.modelo)}
            className="flex min-h-[44px] items-center gap-2 rounded-md border border-gray-200 px-3 text-left text-sm hover:border-gray-400 active:scale-[0.99]"
          >
            <span className="font-mono font-medium text-gray-900">{c.modelo}</span>
            <span className="text-gray-700">{c.descripcion || "—"}</span>
            <span className="ml-auto shrink-0 text-xs text-gray-600">
              {c.colores} {c.colores === 1 ? "color" : "colores"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Reexport para que el texto tenga una sola definición.
export { textoMeses };
