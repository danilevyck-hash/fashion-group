// ─────────────────────────────────────────────────────────────────────────────
// COMPRAS REALES — el corazón del tab Ventas › Referencia. Módulo PURO.
//
// Responde LA pregunta de Daniel, en sus palabras: *"cuando me llego, cuanto me
// lllego"*. Fecha y cantidad, tal como están en `switch_ingresos_mercancia`. Sin
// veredictos, sin recomendaciones, sin proyecciones.
//
// 🩸 LO QUE ESTE MÓDULO VINO A REEMPLAZAR MENTÍA. La versión anterior no tenía
// los ingresos de mercancía, así que ADIVINABA "tandas" a partir de las ventas:
// para `40HM265001` anunciaba "1.332 unidades en 1 tanda, 46 meses", que no
// corresponde a ninguna compra real. Acá NO se adivina ninguna compra: si un
// artículo no tiene ingreso registrado, la pantalla lo DICE.
//
// 🩸 Y TAMPOCO SE ADIVINA EN CUÁNTO TIEMPO SE VENDIÓ **UNA** COMPRA. Este
// módulo tuvo un reparto FIFO que le asignaba ventas a cada llegada para poder
// decir "esta tardó 15 meses". Se fue entero, y la razón es de negocio, no de
// código: **cuando llega mercancía sobre stock que todavía no se acaba, nadie
// marcó las cajas** — atribuirle ventas a una llegada concreta es INVENTAR.
// Daniel, textual: *"si llego una compra mientras tenia stock, yo lo que quiero
// ver en cuanto tiempo se me mueve el articulo… pero no quiero que decidas tu,
// lo decido yo con la data que me extraigas"*. Peor todavía, en el artículo que
// más le importa (`NB2570001`, tres compras recientes sin vender bajo FIFO) el
// número resultante era **"van 0 de 180"**: cero información. Lo que se mide
// ahora es el ARTÍCULO —cuánto vende por mes, para cuánto le queda— y las
// compras se muestran CRUDAS. La aritmética del artículo vive en
// `resumen-articulo.ts`.
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

import { signoTipo, mesDeFecha } from "./referencia";

/** % de importación para estimar el FOB donde Switch no lo desglosa. */
export const PCT_IMPORTACION = 0.1;

/** Tope de historia que se muestra. Daniel pidió 3 años. El cotejo contra las
 *  ventas se hace sobre TODAS las compras (si no, las ventas viejas parecerían
 *  no tener respaldo); el recorte es solo de PANTALLA, y las compras viejas
 *  siguen contando para lo que hay en bodega — la pantalla lo dice. */
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

