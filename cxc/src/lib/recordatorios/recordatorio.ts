/**
 * RECORDATORIOS — módulo PURO (sin base y sin Telegram).
 *
 * Daniel, textual (24-ago-2026): *"en el módulo de cheques, quisiera cambiarlo
 * a recordatorios, ya que quisiera poner ahí en el calendario «recordar cobrar»
 * y pongo la fecha así telegram me recuerda"*. Y a las tres preguntas del
 * diseño: el cliente **"sí, pero no debería de ser obligatorio"**, la repetición
 * **"puede ser, no siempre"** y lo ven **"admin y secre"**.
 *
 * Un recordatorio es **fecha + texto**, y opcionalmente un **cliente** (código
 * D-XXX del directorio) y una **repetición** (una vez / semanal / mensual).
 *
 * ── 🔴 EL AVISO USA LA MISMA VENTANA QUE LOS CHEQUES, Y NO ES UN CAPRICHO ────
 *
 * El cron `cheques-alert` corre 14:15 UTC (9:15 a.m. Panamá) y **no manda nada
 * sábado ni domingo** (ver `cheques-aviso-ventana.ts`). Si el recordatorio se
 * avisara SOLO el día exacto, uno puesto para un sábado **no se avisaría
 * nunca**: sábado y domingo no hay corrida y el lunes ya pasó. Es exactamente
 * el hueco que la ventana de cheques vino a tapar.
 *
 * Por eso se reusa `ventanaAviso(hoy)` tal cual: corriendo un día hábil D, la
 * ventana es [D, N] con N = el próximo día hábil. El viernes cubre sábado,
 * domingo y lunes, y cada línea dice para cuándo es (`HOY` · `MAÑANA` ·
 * `el sábado 29 ago`), con el MISMO rótulo que ya usan los cheques. Un
 * recordatorio del lunes se anuncia el viernes ("el lunes 31 ago") y otra vez
 * el lunes ("HOY"): son días distintos, no un duplicado.
 *
 * ⚠️ **Feriados de Panamá: no los tenemos y no se inventa un calendario.** Misma
 * limitación conocida y aceptada que en cheques.
 *
 * Las FECHAS se reusan de `cheques-aviso-ventana` en vez de escribirse otra vez:
 * dos formas de contar un día se separan con el tiempo, y acá las dos cosas se
 * mandan en el MISMO mensaje de Telegram.
 */

import { diaSemana, etiquetaVencimiento } from "@/lib/cheques-aviso-ventana";

/** Nombre de la tabla. Una sola vez, para que el código y la detección de
 *  "todavía no corrió el DDL" no puedan apuntar a nombres distintos. */
export const TABLA_RECORDATORIOS = "recordatorios";

/** El archivo que Daniel corre A MANO. Se nombra en el aviso de la pantalla. */
export const MIGRACION_RECORDATORIOS = "20260824120000_recordatorios.sql";

/** Cada cuánto vuelve. `una_vez` es el default y el caso común. */
export const REPETICIONES = ["una_vez", "semanal", "mensual"] as const;
export type Repeticion = (typeof REPETICIONES)[number];

/** Lo que se lee en pantalla. En español simple, sin jerga. */
export const ETIQUETA_REPETICION: Record<Repeticion, string> = {
  una_vez: "Una sola vez",
  semanal: "Cada semana",
  mensual: "Cada mes",
};

/** Cómo se dice dentro de una línea del aviso de Telegram. */
const CADA: Record<Repeticion, string> = {
  una_vez: "",
  semanal: "cada semana",
  mensual: "cada mes",
};

export interface Recordatorio {
  id: string;
  /** El día que Daniel eligió, YYYY-MM-DD. Con repetición, es el PRIMERO. */
  fecha: string;
  texto: string;
  /** Nombre del cliente tal cual se muestra. "" = sin cliente (es legítimo). */
  cliente: string;
  /** Código D-XXX. null = sin vincular (opción "a mano" del selector, o vacío). */
  clienteCodigo: string | null;
  repeticion: Repeticion;
  creadoPor: string;
  createdAt: string;
}

/** Lo que hace falta para guardar uno. El `id` lo pone la base. */
export interface RecordatorioNuevo {
  fecha: string;
  texto: string;
  cliente: string;
  clienteCodigo: string | null;
  repeticion: Repeticion;
}

// ─── Validación (la misma en el navegador y en el servidor) ──────────────────

