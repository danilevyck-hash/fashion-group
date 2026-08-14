// ─────────────────────────────────────────────────────────────────────────────
// LEER LAS METAS Y SU AVANCE — la capa de I/O.
//
// Lo puro vive aparte y no se toca desde acá: `metas-clave.ts` (quién es quién)
// y `metas-avance.ts` (la proyección). Este archivo solo TRAE los números.
//
// ── 🔴 QUÉ ES "VENTA" PARA UNA META ─────────────────────────────────────────
// Exactamente lo mismo que para el resto del módulo, sin una segunda
// definición: `_multifashion_sf_vw` (american_classic), `is_wholesale = false`,
// y la suma del subtotal **FIRMADO** — o sea con el descuento ya aplicado y con
// las notas de crédito RESTANDO.
//
// 🩸 NO ES `subtotal` A SECAS DE `switch_facturas`: ése es ANTES del descuento.
// Factura real: subtotal 354.10 − descuento 221.01 = subtotal_descuento 133.09,
// más ITBMS 9.32 = total 142.41. Daniel mira el subtotal SIN ITBMS, o sea
// `subtotal_descuento` — que es justo lo que la vista proyecta como `subtotal`.
// Usar el otro infla la meta ~5%.
//
// ⚠️ Y las NC restan. La firma de haberlas sumado es que la diferencia da
// EXACTAMENTE el doble de las devoluciones.
//
// ── CUÁNTO CUESTA, MEDIDO ────────────────────────────────────────────────────
// El período de la meta real (sep-dic) tuvo el año pasado **6.610 documentos**:
// leerlos crudos son ~8 viajes paginados y 1,5 s POR CARGA DE PANTALLA, contra
// una base en compute Micro. Por eso hay dos caminos y el bueno es el primero:
//
//   1. `multifashion_meta_ventas_v1` (DDL 20260813170000) — el período ya
//      sumado por (vendedor, mes) en UNA llamada. Decenas de filas.
//   2. Si esa función todavía no existe (la DDL la corre Daniel a mano),
//      lectura paginada con `leerTodoPaginado`. Mismos filtros, mismo número.
//
// El camino 2 NO es decoración: `db-max-rows` = 1000 corta EN SILENCIO, así que
// sin paginar se leerían 1.000 de 6.610 documentos —el 15% de la venta— sin un
// solo error. Un avance que se queda corto y no avisa es peor que no tenerlo.
//
// 🔑 LOS PESOS DE LA TEMPORADA NO CUESTAN UNA LECTURA EXTRA CARA: salen de
// `multifashion_overview_serie_v1(anio)`, una RPC que YA ESTÁ EN PRODUCCIÓN
// desde jun-2026 y devuelve los 12 meses del año en una llamada. O sea que la
// proyección ponderada —lo que Daniel pidió— funciona ANTES de que corra la DDL.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esTablaAusente } from "@/lib/contable/tabla-ausente";
import { VISTA_RETAIL } from "./retail-dia";
import {
  agruparVendedoras,
  claveVendedora,
  type VendedoraAgrupada,
} from "./metas-clave";
import {
  avanceMeta,
  mesDelAnioAnterior,
  type Avance,
  type PesoMes,
} from "./metas-avance";

// ── Tipos del dominio ────────────────────────────────────────────────────────

export type TipoMeta = "grupal" | "vendedora";

export interface Participante {
  clave: string;
  nombre: string;
  objetivoIndividual: number | null;
}

export interface Meta {
  id: string;
  nombre: string;
  desde: string;
  hasta: string;
  objetivo: number;
  tipo: TipoMeta;
  premio: string | null;
  premioMonto: number | null;
  activa: boolean;
  participantes: Participante[];
}

export interface AvanceParticipante {
  clave: string;
  nombre: string;
  vendido: number;
  /**
   * Qué porción del avance del GRUPO puso esta persona (0..1).
   *
   * 🔑 Es un APORTE, no una meta. Daniel lo pidió así para la meta grupal:
   * *"Jailine $28,140 · 29% del avance"*. No hay objetivo personal detrás ni
   * hay que inventarle uno — el premio de una meta grupal es colectivo
   * (*"el viaje es de todas o de ninguna"*).
   *
   * ⚠️ En una meta grupal el denominador es LA TIENDA ENTERA, así que los
   * aportes NO suman 100%: lo que falta es `aporteNoAsignado`.
   */
  aporte: number;
  /** Solo en metas por vendedora. En una meta grupal es SIEMPRE `null`. */
  objetivo: number | null;
  avance: Avance | null;
}

