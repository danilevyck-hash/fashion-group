// ============================================================================
// Marketing — EL PERÍODO MANDA (23-sep-2026). Módulo PURO: sin React, sin
// Supabase, sin fetch.
//
// Daniel, con el mockup aprobado (`marketing-periodos.html`): «arriba eliges
// el período, abajo ves lo de ese período». La ficha de la tienda y la lista
// de Tiendas abren en «Abierto» —lo que todavía no se le pasó a ninguna marca,
// lo que Daniela está trabajando— y cada cierre viejo se elige con su nombre;
// «Todos» es la historia, agrupada por período, el más nuevo arriba.
//
// 🔑 LOS PERÍODOS SON DE CADA MARCA (`mk_periodos.proveedor_key`: Tommy cierra
// el suyo, Calvin el suyo), y una tienda mezcla marcas. Por eso el primer chip
// no es «Período 2026» a secas: es «Abierto», que junta todas las marcas. Los
// cerrados van con su nombre y su casa («mid 2026 · PVH»), como en
// `cerrados-por-periodo.ts`.
//
// 🔴 UN GASTO ESTÁ «ABIERTO» SI NINGÚN SELLO SUYO APUNTA A UN PERÍODO CERRADO.
// Con un sello a un cerrado, pertenece a ESE cerrado. Lo decide quien lee la
// base (datos.ts / reportes.ts) y acá solo se agrupa; los chips salen de los
// períodos REALES de los gastos, nunca de una lista escrita a mano.
//
// 🔴 NINGÚN NÚMERO CAMBIA: lo que suma sigue siendo `periodo-estado.ts`
// (solo lo que se reporta); acá se parte y se rotula. Medido el 23-sep-2026
// en Outlet Duty Free N3 (D-118): Abierto $6.401,27 (3) · mid 2026 $71,26 (1)
// · Todos $6.472,53.
//
// 🔴 LOS ANULADOS DESAPARECEN. Daniel: *«se elimina y listo… con seguro de
// que escriban ELIMINAR»*. Al anular, el gasto se va de TODAS las pantallas
// (ni chip, ni lista, ni conteo); la fila queda con `anulado_en` —recuperable
// solo por la base— y a los 90 días el cron `cleanup-marketing-anulados` la
// borra de verdad, con sus adjuntos.
// ============================================================================

import { fechaPanamaDe } from "@/lib/fecha-panama";
import { nombreDeProveedor, unirNombres } from "./cerrados-por-periodo";
import { formatearFecha } from "./normalizar";
import { totalesDelPeriodo } from "./periodo-estado";
import { reportePorTiendaDe, type GastoParaReporte, type NombresDeMarca } from "./reportes-rediseno";
import { filasDeTiendas, type FilaTienda } from "./tiendas-y-marcas";

// ─── EL PERÍODO DE UN GASTO ──────────────────────────────────────────────────

/** El período CERRADO al que quedó sellado un gasto. `null` = abierto. */
export interface PeriodoDelGasto {
  id: string;
  /** El nombre que se le puso al cerrar, o el de siempre. */
  nombre: string;
  /** `mk_periodos.proveedor_key`: la marca, o la casa («pvh»). */
  proveedorKey: string;
  cerradoEn: string | null;
}

export interface ConPeriodo {
  monto: number;
  seReporta?: boolean | null;
  periodo?: PeriodoDelGasto | null;
}

/** La clave del chip «Abierto». */
export const PERIODO_ABIERTO = "abierto";
/** La clave del chip «Todos». */
export const PERIODO_TODOS = "todos";
/** Con qué abre la ficha y la lista de Tiendas. */
export const PERIODO_INICIAL = PERIODO_ABIERTO;

export const ROTULO_ABIERTO = "Abierto";
export const ROTULO_TODOS = "Todos";
export const TEXTO_AUN_NO_PASADO = "aún no pasado a la marca";

/** La clave del período de un gasto: `abierto`, o el id del cerrado. */
export function claveDelPeriodo(g: Pick<ConPeriodo, "periodo">): string {
  const id = String(g.periodo?.id ?? "").trim();
  return id.length > 0 ? id : PERIODO_ABIERTO;
}

