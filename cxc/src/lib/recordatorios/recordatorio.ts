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
 *
 * ── 🔴 REDISEÑO DEL 5-SEP-2026 — lo que cambió y por qué ─────────────────────
 *
 * Daniel, definiendo el módulo entero: **un solo mensaje diario a las 9:00 a.m.**
 * Con eso caen tres cosas de un saque:
 *
 *   1. **«Hoy» NO existe como opción.** Todo sale a las 9:00; si ya pasó, «hoy»
 *      no serviría. El primero disponible es MAÑANA, y el servidor lo exige
 *      (`faltaParaGuardar` con la fecha de Panamá). No hay selector de hora.
 *   2. **`cada_dia` se suma a las repeticiones**, y las tres repeticiones
 *      aceptan un **`hasta`** opcional (fecha de fin). Sin `hasta`, corre hasta
 *      que alguien lo borre.
 *   3. **`destino`**: `equipo` (📊 el grupo, como siempre) o `privado` (el chat
 *      de Daniel). La opción la ven SOLO los admin; lo que escribe una
 *      secretaria va SIEMPRE al equipo, y eso se fuerza en el SERVIDOR
 *      (`destinoPermitido`), no en la pantalla.
 *
 * ⚠️ **Solo existe UN chat privado: el de Daniel.** Hay dos admin (daniel y
 * alberto), así que si Alberto marca «solo a mí», el mensaje le llega a DANIEL.
 * Daniel lo sabe y lo aprobó así. No se inventa un chat por usuario.
 *
 * 🔴 **Un recordatorio NO se marca como hecho.** Daniel, textual: *«No quiero
 * tener que meterme para poner que lo hice. Se supone que sí.»* No hay —ni se
 * agrega— estado de completado: se manda y ya.
 */

import { diaSemana, etiquetaVencimiento } from "@/lib/cheques-aviso-ventana";

/** Nombre de la tabla. Una sola vez, para que el código y la detección de
 *  "todavía no corrió el DDL" no puedan apuntar a nombres distintos. */
export const TABLA_RECORDATORIOS = "recordatorios";

/** El archivo que Daniel corre A MANO. Se nombra en el aviso de la pantalla. */
export const MIGRACION_RECORDATORIOS = "20260824120000_recordatorios.sql";

/** Cada cuánto vuelve. `una_vez` es el default y el caso común.
 *  `cada_dia` entró el 5-sep-2026 con el rediseño (el mensaje es diario). */
export const REPETICIONES = ["una_vez", "cada_dia", "semanal", "mensual"] as const;
export type Repeticion = (typeof REPETICIONES)[number];

/** Las que VUELVEN. Se deriva de la lista para que agregar una repetición nueva
 *  no deje la agenda mostrándola como si fuera de una sola vez. */
export const REPETICIONES_QUE_VUELVEN = REPETICIONES.filter((r) => r !== "una_vez");

export function seRepite(rec: Pick<Recordatorio, "repeticion">): boolean {
  return rec.repeticion !== "una_vez";
}

/** Lo que se lee en pantalla. En español simple, sin jerga. */
export const ETIQUETA_REPETICION: Record<Repeticion, string> = {
  una_vez: "Una sola vez",
  cada_dia: "Cada día",
  semanal: "Cada semana",
  mensual: "Cada mes",
};

/** Cómo se dice dentro de una línea del aviso de Telegram. */
const CADA: Record<Repeticion, string> = {
  una_vez: "",
  cada_dia: "cada día",
  semanal: "cada semana",
  mensual: "cada mes",
};

// ─── A QUIÉN le llega (5-sep-2026) ───────────────────────────────────────────

/** `equipo` = 📊 el grupo de Telegram. `privado` = el chat de Daniel. */
export const DESTINOS = ["equipo", "privado"] as const;
export type Destino = (typeof DESTINOS)[number];

/** Lo que se lee en la pastilla. Sin jerga de canales ni de bots. */
export const ETIQUETA_DESTINO: Record<Destino, string> = {
  equipo: "Al equipo",
  privado: "Solo a mí",
};

