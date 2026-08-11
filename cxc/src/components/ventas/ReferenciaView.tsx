"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tab "Referencia" de /ventas (solo admin — el guard real es el SSR de la
// página + requireRole en el API; esta vista es solo la cara).
//
// 🔴 LA ESPECIFICACIÓN ES UNA FRASE DE DANIEL, y la pantalla no muestra nada más:
//   *"cuánto tiempo demoré en vender mi compra, cuánto por mes, para cuántos
//    meses me queda el stock actual"*
// Tres números grandes por artículo (color), las barras de los 12 meses
// completos con oct·nov·dic resaltados, el precio real de venta con su margen, y
// la fila de costos. Se usa PARA HACER PEDIDO: mira, decide y escribe la
// cantidad en su Excel.
//
// 🩸 LO QUE SE FUE EN ESTA PODA, Y POR QUÉ NO VUELVE:
//   · La tabla con UNA FILA POR COMPRA. *"la ultima me basta"* — las viejas
//     quedan detrás de "Ver las N compras anteriores".
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

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Ayuda } from "@/components/shared/Ayuda";
import { Download, Search } from "lucide-react";
import { fetchJsonWithRetry, describeFetchError } from "@/lib/fetch-retry";
import { colorDe, modeloDe, MAX_CODIGOS_MULTI } from "@/lib/ventas/referencia";
import type { ArticuloCompras, CompraMedida, ComprasApiResp } from "@/lib/ventas/compras";
import {
  armarFicha,
  fmtFechaCorta,
  fmtMesCorto,
  resumirCompra,
  textoSinMargen,
  MESES_VENTANA,
  type FichaArticulo,
  type MesBarra,
} from "@/lib/ventas/resumen-articulo";
import {
  exportComprasToExcel,
  mesesDeCompra,
  textoMeses,
  textoOrigenFob,
  textoSeVendio,
} from "@/lib/ventas/referencia-excel";
import { fmtFrescura } from "@/lib/ventas/referencia-info";

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
  const [verViejas, setVerViejas] = useState(false);
  const ficha = useMemo(() => armarFicha(art, hoyMes), [art, hoyMes]);

  const color = colorDe(art.codigo);
  const frescura = art.catalogoSyncedAt ? fmtFrescura(art.catalogoSyncedAt) : null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-gray-200 px-3.5 py-3">
        <h4 className="font-mono text-sm font-semibold text-gray-900">{art.codigo}</h4>
        {color && <span className="text-xs text-gray-600">color {color}</span>}
        <span className="text-sm text-gray-700">{art.descripcion || "—"}</span>
        <span className="ml-auto text-xs text-gray-600">{etiquetaEmpresa(art.empresa)}</span>
      </header>

      <TresNumeros art={art} ficha={ficha} />

      {ficha.comparacion && (
        <p className="border-b border-gray-100 px-3.5 py-2 text-xs text-gray-600">{ficha.comparacion}</p>
      )}

      <MesAMes ficha={ficha} />

      <MargenLinea ficha={ficha} />

      <FilaCostos art={art} ficha={ficha} />

      <Avisos art={art} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 px-3.5 py-2">
        {frescura && (
          <p className="text-xs text-gray-500">Lo que queda en bodega es de Switch, al {frescura}.</p>
        )}
        {ficha.viejas.length > 0 && (
          <button
            type="button"
            onClick={() => setVerViejas((v) => !v)}
            className="min-h-[44px] text-xs font-medium text-gray-900 underline underline-offset-2 hover:text-gray-600"
          >
            {verViejas
              ? "Ocultar las compras anteriores"
              : `Ver ${ficha.viejas.length === 1 ? "la compra anterior" : `las ${ficha.viejas.length} compras anteriores`}`}
          </button>
        )}
      </div>

      {verViejas && ficha.viejas.length > 0 && <ComprasViejas compras={ficha.viejas} />}
    </section>
  );
}