/** «mid 2026 · PVH»: el nombre y, si la casa se conoce, la casa. */
export function rotuloDelPeriodoCerrado(p: Pick<PeriodoDelGasto, "nombre" | "proveedorKey">): string {
  const casa = nombreDeProveedor(p.proveedorKey);
  const nombre = String(p.nombre ?? "").trim() || "Período cerrado";
  return casa ? `${nombre} · ${casa}` : nombre;
}

/** «11 ago 2026», con el día de PANAMÁ (el cierre se guarda en UTC). */
export function fechaDeCierre(cerradoEn: string | null | undefined): string {
  const s = String(cerradoEn ?? "").trim();
  if (!s) return "";
  const dia = /T|\s/.test(s) ? fechaPanamaDe(s) : s.slice(0, 10);
  return formatearFecha(dia);
}

// ─── LOS CHIPS DE ARRIBA ─────────────────────────────────────────────────────

export interface ChipDePeriodo {
  /** `abierto` · el id de un período cerrado · `todos`. */
  clave: string;
  rotulo: string;
  /** Cuántos gastos vivos caen ahí. */
  cantidad: number;
  cerrado: boolean;
  cerradoEn: string | null;
}

/**
 * 🔴 Los chips SALEN DE LOS GASTOS: «Abierto», después cada período cerrado
 * que tenga al menos un gasto (el más nuevo primero), y «Todos» al final.
 * Un cerrado sin gastos no se dibuja. Nunca una lista escrita a mano.
 */
export function chipsDePeriodos(gastos: ReadonlyArray<ConPeriodo>): ChipDePeriodo[] {
  let abiertos = 0;
  const cerrados = new Map<string, ChipDePeriodo>();
  for (const g of gastos) {
    const p = g.periodo;
    if (!p || !String(p.id ?? "").trim()) {
      abiertos += 1;
      continue;
    }
    const id = String(p.id).trim();
    const c = cerrados.get(id) ?? {
      clave: id,
      rotulo: rotuloDelPeriodoCerrado(p),
      cantidad: 0,
      cerrado: true,
      cerradoEn: p.cerradoEn ?? null,
    };
    c.cantidad += 1;
    cerrados.set(id, c);
  }
  const lista = [...cerrados.values()].sort(
    (a, b) => (b.cerradoEn ?? "").localeCompare(a.cerradoEn ?? "") || a.rotulo.localeCompare(b.rotulo, "es"),
  );
  return [
    { clave: PERIODO_ABIERTO, rotulo: ROTULO_ABIERTO, cantidad: abiertos, cerrado: false, cerradoEn: null },
    ...lista,
    { clave: PERIODO_TODOS, rotulo: ROTULO_TODOS, cantidad: gastos.length, cerrado: false, cerradoEn: null },
  ];
}

/** La clave elegida, si existe entre los chips; si no, «Abierto». */
export function periodoElegido(chips: ReadonlyArray<ChipDePeriodo>, clave: unknown): string {
  const c = String(clave ?? "").trim();
  return chips.some((x) => x.clave === c) ? c : PERIODO_INICIAL;
}

/** Los gastos de UN período. «Todos» devuelve todos. */
export function gastosDelPeriodo<T extends ConPeriodo>(gastos: ReadonlyArray<T>, clave: string): T[] {
  if (clave === PERIODO_TODOS) return [...gastos];
  return gastos.filter((g) => claveDelPeriodo(g) === clave);
}

// ─── «TODOS»: LOS BLOQUES POR PERÍODO ────────────────────────────────────────

export interface BloqueDePeriodo<T extends ConPeriodo> {
  clave: string;
  rotulo: string;
  cerrado: boolean;
  cerradoEn: string | null;
  gastos: T[];
  /** Lo reportado del bloque (regla única de `periodo-estado.ts`). */
  total: number;
  noReportado: number;
  cantidad: number;
}

/**
 * Los bloques de «Todos»: el abierto primero (si tiene algo) y los cerrados
 * del más nuevo al más viejo. Los subtotales SUMAN el total de la tienda por
 * construcción: cada gasto está en exactamente un bloque.
 */