/** Quién puede elegir a dónde va. El resto va SIEMPRE al equipo. */
export const ROLES_QUE_ELIGEN_DESTINO: readonly string[] = ["admin"];

export function esDestino(v: unknown): v is Destino {
  return typeof v === "string" && (DESTINOS as readonly string[]).includes(v);
}

/**
 * 🔴 EL DESTINO LO DECIDE EL SERVIDOR, NO LA PANTALLA.
 *
 * Una secretaria no ve la opción, pero un POST a mano sí podría mandarla: si el
 * rol no está en `ROLES_QUE_ELIGEN_DESTINO`, lo suyo va al equipo pase lo que
 * pase. Esconder el control en la pantalla es cortesía; esto es el candado.
 */
export function destinoPermitido(rol: string, pedido: unknown): Destino {
  if (!ROLES_QUE_ELIGEN_DESTINO.includes(rol)) return "equipo";
  return esDestino(pedido) ? pedido : "equipo";
}

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
  /** Fecha de fin de una repetición, YYYY-MM-DD. `null` = corre hasta que se
   *  borre. Solo tiene sentido con `repeticion !== "una_vez"`. */
  hasta: string | null;
  /** A quién le llega el aviso de las 9:00. */
  destino: Destino;
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
  hasta: string | null;
  destino: Destino;
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
 * 🔴 «HOY» YA PASÓ, Y NO SE PUEDE GUARDAR PARA UNA HORA QUE PASÓ (5-sep-2026).
 *
 * Todo el módulo manda UN mensaje al día, a las 9:00 a.m. de Panamá. Un
 * recordatorio puesto para HOY no llegaría nunca: el mensaje de hoy o ya salió,
 * o sale sin él porque se escribió después. El primero disponible es MAÑANA, y
 * eso vale igual en la pantalla y en el servidor — que es la única puerta que no
 * se puede saltear.
 */
export function fechaYaPaso(fecha: string, hoy: string): boolean {
  if (!fechaValida(fecha) || !fechaValida(hoy)) return false;
  return fecha <= hoy;
}

/** Lo que se le dice a la persona cuando eligió un día que ya pasó. */
export const AVISO_FECHA_PASADA =
  "El aviso sale a las 9:00 de la mañana, así que hoy ya pasó. Elige de mañana en adelante.";

/** Y cuando el «hasta» queda antes de la fecha en que arranca. */
export const AVISO_HASTA_ANTES =
  "El «hasta» tiene que ser igual o posterior a la fecha en que empieza.";

/** La marca interna de «el día elegido ya pasó», para que la pantalla y las dos
 *  rutas la reconozcan sin comparar cadenas sueltas. */
export const FALTA_FECHA_PASADA = "una fecha de mañana en adelante";
export const FALTA_HASTA = "un «hasta» válido";

/**
 * Lo que se le muestra a la persona. Las dos faltas «raras» tienen su frase
 * completa —decir «Falta: una fecha de mañana en adelante» no explica POR QUÉ—
 * y el resto sigue con el «Falta: …» de siempre.
 */
export function mensajeDeFalta(falta: string[]): string {
  if (falta.includes(FALTA_FECHA_PASADA)) return AVISO_FECHA_PASADA;
  if (falta.includes(FALTA_HASTA)) return AVISO_HASTA_ANTES;
  return `Falta: ${falta.join(" y ")}`;
}

/**
 * Qué falta para poder guardar. Devuelve la LISTA, no un booleano: el botón se
 * apaga y dice qué falta, que es el patrón de la casa (Guías, Pedidos).
 *
 * 🔴 El cliente NO entra acá, y es decisión de Daniel: *"sí, pero no debería de
 * ser obligatorio"*. La repetición tampoco: su default es `una_vez`.
 *
 * `hoy` es la fecha de PANAMÁ y es obligatoria desde el 5-sep-2026: sin ella no
 * se puede saber si el día elegido ya pasó, y ése es el chequeo nuevo.
 */