/** Un mes de venta NETA del artículo (NC ya restadas). */
export interface MesVenta {
  mes: string; // YYYY-MM
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

/**
 * Días netos → meses netos, ordenados por mes ascendente.
 *
 * 🔴 NO se vuelve a firmar nada: los días ya vienen netos de
 * `ventasNetasPorDia()`, que es el ÚNICO lugar donde se aplica `signoTipo()`.
 * Un mes puede quedar NEGATIVO (más devoluciones que ventas) y así se muestra:
 * ponerlo en cero inflaría lo vendido.
 */
export function ventasPorMes(dias: readonly VentaDia[]): MesVenta[] {
  const porMes = new Map<string, { unidades: number; venta: number }>();
  for (const d of dias) {
    const m = mesDeFecha(d.fecha);
    const g = porMes.get(m) ?? { unidades: 0, venta: 0 };
    g.unidades += d.unidades;
    g.venta += d.venta;
    porMes.set(m, g);
  }
  return [...porMes.entries()]
    .map(([mes, v]) => ({ mes, unidades: v.unidades, venta: v.venta }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
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

// ─── Cotejo cronológico: ¿lo vendido sale de lo comprado? ────────────────────
//
// 🩸 ACÁ VIVÍA EL REPARTO FIFO, Y NO VUELVE. Repartía las ventas entre las
// compras para poder decir "esta llegada tardó 15 meses". Eso solo se sostiene
// si la mercancía viene marcada por tanda, y NO viene: cuando llega un
// contenedor sobre stock que todavía no se acaba, decir de qué compra salió una
// venta es inventar. Medido en `NB2570001`: sus tres compras más recientes
// quedaban con "0 vendidas" mientras el artículo vendía 28 u/mes.
//
// Lo que SÍ se puede afirmar sin marcar cajas es agregado, y es lo único que
// quedó: mirando el tiempo hacia adelante, ¿alcanza lo que había llegado hasta
// ese día para explicar lo que se vendió? Medido sobre 400 códigos
// multi-compra: 9 tienen ventas ANTERIORES a su primera compra registrada y 44
// vendieron MÁS de lo que compraron. Esos dos huecos van a dos baldes con
// nombre y la pantalla LO DICE, en vez de esconderlos.

export interface Cotejo {
  /** Unidades vendidas ANTES de que llegara la primera compra registrada. Si es
   *  > 0, falta una compra anterior a lo que tenemos. */
  vendidoAntes: number;
  /** Unidades vendidas de MÁS: ese día ya no quedaba nada de lo que había
   *  llegado. Puede ser NEGATIVO (devoluciones sobre nada consumido). */
  vendidoDeMas: number;
  /** Unidades vendidas que SÍ salen de mercancía registrada. Lo que no está acá
   *  está en uno de los dos baldes de arriba. */
  respaldado: number;
}

/**
 * Recorre los días de venta en orden y va sumando lo que fue LLEGANDO.
 *
 * Reglas:
 *  1. Una venta del día D solo se puede explicar con compras de fecha ≤ D — no
 *     se puede vender lo que todavía no llegó.
 *  2. Lo que sobra va a `vendidoAntes` si todavía no había llegado NINGUNA
 *     compra, y a `vendidoDeMas` si ya habían llegado y se agotaron.
 *  3. Un día NETO negativo (más devoluciones que ventas) devuelve unidades a lo
 *     respaldado; si no había nada que devolver, resta en `vendidoDeMas`.
 *
 * ⚠️ NO dice de QUÉ compra salió cada venta, y es a propósito: eso no se sabe.
 * `compras` tiene que venir ordenada por fecha ascendente (`agruparCompras` ya
 * la devuelve así).
 */
export function cotejarVentasConCompras(
  compras: readonly Compra[],
  dias: readonly VentaDia[],
): Cotejo {
  let proxima = 0; // índice de la próxima compra por "llegar"
  let llegado = 0; // unidades llegadas hasta el día que se está mirando
  let respaldado = 0;
  let vendidoAntes = 0;
  let vendidoDeMas = 0;

  for (const d of dias) {
    while (proxima < compras.length && compras[proxima].fecha <= d.fecha) {
      llegado += compras[proxima].unidades;
      proxima += 1;
    }

    if (d.unidades >= 0) {
      const cabe = Math.min(d.unidades, Math.max(0, llegado - respaldado));
      respaldado += cabe;
      const sobra = d.unidades - cabe;
      // "¿ya llegó alguna?" se pregunta por la CANTIDAD DE COMPRAS llegadas, no
      // por las unidades: una compra de 0 unidades igual es una llegada.
      if (sobra > 0) {
        if (proxima > 0) vendidoDeMas += sobra;
        else vendidoAntes += sobra;
      }
      continue;
    }

    const devuelve = Math.min(-d.unidades, Math.max(0, respaldado));
    respaldado -= devuelve;
    const sobra = -d.unidades - devuelve;
    if (sobra > 0) vendidoDeMas -= sobra;
  }

  return { vendidoAntes, vendidoDeMas, respaldado };
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
  cotejo: Pick<Cotejo, "vendidoAntes" | "vendidoDeMas">,
): Cuadre {
  if (existencia == null) {
    return { comprado, vendido, existencia, residuo: null, ajusteConfiable: false };
  }
  const residuo = comprado - vendido - existencia;
  const cierra = cotejo.vendidoAntes === 0 && cotejo.vendidoDeMas === 0;
  return {
    comprado,
    vendido,
    existencia,
    residuo,
    ajusteConfiable: cierra && existencia === 0 && residuo > 0,
  };
}

// ─── El armado completo, de punta a punta ────────────────────────────────────

export interface ArticuloCompras {
  empresa: string;
  codigo: string;
  /** Nombre comercial del catálogo si lo hay; si no, el del ingreso o el diario. */
  descripcion: string;
  /** Compras CRUDAS dentro de la ventana de historia, la más nueva PRIMERO.
   *  Fecha y cantidad tal como llegaron — sin una sola venta atribuida. */
  compras: Compra[];
  /** Venta NETA mes a mes, TODA su historia, ascendente. De acá salen las
   *  barras de los 12 meses completos, el "vendo por mes" y el precio real
   *  (`@/lib/ventas/resumen-articulo`). Va la historia entera y no solo los 12
   *  meses porque hace falta saber CUÁNDO empezó a venderse: un artículo que
   *  llegó en diciembre no se promedia entre 12. */
  serie: MesVenta[];
  /** Compras que existen pero quedaron fuera de la ventana de 3 años. NO vienen
   *  en `compras` (solo se sabe cuántas son) y SÍ cuentan para lo que hay en
   *  bodega — la pantalla lo dice en vez de dejar que el total no cierre. */
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
 * Arma la respuesta de un artículo: agrupa las compras, coteja lo vendido
 * contra lo que fue llegando y cuadra contra la existencia de Switch.
 *
 * 🔴 NO mide ninguna compra por separado. La única aritmética que sobrevive es
 * de ARTÍCULO, y `hoy` solo se usa para saber dónde cortar los 3 años.
 */
export function armarArticulo(e: EntradaArticulo, hoy: string): ArticuloCompras {
  const todasLasCompras = agruparCompras(e.ingresos);
  const dias = ventasNetasPorDia(e.ventas);
  const cotejo = cotejarVentasConCompras(todasLasCompras, dias);

  const comprado = todasLasCompras.reduce((s, c) => s + c.unidades, 0);
  const vendido = dias.reduce((s, d) => s + d.unidades, 0);
  const cuadre = cuadrar(comprado, vendido, e.existencia, cotejo);

  // Stock que ninguna compra registrada explica. Lo que las compras PUEDEN
  // sostener es lo que llegó menos lo que salió de ellas; si Switch dice que
  // hay más, esa diferencia se AVISA en vez de esconderse.
  const sinRespaldo =
    e.existencia == null ? 0 : Math.max(0, e.existencia - (comprado - cotejo.respaldado));

  const desde = desdeDeVentana(hoy);
  const dentro = todasLasCompras.filter((c) => c.fecha >= desde);

  return {
    empresa: e.empresa,
    codigo: e.codigo,
    descripcion: e.descripcion,
    // La más NUEVA primero: es la que se está decidiendo comprar otra vez.
    compras: [...dentro].reverse(),
    serie: ventasPorMes(dias),
    comprasFueraDeVentana: todasLasCompras.length - dentro.length,
    cuadre,
    stockSinRespaldo: sinRespaldo,
    vendidoAntes: cotejo.vendidoAntes,
    vendidoDeMas: cotejo.vendidoDeMas,
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
  /** `false` = el rol (vendedor/bodega) NO ve el margen — Daniel: *"quita
   *  margen, lo demas dejalo"*. La vista no lo calcula ni lo dibuja, y el
   *  Excel no baja su columna. Ausente (respuesta vieja cacheada) = visible. */
  margenVisible?: boolean;
}