export function bloquesPorPeriodo<T extends ConPeriodo>(gastos: ReadonlyArray<T>): BloqueDePeriodo<T>[] {
  const chips = chipsDePeriodos(gastos).filter((c) => c.clave !== PERIODO_TODOS && c.cantidad > 0);
  return chips.map((c) => {
    const del = gastosDelPeriodo(gastos, c.clave);
    const t = totalesDelPeriodo(del.map((g) => ({ monto: g.monto, seReporta: g.seReporta })));
    return {
      clave: c.clave,
      rotulo: c.rotulo,
      cerrado: c.cerrado,
      cerradoEn: c.cerradoEn,
      gastos: del,
      total: t.reportado,
      noReportado: t.noReportado,
      cantidad: del.length,
    };
  });
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * La cabecera de un bloque de «Todos»:
 *   «Abierto · aún no pasado a la marca · 3 gastos»
 *   «mid 2026 · PVH · cerrado el 11 ago 2026 · 1 gasto»
 */
export function cabeceraDelBloque(b: Pick<BloqueDePeriodo<ConPeriodo>, "clave" | "rotulo" | "cerrado" | "cerradoEn" | "cantidad">): string {
  const partes = [b.rotulo];
  if (b.clave === PERIODO_ABIERTO) partes.push(TEXTO_AUN_NO_PASADO);
  else if (b.cerrado) {
    const fecha = fechaDeCierre(b.cerradoEn);
    partes.push(fecha ? `cerrado el ${fecha}` : "cerrado");
  }
  partes.push(plural(b.cantidad, "gasto", "gastos"));
  return partes.join(" · ");
}

// ─── LOS RÓTULOS DE ARRIBA Y DEL PIE ─────────────────────────────────────────

/** El rótulo del KPI grande según el período que se mira. */
export function rotuloDelKpi(clave: string, chips: ReadonlyArray<ChipDePeriodo>): string {
  if (clave === PERIODO_TODOS) return "Total de la tienda · todos los períodos";
  if (clave === PERIODO_ABIERTO) return `${ROTULO_ABIERTO} · ${TEXTO_AUN_NO_PASADO}`;
  const chip = chips.find((c) => c.clave === clave);
  if (!chip) return "Total";
  const fecha = fechaDeCierre(chip.cerradoEn);
  return fecha ? `${chip.rotulo} · cerrado el ${fecha}` : chip.rotulo;
}

/** «de Calvin Klein y de Tommy Hilfiger» — o «de Tommy Hilfiger» con una. */
function deCadaMarca(marcas: ReadonlyArray<string>): string {
  const xs = [...new Set(marcas.map((m) => String(m ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
  return unirNombres(xs.map((m) => `de ${m}`));
}

/**
 * El pie de la tabla de la ficha:
 *   Abierto → «3 gastos · irán al próximo ZIP de Calvin Klein y de Tommy Hilfiger»
 *   cerrado → «1 gasto · ya pasado a la marca en «mid 2026 · PVH»»
 *   Todos   → «4 gastos en 2 períodos»
 * La tienda propia (Multifashion) no se le pasa a nadie, y se dice.
 */
export function textoDelPieDelPeriodo(args: {
  clave: string;
  cantidad: number;
  /** Nombres de las marcas de lo que SE REPORTA en el período. */
  marcas: ReadonlyArray<string>;
  /** Cuántos bloques tiene «Todos». */
  periodos: number;
  tiendaPropia: boolean;
  chips: ReadonlyArray<ChipDePeriodo>;
}): string {
  const gastos = plural(args.cantidad, "gasto", "gastos");
  if (args.clave === PERIODO_TODOS) {
    return `${gastos} en ${plural(args.periodos, "período", "períodos")}`;
  }
  if (args.tiendaPropia) return `${gastos} · no se le pasa a ninguna marca`;
  if (args.clave === PERIODO_ABIERTO) {
    const de = deCadaMarca(args.marcas);
    return de ? `${gastos} · irán al próximo ZIP ${de}` : gastos;
  }
  const chip = args.chips.find((c) => c.clave === args.clave);
  return chip ? `${gastos} · ya pasados a la marca en «${chip.rotulo}»` : gastos;
}

/** El pie de la lista de Tiendas: qué período se mira y cuántas tiendas. */
export function textoDelPieDeTiendas(clave: string, chips: ReadonlyArray<ChipDePeriodo>, tiendas: number): string {
  const n = plural(tiendas, "tienda", "tiendas");
  if (clave === PERIODO_TODOS) return `Todos los períodos · ${n}`;
  if (clave === PERIODO_ABIERTO) return `${ROTULO_ABIERTO} · lo que irá al próximo ZIP · ${n}`;
  const chip = chips.find((c) => c.clave === clave);
  return chip ? `${chip.rotulo} · ${n}` : n;
}

// ─── LA LISTA DE TIENDAS, POR PERÍODO ────────────────────────────────────────

export interface TiendasPorPeriodo {
  /** Los chips, salidos de los gastos. */
  periodos: ChipDePeriodo[];
  /** «Todos»: la lista de siempre. */
  filas: FilaTienda[];
  /** Por clave de chip (`abierto` y cada cerrado), la lista de ese período. */
  filasPorPeriodo: Record<string, FilaTienda[]>;
}

/**
 * La portada de Tiendas partida por período. Cada lista es EL MISMO reporte
 * por tienda (`reportePorTiendaDe`) sobre los gastos de ese período: ninguna
 * cuenta nueva. «Todos» es la lista completa de siempre.
 */
export function tiendasPorPeriodo(gastos: ReadonlyArray<GastoParaReporte>, nombres: NombresDeMarca): TiendasPorPeriodo {
  const periodos = chipsDePeriodos(gastos);
  const filasPorPeriodo: Record<string, FilaTienda[]> = {};
  for (const c of periodos) {
    if (c.clave === PERIODO_TODOS) continue;
    filasPorPeriodo[c.clave] = filasDeTiendas(reportePorTiendaDe(gastosDelPeriodo(gastos, c.clave), nombres));
  }
  return { periodos, filas: filasDeTiendas(reportePorTiendaDe(gastos, nombres)), filasPorPeriodo };
}

/** Las filas que se ven con un chip puesto. */
export function filasDeTiendasDelPeriodo(datos: TiendasPorPeriodo, clave: string): FilaTienda[] {
  if (clave === PERIODO_TODOS) return datos.filas;
  return datos.filasPorPeriodo[clave] ?? [];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** El total del pie de Tiendas: la suma de lo reportado de las filas que se ven. */
export function totalDeTiendas(filas: ReadonlyArray<Pick<FilaTienda, "total">>): number {
  return round2(filas.reduce((s, f) => s + (Number.isFinite(f.total) ? f.total : 0), 0));
}

// ─── LOS ANULADOS ────────────────────────────────────────────────────────────

/** A los 90 días de anulado, el cron lo borra de verdad. */
export const DIAS_PARA_BORRAR_ANULADOS = 90;

/** La palabra que hay que escribir para anular. Exacta, en mayúsculas. */
export const PALABRA_PARA_ANULAR = "ELIMINAR";

/** ¿Lo escrito confirma? Se recortan espacios; la palabra va tal cual. */
export function confirmaEliminar(texto: unknown): boolean {
  return String(texto ?? "").trim() === PALABRA_PARA_ANULAR;
}

/**
 * El corte del borrado: la medianoche de PANAMÁ de hace 90 días, en ISO.
 * Un anulado con `anulado_en` ANTERIOR al corte se borra.
 *   hoyPanama = "2026-09-23" → "2026-06-25T05:00:00.000Z"
 */
export function corteDeAnulados(hoyPanama: string): string {
  const medianoche = new Date(`${hoyPanama}T00:00:00-05:00`);
  if (Number.isNaN(medianoche.getTime())) throw new Error(`corteDeAnulados: fecha inválida ${hoyPanama}`);
  return new Date(medianoche.getTime() - DIAS_PARA_BORRAR_ANULADOS * 86400000).toISOString();
}

/** ¿Este anulado ya pasó los 90 días? Sin fecha de anulación, NO se borra. */
export function anuladoCaduco(anuladoEn: string | null | undefined, corte: string): boolean {
  const s = String(anuladoEn ?? "").trim();
  if (!s) return false;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return false;
  return t < new Date(corte).getTime();
}
