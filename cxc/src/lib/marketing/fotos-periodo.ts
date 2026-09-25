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

import { MARCAS_BLOQUE, marcaBloquePorKey } from "./bloques";
import { nombreDeProveedor } from "./cerrados-por-periodo";
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
 * Un gasto de la tienda, para saber qué marcas tiene abiertas.
 * `cuando` es la fecha con la que se ordena (ISO o AAAA-MM-DD).
 */
export interface GastoParaSellarFoto {
  documentoId: string;
  cuando: string;
  /** Los períodos ABIERTOS a los que ese gasto está sellado. */
  periodosAbiertos: ReadonlyArray<string>;
}

/**
 * Los períodos ABIERTOS de una tienda, sin repetir, el del gasto MÁS RECIENTE
 * primero. Empatados, el id más chico: la cuenta es siempre la misma.
 */
export function periodosAbiertosOrdenados(
  gastos: ReadonlyArray<GastoParaSellarFoto>,
): string[] {
  const ordenados = [...gastos]
    .filter((g) => g.periodosAbiertos.length > 0)
    .sort((a, b) => {
      const c = String(b.cuando ?? "").localeCompare(String(a.cuando ?? ""));
      if (c !== 0) return c;
      return String(a.documentoId).localeCompare(String(b.documentoId));
    });
  const vistos: string[] = [];
  for (const g of ordenados) {
    for (const pid of [...g.periodosAbiertos].map(String).sort()) {
      if (pid && !vistos.includes(pid)) vistos.push(pid);
    }
  }
  return vistos;
}

/**
 * El período abierto del gasto MÁS RECIENTE de la tienda. Con UNA sola marca
 * abierta es la respuesta entera; con dos o más es solo el primero de la
 * lista, y quien sube la foto ELIGE (`destinoDeFotoNueva`).
 */
export function periodoAbiertoParaFotoNueva(
  gastos: ReadonlyArray<GastoParaSellarFoto>,
): string | null {
  return periodosAbiertosOrdenados(gastos)[0] ?? null;
}

// ─── 🔴 LA FOTO VA A LA TIENDA DEL PERÍODO ABIERTO, Y LA MARCA SE ELIGE ──────
//
// Daniel, 24-sep-2026: *«las fotos deben ir a la tienda del período abierto;
// un período cerrado, nada debe entrar ni salir»*. Los períodos son POR MARCA,
// así que una tienda puede tener DOS abiertos a la vez — medido hoy: D-118
// (Calvin + Tommy), D-170 (Tommy + Calvin) y el cajón «General»; D-87 tiene
// una sola (Joybees).
//
//   · UNA marca abierta  → la foto va ahí, sin preguntar.
//   · DOS o más          → se elige con un toque, y el SERVIDOR lo valida.
//   · NINGUNA            → la foto queda sin sello y se ve en «Abierto».
//   · un período CERRADO → no entra: 400 en español.

/** Una marca con período ABIERTO en esta tienda: lo que se elige con un toque. */
export interface MarcaAbiertaDeLaTienda {
  /** `mk_periodos.id` — lo que se guarda en `mk_adjuntos.periodo_id`. */
  periodoId: string;
  /** `mk_periodos.proveedor_key`: la clave de la marca, o la de su casa. */
  proveedorKey: string;
  /** El nombre que se lee en el botón: «Tommy Hilfiger». */
  nombre: string;
}

/** La pregunta, cuando hay más de una marca abierta. */
export const PREGUNTA_DE_LA_MARCA = "¿De qué marca es la foto?";

/** Falta elegir: la pantalla no la abrió, o el servidor no recibió nada. */
export const AVISO_ELIGE_LA_MARCA =
  "Esta tienda tiene más de una marca abierta. Elige a cuál va la foto antes de subirla.";

/** La marca que llegó no tiene gastos abiertos en esta tienda. */
export const AVISO_MARCA_AJENA =
  "Esa marca no tiene gastos abiertos en esta tienda. Elige una de las que salen.";

/** 🔴 A un período cerrado no entra ni sale nada. */
export const AVISO_PERIODO_CERRADO =
  "Ese período ya está cerrado: a un período cerrado no entra ni sale nada.";

/** Cómo se lee una marca en pantalla; sin nombre conocido, su propia clave. */
export function nombreDeMarcaAbierta(proveedorKey: string | null | undefined): string {
  const k = String(proveedorKey ?? "").trim();
  if (!k) return "";
  return marcaBloquePorKey(k)?.nombreFallback ?? nombreDeProveedor(k) ?? k;
}

