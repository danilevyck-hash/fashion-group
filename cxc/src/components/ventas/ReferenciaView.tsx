"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tab "Referencia" de /ventas (solo admin — el guard real es el SSR de la
// página + requireRole en el API; esta vista es solo la cara).
//
// ES UNA TABLA. UNA FILA POR COMPRA. Daniel, después de rechazar dos diseños
// por complicados: *"quiero la data clara y simple. cuando me llego, cuanto me
// lllego y en cuanto tiempo lo vendi, punto"* y *"normalmente cuando hago
// ingreso de mercancia veo por articulo por ejemplo compre 60 piezas, y veo
// cuanto tiempo me demoro en venderlas y que meses"*.
//
// 🩸 LO QUE SE FUE, Y POR QUÉ NO VUELVE:
//   · "Se te acaba en ~46 meses" — medía cuánto duró LO DE ANTES, no lo que
//     hay. Con 89 unidades vendiendo ~32/mes se acaba en 2,8, no en 46.
//   · "compra ~138 unidades" y los veredictos SE AGOTÓ / DESCONTINUADO. Él mira
//     los números y decide; ya rechazó dos diseños por eso.
//   · Los promedios de 3/6/12 meses, que metían el mes en curso adentro y
//     hacían parecer moribundo a todo el catálogo los primeros días del mes.
//     Acá NO HAY NI UN PROMEDIO: por construcción, el defecto no puede volver.
//   · La pestaña "Varias · pegar lista". Daniel: *"porq columna de varias pegar
//     por lista? enves de ponerlo en el mismo buscador que una?"*. Un solo
//     buscador: si pegás un código busca uno, si pegás veinte busca veinte.
//
// Toda la matemática viene de los módulos PUROS (@/lib/ventas/compras y
// referencia) — acá no se suma ni se firma nada.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Ayuda } from "@/components/shared/Ayuda";
import { Download, Search } from "lucide-react";
import { fetchJsonWithRetry, describeFetchError } from "@/lib/fetch-retry";
import { colorDe, modeloDe, MAX_CODIGOS_MULTI } from "@/lib/ventas/referencia";
import {
  textoMesesVendidos,
  type ArticuloCompras,
  type CompraMedida,
  type ComprasApiResp,
} from "@/lib/ventas/compras";
import {
  exportComprasToExcel,
  textoAgotadas,
  textoMeses,
  textoOrigenFob,
  textoSeVendio,
} from "@/lib/ventas/referencia-excel";
import { fmtFrescura } from "@/lib/ventas/referencia-info";

// ─── Formato ─────────────────────────────────────────────────────────────────

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "28 nov 2023" — el formato de fecha de la casa. */
function fmtFecha(f: string): string {
  const [a, m, d] = f.split("-");
  return `${Number(d)} ${MESES_CORTO[Number(m) - 1] ?? m} ${a}`;
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** El descuento se muestra ENTERO: al 0,4% no le cambia la decisión a nadie. */
function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
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
  const color = colorDe(art.codigo);
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-gray-200 px-3.5 py-3">
        <h4 className="font-mono text-sm font-semibold text-gray-900">{art.codigo}</h4>
        {color && <span className="text-xs text-gray-600">color {color}</span>}
        <span className="text-sm text-gray-700">{art.descripcion || "—"}</span>
        <span className="ml-auto text-xs text-gray-600">{etiquetaEmpresa(art.empresa)}</span>
      </header>

      <ResumenArticuloLinea art={art} />

      {art.sinCompraRegistrada ? (
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
        </div>
      ) : (
        <>
          {/* ESCRITORIO — la tabla. Por debajo de lg el ancho útil no alcanza:
              un iPad de 834 deja 610 px con la barra lateral, más angosto que
              un iPhone acostado. Ahí van tarjetas (patrón PanelCxcMobile). */}
          <div className="hidden overflow-x-auto lg:block" data-vista="tabla">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
                  <th className="px-1.5 py-2 text-left font-medium xl:px-3">Llegó</th>
                  <th className="px-1.5 py-2 text-right font-medium xl:px-3">Cuánto</th>
                  {/* "Se vendió" son UNIDADES + tiempo. Antes decía "te quedan
                      126" y repetía la columna de al lado — el defecto que
                      Daniel cazó: *"me sale dos veces mi inv"*. */}
                  <th className="px-1.5 py-2 text-left font-medium xl:px-3">Se vendió</th>
                  <th className="px-1.5 py-2 text-right font-medium xl:px-3">Queda</th>
                  <th className="px-1.5 py-2 text-right font-medium xl:px-3">CIF</th>
                  <th className="px-1.5 py-2 text-right font-medium xl:px-3">FOB</th>
                  <th className="px-1.5 py-2 text-right font-medium xl:px-3">Lista</th>
                  {/* "Vendido" a secas se leía como cantidad ($6.78 → "vendí
                      6,78"). "Salió a" solo puede leerse como precio. */}
                  <th className="px-1.5 py-2 text-right font-medium xl:px-3">Salió a</th>
                  <th className="px-1.5 py-2 text-right font-medium xl:px-3">Desc.</th>
                </tr>
              </thead>
              <tbody>
                {art.compras.map((c) => (
                  <FilaCompra key={`${c.fecha}·${c.documento}`} art={art} c={c} hoyMes={hoyMes} />
                ))}
              </tbody>
            </table>
          </div>

          {/* CELULAR / IPAD */}
          <div className="divide-y divide-gray-200 lg:hidden" data-vista="tarjetas">
            {art.compras.map((c) => (
              <TarjetaCompra key={`${c.fecha}·${c.documento}`} art={art} c={c} hoyMes={hoyMes} />
            ))}
          </div>
        </>
      )}

      <Avisos art={art} />
    </section>
  );
}