export interface MetaConAvance extends Meta {
  avance: Avance;
  porVendedora: AvanceParticipante[];
  /**
   * Qué parte del avance NO es de ninguna de las participantes elegidas (0..1).
   *
   * 🔴 EXISTE PARA QUE LA PANTALLA PUEDA EXPLICAR POR QUÉ LOS APORTES NO SUMAN
   * 100%. En una meta grupal se mide la tienda entera, así que lo facturado con
   * códigos de gente que ya no trabaja acá queda dentro del avance y fuera de
   * la lista de aportes. Medido may-jul 2026: 4,1%.
   *
   * Es un número CALCULADO del período de cada meta, nunca una constante: el día
   * que esos códigos se cierren en Switch, baja solo hasta 0 y la línea
   * desaparece de la pantalla. En una meta por vendedora es siempre 0.
   */
  aporteNoAsignado: number;
  /** De dónde salieron las ventas: para poder auditar sin adivinar. */
  fuente: "rpc" | "paginado";
  /** `false` si no se pudo armar la temporada → la proyección es por días. */
  temporadaDisponible: boolean;
}

/** Lo que la pantalla necesita cuando la DDL todavía no corrió. */
export interface MetasResultado {
  instalado: boolean;
  metas: MetaConAvance[];
  /** Candidatas a participar, con sus ventas de los últimos 12 meses. */
  vendedoras: VendedoraAgrupada[];
}

// ── Ventas del período ───────────────────────────────────────────────────────

interface VentaAgrupada {
  vendedor: string;
  mes: string;
  ventas: number;
  documentos: number;
  /** El día de la ÚLTIMA venta de esa persona en ese mes (`YYYY-MM-DD`). */
  ultima: string | null;
}

interface FilaCruda {
  fecha: string;
  vendedor: string | null;
  subtotal: number | string | null;
}

/**
 * "Esa FUNCIÓN todavía no existe" — reconocimiento ESTRECHO, igual que
 * `esTablaAusente`. Un timeout o un permiso denegado NO son "no instalado" y
 * tienen que seguir siendo un error: caerse al camino de 8 viajes ante un
 * error de verdad sería esconderlo y agrandarlo contra una base saturada.
 */
export function esFuncionAusente(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST202" || e.code === "42883") return true;
  const msg = (e.message ?? String(err)).toLowerCase();
  return (
    msg.includes("could not find the function") ||
    msg.includes("pgrst202") ||
    msg.includes("42883")
  );
}

/** Camino 1: el período ya sumado por Postgres. */
async function ventasPorRpc(desde: string, hasta: string): Promise<VentaAgrupada[] | null> {
  const { data, error } = await supabaseServer.rpc("multifashion_meta_ventas_v1", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    if (esFuncionAusente(error)) return null;
    throw new Error(`multifashion_meta_ventas_v1: ${error.message}`);
  }
  return ((data ?? []) as VentaAgrupada[]).map((f) => ({
    vendedor: f.vendedor ?? "",
    mes: String(f.mes),
    ventas: Number(f.ventas) || 0,
    documentos: Number(f.documentos) || 0,
    ultima: f.ultima == null ? null : String(f.ultima).slice(0, 10),
  }));
}

/**
 * Camino 2: lectura paginada.
 *
 * ⚠️ LOS FILTROS SON LOS MISMOS QUE `leerRetailRango` (retail-dia.ts) y que la
 * RPC. Los tres tienen que dar el MISMO número sobre las mismas filas — hay un
 * candado que lo verifica, porque tres definiciones de "venta" que se separan es
 * exactamente cómo Daniel termina viendo dos totales distintos de lo mismo.
 */
async function ventasPaginadas(desde: string, hasta: string): Promise<VentaAgrupada[]> {
  const filas = await leerTodoPaginado<FilaCruda>(
    `${VISTA_RETAIL} metas [${desde}..${hasta}]`,
    (pedirCount, from, to) =>
      supabaseServer
        .from(VISTA_RETAIL)
        .select("fecha,vendedor,subtotal", pedirCount ? { count: "exact" } : {})
        .eq("is_wholesale", false)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("n_sistema", { ascending: true })
        .range(from, to),
  );

  const acc = new Map<string, VentaAgrupada>();
  for (const f of filas) {
    const vendedor = (f.vendedor ?? "").trim();
    const mes = String(f.fecha).slice(0, 7);
    const llave = `${vendedor} ${mes}`;
    const prev = acc.get(llave) ?? { vendedor, mes, ventas: 0, documentos: 0, ultima: null };
    prev.ventas += Number(f.subtotal) || 0;
    prev.documentos += 1;
    const dia = String(f.fecha).slice(0, 10);
    if (prev.ultima == null || dia > prev.ultima) prev.ultima = dia;
    acc.set(llave, prev);
  }
  return [...acc.values()];
}