/** El formato que produce un `<input type="date">`, y que la fecha EXISTA. */
export function fechaValida(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function esRepeticion(v: unknown): v is Repeticion {
  return typeof v === "string" && (REPETICIONES as readonly string[]).includes(v);
}

/**
 * Qué falta para poder guardar. Devuelve la LISTA, no un booleano: el botón se
 * apaga y dice qué falta, que es el patrón de la casa (Guías, Pedidos).
 *
 * 🔴 El cliente NO entra acá, y es decisión de Daniel: *"sí, pero no debería de
 * ser obligatorio"*. La repetición tampoco: su default es `una_vez`.
 */
export function faltaParaGuardar(v: { fecha: string; texto: string }): string[] {
  const falta: string[] = [];
  if (!fechaValida(v.fecha)) falta.push("la fecha");
  if (!v.texto.trim()) falta.push("qué hay que recordar");
  return falta;
}

/**
 * El cuerpo que aceptan el POST y el PUT, ya normalizado.
 *
 * **El cliente y la repetición son opcionales** (decisión de Daniel) y lo que no
 * venga se normaliza ACÁ, no en la pantalla: el servidor es la única puerta que
 * no se puede saltear. Vive en el módulo puro para que las dos rutas usen la
 * MISMA lectura — dos normalizaciones del mismo cuerpo se separan con el tiempo.
 */
export function leerCuerpo(body: unknown): RecordatorioNuevo {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    fecha: typeof b.fecha === "string" ? b.fecha : "",
    texto: typeof b.texto === "string" ? b.texto.trim() : "",
    cliente: typeof b.cliente === "string" ? b.cliente.trim() : "",
    // "" y "   " son "sin vincular", igual que en cheques: van a NULL. Un ""
    // haría que `cliente_codigo IS NOT NULL` contara los que no están atados.
    clienteCodigo:
      typeof b.cliente_codigo === "string" && b.cliente_codigo.trim()
        ? b.cliente_codigo.trim()
        : null,
    repeticion: esRepeticion(b.repeticion) ? b.repeticion : "una_vez",
  };
}

// ─── Cuándo toca un recordatorio ─────────────────────────────────────────────

function partes(ymd: string): { y: number; m: number; d: number } {
  return { y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)), d: Number(ymd.slice(8, 10)) };
}

/** Cuántos días tiene ese mes (con años bisiestos, por construcción). */
export function diasDelMes(anio: number, mes1a12: number): number {
  return new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate();
}

/**
 * ¿Este recordatorio toca el día `ymd`?
 *
 * - `una_vez` → solo su propia fecha.
 * - `semanal` → el mismo día de la semana, desde su fecha en adelante.
 * - `mensual` → el mismo día del mes, desde su fecha en adelante.
 *
 * 🔴 **EL BORDE DE FIN DE MES, y es el que se salta en silencio si nadie lo
 * escribe:** un recordatorio mensual puesto el **31** no existe en abril, junio,
 * septiembre, noviembre ni febrero. Sin esta regla, ese recordatorio **no
 * sonaría 5 meses del año y nadie se enteraría**. Cuando el día elegido no cabe
 * en el mes, cae en el ÚLTIMO día de ese mes. Lo mismo con el 29, 30 y 31 de
 * febrero.
 *
 * ⚠️ **Nunca ANTES de su fecha.** Poner un recordatorio para el 15 del mes que
 * viene no puede hacerlo sonar el 15 de este mes.
 */
export function ocurreEn(
  rec: Pick<Recordatorio, "fecha" | "repeticion">,
  ymd: string,
): boolean {
  if (!fechaValida(rec.fecha) || !fechaValida(ymd)) return false;
  if (ymd < rec.fecha) return false;

  if (rec.repeticion === "una_vez") return ymd === rec.fecha;
  if (rec.repeticion === "semanal") return diaSemana(ymd) === diaSemana(rec.fecha);

  // Mensual.
  const base = partes(rec.fecha);
  const hoy = partes(ymd);
  if (hoy.d === base.d) return true;
  const ultimo = diasDelMes(hoy.y, hoy.m);
  return hoy.d === ultimo && base.d > ultimo;
}

export interface Ocurrencia {
  rec: Recordatorio;
  fecha: string;
}

/**
 * Las ocurrencias que caen en una lista de días (la ventana del aviso, o los
 * días de un mes del calendario). Ordenadas por fecha y, dentro del día, por el
 * orden en que vinieron — que es el de la base.
 */
export function ocurrenciasEnFechas(recs: Recordatorio[], fechas: string[]): Ocurrencia[] {
  const salida: Ocurrencia[] = [];
  for (const fecha of fechas) {
    for (const rec of recs) {
      if (ocurreEn(rec, fecha)) salida.push({ rec, fecha });
    }
  }
  return salida;
}

/** Todas las fechas YYYY-MM-DD de un mes (mes 1..12). */
export function diasDeMes(anio: number, mes1a12: number): string[] {
  const total = diasDelMes(anio, mes1a12);
  const mm = String(mes1a12).padStart(2, "0");
  return Array.from({ length: total }, (_, i) => `${anio}-${mm}-${String(i + 1).padStart(2, "0")}`);
}

