// ─────────────────────────────────────────────────────────────────────────────
// COMPRAS REALES — el corazón del tab Ventas › Referencia. Módulo PURO.
//
// Responde LA pregunta de Daniel, en sus palabras: *"cuando me llego, cuanto me
// lllego y en cuanto tiempo lo vendi, punto"*. Una fila por COMPRA. Sin
// veredictos, sin recomendaciones, sin proyecciones.
//
// 🩸 LO QUE ESTE MÓDULO VINO A REEMPLAZAR MENTÍA. La versión anterior no tenía
// los ingresos de mercancía, así que ADIVINABA "tandas" a partir de las ventas:
// para `40HM265001` anunciaba "1.332 unidades en 1 tanda, 46 meses", que no
// corresponde a ninguna compra real. Y `rangoDuracionTandas()` calculaba cuánto
// duró LO DE ANTES y lo rotulaba "Se te acaba en ~46 meses" — con 89 unidades
// vendiendo ~32/mes se acaba en 2,8. Acá NO se adivina ninguna compra: si un
// artículo no tiene ingreso registrado, la fila lo DICE.
//
// 🔴 LAS NC RESTAN. `tipo='NC'` viene con la cantidad en POSITIVO (magnitud);
// el signo lo aplica `signoTipo()` de `referencia.ts` y NADIE MÁS. La firma del
// error histórico de este repo es que la diferencia da EXACTO el doble de las
// NC. Medido en `40HM265032`: 285 FA + 1 TQ − 7 NC = 279 netas; sumándolas mal
// dan 293, y 293 − 279 = 14 = 2 × 7. Hay un test que lo fija.
//
// 🔴 UN AJUSTE DE INVENTARIO NUNCA ES UNA VENTA NI UNA COMPRA. Daniel: *"ajuste
// de inv es un ajuste al momento de contar, si hay menos es porq robaron"*. Se
// muestra aparte y en chico — es plata que se va y él quiere verla.
// ─────────────────────────────────────────────────────────────────────────────

import { signoTipo, diffMeses, mesDeFecha } from "./referencia";

/** Días de un mes promedio (365,25 ÷ 12). El "se vendió en N meses" se mide en
 *  DÍAS entre la fecha de la compra y el día en que se cruzó el 90%, y recién
 *  ahí se pasa a meses: contar meses calendario redondea de más. Verificado
 *  contra la reconstrucción a mano de `40HM265032` (28-nov-2023 → 10-abr-2025 =
 *  499 días = 16,39 meses, el 16,4 que Daniel ya tenía). */
export const DIAS_POR_MES = 30.4375;

/** El "se vendió en" se mide hasta acá, NO hasta el 100%. Daniel: *"5 no es
 *  nada, para mi es igual. si los ultimos 5 se vendieron 6 meses despues, no
 *  quiero que me digas vendi 60 en 10 meses, cuando la realidad el grosor fue
 *  en 4 meses"*. */
export const UMBRAL_VENDIDO = 0.9;

/** % de importación para estimar el FOB donde Switch no lo desglosa. */
export const PCT_IMPORTACION = 0.1;

/** Tope de historia que se muestra. Daniel pidió 3 años. El reparto de ventas
 *  se calcula sobre TODAS las compras (si no, las ventas viejas se le cargarían
 *  a la primera compra visible); el recorte es solo de PANTALLA. */
export const ANIOS_HISTORIA = 3;

// ─── Entrada ─────────────────────────────────────────────────────────────────

/** Fila cruda de `switch_ingresos_mercancia`. */
export interface FilaIngreso {
  empresa_key: string;
  fecha: string; // YYYY-MM-DD
  n_interno: string;
  linea?: number | null;
  proveedor?: string | null;
  codigo_articulo: string;
  articulo?: string | null;
  precio?: number | string | null;
  cantidad: number | string;
  costo_fob?: number | string | null;
  costo_cif?: number | string | null;
  /** Solo Fashion Shoes: esa empresa no trae desglose FOB/CIF, manda UNA
   *  columna COSTO que ES el CIF. Puede no existir (tabla vieja) → se degrada. */
  costo_sin_desglosar?: number | string | null;
  costo_promedio?: number | string | null;
  /** Bandera que ya calcula el sync: FOB presente y DISTINTO del CIF. Si la
   *  columna no existe se deriva acá con la misma regla. */
  fob_confiable?: boolean | null;
}

