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
//   5. **El atraso se dice SOLO cuando lo hubo**, en gris bajo la fila.
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
 * La nota del pie pasó a un ⓘ al lado del conteo: es la misma frase, en el
 * lugar donde no gasta un renglón.
 */
export const NOTA_SOLO_SE_MIRA =
  "Aquí solo se mira. Para corregir una hora, entra a Asistencia: la marca del teléfono no se edita " +
  "ni se borra, la corrección va encima y pide el porqué.";

/** El aviso ROJO de la fila. Dos personas, un teléfono: eso sí se mira. */
export const AVISO_MISMO_TELEFONO = "mismo teléfono que otro colaborador";

/** Lo que se dice de una marca mandada sin señal. */
export const TEXTO_SIN_SENAL = "sin señal";

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
  const nombre = sinCodigoDeMapa(opts.nombre);
  const lejos = distanciaDeLaTienda(opts.metros);
  if (nombre && lejos) return `${nombre} · ${lejos}`;
  return nombre || lejos || SIN_LUGAR;
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

/**
 * Cómo se nombra el tramo dentro de la frase del atraso: «la entrada se envió
 * 9 h después». Sin artículo la frase quedaría en telegrama.
 */
export const ARTICULO_TRAMO: Record<string, string> = {
  entrada: "la entrada",
  almuerzo: "el almuerzo",
  salida: "la salida",
};

/** A qué tramo pertenece la marca número `indice` del día de esa persona. */
export function tramoDeLaMarca(indice: number): ClaveTramo {
  const i = Math.floor(Number.isFinite(indice) ? indice : -1);
  if (i === 0) return "entrada";
  if (i === 1 || i === 2) return "almuerzo";
  if (i === 3) return "salida";
  return `marca-${i}`;
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
// LA FRASE DEL ATRASO — «se envió», nunca «llegó»
// ─────────────────────────────────────────────────────────────────────────────

/** El verbo, en UN solo lugar. 🔴 «llegó» está prohibida en esta pantalla. */
export const VERBO_ENVIO = "se envió";

/**
 * «la entrada se envió 9 h después · la salida, 6 min después».
 *
 * 🔴 El verbo se escribe UNA vez: repetirlo en cada tramo convierte la línea
 * gris en un párrafo.
 */
export function frasesDeEnvio(
  items: readonly { articulo: string; cuanto: string }[],
): string {
  return items
    .map((x, i) => (i === 0 ? `${x.articulo} ${VERBO_ENVIO} ${x.cuanto}` : `${x.articulo}, ${x.cuanto}`))
    .join(" · ");
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
}

export interface TramoDibujado {
  clave: ClaveTramo;
  rotulo: string;
  /** «08:59» o «18:01 – 18:01». */
  horas: string;
  /** Alguna de sus marcas se mandó sin señal: va con el punto gris. */
  sinSenal: boolean;
}

export interface FilaPorDia<T> {
  /** `codigo|dia`, estable: sirve de `key`. */
  llave: string;
  codigo: string;
  nombre: string;
  dia: string;
  tramos: TramoDibujado[];
  /** «Paso Canoas · 46 km de la tienda». */
  lugar: string;
  /** La línea gris de abajo, o `null` cuando no hay nada que decir. */
  detalle: string | null;
  /** Ese día, otro colaborador marcó desde este mismo teléfono. */
  mismoTelefono: boolean;
  /** Las marcas del día, en orden: es lo que abre la hoja de fotos y mapa. */
  marcas: T[];
}

export interface DiaDeMarcaciones<T> {
  /** El día de Panamá (`YYYY-MM-DD`). */
  dia: string;
  /** «vie 25 sep». */
  rotulo: string;
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
  for (const m of marcas) {
    const texto = lugarEnPalabras({
      nombre: m.lugar?.nombre ?? m.lugar?.texto ?? null,
      metros: m.lugar?.metros ?? null,
    });
    if (texto !== SIN_LUGAR) return texto;
  }
  return SIN_LUGAR;
}

const porHora = (a: MarcaParaElDia, b: MarcaParaElDia): number =>
  a.ocurrioEn.localeCompare(b.ocurrioEn) || a.id.localeCompare(b.id);

/** Los tramos de un día, ya ordenado por hora. */
export function tramosDelDia(marcas: readonly MarcaParaElDia[]): TramoDibujado[] {
  const orden: ClaveTramo[] = [];
  const juntas = new Map<ClaveTramo, { horas: string[]; sinSenal: boolean; rotulo: string }>();

  marcas.forEach((m, i) => {
    const clave = tramoDeLaMarca(i);
    const rotulo = ROTULO_TRAMO[clave] ?? rotuloSuelto(i, m.tipo);
    const g = juntas.get(clave);
    if (!g) {
      orden.push(clave);
      juntas.set(clave, { horas: [horaCorta(m.ocurrioEn)], sinSenal: Boolean(m.sinSenal), rotulo });
    } else {
      g.horas.push(horaCorta(m.ocurrioEn));
      g.sinSenal = g.sinSenal || Boolean(m.sinSenal);
    }
  });

  return orden.map((clave) => {
    const g = juntas.get(clave)!;
    return {
      clave,
      rotulo: g.rotulo,
      // 🔑 El almuerzo se lee de corrido: «18:01 – 18:01», nunca dos renglones.
      horas: g.horas.length > 1 ? `${g.horas[0]} – ${g.horas[g.horas.length - 1]}` : g.horas[0],
      sinSenal: g.sinSenal,
    };
  });
}

/**
 * La línea gris bajo la fila, o `null` cuando el día no tiene nada que decir.
 *
 * 🔴 **32 de las 37 marcas medidas llegaron al instante y no escriben nada.**
 * Una línea que sale siempre se deja de leer.
 */
export function detalleDelDia(marcas: readonly MarcaParaElDia[]): string | null {
  const haySinSenal = marcas.some((m) => m.sinSenal);

  const envios: { articulo: string; cuanto: string }[] = [];
  const yaDicho = new Set<ClaveTramo>();
  marcas.forEach((m, i) => {
    const cuanto = cuantoDespues(m.ocurrioEn, m.creadoEn);
    if (!cuanto) return;
    const clave = tramoDeLaMarca(i);
    // Un tramo habla UNA vez: si la salida a almuerzo y la vuelta se atrasaron,
    // se dice «el almuerzo», no dos veces lo mismo.
    if (yaDicho.has(clave)) return;
    yaDicho.add(clave);
    envios.push({
      articulo: ARTICULO_TRAMO[clave] ?? `la marca de ${ROTULO_TRAMO[clave] ?? rotuloSuelto(i, m.tipo)}`,
      cuanto,
    });
  });

  if (envios.length === 0) return haySinSenal ? TEXTO_SIN_SENAL : null;
  const frase = frasesDeEnvio(envios);
  return haySinSenal ? `${TEXTO_SIN_SENAL}: ${frase}` : frase;
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
    const fila: FilaPorDia<T> = {
      llave,
      codigo: g.codigo,
      nombre: capitalizarNombre(g.nombre) || g.codigo,
      dia: g.dia,
      tramos: tramosDelDia(ordenadas),
      lugar: lugarDeLaFila(ordenadas),
      detalle: detalleDelDia(ordenadas),
      mismoTelefono: ordenadas.some((m) => compartidas?.has(m.id) === true),
      marcas: ordenadas,
    };
    const lista = porDia.get(g.dia) ?? [];
    lista.push(fila);
    porDia.set(g.dia, lista);
  }

  return [...porDia.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dia, filas]) => ({
      dia,
      rotulo: fechaDelDia(dia),
      filas: filas.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    }));
}