/** Día del mes (1..31) → los recordatorios que tocan ese día. Para el calendario. */
export function ocurrenciasPorDiaDelMes(
  recs: Recordatorio[],
  anio: number,
  mes1a12: number,
): Record<number, Recordatorio[]> {
  const salida: Record<number, Recordatorio[]> = {};
  for (const fecha of diasDeMes(anio, mes1a12)) {
    const dia = Number(fecha.slice(8, 10));
    for (const rec of recs) {
      if (!ocurreEn(rec, fecha)) continue;
      (salida[dia] ??= []).push(rec);
    }
  }
  return salida;
}

/**
 * La PRÓXIMA vez que toca, mirando desde `hoy` (inclusive). `null` si es de una
 * sola vez y ya pasó — ahí lo que se muestra es su propia fecha, en pasado.
 *
 * El barrido tiene tope (`TOPE_DIAS`): un mensual siempre cae dentro de 31 días
 * y un semanal dentro de 7, así que 400 días cubren cualquier caso con aire de
 * sobra sin dejar un bucle sin fondo.
 */
const TOPE_DIAS = 400;
export function proximaOcurrencia(rec: Recordatorio, hoy: string): string | null {
  if (!fechaValida(rec.fecha) || !fechaValida(hoy)) return null;
  if (rec.repeticion === "una_vez") return rec.fecha >= hoy ? rec.fecha : null;
  const desde = hoy < rec.fecha ? rec.fecha : hoy;
  const d = new Date(`${desde}T00:00:00.000Z`);
  for (let i = 0; i < TOPE_DIAS; i += 1) {
    const ymd = d.toISOString().slice(0, 10);
    if (ocurreEn(rec, ymd)) return ymd;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

// ─── El texto de Telegram ────────────────────────────────────────────────────

/**
 * El bloque de recordatorios del aviso, tal cual lo lee Daniel en el celular.
 *
 * La PRIMERA línea dice cuántos son — es lo único que se ve en la notificación
 * del iPhone sin abrirla — y cada línea siguiente dice qué hay que hacer, para
 * cuándo, con quién (si hay cliente) y si se repite.
 *
 * Devuelve `""` cuando no hay ninguno: **un "hoy no hay nada" diario es ruido**,
 * la misma regla que ya rige para los cheques.
 */
export function construirAvisoRecordatorios(ocurrencias: Ocurrencia[], hoy: string): string {
  if (ocurrencias.length === 0) return "";
  const lineas = ocurrencias
    .map(({ rec, fecha }) => {
      const extras = [rec.cliente.trim(), CADA[rec.repeticion]].filter(Boolean);
      return `• ${rec.texto.trim()} — ${etiquetaVencimiento(fecha, hoy)}${extras.length ? ` · ${extras.join(" · ")}` : ""}`;
    })
    .join("\n");
  return `🔔 ${ocurrencias.length} recordatorio${ocurrencias.length > 1 ? "s" : ""}\n${lineas}`;
}

/**
 * El mensaje ENTERO que sale por Telegram: cheques primero, recordatorios
 * después, separados por una línea en blanco.
 *
 * 🔴 **Los cheques van primero y su texto NO se toca**: es la plata, y es lo que
 * se lee en la notificación sin abrirla. Cuando no hay cheques sale solo el
 * bloque de recordatorios, y al revés igual. Si no hay ninguno de los dos
 * devuelve `""` y el cron **no manda nada**.
 */
export function unirAviso(bloqueCheques: string, bloqueRecordatorios: string): string {
  return [bloqueCheques, bloqueRecordatorios].filter((b) => b.trim()).join("\n\n");
}

// ─── "Todavía no corrió el DDL" ──────────────────────────────────────────────

interface ErrorPostgrest {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/**
 * ¿El error es "esa tabla todavía no existe"?
 *
 * 🔴 **Tiene que NOMBRAR la tabla.** Tragarse cualquier error convertiría un
 * problema real —permisos, red, RLS— en "no hay recordatorios", que es la peor
 * forma de fallar: la pantalla se vería normal y vacía. Mismo criterio que
 * `esTablaFaltante` de Asistencia (se copia el criterio, no el archivo: ése vive
 * atado a `asistencia_*` y arrastrarlo acá acoplaría dos módulos ajenos).
 */
export function esTablaRecordatoriosFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!texto.includes(TABLA_RECORDATORIOS)) return false;
  const code = String(e.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

/** Lo que ve la gente cuando falta correr el SQL. Sin jerga de base de datos. */
export function avisoMigracionRecordatorios(): string {
  return `Los recordatorios todavía no están activos. Pídele a Daniel que corra el archivo ${MIGRACION_RECORDATORIOS} en Supabase. Mientras tanto, los cheques funcionan igual que siempre.`;
}
