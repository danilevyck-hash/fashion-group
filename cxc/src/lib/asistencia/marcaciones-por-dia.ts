// ─────────────────────────────────────────────────────────────────────────────
// MARCACIONES POR DÍA — la regla, sin pantalla (25-sep-2026).
//
// Daniel, mirando el mockup: *«hazlo minimalista, user friendly; ya sabes que
// tienes que usar scroll down en vez de chips con cada persona»*.
//
// ── 🩸 LO QUE HABÍA ─────────────────────────────────────────────────────────
//
// Dos filas de chips —un chip por colaborador y otro por día— y una tabla de
// seis columnas SIN columna de fecha: **37 renglones sueltos** de cinco
// personas y cuatro días, todos mezclados, y para saber de qué día era cada uno
// había que tocar un chip. En el celular, **cuatro filas de botones** antes de
// la primera hora, y el día repetido en la esquina de cada tarjeta.
//
// ── 🔴 LA REGLA ─────────────────────────────────────────────────────────────
//
//   1. **El día es el encabezado**, y dentro va UNA fila por colaborador con
//      sus marcas del día en orden. De 37 renglones sueltos a 17 bajo cuatro
//      días. El día se baja con la rueda: no hay filtro de día.
//   2. **Las cuatro marcas se leen como tres tramos**: Entrada · Almuerzo
//      (salida y vuelta juntas, «18:01 – 18:01») · Salida.
//   3. **«Sin señal» es un punto**, no una pastilla que empuja el renglón.
//   4. **El lugar se dice UNA vez por fila y en palabras**: «Paso Canoas ·
//      46 km de la tienda». El código de mapa —«G5P6+2GH»— no le dice nada a
//      nadie y se va.
//   5. **El atraso se dice SOLO cuando lo hubo**. Desde el 29-sep-2026 (27a)
//      ya no es una línea gris bajo la fila: va en el `title` del punto gris
//      de la marca y entero en la hoja que abre la fila.
//      🔴 Y NUNCA con la palabra «llegó»: se dice **«se envió»**. La contadora
//      leería «llegó 9 h después» como que la persona llegó tarde a trabajar, y
//      no — a esa hora el teléfono recién encontró señal. Misma regla y mismo
//      candado que `lib/marcacion/en-el-reporte.ts` y `linea-del-dia.ts`.
//   6. **La columna «Aparato» se va**, y en su lugar queda un aviso ROJO en la
//      fila SOLO cuando dos colaboradores marcaron con el mismo teléfono ese
//      día. Un sello de seis letras no se mira; dos personas en un teléfono sí.
//
// 🔑 NINGÚN NÚMERO CAMBIA. Acá no se mide un minuto de planilla: se agrupa y se
// redacta. Las horas son las mismas, los atrasos salen de la MISMA cuenta
// (`demoraEnPalabras` de `marcaciones-pestana.ts`, que solo cambia de verbo) y
// la distancia exacta sigue entera en la hoja que se abre al tocar la fila.
//
// ⚠️ ESTE MÓDULO ES PURO: no lee la base, no llama a nadie y no sabe qué hora
// es. Quien lo usa le pasa las marcas ya leídas.
// ─────────────────────────────────────────────────────────────────────────────

import { diaPanamaDe, horaCorta } from "@/lib/marcacion/marcacion";
import { NOMBRES_DE_LA_MARCA } from "@/lib/marcacion/cuatro-marcas";
import { SIN_LUGAR } from "@/lib/asistencia/lugar-de-marca";
import { cuantoDespues } from "@/lib/asistencia/marcaciones-pestana";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { SALIDA_SOSPECHOSA_MIN } from "@/lib/asistencia/salida-sospechosa";
// 🔴 25a (29-sep-2026): las marcas repetidas se juntan con la MISMA regla y el
// MISMO número de la planilla —«1 minuto», ≤ 60 s de la última que cuenta—.
// No hay un segundo umbral aquí.
import { explicacionRepetida, olvidarRepetidas, type MarcaOlvidada } from "@/lib/asistencia/marca-repetida";