export function faltaParaGuardar(
  v: { fecha: string; texto: string; hasta?: string | null },
  hoy: string,
): string[] {
  const falta: string[] = [];
  if (!fechaValida(v.fecha)) falta.push("la fecha");
  else if (fechaYaPaso(v.fecha, hoy)) falta.push(FALTA_FECHA_PASADA);
  if (!v.texto.trim()) falta.push("qué hay que recordar");
  if (v.hasta && (!fechaValida(v.hasta) || v.hasta < v.fecha)) falta.push(FALTA_HASTA);
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
export function leerCuerpo(body: unknown, rol: string): RecordatorioNuevo {
  const b = (body ?? {}) as Record<string, unknown>;
  const repeticion: Repeticion = esRepeticion(b.repeticion) ? b.repeticion : "una_vez";
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
    repeticion,
    // ⚠️ Un `hasta` sobre algo que NO se repite no significa nada, y guardado
    // sería una bomba: si alguien después le pone repetición, la fecha de fin
    // vieja lo apagaría sin que nadie la haya vuelto a mirar. Se descarta acá.
    hasta:
      repeticion !== "una_vez" && typeof b.hasta === "string" && fechaValida(b.hasta)
        ? b.hasta
        : null,
    // 🔴 El rol manda, no el cuerpo. Ver `destinoPermitido`.
    destino: destinoPermitido(rol, b.destino),
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
 * - `cada_dia` → todos los días, desde su fecha en adelante.
 * - `semanal` → el mismo día de la semana, desde su fecha en adelante.
 * - `mensual` → el mismo día del mes, desde su fecha en adelante.
 *
 * 🔴 **El `hasta` corta, y corta INCLUSIVE** (5-sep-2026): el último día que
 * suena es el `hasta`, no el anterior. Un `hasta` sin repetición no existe —
 * `leerCuerpo` lo descarta— así que acá no hace falta preguntarlo aparte.
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
  rec: Pick<Recordatorio, "fecha" | "repeticion"> & { hasta?: string | null },
  ymd: string,
): boolean {
  if (!fechaValida(rec.fecha) || !fechaValida(ymd)) return false;
  if (ymd < rec.fecha) return false;
  if (rec.hasta && fechaValida(rec.hasta) && ymd > rec.hasta) return false;

  if (rec.repeticion === "una_vez") return ymd === rec.fecha;
  if (rec.repeticion === "cada_dia") return true;
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
 * Las ocurrencias, partidas por A QUIÉN le llegan (5-sep-2026).
 *
 * 🔴 Son DOS mensajes, no uno con dos secciones: el del equipo va al grupo
 * (`enviarNegocio`) y el privado al chat de Daniel (`enviarNegocioPrivado`).
 * Mezclarlos publicaría en el grupo justo lo que se marcó como privado.
 */
export function partirPorDestino(ocurrencias: Ocurrencia[]): {
  equipo: Ocurrencia[];
  privado: Ocurrencia[];
} {
  return {
    equipo: ocurrencias.filter((o) => o.rec.destino !== "privado"),
    privado: ocurrencias.filter((o) => o.rec.destino === "privado"),
  };
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
 * El mensaje ENTERO que sale por Telegram: los bloques en el orden en que se
 * pasan, separados por una línea en blanco, y sin los vacíos.
 *
 * 🔴 **Los cheques van primero y su texto NO se toca**: es la plata, y es lo que
 * se lee en la notificación sin abrirla. Si no queda ningún bloque devuelve `""`
 * y el cron **no manda nada** — un "hoy no hay nada" diario es ruido.
 *
 * Pasó a ser variádica el 5-sep-2026: el mensaje del grupo tiene TRES bloques
 * (por vencer · vencidos · recordatorios del equipo), y encadenar dos llamadas
 * de dos argumentos habría dejado el orden a merced de quién llama primero.
 */
export function unirAviso(...bloques: string[]): string {
  return bloques.filter((b) => b && b.trim()).join("\n\n");
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