export interface VentasDelPeriodo {
  filas: VentaAgrupada[];
  fuente: "rpc" | "paginado";
}

export async function leerVentasDelPeriodo(
  desde: string,
  hasta: string,
): Promise<VentasDelPeriodo> {
  const porRpc = await ventasPorRpc(desde, hasta);
  if (porRpc != null) return { filas: porRpc, fuente: "rpc" };
  return { filas: await ventasPaginadas(desde, hasta), fuente: "paginado" };
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Total del período (todas las personas, incluido `DEFAULT` y sin asignar). */
export function totalDe(filas: readonly VentaAgrupada[]): number {
  return centavos(filas.reduce((a, f) => a + f.ventas, 0));
}

/** Total de las claves elegidas. Lo que no está elegido NO suma. */
export function totalDeParticipantes(
  filas: readonly VentaAgrupada[],
  claves: readonly string[],
): Map<string, number> {
  const buscadas = new Set(claves);
  const out = new Map<string, number>();
  for (const c of buscadas) out.set(c, 0);
  for (const f of filas) {
    const k = claveVendedora(f.vendedor);
    if (k == null || !buscadas.has(k)) continue;
    out.set(k, (out.get(k) ?? 0) + f.ventas);
  }
  for (const [k, v] of out) out.set(k, centavos(v));
  return out;
}

// ── Pesos de la temporada ────────────────────────────────────────────────────

interface SerieAnual {
  meses?: { mes: number; ventas: number | string }[];
}

/**
 * Lo que vendió CADA MES del año pasado dentro del período de la meta.
 *
 * Se apoya en `multifashion_overview_serie_v1`, que ya está en producción y
 * devuelve los 12 meses de un año en UNA llamada. Como una meta puede cruzar el
 * fin de año, se piden los años que hagan falta (a lo sumo dos para un período
 * de menos de 12 meses) y se cachean por año dentro de la misma request.
 *
 * Falla ABIERTO: si no se puede leer, devuelve `[]` y la proyección se cae a los
 * días con la pantalla diciéndolo. Una proyección que no cargó no puede tumbar
 * el avance que sí cargó.
 */
export async function leerPesosTemporada(desde: string, hasta: string): Promise<PesoMes[]> {
  const mesesDelPeriodo: string[] = [];
  let cursor = desde.slice(0, 7);
  const ultimo = hasta.slice(0, 7);
  // Tope de sanidad: 120 meses. Un rango absurdo no puede volverse un bucle.
  for (let i = 0; i < 120 && cursor <= ultimo; i++) {
    mesesDelPeriodo.push(cursor);
    const anio = Number(cursor.slice(0, 4));
    const m = Number(cursor.slice(5, 7));
    cursor = m === 12 ? `${anio + 1}-01` : `${anio}-${String(m + 1).padStart(2, "0")}`;
  }

  const mesesRef = mesesDelPeriodo.map(mesDelAnioAnterior);
  const anios = [...new Set(mesesRef.map((m) => Number(m.slice(0, 4))))];

  const porMes = new Map<string, number>();
  for (const anio of anios) {
    const { data, error } = await supabaseServer.rpc("multifashion_overview_serie_v1", {
      p_year: anio,
    });
    if (error) {
      console.error("[metas] no se pudo leer la temporada", anio, error.message);
      return [];
    }
    for (const m of (data as SerieAnual | null)?.meses ?? []) {
      porMes.set(`${anio}-${String(m.mes).padStart(2, "0")}`, Number(m.ventas) || 0);
    }
  }

  return mesesRef.map((mes) => ({ mes, ventas: porMes.get(mes) ?? 0 }));
}

// ── Metas guardadas ──────────────────────────────────────────────────────────

interface FilaMeta {
  id: string;
  nombre: string;
  desde: string;
  hasta: string;
  objetivo: number | string;
  tipo: string;
  premio: string | null;
  premio_monto: number | string | null;
  activa: boolean;
}

interface FilaParticipante {
  meta_id: string;
  vendedora_clave: string;
  vendedora_nombre: string;
  objetivo_individual: number | string | null;
}

/**
 * Las metas vivas. `null` cuando la DDL todavía no corrió — que NO es un error:
 * es el estado normal hasta que Daniel corra el archivo.
 */
export async function leerMetas(): Promise<Meta[] | null> {
  const { data, error } = await supabaseServer
    .from("multifashion_metas")
    .select("id,nombre,desde,hasta,objetivo,tipo,premio,premio_monto,activa")
    .eq("deleted", false)
    .order("desde", { ascending: false });

  if (error) {
    if (esTablaAusente(error)) return null;
    throw new Error(`multifashion_metas: ${error.message}`);
  }

  const metas = (data ?? []) as FilaMeta[];
  if (metas.length === 0) return [];

  const { data: parts, error: errParts } = await supabaseServer
    .from("multifashion_meta_participantes")
    .select("meta_id,vendedora_clave,vendedora_nombre,objetivo_individual")
    .in("meta_id", metas.map((m) => m.id));

  if (errParts) {
    if (esTablaAusente(errParts)) return null;
    throw new Error(`multifashion_meta_participantes: ${errParts.message}`);
  }

  const porMeta = new Map<string, Participante[]>();
  for (const p of (parts ?? []) as FilaParticipante[]) {
    const lista = porMeta.get(p.meta_id) ?? [];
    lista.push({
      clave: p.vendedora_clave,
      nombre: p.vendedora_nombre,
      objetivoIndividual:
        p.objetivo_individual == null ? null : Number(p.objetivo_individual),
    });
    porMeta.set(p.meta_id, lista);
  }

  return metas.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    desde: String(m.desde).slice(0, 10),
    hasta: String(m.hasta).slice(0, 10),
    objetivo: Number(m.objetivo),
    tipo: m.tipo === "vendedora" ? "vendedora" : "grupal",
    premio: m.premio,
    premioMonto: m.premio_monto == null ? null : Number(m.premio_monto),
    activa: m.activa,
    participantes: (porMeta.get(m.id) ?? []).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es"),
    ),
  }));
}