/** Hoy prendido. `false` = la pestaña de chips y seis columnas del 25-sep. */
export const MARCACIONES_POR_DIA = true;

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE DIBUJA ARRIBA
// ─────────────────────────────────────────────────────────────────────────────

/** Las TRES columnas de la computadora, en este orden. */
export const COLUMNAS_POR_DIA = ["Colaborador", "Sus marcas del día", "Lugar"] as const;

/** El único desplegable que queda al lado del período. */
export const ROTULO_TODOS = "Colaborador: todos";
export const ETIQUETA_COLABORADOR = "Colaborador";

/**
 * La nota de «solo se mira». 🔴 28a (29-sep-2026): arriba quedan SOLO período ·
 * calendario · «Colaborador: todos»; se fueron «84 marcas» y su ⓘ. La frase no
 * se pierde: va al pie de la hoja que abre la fila, que es donde a uno se le
 * ocurre corregir una hora.
 */
export const NOTA_SOLO_SE_MIRA =
  "Aquí solo se mira. Para corregir una hora, entra a Asistencia: la marca del teléfono no se edita " +
  "ni se borra, la corrección va encima y pide el porqué.";

/** El aviso ROJO de la fila. Dos personas, un teléfono: eso sí se mira. */
export const AVISO_MISMO_TELEFONO = "mismo teléfono que otro colaborador";

// ─────────────────────────────────────────────────────────────────────────────
// EL LUGAR, EN PALABRAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 EL CÓDIGO DE MAPA SE VA. El servicio de mapas antepone un «plus code»
 * —«G5P6+2GH, Paso Canoas»— cuando el punto no cae sobre un negocio con
 * nombre. Ese código no le dice nada a nadie y se come media celda.
 *
 * ⚠️ Se quita solo cuando queda algo detrás: un texto que es SOLO el código no
 * se convierte en un lugar inventado, se queda sin nombre.
 */
const CODIGO_DE_MAPA = /^[0-9A-Z]{4,8}\+[0-9A-Z]{2,3}(?:\s*,\s*|\s+|$)/;

export function sinCodigoDeMapa(texto: string | null | undefined): string {
  const t = String(texto ?? "").trim();
  if (!t) return "";
  return t.replace(CODIGO_DE_MAPA, "").trim();
}

/**
 * Cuánto se alejó del punto de referencia de su empresa, en palabras.
 * `null` cuando no hay contra qué medir: sin referencia no se afirma ninguna
 * distancia.
 *
 * 🔑 El número redondeado es el de la PANTALLA. El exacto —«a 46,4 km»— sigue
 * entero en la hoja que se abre al tocar la fila: no se pierde, se resume.
 */
export function distanciaDeLaTienda(metros: number | null | undefined): string | null {
  if (typeof metros !== "number" || !Number.isFinite(metros) || metros <= 0) return null;
  if (metros < 1000) {
    const m = Math.max(10, Math.round(metros / 10) * 10);
    return `${m} m de la tienda`;
  }
  return `${Math.round(metros / 1000)} km de la tienda`;
}

/**
 * El lugar de una fila, en una línea: «Paso Canoas · 46 km de la tienda».
 * Sin referencia, solo el nombre. Sin nombre, solo la distancia. Sin nada, «—».
 */
export function lugarEnPalabras(opts: {
  nombre?: string | null;
  metros?: number | null;
}): string {
  return lugarUnido(partesDelLugar(opts));
}

/** Las dos partes, en una línea: «Paso Canoas · 46 km de la tienda». */
function lugarUnido({ nombre, distancia }: { nombre: string; distancia: string | null }): string {
  if (nombre && distancia) return `${nombre} · ${distancia}`;
  return nombre || distancia || SIN_LUGAR;
}