// ─── El resumen del artículo ─────────────────────────────────────────────────
//
// Daniel: *"quiero que me diga en cuantos meses se vendio. y total que tengo en
// inv."*. Antes había que sumar 180 + 120 + 45 de cabeza para saber cuánto hay.
//
// 🩸 ACÁ NO VA UN PROMEDIO, Y ESTÁ MEDIDO POR QUÉ (ver la nota larga de
// compras.ts). Las dos compras agotadas de `NB2570001` tardaron 7 y 15 meses;
// "promedio 11" no describe ninguna de las dos, y el 15 solo es 15 porque esa
// tanda esperó medio año en bodega a que se acabara la de adelante. Se muestran
// las unidades AL LADO de los meses, nunca divididas: dividir es lo que produce
// los "14.899 u/mes" que salieron en la medición de 300 códigos reales.
//
// 🔴 Es UNA LÍNEA. Daniel ya rechazó dos diseños de este módulo por complicados;
// esto no es un panel nuevo. Y envuelve (flex-wrap) en vez de crecer a lo ancho:
// a 1024 la barra lateral deja 766 px útiles y la tabla ya usa todos.
function ResumenArticuloLinea({ art }: { art: ArticuloCompras }) {
  const r = art.resumen;
  const enBodega = r.enBodega ?? 0;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-gray-200 bg-gray-50 px-3.5 py-2.5">
      <p className="text-sm text-gray-700">
        En bodega{" "}
        <span className="font-semibold tabular-nums text-gray-900">{fmtInt(enBodega)} u</span>
        {!r.bodegaDeSwitch && <span className="ml-1 text-xs text-gray-600">(deducido)</span>}
      </p>

      {!art.sinCompraRegistrada && (
        <p className="text-sm text-gray-700">
          {textoAgotadas(r)}
          <Ayuda titulo="Cómo se mide">
            Solo cuentan las compras que YA se acabaron — una tanda que todavía tiene mercancía no se puede medir,
            porque no ha terminado. Los meses son el tiempo que estuvo vendiéndose: si dos tandas se solaparon no se
            cuenta dos veces, y si entre una y otra estuviste sin mercancía, ese tiempo no se cuenta.
            <br />
            <br />
            No hay promedio a propósito. En este código una tanda tardó 7 meses y otra 15, y las 15 fueron así solo
            porque esperó en bodega a que se acabara la de adelante — un &quot;promedio 11&quot; no describiría
            ninguna de las dos.
          </Ayuda>
        </p>
      )}

      {!r.bodegaDeSwitch && (
        <p className="w-full text-xs text-gray-600">
          Switch no tiene este código en el catálogo, así que lo de bodega no es su existencia: es lo que queda según
          las compras y las ventas.
        </p>
      )}

      {r.bodegaDeSwitch && r.bodegaFueraDeLasFilas !== 0 && !art.sinCompraRegistrada && (
        <p className="w-full text-xs text-gray-600">
          {r.bodegaFueraDeLasFilas > 0
            ? `Las filas de abajo solo explican ${fmtInt(enBodega - r.bodegaFueraDeLasFilas)} de esas ${fmtInt(enBodega)} u; el total es el de Switch.`
            : `Switch reporta ${fmtInt(enBodega)} u, menos de lo que suman las filas de abajo; el total es el de Switch.`}
        </p>
      )}
    </div>
  );
}

// ─── Una compra, en tabla ────────────────────────────────────────────────────