// ── El avance completo ───────────────────────────────────────────────────────

/**
 * 🔴 EL AVANCE SE CALCULA SIEMPRE ENTERO, SOBRE EL PERÍODO QUE DICE LA META.
 *
 * Y en una meta GRUPAL, sobre la TIENDA ENTERA: elegir participantes decide a
 * quién se le muestra el aporte, no qué se mide (ver el bloque de abajo).
 *
 * Quién puede verlo es una pregunta DISTINTA y vive en `metas-permiso.ts`. Acá
 * no se mira ni un rol: si el permiso se metiera en la cuenta (por ejemplo
 * recortando el rango), el avance de la meta pasaría a depender de quién
 * pregunta y dos pantallas dirían números distintos de lo mismo.
 */
export async function avanceDeMeta(meta: Meta, hoy: string): Promise<MetaConAvance> {
  const [{ filas, fuente }, pesos] = await Promise.all([
    leerVentasDelPeriodo(meta.desde, meta.hasta),
    leerPesosTemporada(meta.desde, meta.hasta),
  ]);

  const claves = meta.participantes.map((p) => p.clave);
  const porClave = totalDeParticipantes(filas, claves);
  const vendidoDeParticipantes = centavos(
    [...porClave.values()].reduce((a, b) => a + b, 0),
  );

  // ── 🔴 UNA META GRUPAL MIDE SIEMPRE LA TIENDA ENTERA ───────────────────────
  //
  // Elegir participantes NO recorta lo que se mide: solo decide **a quién se le
  // MUESTRA su aporte** en la lista de abajo. El avance es el total PELADO del
  // período —el MISMO número que devuelve `leerRetailRango` y que Daniel
  // verifica en la pantalla de Ventas— con `DEFAULT` incluido.
  //
  // 🩸 POR QUÉ, medido contra producción (may-jul 2026): la tienda vendió
  // 147.737,77 y las 4 vendedoras 141.705,00, o sea el 95,9%. El 4,1% restante
  // (6.032,77) son ventas facturadas con **códigos viejos que siguen abiertos en
  // Switch** —YEISIBETH MUÑOZ 2.042,21 (última 29-jun), ANA TREJOS 1.786,77
  // (21-jul), CINDY DE GRACIA 1.607,98 (11-ago) y DEFAULT 595,81—: gente que ya
  // no es vendedora y cuyos usuarios alguien sigue usando para facturar.
  //
  // Sobre los 420.000 de la meta eso son ~17.000, y la proyección al ritmo real
  // cierra en 378.654: esos 17.000 deciden si el viaje se gana o no. **Una venta
  // de la tienda no puede desaparecer del viaje porque se facturó con el código
  // equivocado.**
  //
  // ⚠️ En una meta POR VENDEDORA no cambia nada: ahí cada una tiene su objetivo
  // escrito a mano y se mide contra el suyo, así que el "grupo" ES la suma de
  // las elegidas (que es lo que hace cuadrar la barra del conjunto).
  const vendidoTienda = totalDe(filas);
  const vendidoGrupal =
    meta.tipo === "vendedora" && claves.length > 0 ? vendidoDeParticipantes : vendidoTienda;

  const avance = avanceMeta({
    desde: meta.desde,
    hasta: meta.hasta,
    hoy,
    objetivo: meta.objetivo,
    vendido: vendidoGrupal,
    pesos,
  });

  const porVendedora: AvanceParticipante[] = meta.participantes.map((p) => {
    const vendido = porClave.get(p.clave) ?? 0;
    // Porción del avance del grupo. Con el grupo en 0 (o en negativo, que puede
    // pasar un día de puras devoluciones) el porcentaje no significa nada: se
    // deja en 0 en vez de mostrar una división absurda.
    const aporte = vendidoGrupal > 0 ? vendido / vendidoGrupal : 0;
    // 🔴 NUNCA se deriva una meta individual de la grupal. Daniel, textual:
    // *"las vendedoras no deberian de tener meta individual diferente cuando se
    // abre una nueva meta"* y *"Las metas personales las pongo yo a mano"*. Si
    // la meta es grupal, no hay objetivo por persona (`null`); si es por
    // vendedora, es EXACTAMENTE el que se escribió a mano — sin caer de vuelta
    // al monto del grupo, que sería inventarle un objetivo a alguien.
    const objetivo = meta.tipo === "vendedora" ? p.objetivoIndividual : null;
    return {
      clave: p.clave,
      nombre: p.nombre,
      vendido,
      aporte,
      objetivo,
      avance:
        objetivo == null
          ? null
          : avanceMeta({
              desde: meta.desde,
              hasta: meta.hasta,
              hoy,
              objetivo,
              vendido,
              pesos,
            }),
    };
  });

  // En la grupal el orden útil es quién más aportó; en la individual, quién va
  // mejor contra SU objetivo (no quién vendió más en bruto).
  porVendedora.sort((a, b) =>
    meta.tipo === "vendedora"
      ? (b.avance?.pctVendido ?? 0) - (a.avance?.pctVendido ?? 0)
      : b.vendido - a.vendido,
  );

  // Lo que el avance mide y NADIE de la lista puso. Se calcula del período de
  // ESTA meta —no es un 4% escrito a mano— y se acota a [0,1] por si un mes de
  // puras devoluciones dejara los números al revés.
  const aporteNoAsignado =
    vendidoGrupal > 0
      ? Math.min(1, Math.max(0, 1 - vendidoDeParticipantes / vendidoGrupal))
      : 0;

  return {
    ...meta,
    avance,
    porVendedora,
    aporteNoAsignado,
    fuente,
    temporadaDisponible: pesos.some((p) => p.ventas > 0),
  };
}