/** Un movimiento de venta NETO de un día (NC ya restadas). */
export interface VentaDia {
  fecha: string; // YYYY-MM-DD
  unidades: number;
  venta: number;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Ventas diarias netas ────────────────────────────────────────────────────

/**
 * Filas diarias crudas → movimientos NETOS por día, ordenados.
 * Un día con más devoluciones que ventas queda NEGATIVO a propósito: es lo que
 * pasó, y ponerlo en cero inflaría lo vendido.
 */
export function ventasNetasPorDia(
  filas: readonly { fecha: string; tipo: string; cantidad_total: number | string; venta_total: number | string }[],
): VentaDia[] {
  const porDia = new Map<string, { unidades: number; venta: number }>();
  for (const f of filas) {
    const s = signoTipo(f.tipo);
    const d = porDia.get(f.fecha) ?? { unidades: 0, venta: 0 };
    d.unidades += s * (num(f.cantidad_total) ?? 0);
    d.venta += s * (num(f.venta_total) ?? 0);
    porDia.set(f.fecha, d);
  }
  return [...porDia.entries()]
    .map(([fecha, v]) => ({ fecha, unidades: v.unidades, venta: v.venta }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ─── Costos ──────────────────────────────────────────────────────────────────

/** De dónde salió el FOB que se muestra. El nombre ES el contrato: la pantalla
 *  tiene que poder distinguir un FOB creíble de uno que no lo es. */
export type OrigenFob =
  /** Switch lo mandó y DIFIERE del CIF — es un FOB de verdad. */
  | "real"
  /** Switch lo mandó IGUAL al CIF. Es un error de carga conocido y NO se
   *  corrige ni se estima: se muestra tal cual, marcado, para que Daniel sepa
   *  a cuál creerle. En el 86% de las líneas está así. */
  | "igual-al-cif"
  /** Fashion Shoes no trae desglose: FOB = CIF ÷ 1,1, marcado "est.". */
  | "estimado"
  | "sin-dato";

export interface CostosCompra {
  cif: number | null;
  fob: number | null;
  fobOrigen: OrigenFob;
  /** Precio de lista con el que entró la mercancía. */
  lista: number | null;
}

/**
 * Costos de UNA línea de ingreso.
 *
 * ⚠️ Fashion Shoes manda `costo_fob` y `costo_cif` en NULL y el valor en
 * `costo_sin_desglosar` — medido: 3.515 de 3.515 líneas. Ese número ES el CIF.
 * El FOB se estima DIVIDIENDO (CIF ÷ 1,1), nunca multiplicando por 0,9: no es
 * la inversa y da otro número.
 */
export function costosDeLinea(f: FilaIngreso): CostosCompra {
  const fobCrudo = num(f.costo_fob);
  const cifCrudo = num(f.costo_cif);
  const sinDesglose = num(f.costo_sin_desglosar);
  const lista = num(f.precio);

  // Fashion Shoes: una sola columna, y es el CIF.
  if (cifCrudo == null && fobCrudo == null && sinDesglose != null && sinDesglose > 0) {
    return { cif: sinDesglose, fob: sinDesglose / (1 + PCT_IMPORTACION), fobOrigen: "estimado", lista };
  }

  const cif = cifCrudo ?? sinDesglose;
  if (cif == null) return { cif: null, fob: fobCrudo, fobOrigen: fobCrudo == null ? "sin-dato" : "real", lista };

  if (fobCrudo == null || fobCrudo === 0) return { cif, fob: null, fobOrigen: "sin-dato", lista };
  // La bandera del sync es la fuente; si la columna no vino, misma regla acá.
  const confiable = f.fob_confiable ?? fobCrudo !== cif;
  return { cif, fob: fobCrudo, fobOrigen: confiable ? "real" : "igual-al-cif", lista };
}

// ─── Agrupación de líneas en COMPRAS ─────────────────────────────────────────

/** Una COMPRA = un documento de ingreso para un código. */
export interface Compra {
  empresa: string;
  codigo: string;
  /** YYYY-MM-DD */
  fecha: string;
  documento: string;
  proveedor: string | null;
  articulo: string | null;
  unidades: number;
  costos: CostosCompra;
}

/**
 * Líneas → compras. La llave es `(empresa, código, fecha, documento)`: un mismo
 * documento puede traer el código en varias líneas (medido: 6 casos de 34.786),
 * y son la MISMA llegada, no dos.
 *
 * Los costos de un documento con varias líneas se promedian PONDERADO por
 * unidades — promediar a secas le daría el mismo peso a una línea de 2 piezas
 * que a una de 400.
 */
export function agruparCompras(filas: readonly FilaIngreso[]): Compra[] {
  const porDoc = new Map<
    string,
    {
      base: FilaIngreso;
      unidades: number;
      cifPond: number;
      cifPeso: number;
      fobPond: number;
      fobPeso: number;
      listaPond: number;
      listaPeso: number;
      origenes: OrigenFob[];
    }
  >();

  for (const f of filas) {
    const u = num(f.cantidad) ?? 0;
    const k = `${f.empresa_key}·${f.codigo_articulo}·${f.fecha}·${f.n_interno}`;
    const g = porDoc.get(k) ?? {
      base: f,
      unidades: 0,
      cifPond: 0,
      cifPeso: 0,
      fobPond: 0,
      fobPeso: 0,
      listaPond: 0,
      listaPeso: 0,
      origenes: [],
    };
    const c = costosDeLinea(f);
    const peso = u > 0 ? u : 1;
    g.unidades += u;
    if (c.cif != null) {
      g.cifPond += c.cif * peso;
      g.cifPeso += peso;
    }
    if (c.fob != null) {
      g.fobPond += c.fob * peso;
      g.fobPeso += peso;
    }
    if (c.lista != null) {
      g.listaPond += c.lista * peso;
      g.listaPeso += peso;
    }
    g.origenes.push(c.fobOrigen);
    porDoc.set(k, g);
  }

  const out: Compra[] = [];
  for (const g of porDoc.values()) {
    // El origen del FOB del documento es el PEOR de sus líneas: si una sola no
    // es creíble, el promedio tampoco lo es.
    const orden: OrigenFob[] = ["sin-dato", "igual-al-cif", "estimado", "real"];
    const fobOrigen = g.origenes.reduce(
      (peor, o) => (orden.indexOf(o) < orden.indexOf(peor) ? o : peor),
      "real" as OrigenFob,
    );
    out.push({
      empresa: g.base.empresa_key,
      codigo: g.base.codigo_articulo,
      fecha: g.base.fecha,
      documento: g.base.n_interno,
      proveedor: g.base.proveedor ?? null,
      articulo: g.base.articulo ?? null,
      unidades: g.unidades,
      costos: {
        cif: g.cifPeso > 0 ? g.cifPond / g.cifPeso : null,
        fob: g.fobPeso > 0 ? g.fobPond / g.fobPeso : null,
        fobOrigen: g.fobPeso > 0 ? fobOrigen : "sin-dato",
        lista: g.listaPeso > 0 ? g.listaPond / g.listaPeso : null,
      },
    });
  }
  // Orden natural de una historia de compras: la más vieja primero.
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.documento.localeCompare(b.documento));
}

// ─── Reparto FIFO ────────────────────────────────────────────────────────────
//
// 🔴 POR QUÉ FIFO, Y QUÉ NO PUEDE HACER.
// El 20,5% de los códigos tiene más de una compra (5.429 de 26.533, medido), así
// que había que decidir cómo se reparten las ventas. FIFO —lo que entró primero
// se vende primero— es la lectura natural de una bodega de ropa y la única que
// contesta "¿cuánto tardó ESTA llegada?".
//
// Pero FIFO solo es honesto si lo vendido sale de lo comprado, y eso NO siempre
// pasa. Medido sobre 400 códigos multi-compra: 9 tienen ventas ANTERIORES a su
// primera compra registrada y 44 vendieron MÁS de lo que compraron. Esas ventas
// no salieron de ninguna tanda que tengamos. En vez de empujarlas contra la
// tanda más vieja —que le inventaría meses de duración— van a dos baldes con
// nombre (`vendidoAntes`, `vendidoDeMas`) y la pantalla LO DICE. Un artículo así
// muestra sus compras igual, con el aviso al lado.

export interface RepartoFifo {
  /** Por compra (mismo índice que el arreglo de compras): unidades asignadas. */
  asignadas: number[];
  /** Por compra: los días con venta que le tocaron, en orden. */
  diasPorCompra: { fecha: string; unidades: number; venta: number }[][];
  /** Unidades vendidas ANTES de la primera compra registrada. Si es > 0 falta
   *  una compra anterior a lo que tenemos. */
  vendidoAntes: number;
  /** Unidades vendidas de MÁS: no quedaba nada en ninguna tanda ya llegada. */
  vendidoDeMas: number;
}

/**
 * Reparte las ventas diarias entre las compras, en orden cronológico.
 *
 * Reglas, en este orden:
 *  1. Una venta del día D solo puede salir de una compra con fecha ≤ D — no se
 *     puede vender lo que todavía no llegó.
 *  2. Entre las candidatas, la más VIEJA primero (FIFO).
 *  3. Un día NETO negativo (más devoluciones que ventas) devuelve unidades a la
 *     compra más reciente que había consumido: es el espejo exacto de FIFO.
 *  4. Lo que no entra en ninguna compra se anota aparte y NO se reparte.
 */
export function repartirFifo(compras: readonly Compra[], dias: readonly VentaDia[]): RepartoFifo {
  const asignadas = compras.map(() => 0);
  const diasPorCompra: { fecha: string; unidades: number; venta: number }[][] = compras.map(() => []);
  let vendidoAntes = 0;
  let vendidoDeMas = 0;

  for (const d of dias) {
    const precioUnit = d.unidades !== 0 ? d.venta / d.unidades : 0;

    if (d.unidades < 0) {
      // Devolución: se le saca a la compra más nueva que tenga consumo.
      let pendiente = -d.unidades;
      for (let i = compras.length - 1; i >= 0 && pendiente > 0; i -= 1) {
        if (asignadas[i] <= 0) continue;
        const quita = Math.min(asignadas[i], pendiente);
        asignadas[i] -= quita;
        diasPorCompra[i].push({ fecha: d.fecha, unidades: -quita, venta: -quita * precioUnit });
        pendiente -= quita;
      }
      if (pendiente > 0) vendidoDeMas -= pendiente;
      continue;
    }

    let pendiente = d.unidades;
    for (let i = 0; i < compras.length && pendiente > 0; i += 1) {
      if (compras[i].fecha > d.fecha) break; // ordenadas: de acá en adelante ninguna llegó
      const libre = compras[i].unidades - asignadas[i];
      if (libre <= 0) continue;
      const toma = Math.min(libre, pendiente);
      asignadas[i] += toma;
      diasPorCompra[i].push({ fecha: d.fecha, unidades: toma, venta: toma * precioUnit });
      pendiente -= toma;
    }
    if (pendiente > 0) {
      // ¿No había NINGUNA compra llegada todavía, o se acabaron todas?
      const hayLlegada = compras.some((c) => c.fecha <= d.fecha);
      if (hayLlegada) vendidoDeMas += pendiente;
      else vendidoAntes += pendiente;
    }
  }

  return { asignadas, diasPorCompra, vendidoAntes, vendidoDeMas };
}

// ─── Ajuste de inventario ────────────────────────────────────────────────────

export interface Cuadre {
  comprado: number;
  vendido: number;
  /** Existencia REAL de catálogo. `null` = no la sabemos (sin fila de catálogo). */
  existencia: number | null;
  /** comprado − vendido − existencia. `null` si no hay existencia que restar.
   *  ⚠️ ES UN RESIDUO, no un veredicto: solo significa "se perdió contando"
   *  cuando `ajusteConfiable` lo habilita. */
  residuo: number | null;
  /** SOLO acá la pantalla puede decir "se perdió en ajuste". Ver la nota. */
  ajusteConfiable: boolean;
}

/**
 * Cuadre de un artículo: lo comprado tiene que ser lo vendido + lo que queda +
 * lo que se perdió contando.
 *
 * 🩸 EL RESIDUO NO ES UN AJUSTE, Y CONFUNDIRLOS INVENTA ROBOS. La cuenta real
 * es `existencia_hoy = existencia_ANTES + comprado − vendido`, y de
 * `existencia_ANTES` no tenemos ni un dato: las compras arrancan el 25-oct-2022
 * y la existencia es una foto de HOY. Todo lo que había en la bodega antes de
 * esa fecha —o lo que entró por una vía que no es un ingreso de mercancía— cae
 * dentro del residuo.
 *
 * Medido, y es lo que tumbó la versión ingenua: `TWCAPRE001` (fashion_shoes)
 * llegó el 7-ago-2026 con 444 unidades, no registró NI UNA venta y hoy tiene
 * 384 en bodega → el residuo da 60. Anunciar "60 se perdieron en ajuste" de un
 * contenedor de hace 4 días es exactamente la clase de número inventado que
 * este módulo vino a eliminar. Igual `WW0WW505930A8` (48 → 40, residuo 8). Y no
 * es la sucursal: las 34.792 líneas son PRINCIPAL, una sola.
 *
 * Por eso el ajuste se declara SOLO cuando la cuenta cierra sola y sin lugar a
 * otra lectura:
 *   · `existencia === 0` — el artículo está CERRADO. Con stock vivo, un residuo
 *     puede ser mercancía que entró de otro lado y todavía está ahí.
 *   · sin ventas anteriores a la primera compra y sin ventas de más — o sea, la
 *     vida entera del artículo cabe adentro de lo que tenemos registrado.
 *   · residuo > 0.
 *
 * Ese es EXACTAMENTE el caso que Daniel reconstruyó a mano con el Kardex
 * (`40HM265032`: 280 compradas, 279 vendidas, 0 en bodega → 1 unidad perdida),
 * y no se enciende en ninguno de los contenedores frescos de arriba.
 */
export function cuadrar(
  comprado: number,
  vendido: number,
  existencia: number | null,
  reparto: Pick<RepartoFifo, "vendidoAntes" | "vendidoDeMas">,
): Cuadre {
  if (existencia == null) {
    return { comprado, vendido, existencia, residuo: null, ajusteConfiable: false };
  }
  const residuo = comprado - vendido - existencia;
  const cierra = reparto.vendidoAntes === 0 && reparto.vendidoDeMas === 0;
  return {
    comprado,
    vendido,
    existencia,
    residuo,
    ajusteConfiable: cierra && existencia === 0 && residuo > 0,
  };
}

// ─── Medición de una compra ──────────────────────────────────────────────────

export type EstadoCompra =
  /** Llegó al 90% vendido: el número de meses es real. */
  | "medida"
  /** Todavía queda mercancía de esta llegada. */
  | "viva"
  /** Se cerró sin llegar al 90% porque el resto se perdió en un ajuste. */
  | "cerrada-sin-90"
  /** No vendió NADA todavía. */
  | "sin-ventas";

export interface CompraMedida extends Compra {
  /** Unidades de esta compra que se vendieron (reparto FIFO). */
  vendidas: number;
  /** Lo que todavía está en la bodega de esta llegada. Suma = existencia real. */
  quedan: number;
  /** Unidades de esta llegada que no se vendieron y tampoco están en bodega.
   *  ⚠️ Solo se puede LLAMAR "perdidas en ajuste" cuando
   *  `cuadre.ajusteConfiable`; si no, es un residuo sin explicación y la
   *  pantalla no dice nada. */
  noVendidoNiEnBodega: number;
  estado: EstadoCompra;
  /** Meses hasta el 90% vendido. `null` si no llegó (tanda viva o sin ventas). */
  meses: number | null;
  /** El día exacto en que se cruzó el 90% — la prueba del número de arriba. */
  fechaUmbral: string | null;
  /** Meses YYYY-MM en los que esta llegada vendió, ordenados. */
  mesesConVenta: string[];
  /** Venta neta asignada ÷ unidades vendidas — a cuánto salió DE VERDAD. */
  precioVendido: number | null;
  /** (lista − vendido) ÷ lista. `null` si falta alguno de los dos. */
  descuento: number | null;
}

/**
 * Mide UNA compra contra los días de venta que le tocaron.
 *
 * 🔴 El "se vendió en N meses" se mide en DÍAS y recién después se pasa a
 * meses. Contar meses calendario da 17 donde la realidad es 16,4 — y 16,4 es
 * el número que Daniel ya tenía reconstruido a mano.
 */
export function medirCompra(
  compra: Compra,
  diasAsignados: readonly { fecha: string; unidades: number; venta: number }[],
  quedan: number,
  noVendidoNiEnBodega: number,
): CompraMedida {
  const vendidas = diasAsignados.reduce((s, d) => s + d.unidades, 0);
  const ventaTotal = diasAsignados.reduce((s, d) => s + d.venta, 0);

  const objetivo = compra.unidades * UMBRAL_VENDIDO;
  let acum = 0;
  let fechaUmbral: string | null = null;
  for (const d of diasAsignados) {
    acum += d.unidades;
    if (fechaUmbral == null && acum >= objetivo && compra.unidades > 0) {
      fechaUmbral = d.fecha;
      break;
    }
  }

  const mesesConVenta = [
    ...new Set(diasAsignados.filter((d) => d.unidades > 0).map((d) => mesDeFecha(d.fecha))),
  ].sort();

  let estado: EstadoCompra;
  if (fechaUmbral != null) estado = "medida";
  else if (quedan > 0) estado = "viva";
  else if (vendidas <= 0) estado = "sin-ventas";
  else estado = "cerrada-sin-90";

  // Para la que se cerró por ajuste sin llegar al 90%, el número honesto es
  // hasta su ÚLTIMA venta: es lo que efectivamente tardó en irse.
  const fechaCorte =
    fechaUmbral ??
    (estado === "cerrada-sin-90"
      ? [...diasAsignados].filter((d) => d.unidades > 0).map((d) => d.fecha).sort().pop() ?? null
      : null);

  const meses = fechaCorte != null ? diasEntre(compra.fecha, fechaCorte) / DIAS_POR_MES : null;

  const precioVendido = vendidas > 0 ? ventaTotal / vendidas : null;
  const lista = compra.costos.lista;
  const descuento =
    precioVendido != null && lista != null && lista > 0 ? (lista - precioVendido) / lista : null;

  return {
    ...compra,
    vendidas,
    quedan,
    noVendidoNiEnBodega,
    estado,
    meses,
    fechaUmbral,
    mesesConVenta,
    precioVendido,
    descuento,
  };
}

/** Días entre dos fechas YYYY-MM-DD. Panamá es UTC-5 FIJO y las dos puntas
 *  están en el mismo huso, así que la resta en UTC es exacta. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// ─── El ajuste, repartido entre las compras ──────────────────────────────────

/**
 * Reparte la EXISTENCIA REAL entre las compras — la columna "QUEDA" nunca es un
 * número deducido, es el stock de Switch repartido.
 *
 * Va de la compra más NUEVA a la más vieja: lo que hoy está en la bodega es lo
 * último que llegó (el espejo de FIFO, que se lleva primero lo más viejo).
 * Cada compra no puede sostener más de lo que le sobró sin vender.
 *
 * Garantía: `Σ quedan = existencia` (si alcanza la capacidad), y lo que no
 * alcanza queda en `sinRespaldo` — stock que no sale de ninguna compra
 * registrada, que se AVISA en vez de repartirse a la fuerza.
 *
 * Sin existencia (artículo fuera del catálogo) se devuelve el sobrante del
 * reparto como mejor estimación, marcado por el llamador.
 */
export function repartirExistencia(
  compras: readonly Compra[],
  asignadas: readonly number[],
  existencia: number | null,
): { quedan: number[]; noVendidoNiEnBodega: number[]; sinRespaldo: number } {
  const capacidad = compras.map((c, i) => Math.max(0, c.unidades - asignadas[i]));
  if (existencia == null) {
    return { quedan: capacidad, noVendidoNiEnBodega: compras.map(() => 0), sinRespaldo: 0 };
  }

  const quedan = compras.map(() => 0);
  let pendiente = Math.max(0, existencia);
  for (let i = compras.length - 1; i >= 0 && pendiente > 0; i -= 1) {
    const toma = Math.min(capacidad[i], pendiente);
    quedan[i] = toma;
    pendiente -= toma;
  }
  return {
    quedan,
    noVendidoNiEnBodega: capacidad.map((c, i) => c - quedan[i]),
    sinRespaldo: pendiente,
  };
}

// ─── Texto de los meses en que vendió ────────────────────────────────────────

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function nombreMes(mes: string): string {
  const m = Number(mes.slice(5, 7));
  return MESES_CORTO[m - 1] ?? mes;
}

/**
 * "2024: ene→abr, ago→dic · 2025: ene, mar→may · 2026: ago (en curso)".
 *
 * Meses CONSECUTIVOS se juntan con flecha; un mes suelto va solo. Agrupado por
 * año porque sin el año no se sabe si "ene" fue hace 3 meses o hace 3 años.
 *
 * ⚠️ El mes en curso se ROTULA. No cuenta para ningún promedio —este módulo no
 * tiene promedios, por diseño— pero verlo igual que un mes cerrado hace creer
 * que se vendió un mes entero cuando pueden ser 3 días.
 */
export function textoMesesVendidos(meses: readonly string[], hoyMes: string): string {
  if (!meses.length) return "";
  const porAnio = new Map<string, number[]>();
  for (const m of [...meses].sort()) {
    const anio = m.slice(0, 4);
    const arr = porAnio.get(anio) ?? [];
    arr.push(Number(m.slice(5, 7)));
    porAnio.set(anio, arr);
  }

  const partes: string[] = [];
  for (const [anio, ms] of porAnio) {
    const tramos: string[] = [];
    let ini = ms[0];
    let fin = ms[0];
    for (const m of ms.slice(1)) {
      if (m === fin + 1) {
        fin = m;
        continue;
      }
      tramos.push(tramo(ini, fin));
      ini = m;
      fin = m;
    }
    tramos.push(tramo(ini, fin));
    const enCurso = `${anio}-${String(ms[ms.length - 1]).padStart(2, "0")}` === hoyMes;
    partes.push(`${anio}: ${tramos.join(", ")}${enCurso ? " (en curso)" : ""}`);
  }
  return partes.join(" · ");
}

function tramo(ini: number, fin: number): string {
  const a = MESES_CORTO[ini - 1];
  const b = MESES_CORTO[fin - 1];
  return ini === fin ? a : `${a}→${b}`;
}

// ─── El armado completo, de punta a punta ────────────────────────────────────

export interface ArticuloCompras {
  empresa: string;
  codigo: string;
  /** Nombre comercial del catálogo si lo hay; si no, el del ingreso o el diario. */
  descripcion: string;
  /** Compras dentro de la ventana de historia, la más nueva PRIMERO. */
  compras: CompraMedida[];
  /** Compras que existen pero quedaron fuera de la ventana de 3 años. */
  comprasFueraDeVentana: number;
  cuadre: Cuadre;
  /** Stock en bodega que no sale de ninguna compra registrada. Se avisa. */
  stockSinRespaldo: number;
  vendidoAntes: number;
  vendidoDeMas: number;
  /** `true` = este código NO tiene ni una compra registrada. La fila lo dice;
   *  no se rellena con una adivinanza. */
  sinCompraRegistrada: boolean;
  existencia: number | null;
  precioEtiqueta: number | null;
  /** Frescura del dato de catálogo (existencia/precio). */
  catalogoSyncedAt: string | null;
}

export interface EntradaArticulo {
  empresa: string;
  codigo: string;
  descripcion: string;
  ingresos: readonly FilaIngreso[];
  ventas: readonly { fecha: string; tipo: string; cantidad_total: number | string; venta_total: number | string }[];
  existencia: number | null;
  precioEtiqueta: number | null;
  catalogoSyncedAt: string | null;
}

/** Recorta a los últimos ANIOS_HISTORIA años contando desde `hoy` (YYYY-MM-DD). */
export function desdeDeVentana(hoy: string): string {
  const anio = Number(hoy.slice(0, 4)) - ANIOS_HISTORIA;
  return `${anio}${hoy.slice(4)}`;
}

/**
 * Arma la respuesta de un artículo: agrupa compras, reparte ventas, cuadra
 * contra la existencia y mide cada llegada.
 */
export function armarArticulo(e: EntradaArticulo, hoy: string): ArticuloCompras {
  const todasLasCompras = agruparCompras(e.ingresos);
  const dias = ventasNetasPorDia(e.ventas);
  const reparto = repartirFifo(todasLasCompras, dias);

  const comprado = todasLasCompras.reduce((s, c) => s + c.unidades, 0);
  const vendido = dias.reduce((s, d) => s + d.unidades, 0);
  const cuadre = cuadrar(comprado, vendido, e.existencia, reparto);
  const { quedan, noVendidoNiEnBodega, sinRespaldo } = repartirExistencia(
    todasLasCompras,
    reparto.asignadas,
    e.existencia,
  );

  const desde = desdeDeVentana(hoy);
  const medidas: CompraMedida[] = [];
  let fuera = 0;
  todasLasCompras.forEach((c, i) => {
    if (c.fecha < desde) {
      fuera += 1;
      return;
    }
    medidas.push(medirCompra(c, reparto.diasPorCompra[i], quedan[i], noVendidoNiEnBodega[i]));
  });

  return {
    empresa: e.empresa,
    codigo: e.codigo,
    descripcion: e.descripcion,
    // La más NUEVA primero: es la que se está decidiendo comprar otra vez.
    compras: medidas.reverse(),
    comprasFueraDeVentana: fuera,
    cuadre,
    stockSinRespaldo: sinRespaldo,
    vendidoAntes: reparto.vendidoAntes,
    vendidoDeMas: reparto.vendidoDeMas,
    sinCompraRegistrada: todasLasCompras.length === 0,
    existencia: e.existencia,
    precioEtiqueta: e.precioEtiqueta,
    catalogoSyncedAt: e.catalogoSyncedAt,
  };
}

// ─── Contrato del API ────────────────────────────────────────────────────────

export interface ComprasApiResp {
  /** Mes actual en hora Panamá (YYYY-MM) — el corte de todos los cálculos. */
  hoyMes: string;
  /** Día actual en hora Panamá (YYYY-MM-DD). */
  hoy: string;
  articulos: ArticuloCompras[];
  /** Códigos que se pidieron y no existen ni en ventas ni en compras. */
  noEncontrados: string[];
  /** Modelos que coinciden por descripción, cuando lo escrito no era un código. */
  coincidencias?: { modelo: string; descripcion: string; empresa: string; colores: number }[];
  /** `false` = `switch_ingresos_mercancia` no existe todavía: la pantalla lo
   *  dice en vez de mostrar todo como "sin compra registrada". */
  comprasDisponibles: boolean;
  infoDisponible: boolean;
}