function FilaCompra({ art, c, hoyMes }: { art: ArticuloCompras; c: CompraMedida; hoyMes: string }) {
  const meses = textoMesesVendidos(c.mesesConVenta, hoyMes);
  return (
    <>
      <tr className="border-b border-gray-100">
        <td className="whitespace-nowrap px-1.5 py-2.5 xl:px-3 text-gray-900">{fmtFecha(c.fecha)}</td>
        <td className="whitespace-nowrap px-1.5 py-2.5 xl:px-3 text-right font-medium text-gray-900">
          {fmtInt(c.unidades)} u
        </td>
        <td className="whitespace-nowrap px-1.5 py-2.5 xl:px-3 text-gray-900">{textoSeVendio(c)}</td>
        <td className="whitespace-nowrap px-1.5 py-2.5 xl:px-3 text-right text-gray-900">{fmtInt(c.quedan)}</td>
        <td className="whitespace-nowrap px-1.5 py-2.5 xl:px-3 text-right text-gray-700">{fmtMoney(c.costos.cif)}</td>
        <td className="whitespace-nowrap px-1.5 py-2.5 xl:px-3 text-right text-gray-700">
          <Fob c={c} />
        </td>
        <td className="whitespace-nowrap px-1.5 py-2.5 xl:px-3 text-right text-gray-700">{fmtMoney(c.costos.lista)}</td>
        <td className="whitespace-nowrap px-1.5 py-2.5 xl:px-3 text-right text-gray-700">{fmtMoney(c.precioVendido)}</td>
        <td className="whitespace-nowrap px-1.5 py-2.5 xl:px-3 text-right text-gray-700">{fmtPct(c.descuento)}</td>
      </tr>
      {(meses || (art.cuadre.ajusteConfiable && c.noVendidoNiEnBodega > 0)) && (
        <tr className="border-b border-gray-100">
          <td colSpan={9} className="px-1.5 pb-2.5 text-xs text-gray-600 xl:px-3">
            {meses}
            {art.cuadre.ajusteConfiable && c.noVendidoNiEnBodega > 0 && (
              <span className={meses ? "ml-2" : ""}>
                · de las {fmtInt(c.unidades)}, {fmtInt(c.noVendidoNiEnBodega)} se perdió en ajuste
              </span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Una compra, en tarjeta ──────────────────────────────────────────────────

function TarjetaCompra({ art, c, hoyMes }: { art: ArticuloCompras; c: CompraMedida; hoyMes: string }) {
  const meses = textoMesesVendidos(c.mesesConVenta, hoyMes);
  return (
    <div className="px-3.5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-gray-900">{fmtFecha(c.fecha)}</span>
        <span className="text-sm text-gray-900">· {fmtInt(c.unidades)} u</span>
        <span className="ml-auto text-sm font-medium text-gray-900">{textoSeVendio(c)}</span>
      </div>

      <dl className="mt-2 grid grid-cols-[auto_auto] justify-between gap-x-4 gap-y-1 text-sm tabular-nums sm:grid-cols-[repeat(3,auto)]">
        <Dato k="Queda" v={fmtInt(c.quedan)} />
        <Dato k="CIF" v={fmtMoney(c.costos.cif)} />
        <Dato k="FOB" v={<Fob c={c} />} />
        <Dato k="Lista" v={fmtMoney(c.costos.lista)} />
        <Dato k="Salió a" v={fmtMoney(c.precioVendido)} />
        <Dato k="Desc." v={fmtPct(c.descuento)} />
      </dl>

      {meses && <p className="mt-2 text-xs text-gray-600">{meses}</p>}
      {art.cuadre.ajusteConfiable && c.noVendidoNiEnBodega > 0 && (
        <p className="mt-1 text-xs text-gray-600">
          De las {fmtInt(c.unidades)}, {fmtInt(c.noVendidoNiEnBodega)} se perdió en ajuste.
        </p>
      )}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-xs text-gray-600">{k}</dt>
      <dd className="text-gray-900">{v}</dd>
    </div>
  );
}

/** El FOB va con su procedencia: en el 86% de las líneas Switch lo manda IGUAL
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
          Switch lo mandó IGUAL al costo CIF, y eso es un error de carga conocido — pasa en el 86% de las líneas. Se
          muestra tal cual, sin corregirlo ni estimarlo. Cuando el FOB es distinto del CIF, sí viene de Switch y se
          puede creer.
        </Ayuda>
      )}
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
  if (art.comprasFueraDeVentana > 0) {
    avisos.push(
      `Hay ${art.comprasFueraDeVentana} ${art.comprasFueraDeVentana === 1 ? "compra más vieja" : "compras más viejas"} de 3 años que no se muestran (sí cuentan para el reparto).`,
    );
  }

  const frescura = art.catalogoSyncedAt ? fmtFrescura(art.catalogoSyncedAt) : null;

  if (!avisos.length && !frescura) return null;
  return (
    <div className="border-t border-gray-200 px-3.5 py-2.5">
      {avisos.map((a) => (
        <p key={a} className="text-xs text-gray-600">
          {a}
        </p>
      ))}
      {frescura && (
        <p className="mt-0.5 text-xs text-gray-500">
          Lo que queda en bodega es de Switch, al {frescura}.
        </p>
      )}
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

// Reexport para que el texto de "se vendió en" tenga una sola definición.
export { textoMeses, textoOrigenFob };