/**
 * La lista de personas entre las que se eligen participantes.
 *
 * Se arma con los últimos 12 meses para que aparezca todo el que vendió alguna
 * vez en el año, con sus ventas al lado para poder reconocerlas. NO decide
 * quién es vendedora: eso lo elige Daniel de la lista.
 */
export async function leerVendedorasCandidatas(hoy: string): Promise<VendedoraAgrupada[]> {
  // Un año hacia atrás. ⚠️ Restarle 1 al año a pelo produce `2027-02-29` cuando
  // hoy es un 29 de febrero — una fecha que no existe y que PostgREST rechaza,
  // así que la lista de participantes quedaría vacía UN día cada cuatro años.
  const unAnioAtras = new Date(`${hoy}T12:00:00Z`);
  unAnioAtras.setUTCFullYear(unAnioAtras.getUTCFullYear() - 1);
  const desde = unAnioAtras.toISOString().slice(0, 10);
  const { filas } = await leerVentasDelPeriodo(desde, hoy);
  // Las filas vienen AGREGADAS por (vendedor, mes): cada una trae su propio
  // conteo de documentos y hay que pasarlo, o el "N tiquetes" de la lista
  // contaría meses en vez de ventas.
  return agruparVendedoras(
    filas.map((f) => ({
      vendedor: f.vendedor,
      subtotal: f.ventas,
      documentos: f.documentos,
      ultima: f.ultima,
    })),
  );
}