const ORDEN_DE_MARCA: ReadonlyMap<string, number> = new Map(
  MARCAS_BLOQUE.map((m, i) => [String(m.key), i] as const),
);

/**
 * Las marcas abiertas, sin repetir y en el orden de siempre (el de
 * `MARCAS_BLOQUE`); lo que no es una marca conocida va al final, por nombre.
 * 🔴 Nada se preselecciona: esto solo decide cómo se DIBUJAN los botones.
 */
export function marcasAbiertasOrdenadas(
  crudas: ReadonlyArray<{ periodoId: string; proveedorKey: string }>,
): MarcaAbiertaDeLaTienda[] {
  const porPeriodo = new Map<string, MarcaAbiertaDeLaTienda>();
  for (const c of crudas) {
    const periodoId = String(c.periodoId ?? "").trim();
    if (!periodoId || porPeriodo.has(periodoId)) continue;
    const proveedorKey = String(c.proveedorKey ?? "").trim();
    porPeriodo.set(periodoId, {
      periodoId,
      proveedorKey,
      nombre: nombreDeMarcaAbierta(proveedorKey) || periodoId,
    });
  }
  const lugar = (m: MarcaAbiertaDeLaTienda) =>
    ORDEN_DE_MARCA.get(m.proveedorKey.toUpperCase()) ?? ORDEN_DE_MARCA.size;
  return [...porPeriodo.values()].sort((a, b) => {
    const d = lugar(a) - lugar(b);
    if (d !== 0) return d;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

/** ¿Hay que preguntar? Solo con DOS o más marcas abiertas. */
export function necesitaElegirMarca(
  opciones: ReadonlyArray<MarcaAbiertaDeLaTienda>,
): boolean {
  return MARKETING_FOTOS_CON_PERIODO && opciones.length >= 2;
}

/** La marca elegida, buscada por id de período O por su clave. Nunca por parecido. */
export function marcaElegidaEntre(
  opciones: ReadonlyArray<MarcaAbiertaDeLaTienda>,
  elegido: string | null | undefined,
): MarcaAbiertaDeLaTienda | null {
  const e = String(elegido ?? "").trim();
  if (!e) return null;
  const porId = opciones.find((o) => o.periodoId === e);
  if (porId) return porId;
  const k = e.toUpperCase();
  return opciones.find((o) => o.proveedorKey.toUpperCase() === k) ?? null;
}

/** Lo que el servidor decide con lo que llegó. */
export interface DestinoDeFotoNueva {
  /** `true` = se puede guardar. `false` = 400 con `error`. */
  ok: boolean;
  /** El sello que va en `mk_adjuntos.periodo_id`. `null` = sin sello. */
  periodoId: string | null;
  /** El aviso en español, cuando no se puede. */
  error: string | null;
  /** Había que preguntar y no llegó nada elegido. */
  faltaElegir: boolean;
}

/**
 * 🔴 A QUÉ PERÍODO VA UNA FOTO NUEVA. Una sola regla, la misma para la puerta,
 * la pantalla y el script de rescate:
 *
 *   · sin marcas abiertas → sin sello (se ve en «Abierto», como hoy);
 *   · una sola            → esa, sin preguntar;
 *   · dos o más           → la elegida, y sin elección es 400;
 *   · una marca que no está entre las abiertas → 400, nunca se adivina.
 *
 * Con el interruptor apagado no se sella nada: la pantalla de antes.
 */
export function destinoDeFotoNueva(
  opciones: ReadonlyArray<MarcaAbiertaDeLaTienda>,
  elegido: string | null | undefined,
): DestinoDeFotoNueva {
  if (!MARKETING_FOTOS_CON_PERIODO) {
    return { ok: true, periodoId: null, error: null, faltaElegir: false };
  }
  const e = String(elegido ?? "").trim();
  const match = marcaElegidaEntre(opciones, e);
  if (e && !match) {
    return { ok: false, periodoId: null, error: AVISO_MARCA_AJENA, faltaElegir: false };
  }
  if (opciones.length === 0) {
    return { ok: true, periodoId: null, error: null, faltaElegir: false };
  }
  if (match) {
    return { ok: true, periodoId: match.periodoId, error: null, faltaElegir: false };
  }
  if (opciones.length === 1) {
    return { ok: true, periodoId: opciones[0].periodoId, error: null, faltaElegir: false };
  }
  return { ok: false, periodoId: null, error: AVISO_ELIGE_LA_MARCA, faltaElegir: true };
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