// ─── Los tres números ────────────────────────────────────────────────────────
//
// 🔴 "Mi última compra" es SIEMPRE la última, aunque no se haya acabado —
// decisión A de Daniel. Si todavía le queda mercancía dice "todavía no se
// acaba · van 54 de 180"; NO se cae a la última compra agotada, que hablaría de
// mercancía que ya no está mientras la que se acaba de traer no dice nada.

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
          no aparece en los ingresos de mercancía, así que no se puede decir cuándo llegó ni en cuánto tiempo se
          vendió.
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

  const u = resumirCompra(ficha.ultima);
  return (
    <dl className="grid gap-3 px-3.5 py-3.5 sm:grid-cols-3">
      <Numero rotulo="Mi última compra" valor={u.titular} pie={u.detalle} />
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

// ─── Precio real y margen ────────────────────────────────────────────────────
//
// 🔴 ESTA LÍNEA ES LA MITAD DE LA DECISIÓN. Daniel no compra si *"vendi a margen
// bajo o negativo"*. El precio de LISTA (que está abajo, en los costos) NO es a
// lo que vendió: los descuentos se lo comen. Acá va lo que salió DE VERDAD.

function MargenLinea({ ficha }: { ficha: FichaArticulo }) {
  const m = ficha.margen;

  if (m.motivo) {
    return (
      <div className="border-t border-gray-100 bg-gray-50 px-3.5 py-2.5">
        <p className="text-sm text-gray-700">{textoSinMargen(m.motivo, ficha.promedio.meses)}</p>
        {m.precioReal != null && (
          <p className="mt-0.5 text-xs text-gray-600">Vendí a {fmtMoney(m.precioReal)} en promedio.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-gray-100 bg-gray-50 px-3.5 py-2.5 text-sm">
      <span className="text-gray-700">
        Vendí a <span className="font-semibold tabular-nums text-gray-900">{fmtMoney(m.precioReal)}</span>
      </span>
      <span className="text-gray-400">·</span>
      <span className="text-gray-700">
        me costó <span className="font-semibold tabular-nums text-gray-900">{fmtMoney(m.costo)}</span>
      </span>
      <span className="text-gray-400">·</span>
      <span className="text-gray-700">
        margen{" "}
        <span
          className={`font-semibold tabular-nums ${(m.margen ?? 0) < 0 ? "text-red-700" : "text-gray-900"}`}
        >
          {fmtPct(m.margen)}
        </span>
      </span>
      <Ayuda titulo="De dónde salen estos dos números">
        <b>Vendí a</b> es la venta real dividida entre las unidades reales de los últimos {ficha.promedio.meses}{" "}
        {ficha.promedio.meses === 1 ? "mes completo" : "meses completos"} — con los descuentos ya adentro y las
        devoluciones (notas de crédito) ya restadas. El precio de lista de abajo no es a lo que vendiste.
        <br />
        <br />
        <b>El margen se calcula contra el CIF</b> de tu última compra, que es lo que costó de verdad poner la pieza
        en bodega (mercancía + flete + seguro). No se usa el FOB: en 93 de cada 100 líneas Switch lo manda igual al
        CIF por un error de carga, así que un margen sobre FOB sería el mismo número en unos artículos y otro
        distinto en otros.
      </Ayuda>
    </div>
  );
}

// ─── La fila de costos ───────────────────────────────────────────────────────

function FilaCostos({ art, ficha }: { art: ArticuloCompras; ficha: FichaArticulo }) {
  const u = ficha.ultima;
  const lista = u?.costos.lista ?? art.precioEtiqueta;
  if (!u && lista == null) return null;

  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 px-3.5 py-2.5">
      {u && <Costo k="CIF de hoy" v={fmtMoney(u.costos.cif)} />}
      {/* Sin compra anterior la celda se OMITE — un guion mudo no dice nada. */}
      {ficha.anterior && <Costo k="CIF de la compra anterior" v={fmtMoney(ficha.anterior.costos.cif)} />}
      {u && <Costo k="FOB" v={<Fob c={u} />} />}
      {lista != null && <Costo k="Precio de lista" v={fmtMoney(lista)} />}
    </dl>
  );
}

function Costo({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-600">{k}</dt>
      <dd className="text-sm font-medium tabular-nums text-gray-900">{v}</dd>
    </div>
  );
}

/** El FOB va con su procedencia: en el 93% de las líneas Switch lo manda IGUAL
 *  al CIF y eso es un error de carga conocido. NO se corrige ni se estima —
 *  Daniel quiere saber a cuál creerle, así que se marca. */
function Fob({ c }: { c: CompraMedida }) {
  const { fob, fobOrigen } = c.costos;
  if (fob == null) return <>—</>;
  return (
    <span className={fobOrigen === "real" ? "" : "text-gray-500"}>
      {fmtMoney(fob)}
      {fobOrigen === "estimado" && <span className="ml-1 text-xs">est.</span>}
      {fobOrigen === "igual-al-cif" && (
        <Ayuda titulo="Este FOB no es confiable">
          Switch lo mandó IGUAL al costo CIF, y eso es un error de carga conocido — pasa en el 93% de las líneas. Se
          muestra tal cual, sin corregirlo ni estimarlo. Cuando el FOB es distinto del CIF, sí viene de Switch y se
          puede creer. Por eso el margen se calcula contra el CIF.
        </Ayuda>
      )}
    </span>
  );
}

// ─── Las compras anteriores, detrás del enlace ───────────────────────────────

function ComprasViejas({ compras }: { compras: CompraMedida[] }) {
  return (
    <ul className="divide-y divide-gray-100 border-t border-gray-100">
      {compras.map((c) => (
        <li key={`${c.fecha}·${c.documento}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3.5 py-2">
          <span className="text-sm text-gray-900">{fmtFechaCorta(c.fecha)}</span>
          <span className="text-sm tabular-nums text-gray-900">{fmtInt(c.unidades)} u</span>
          <span className="text-sm text-gray-700">{textoSeVendio(c)}</span>
          <span className="ml-auto text-xs tabular-nums text-gray-600">
            CIF {fmtMoney(c.costos.cif)}
            {mesesDeCompra(c) != null && c.quedan > 0 && ` · quedan ${fmtInt(c.quedan)}`}
          </span>
        </li>
      ))}
    </ul>
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
  if (art.comprasFueraDeVentana > 0) {
    avisos.push(
      `Hay ${art.comprasFueraDeVentana} ${art.comprasFueraDeVentana === 1 ? "compra más vieja" : "compras más viejas"} de 3 años que no se muestran (sí cuentan para el reparto).`,
    );
  }
  // 🔴 EL AJUSTE DE INVENTARIO SE QUEDA EN PANTALLA. Daniel: *"si hay menos es
  // porq robaron"* — es plata que se fue, no metodología, y no se esconde
  // detrás de un ⓘ. Antes iba renglón por renglón en la tabla; ahora que la
  // tabla no está, va una vez por artículo, sumado.
  if (art.cuadre.ajusteConfiable) {
    const perdido = art.compras.reduce((s, c) => s + Math.max(0, c.noVendidoNiEnBodega), 0);
    const llegaron = art.compras.reduce((s, c) => s + c.unidades, 0);
    if (perdido > 0) {
      avisos.push(
        `De las ${fmtInt(llegaron)} unidades que llegaron, ${fmtInt(perdido)} ${perdido === 1 ? "se perdió" : "se perdieron"} en ajuste de inventario.`,
      );
    }
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
export { textoMeses, textoOrigenFob };
