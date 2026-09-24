// ============================================================================
// Marketing — LAS FOTOS DE LA TIENDA SIGUEN AL PERÍODO (24-sep-2026).
// Módulo PURO: sin React, sin Supabase, sin fetch.
//
// Daniel, hoy: *«cuando me meto al período abierto, veo las fotos del período
// viejo»*. Medido el 24-sep-2026 en Outlet Duty Free N3 (D-118): sus DOS
// únicas fotos (16-jun y 30-jul) pertenecen a lo que ya se le pasó a PVH en
// «mid 2026», y salían bajo «Abierto» porque la cuadrícula no miraba el chip.
//
// 🩸 Y ANTES QUE ESO: NO SE PODÍA GUARDAR NINGUNA FOTO DE TIENDA. La puerta
// nueva manda `tipo = 'foto_proyecto'` con el proyecto VACÍO y la regla de la
// base (`mk_adjuntos_destino_chk`, del 11-ago-2026) todavía exige proyecto
// para ese tipo → error 23514 → 400, con el archivo YA subido al cajón.
// Medido: 4 archivos huérfanos en `tienda/D-118/` del 24-sep 21:50 UTC y
// **0 de 160** filas de adjunto con tienda y sin proyecto. La migración
// `20261219130000` afloja la regla y agrega `mk_adjuntos.periodo_id`.
//
// 🔴 EL SELLO DE UNA FOTO ES UNA COLUMNA, NO UNA FILA DE `mk_periodo_documentos`.
// Un gasto se sella por MARCA (una fila por marca, `proveedor_key`); una foto
// de tienda no tiene marca —es la tienda lo que se ve en la foto—, así que
// lleva UN período y nada más: `mk_adjuntos.periodo_id`.
//
// 🔴 «ABIERTO» ES LO MISMO QUE EN `periodo-manda.ts`: sin sello a un período
// CERRADO. Una foto sellada a un período ABIERTO y una foto SIN sello se ven
// las dos bajo «Abierto» — y cuando ese período cierre, la sellada se va con
// él sola.
//
// 🔴 FALLA ABIERTA. Sin la migración: la lectura no trae período (todas las
// fotos salen en todos los chips, como hoy) y la escritura avisa en español
// en vez de escupir el texto crudo de Postgres — y borra del cajón el archivo
// que acaba de subir, para no dejar más huérfanos.
//
// 🔴 EL INTERRUPTOR. `false` = las fotos como hoy (todas, sin mirar el chip) y
// el ZIP como antes. Ningún monto cambia ni con `true` ni con `false`.
// ============================================================================

import { claveDelPeriodo, PERIODO_ABIERTO, PERIODO_TODOS, type PeriodoDelGasto } from "./periodo-manda";

/** 🔴 El interruptor. `false` = las fotos como hoy y el ZIP como antes. */
export const MARKETING_FOTOS_CON_PERIODO = true;

// ─── LA FOTO Y SU PERÍODO ────────────────────────────────────────────────────

/** Lo mínimo que la cuadrícula necesita de una foto para filtrar por chip. */
export interface FotoConPeriodo {
  id: string;
  /** El período CERRADO al que quedó sellada. `null`/ausente = abierta. */
  periodo?: PeriodoDelGasto | null;
}

/** La clave del chip de una foto: el id del cerrado, o «abierto». */
export function claveDePeriodoDeFoto(foto: Pick<FotoConPeriodo, "periodo">): string {
  return claveDelPeriodo(foto);
}

/**
 * Las fotos que se ven con un chip puesto.
 *   «Todos»  → todas
 *   «Abierto»→ las selladas a un período abierto Y las que no tienen sello
 *   un cierre→ las selladas a ESE cierre
 * Con el interruptor apagado devuelve TODAS, siempre: la pantalla de hoy.
 */
export function fotosDelPeriodo<T extends FotoConPeriodo>(
  fotos: ReadonlyArray<T>,
  clave: string,
): T[] {
  if (!MARKETING_FOTOS_CON_PERIODO) return [...fotos];
  if (clave === PERIODO_TODOS) return [...fotos];
  return fotos.filter((f) => claveDePeriodoDeFoto(f) === clave);
}