/**
 * El lugar en sus DOS partes, para dibujarlas por separado (29-sep-2026): la
 * dirección —que se corta con «…» si no entra— y la distancia en gris al lado,
 * que nunca se parte en dos renglones. Daniel aprobó el audit donde se veía
 * «Calle del Cerro 453-43, David · 780 / m de la tienda» partido en dos.
 */
export function partesDelLugar(opts: {
  nombre?: string | null;
  metros?: number | null;
}): { nombre: string; distancia: string | null } {
  return { nombre: sinCodigoDeMapa(opts.nombre), distancia: distanciaDeLaTienda(opts.metros) };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS TRAMOS DEL DÍA
// ─────────────────────────────────────────────────────────────────────────────

/** Las cuatro marcas se leen como tres tramos. El resto va como vino. */
export type ClaveTramo = "entrada" | "almuerzo" | "salida" | string;

/** El rótulo de cada tramo, tal como se lee en la fila. */
export const ROTULO_TRAMO: Record<string, string> = {
  entrada: "Entrada",
  almuerzo: "Almuerzo",
  salida: "Salida",
};

// 🩸 `ARTICULO_TRAMO` («la entrada», «la salida») se fue el 29-sep-2026 con la
// línea gris del atraso (27a): el punto dice el atraso de SU marca.

/** A qué tramo pertenece la marca número `indice` del día de esa persona. */
export function tramoDeLaMarca(indice: number): ClaveTramo {
  const i = Math.floor(Number.isFinite(indice) ? indice : -1);
  if (i === 0) return "entrada";
  if (i === 1 || i === 2) return "almuerzo";
  if (i === 3) return "salida";
  return `marca-${i}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOS MARCAS Y LA SEGUNDA A SU HORA DE SALIDA (29-sep-2026)
//
// 🩸 En Paso Canoas se leía «Entrada 08:59 · Almuerzo 18:00»: dos marcas, y la
// segunda —que es a las 18:00, su hora de irse— salía como almuerzo y la
// salida parecía faltar. Daniel aprobó en el audit: si hay DOS marcas y la
// segunda cae a su hora de salida (o hasta X min antes), se lee SALIDA y se
// avisa en ámbar «sin almuerzo marcado».
//
// 🔑 ESTO ES SOLO LO QUE SE LEE AQUÍ. El motor de la planilla (`reporte.ts`)
// SIEMPRE tomó la última marca del día como la salida; esta pantalla se pone
// de acuerdo con él. Ni un minuto de planilla se mueve.
//
// 🔑 X = `SALIDA_SOSPECHOSA_MIN` (120), el umbral ya medido y decidido para
// «Revisar salida» (`salida-sospechosa.ts`): más de dos horas antes de su
// salida es un día raro y sigue leyéndose como antes. Un solo número, no dos.
//
// ⚠️ Sin hora de salida configurada no se adivina: se lee como antes.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántos minutos antes de su salida todavía se lee «Salida». */
export const MINUTOS_ANTES_DE_LA_SALIDA = SALIDA_SOSPECHOSA_MIN;

/** El aviso ámbar de la fila. */
export const AVISO_SIN_ALMUERZO = "sin almuerzo marcado";
// 🩸 «N marcas en el mismo minuto» se fue el 29-sep-2026 (25a): lo dice el ×N
// de la marca, con la regla de la planilla. Dos avisos para lo mismo sobraban.

const aMinutos = (hhmm: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** ¿La 2.ª de exactamente dos marcas (ya ordenadas) es la salida? */
export function segundaEsSalida(marcas: readonly MarcaParaElDia[]): boolean {
  if (marcas.length !== 2) return false;
  const salida = aMinutos(marcas[1].salidaHorario ?? marcas[0].salidaHorario);
  if (salida === null) return false;
  const segunda = aMinutos(horaCorta(marcas[1].ocurrioEn))!;
  return segunda >= salida - MINUTOS_ANTES_DE_LA_SALIDA;
}

/** El tramo de cada marca del día (ya ordenado), con la regla de arriba. */
function clavesDelDia(marcas: readonly MarcaParaElDia[]): ClaveTramo[] {
  const salida = segundaEsSalida(marcas);
  return marcas.map((_, i) => (salida && i === 1 ? "salida" : tramoDeLaMarca(i)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 25a — LAS MARCAS REPETIDAS SE JUNTAN COMO LAS CUENTA LA PLANILLA
// (29-sep-2026, aprobado por Daniel sobre su mockup)
//
// 🩸 Se leía «Entrada 09:00 · Almuerzo 18:00 – 18:00 · Salida 18:00»: el dedo
// tocó tres veces al irse y la pantalla inventaba un almuerzo de cero minutos.
// La planilla (`reporte.ts`) nunca lo vio así: olvida toda marca que llega a
// 60 s o menos de la última que cuenta (`marca-repetida.ts`). Ahora la pantalla
// dice lo mismo: «Entrada 09:00 · Salida 18:00 ×3», con el ×N en gris.
//
// 🔑 La regla NO se copia: se le pregunta a `olvidarRepetidas`, con su umbral
// de siempre (`SEGUNDOS_MARCA_REPETIDA`). Los tramos se arman con las que
// CUENTAN; las olvidadas suman al ×N de la que las hizo repetidas.
// 🔑 Nada se esconde: la hoja que abre la fila trae TODAS las marcas crudas, y
// la repetida dice su porqué con la MISMA frase del reporte.
// ─────────────────────────────────────────────────────────────────────────────

const segundoDe = (m: MarcaParaElDia): number => Math.floor(Date.parse(m.ocurrioEn) / 1000);

/** «HH:MM:SS» de Panamá (UTC−5 fijo), como la escribe el reporte. */
const horaConSegundos = (seg: number): string =>
  new Date((seg - 5 * 3600) * 1000).toISOString().slice(11, 19);

export interface MarcasJuntas<T> {
  /** Las que CUENTAN, en orden: con ellas se leen los tramos. */
  buenas: T[];
  /** Cuántas marcas crudas representa cada buena (ella + sus repetidas). */
  veces: number[];
  /** Por cada marca cruda: a qué buena pertenece y, si no cuenta, por qué. */
  deCada: { buena: number; repetida: MarcaOlvidada | null }[];
}

/**
 * Parte las marcas de UN día (ya ordenadas) en las que cuentan y las repetidas,
 * con la regla de la planilla.
 *
 * 🔑 El reparto de vuelta a cada marca es seguro: una olvidada está a ≤ 60 s de
 * su buena y la buena siguiente a más de 60 s, así que recorrerlas en orden y
 * tomar como buena la primera que coincide con la próxima buena no se equivoca
 * (ni con dos marcas del mismo segundo: la primera es la que cuenta).
 */
export function juntarRepetidas<T extends MarcaParaElDia>(ordenadas: readonly T[]): MarcasJuntas<T> {
  const { buenas: segBuenas, olvidadas } = olvidarRepetidas(ordenadas.map(segundoDe));
  const out: MarcasJuntas<T> = { buenas: [], veces: [], deCada: [] };
  let b = 0;
  let o = 0;
  for (const m of ordenadas) {
    if (b < segBuenas.length && segundoDe(m) === segBuenas[b]) {
      out.buenas.push(m);
      out.veces.push(1);
      out.deCada.push({ buena: out.buenas.length - 1, repetida: null });
      b++;
    } else {
      const i = out.buenas.length - 1;
      out.veces[i]++;
      out.deCada.push({ buena: i, repetida: olvidadas[o++] ?? null });
    }
  }
  return out;
}

/**
 * Por cada marca CRUDA del día: con qué número de marca se nombra en la hoja
 * (0 entrada … 3 salida, el mismo de `rotuloDeLaMarca`) y, si es repetida, la
 * frase del reporte: «repetida, 15 s después de 18:00:05 — no cuenta».
 */
export function marcasDeLaHoja(ordenadas: readonly MarcaParaElDia[]): { indice: number; repetida: string | null }[] {
  const j = juntarRepetidas(ordenadas);
  const salida = segundaEsSalida(j.buenas);
  return j.deCada.map((x) => ({
    indice: salida && x.buena === 1 ? 3 : x.buena,
    repetida: x.repetida
      ? explicacionRepetida({
          despuesDe: horaConSegundos(x.repetida.despuesDeSeg),
          segundosDespues: x.repetida.segundosDespues,
        })
      : null,
  }));
}

/** Los avisos ámbar del día (hoy solo «sin almuerzo marcado»). */
export function avisosDelDia(marcas: readonly MarcaParaElDia[]): string[] {
  return segundaEsSalida(juntarRepetidas(marcas).buenas) ? [AVISO_SIN_ALMUERZO] : [];
}

/** El rótulo de un tramo que no es uno de los tres. Sale del `tipo` de la base. */
function rotuloSuelto(indice: number, tipo: string | null | undefined): string {
  const i = Math.floor(Number.isFinite(indice) ? indice : -1);
  const nombre =
    i >= 0 && i < NOMBRES_DE_LA_MARCA.length ? NOMBRES_DE_LA_MARCA[i] : String(tipo ?? "").trim();
  if (!nombre) return "Marca";
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// EL ATRASO — «se envió», nunca «llegó»
// ─────────────────────────────────────────────────────────────────────────────

/** El verbo, en UN solo lugar. 🔴 «llegó» está prohibida en esta pantalla. */
export const VERBO_ENVIO = "se envió";

/**
 * 🔴 27a (29-sep-2026): el punto gris y lo que dice. 🩸 La línea gris «sin
 * señal: la entrada se envió 9 h después · la salida, 6 min después» partía la
 * fila en dos renglones; Daniel aprobó que salga de la fila. Queda el punto
 * junto a la marca, y esto es su `title`: «Sin señal: se envió 9 h después».
 * `null` = nada que decir, y no hay punto. El detalle entero sigue en la hoja.
 *
 * Con varias marcas en el tramo (almuerzo, o repetidas) cada atraso lleva su
 * hora: «Sin señal: 18:01 se envió 6 min después».
 */
export function avisoDelTramo(marcas: readonly MarcaParaElDia[]): string | null {
  const sinSenal = marcas.some((m) => m.sinSenal);
  const envios = marcas
    .map((m) => ({ hora: horaCorta(m.ocurrioEn), cuanto: cuantoDespues(m.ocurrioEn, m.creadoEn) }))
    .filter((x): x is { hora: string; cuanto: string } => Boolean(x.cuanto));
  const frase = envios
    .map((x) => (marcas.length > 1 ? `${x.hora} ${VERBO_ENVIO} ${x.cuanto}` : `${VERBO_ENVIO} ${x.cuanto}`))
    .join(" · ");
  if (sinSenal) return frase ? `Sin señal: ${frase}` : "Sin señal";
  return frase ? frase.charAt(0).toUpperCase() + frase.slice(1) : null;
}

/**
 * La línea bajo la hora en la hoja que abre la fila (27a: el atraso vive aquí,
 * entero). 🔴 Con «se envió», como la pantalla: «Marcada sin señal · se envió
 * 9 h después». La cuenta es la MISMA (`cuantoDespues`).
 */
export function detalleEnLaHoja(m: MarcaParaElDia): string {
  const base = m.sinSenal ? "Marcada sin señal" : "Marcada con señal";
  const cuanto = cuantoDespues(m.ocurrioEn, m.creadoEn);
  return cuanto ? `${base} · ${VERBO_ENVIO} ${cuanto}` : `${base} · al instante`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE ENTRA Y LO QUE SALE
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que esta regla le pide a una marca del teléfono. */
export interface MarcaParaElDia {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  /** ISO en UTC. El día y la hora se sacan en hora de PANAMÁ. */
  ocurrioEn: string;
  creadoEn: string | null;
  sinSenal: boolean;
  lugar: {
    texto: string;
    /** El nombre crudo del lugar, sin la distancia pegada. */
    nombre?: string | null;
    metros?: number | null;
  };
  /** Su hora de salida configurada ese día («HH:MM»), o `null` si no tiene. */
  salidaHorario?: string | null;
}

export interface TramoDibujado {
  clave: ClaveTramo;
  rotulo: string;
  /** «08:59» o «18:01 – 18:01», sin el ×N. */
  horas: string;
  /** Cada hora del tramo con cuántas marcas crudas junta (25a: «18:00 ×3»). */
  partes: { hora: string; veces: number }[];
  /** Alguna de sus marcas se mandó sin señal. */
  sinSenal: boolean;
  /** El `title` del punto gris (ver `avisoDelTramo`); `null` = sin punto. */
  aviso: string | null;
}

/** Un lugar ya en palabras, en sus dos partes y entero. */
export interface LugarDibujado {
  nombre: string;
  distancia: string | null;
  /** «Paso Canoas · 46 km de la tienda». Es el `title`. */
  texto: string;
}

export interface FilaPorDia<T> {
  /** `codigo|dia`, estable: sirve de `key`. */
  llave: string;
  codigo: string;
  nombre: string;
  dia: string;
  tramos: TramoDibujado[];
  /** «Paso Canoas · 46 km de la tienda». Es el `title` de la celda. */
  lugar: string;
  /** Las dos partes del lugar, para dibujarlas por separado. */
  lugarNombre: string;
  lugarDistancia: string | null;
  /** 26a: la fila escribe su lugar porque NO es el del día (ver `lugarDelDia`). */
  lugarEnLaFila: boolean;
  /** Los avisos ámbar del día (ver `avisosDelDia`). */
  avisos: string[];
  /** Por cada marca cruda: su número en la hoja y, si es repetida, su porqué. */
  hoja: { indice: number; repetida: string | null }[];
  /** Ese día, otro colaborador marcó desde este mismo teléfono. */
  mismoTelefono: boolean;
  /** TODAS las marcas crudas del día, en orden: es lo que abre la hoja. */
  marcas: T[];
}

export interface DiaDeMarcaciones<T> {
  /** El día de Panamá (`YYYY-MM-DD`). */
  dia: string;
  /** «vie 25 sep». */
  rotulo: string;
  /** 26a: el lugar de TODO el día, al lado de la fecha; `null` = no hay uno. */
  lugar: LugarDibujado | null;
  filas: FilaPorDia<T>[];
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** «jue 25 sep» — la fecha de un día de Panamá (`YYYY-MM-DD`), como se lee aquí. */
export function fechaDelDia(dia: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? "").trim());
  if (!m) return String(dia ?? "");
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = new Date(Date.UTC(a, mes - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${d} ${MESES[mes - 1]}`;
}

/**
 * 🔴 EL LUGAR DE LA FILA. Se escribe el de la PRIMERA marca del día que tenga
 * uno: es dónde estuvo esa persona ese día. Si alguna cayó en otro sitio, el
 * detalle de cada marca sigue entero en la hoja que abre la fila — acá se
 * resume, y resumir es el punto de toda la pantalla.
 */
export function lugarDeLaFila(marcas: readonly MarcaParaElDia[]): string {
  return lugarUnido(partesDelLugarDeLaFila(marcas));
}

/**
 * 🩸 29-sep-2026: se leía «a 46,4 km · 46 km de la tienda». Sin dirección
 * guardada, el nombre caía a `lugar.texto`, que ES la distancia («a 46,4 km»)
 * y se pegaba delante de la misma distancia redondeada. El nombre sale SOLO de
 * `lugar.nombre`: sin él, se dice la distancia una vez.
 */
export function partesDelLugarDeLaFila(
  marcas: readonly MarcaParaElDia[],
): { nombre: string; distancia: string | null } {
  for (const m of marcas) {
    const p = partesDelLugar({ nombre: m.lugar?.nombre ?? null, metros: m.lugar?.metros ?? null });
    if (p.nombre || p.distancia) return p;
  }
  return { nombre: "", distancia: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 26a — EL LUGAR SOLO CUANDO CAMBIA (29-sep-2026, aprobado por Daniel)
//
// 🩸 «Paso Canoas · 46 km de la tienda» se repetía en cada fila del día, igual
// en todas. Ahora el lugar del día va UNA vez, al lado de la fecha —«jue 24 sep
// · Paso Canoas · 46 km de la tienda»— y la fila solo escribe el suyo cuando es
// OTRO.
//
// 🔑 «MISMO LUGAR» = lo mismo que se LEE en pantalla: el nombre sin el código de
// mapa y la distancia YA REDONDEADA («46 km de la tienda»), comparados sin
// mayúsculas ni espacios de más. Dos marcas a 46,2 y 46,4 km del mismo pueblo
// son el mismo lugar; «Paso Canoas» a 46 km y a 12 km, no. Sin nombre ni
// distancia, la fila no tiene lugar (clave vacía).
//
// 🔑 EL LUGAR DEL DÍA: el que más filas comparten, si es UNO solo (sin empate) y
// lo comparten al menos dos filas —o el día tiene una sola fila—. Si no, el día
// no tiene lugar y cada fila escribe el suyo. Una fila SIN lugar en un día que
// sí tiene uno escribe «—»: callarse diría que estuvo ahí.
// ─────────────────────────────────────────────────────────────────────────────

/** La clave con que se compara «mismo lugar». Vacía = sin lugar. */
export function claveDelLugar(p: { nombre: string; distancia: string | null }): string {
  if (!p.nombre && !p.distancia) return "";
  return lugarUnido(p).toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
}

/** La clave del lugar del día (ver arriba), o `""` si el día no tiene uno. */
export function lugarDelDia(claves: readonly string[]): string {
  const cuenta = new Map<string, number>();
  for (const c of claves) if (c) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  let mejor = "";
  let n = 0;
  let empate = false;
  for (const [c, k] of cuenta) {
    if (k > n) { mejor = c; n = k; empate = false; } else if (k === n) empate = true;
  }
  if (!mejor || empate) return "";
  return n >= 2 || claves.length === 1 ? mejor : "";
}

/** ¿Alguna fila del período escribe su lugar? Si no, la columna «Lugar» no va. */
export function hayColumnaLugar(dias: readonly DiaDeMarcaciones<unknown>[]): boolean {
  return dias.some((d) => d.filas.some((f) => f.lugarEnLaFila));
}

const porHora = (a: MarcaParaElDia, b: MarcaParaElDia): number =>
  a.ocurrioEn.localeCompare(b.ocurrioEn) || a.id.localeCompare(b.id);

/** Los tramos de un día, ya ordenado por hora, con las repetidas juntas (25a). */
export function tramosDelDia(marcas: readonly MarcaParaElDia[]): TramoDibujado[] {
  const j = juntarRepetidas(marcas);
  const claves = clavesDelDia(j.buenas);
  const orden: ClaveTramo[] = [];
  const juntas = new Map<ClaveTramo, { partes: { hora: string; veces: number }[]; crudas: MarcaParaElDia[]; rotulo: string }>();

  j.buenas.forEach((m, i) => {
    const clave = claves[i];
    const crudas = marcas.filter((_, k) => j.deCada[k].buena === i);
    const parte = { hora: horaCorta(m.ocurrioEn), veces: j.veces[i] };
    const g = juntas.get(clave);
    if (!g) {
      orden.push(clave);
      juntas.set(clave, { partes: [parte], crudas, rotulo: ROTULO_TRAMO[clave] ?? rotuloSuelto(i, m.tipo) });
    } else {
      g.partes.push(parte);
      g.crudas.push(...crudas);
    }
  });

  return orden.map((clave) => {
    const g = juntas.get(clave)!;
    const horas = g.partes.map((p) => p.hora);
    return {
      clave,
      rotulo: g.rotulo,
      // 🔑 El almuerzo se lee de corrido: «18:01 – 18:01», nunca dos renglones.
      horas: horas.length > 1 ? `${horas[0]} – ${horas[horas.length - 1]}` : horas[0],
      partes: g.partes.length > 1 ? [g.partes[0], g.partes[g.partes.length - 1]] : g.partes,
      sinSenal: g.crudas.some((m) => m.sinSenal),
      aviso: avisoDelTramo(g.crudas),
    };
  });
}

/**
 * 🔴 AGRUPADO POR DÍA, Y DENTRO UNA FILA POR COLABORADOR. El día más reciente
 * arriba —es el que se viene a mirar— y, dentro del día, por nombre.
 *
 * `compartidas` son los ids de las marcas que salieron del MISMO teléfono que
 * las de otra persona ese día. Se recibe ya calculado para no repetir aquí la
 * regla con la que se le avisa a Daniel por Telegram.
 */
export function diasDeMarcaciones<T extends MarcaParaElDia>(
  marcas: readonly T[],
  compartidas?: ReadonlySet<string> | null,
): DiaDeMarcaciones<T>[] {
  const grupos = new Map<string, { codigo: string; nombre: string; dia: string; marcas: T[] }>();

  for (const m of marcas) {
    const dia = diaPanamaDe(m.ocurrioEn);
    if (!dia) continue;
    const llave = `${m.codigo}|${dia}`;
    const g = grupos.get(llave) ?? { codigo: m.codigo, nombre: m.nombre, dia, marcas: [] as T[] };
    g.marcas.push(m);
    grupos.set(llave, g);
  }

  const porDia = new Map<string, FilaPorDia<T>[]>();
  for (const [llave, g] of grupos) {
    const ordenadas = [...g.marcas].sort(porHora);
    const lugar = partesDelLugarDeLaFila(ordenadas);
    const fila: FilaPorDia<T> = {
      llave,
      codigo: g.codigo,
      nombre: capitalizarNombre(g.nombre) || g.codigo,
      dia: g.dia,
      tramos: tramosDelDia(ordenadas),
      lugar: lugarUnido(lugar),
      lugarNombre: lugar.nombre,
      lugarDistancia: lugar.distancia,
      lugarEnLaFila: true,
      avisos: avisosDelDia(ordenadas),
      hoja: marcasDeLaHoja(ordenadas),
      mismoTelefono: ordenadas.some((m) => compartidas?.has(m.id) === true),
      marcas: ordenadas,
    };
    const lista = porDia.get(g.dia) ?? [];
    lista.push(fila);
    porDia.set(g.dia, lista);
  }

  return [...porDia.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dia, filas]) => {
      const claves = filas.map((f) => claveDelLugar({ nombre: f.lugarNombre, distancia: f.lugarDistancia }));
      const delDia = lugarDelDia(claves);
      const comun = delDia ? filas[claves.indexOf(delDia)] : null;
      filas.forEach((f, i) => { f.lugarEnLaFila = claves[i] !== delDia; });
      return {
        dia,
        rotulo: fechaDelDia(dia),
        lugar: comun ? { nombre: comun.lugarNombre, distancia: comun.lugarDistancia, texto: comun.lugar } : null,
        filas: filas.sort((a, b) => a.nombre.localeCompare(b.nombre)),
      };
    });
}
