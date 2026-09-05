/**
 * Fechas y redacción del aviso de cheques por vencer. **Módulo PURO**: sin
 * base de datos y sin Telegram, para poder previsualizar el mensaje sin tocar
 * producción (`scripts/_dryrun-cheques-aviso.ts`) y testearlo con fechas fijas.
 * El I/O vive en `cheques-alert.ts`.
 *
 * ── LA REGLA (pedido de Daniel, 27-jul-2026) ─────────────────────────────────
 * Textual: "QUIERO aviso de cuando se vence un cheque un dia antes, almenos q
 * venca el lunes, avisame el viernes."
 *
 * O sea: el aviso sale **el día hábil ANTERIOR** a la fecha de depósito, nunca
 * un fin de semana. Formalmente, corriendo un día hábil D, la ventana es
 * [D, N] donde N = el próximo día hábil después de D:
 *
 *   D = jueves  → N = viernes → avisa de jueves y VIERNES
 *   D = viernes → N = lunes   → avisa de viernes, SÁBADO, DOMINGO y LUNES  ←── lo que pidió
 *   D = lunes   → N = martes  → avisa de lunes y martes
 *   D = sábado/domingo        → NO se avisa
 *
 * **Por qué la ventana llega hasta el próximo día hábil y no solo "mañana":**
 * si el viernes solo mirara mañana, un cheque que vence el SÁBADO no se
 * avisaría jamás — sábado y domingo no hay aviso, y el lunes ya venció. Cubrir
 * el hueco entero es lo que hace que no se pierda ninguno.
 *
 * **HOY sigue incluido** (el cron ya avisaba de hoy+mañana antes de este
 * cambio, y a Daniel le sirve el recordatorio del día). Un cheque del lunes se
 * anuncia el viernes ("el lunes 3 ago") y otra vez el lunes ("HOY"): son dos
 * días distintos, no un duplicado.
 *
 * ⚠️ **FERIADOS DE PANAMÁ: no los tenemos y NO se inventa un calendario.** Si el
 * lunes es feriado, el aviso igual salió el viernes — que es lo correcto de
 * todos modos. Lo que queda descubierto es el caso inverso: un cheque que vence
 * el martes después de un lunes feriado se avisa el lunes (feriado) en vez del
 * viernes. Limitación conocida y aceptada.
 */

import { getCompanyDisplay } from "@/lib/companies";

// 🩸 ACÁ VIVÍA `WA_NUMBERS` — dos celulares escritos a mano que se pegaban al
// final de CADA aviso: "WhatsApp seguimiento: +50766745522, +50766494096".
// Se retiró el 5-sep-2026. Daniel, textual: *«nada, es recordatorio nada más»*.
// Un teléfono en el pie no era una acción: era una firma que nadie tocaba, y
// además era el único dato del mensaje que envejecía sin que nada lo avisara.
// El resto del texto de cheques NO se tocó, palabra por palabra.

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// ─── Fechas (Panamá es UTC-5 FIJO, sin horario de verano) ────────────────────
// `cheques.fecha_deposito` es un `date` PELADO (verificado contra producción:
// llega como "2026-04-30", sin hora ni zona), así que todo se compara como
// texto YYYY-MM-DD y no hay borde de día que resolver. Las cuentas de días se
// hacen en UTC a propósito: sobre un `date` pelado, UTC no tiene horario de
// verano ni desplazamiento que corra la fecha.

/** La fecha de HOY en Panamá, como YYYY-MM-DD. */
export function fechaPanama(ahora: Date = new Date()): string {
  // en-CA da directamente YYYY-MM-DD. El truco viejo (toLocaleString + new
  // Date()) dependía de la zona del SERVIDOR y se corría de día cerca de la
  // medianoche.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(ahora);
}

function aDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** 0 = domingo … 6 = sábado. */
export function diaSemana(ymd: string): number {
  return aDate(ymd).getUTCDay();
}

export function esFinDeSemana(ymd: string): boolean {
  const d = diaSemana(ymd);
  return d === 0 || d === 6;
}

export function sumarDias(ymd: string, dias: number): string {
  const d = aDate(ymd);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Nombre del día en español, para los mensajes y el dry-run. */
export function nombreDia(ymd: string): string {
  return DIAS[diaSemana(ymd)];
}

/**
 * Qué fechas de depósito cubre el aviso que sale HOY.
 *
 * `habil:false` = hoy es sábado o domingo → NO se manda nada (esos cheques ya
 * se avisaron el viernes).
 */
export function ventanaAviso(hoy: string): { habil: boolean; fechas: string[] } {
  if (esFinDeSemana(hoy)) return { habil: false, fechas: [] };

  const fechas = [hoy];
  let f = hoy;
  do {
    f = sumarDias(f, 1);
    fechas.push(f);
  } while (esFinDeSemana(f)); // el viernes esto arrastra sábado y domingo hasta el lunes
  return { habil: true, fechas };
}

/** "HOY" · "MAÑANA" · "el lunes 3 ago" — lo que se lee al final de cada línea. */
export function etiquetaVencimiento(fecha: string, hoy: string): string {
  if (fecha === hoy) return "HOY";
  if (fecha === sumarDias(hoy, 1)) return "MAÑANA";
  const d = aDate(fecha);
  return `el ${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** Inicio del día Panamá en ISO (UTC-5 fijo → las 00:00 de Panamá son las
 *  05:00 UTC del mismo día). */
export function inicioDiaPanamaIso(hoy: string): string {
  return `${hoy}T05:00:00.000Z`;
}

const money = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface ChequePorVencer {
  cliente: string;
  empresa: string;
  monto: number;
  fecha_deposito: string;
  vendedor?: string | null;
}

/**
 * El texto tal cual lo ve Daniel en el celular. La PRIMERA línea dice cuántos y
 * cuánto — es lo único que se lee en la notificación del iPhone sin abrirla — y
 * cada línea siguiente dice de quién, cuánto y para cuándo.
 */
export function construirMensaje(cheques: ChequePorVencer[], hoy: string): string {
  const total = cheques.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const lineas = cheques
    .map(
      (c) =>
        `• ${c.cliente} (${getCompanyDisplay(c.empresa)}) ${money(Number(c.monto))}` +
        ` — ${etiquetaVencimiento(c.fecha_deposito, hoy)}${c.vendedor ? ` · ${c.vendedor}` : ""}`,
    )
    .join("\n");

  return (
    `⚠️ ${cheques.length} cheque${cheques.length > 1 ? "s" : ""} por vencer — ${money(total)}\n` +
    `${lineas}`
  );
}