/** El aviso de la cuadrícula vacía, según el chip. */
export function avisoSinFotosDelPeriodo(clave: string, tienda: boolean): string {
  const que = tienda ? "Esta tienda" : "Este proyecto";
  if (clave === PERIODO_TODOS) return `${que} no tiene fotos.`;
  if (clave === PERIODO_ABIERTO) return `${que} no tiene fotos nuevas. Mira «Todos» para ver las de antes.`;
  return `${que} no tiene fotos de ese período. Mira «Todos» para ver las demás.`;
}

// ─── EL PERÍODO DE UNA FOTO, RESUELTO ────────────────────────────────────────

/** Un período tal como sale de `mk_periodos`. */
export interface PeriodoLeidoParaFoto {
  id: string;
  nombre: string | null;
  nombreAlCerrar: string | null;
  proveedorKey: string;
  estado: string | null;
  cerradoEn: string | null;
}

/**
 * El `periodo` que viaja con la foto: SOLO si su sello apunta a un período
 * CERRADO (la misma regla que `delPeriodo` de la ficha). Sellada a uno
 * abierto, o sin sellar, o con un id que no existe → `null` = abierta.
 */
export function periodoDeLaFoto(
  periodoId: string | null | undefined,
  periodos: ReadonlyMap<string, PeriodoLeidoParaFoto>,
): PeriodoDelGasto | null {
  const id = String(periodoId ?? "").trim();
  if (!id) return null;
  const p = periodos.get(id);
  if (!p || p.estado !== "cerrado") return null;
  return {
    id,
    nombre: (p.nombreAlCerrar ?? p.nombre ?? "").trim(),
    proveedorKey: String(p.proveedorKey ?? "").trim(),
    cerradoEn: p.cerradoEn ?? null,
  };
}

// ─── CON QUÉ PERÍODO NACE UNA FOTO ───────────────────────────────────────────

/**
 * Un gasto de la tienda, para elegir a qué período abierto va la foto nueva.
 * `cuando` es la fecha con la que se ordena (ISO o AAAA-MM-DD).
 */
export interface GastoParaSellarFoto {
  documentoId: string;
  cuando: string;
  /** Los períodos ABIERTOS a los que ese gasto está sellado. */
  periodosAbiertos: ReadonlyArray<string>;
}

/**
 * 🔴 UNA FOTO DE TIENDA NACE EN EL PERÍODO ABIERTO DEL GASTO MÁS RECIENTE DE
 * ESA TIENDA. Es la regla y tiene su porqué: la foto se sube justo después de
 * registrar el gasto que documenta, así que acompaña a ese gasto y se le pasa
 * a la marca que lo pagó.
 *
 * ⚠️ Una tienda puede tener gastos de DOS marcas abiertos a la vez (medido:
 * D-118 tiene uno de Calvin y uno de Tommy del 21-sep). Ahí manda el más
 * reciente; empatados, el id de período más chico, para que la cuenta sea
 * siempre la misma.
 *
 * Sin gastos abiertos devuelve `null`: la foto queda sin sello, se ve en
 * «Abierto» y no viaja en ningún ZIP — exactamente lo de hoy.
 */
export function periodoAbiertoParaFotoNueva(
  gastos: ReadonlyArray<GastoParaSellarFoto>,
): string | null {
  const conPeriodo = gastos.filter((g) => g.periodosAbiertos.length > 0);
  if (conPeriodo.length === 0) return null;
  const ordenados = [...conPeriodo].sort((a, b) => {
    const c = String(b.cuando ?? "").localeCompare(String(a.cuando ?? ""));
    if (c !== 0) return c;
    return String(a.documentoId).localeCompare(String(b.documentoId));
  });
  const del = [...ordenados[0].periodosAbiertos].map(String).sort();
  return del[0] ?? null;
}

// ─── CUANDO LA BASE TODAVÍA NO TIENE LA REGLA NUEVA ──────────────────────────

/** El nombre de la regla que hoy rechaza una foto de tienda sin proyecto. */
export const REGLA_DESTINO = "mk_adjuntos_destino_chk";

/** Lo que se le dice a quien sube la foto cuando falta la migración. */
export const AVISO_FALTA_LA_MIGRACION =
  "Todavía no se pueden guardar fotos de tienda: falta aplicar la actualización de la base. Avísale a Daniel.";

/**
 * ¿La base rechazó la fila por la regla de destino? Es el 23514 de Postgres
 * (`check_violation`), y se confirma por el NOMBRE de la regla para no
 * confundirlo con cualquier otro CHECK de la tabla.
 */
export function esLaReglaDeDestino(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "");
  if (msg.includes(REGLA_DESTINO)) return true;
  return code === "23514";
}
