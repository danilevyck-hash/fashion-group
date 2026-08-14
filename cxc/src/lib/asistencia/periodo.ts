/* ─────────────────────────────────────────────────────────────────────────────
 * QUÉ DÍAS CUENTAN, Y A QUIÉN NO SE LE PUEDE CALCULAR SOLO.
 *
 * Módulo PURO: sin base, sin red y sin `new Date()` para saber la hora. El
 * "hoy" entra por parámetro —siempre el día de PANAMÁ, `hoyPanama()`— para que
 * los tests no dependan del reloj de la máquina.
 *
 * ── 🔴 POR QUÉ ESTO NO VIVE EN `planilla.ts` ─────────────────────────────────
 *
 * `planilla.ts` convierte minutos en dólares y la contable lo dio por EXACTO al
 * centavo contra su Excel. Nada de acá toca una fórmula, un redondeo ni un
 * recargo: lo único que se decide es **qué días entran** y **de quién se
 * abstiene el sistema**. Son dos preguntas de calendario, y meterlas entre los
 * recargos obligaría a que cada cálculo cargue con un concepto que no usa para
 * multiplicar nada. Mismo criterio que `vigencia.ts`.
 * ────────────────────────────────────────────────────────────────────────── */

import { esHabil } from "./reporte";
import { fechaCorta } from "./planilla";

// ─────────────────────────────────────────────────────────────────────────────
// EL DÍA QUE TODAVÍA NO PASÓ
//
// 🩸 MEDIDO CONTRA PRODUCCIÓN EL 14-AGO-2026, quincena del 1 al 15: la planilla
// descontaba **$1.127,78** de ausencia y **$866,99 (el 77%) eran del 14** — las
// 33 personas salían ausentes el día que la contadora estaba mirando la
// pantalla, a media mañana. Y excluir solo hoy no alcanzaba: abierta la
// quincena un día 3, los ~9 días hábiles que faltan se descuentan a **~$870
// cada uno**. Un día futuro no es que "no terminó": es que ni siquiera empezó.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Este día ya pasó? Se compara como TEXTO y es correcto a propósito: en
 * `YYYY-MM-DD` el orden alfabético ES el cronológico, así que no hace falta
 * construir un `Date` —que metería la zona horaria en una comparación de días
 * de calendario, el bug clásico de este repo—.
 *
 * 🔑 HOY NO CUENTA COMO PASADO. A las 8:59 de la mañana nadie faltó todavía.
 */
export function diaYaPaso(fecha: string, hoy: string): boolean {
  return fecha < hoy;
}

/**
 * Cuántos días HÁBILES del período todavía no pasaron (hoy incluido).
 *
 * ⚠️ Cuenta lunes a viernes, igual que el motor. Los feriados no se descuentan
 * acá: el número es para decir *"faltan N días"*, no para calcular plata, y
 * pedirle los feriados obligaría a este módulo a saber de la base.
 */
export function diasHabilesPendientes(desde: string, hasta: string, hoy: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return 0;
  let n = 0;
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  // Tope de sanidad: el rango libre ya está acotado a 366 días por la ruta.
  for (let i = 0; d <= fin && i < 400; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (!diaYaPaso(iso, hoy) && esHabil(iso)) n += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/** Lo que la pantalla, el Excel y el PDF dicen del período sin terminar. */
export interface AvisoPeriodoAbierto {
  /** Días hábiles del período que todavía no pasaron (hoy incluido). */
  diasHabiles: number;
  /** La frase tal como se lee. Una sola redacción para pantalla, Excel y PDF. */
  texto: string;
}

/**
 * El aviso de arriba del cuadro. `null` cuando el período ya cerró — un cartel
 * permanente es un cartel que se deja de leer (misma regla que el resto del
 * módulo).
 *
 * 🔴 SE DICE, NO SE ESCONDE. Los días que no pasaron dejan de descontarse, y un
 * número que baja sin explicación se lee como un número que no cuadra. La frase
 * dice las dos cosas: que el período sigue abierto y que eso es a propósito.
 */
export function avisoPeriodoAbierto(
  desde: string,
  hasta: string,
  hoy: string,
  esQuincena = true,
): AvisoPeriodoAbierto | null {
  // Todo el período ya pasó: no hay nada que aclarar.
  if (diaYaPaso(hasta, hoy)) return null;
  const diasHabiles = diasHabilesPendientes(desde, hasta, hoy);
  const que = esQuincena ? "Esta quincena" : "Este período";
  const cuantos =
    diasHabiles === 0
      ? "no quedan días hábiles por delante"
      : diasHabiles === 1
        ? "falta 1 día hábil"
        : `faltan ${diasHabiles} días hábiles`;
  return {
    diasHabiles,
    texto: `${que} todavía no termina — ${cuantos}. Los días que no pasaron no se cuentan.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LA JUSTIFICACIÓN, EN UNA LÍNEA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * «Vacaciones del 16 jul 2026 al 13 ago 2026». Es el motivo escrito AL LADO de
 * la persona, que es lo que faltaba: RODRIGO MIRANDA y ELOYN MENDOZA salían en
 * ámbar diciendo *"falta configurarles algo… se arreglan en Configuración"* y
 * en Configuración no había nada que arreglarles — sus justificaciones ya
 * estaban cargadas y eran correctas.
 */
export function textoJustificacion(motivo: string, desde: string, hasta: string): string {
  return `${motivo} del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL CÓDIGO QUE MARCA Y NO TIENE FICHA
//
// 🩸 El código 50 marcó **53 veces** entre el 14-jul y el 3-ago y no tiene
// ficha. `armarPlanilla` lo mete en las TRES empresas a propósito —para que
// nadie lo borre en silencio— y por eso aparecía tres veces, una por cuadro.
// La intención SE CONSERVA: no desaparece. Lo que cambia es dónde se muestra:
// una sola vez, arriba, fuera del cuadro de cualquier empresa.
// ─────────────────────────────────────────────────────────────────────────────

export interface CodigoSinFicha {
  codigo: string;
  /** Cuántas veces pasó por el reloj en el período. */
  marcaciones: number;
}

/**
 * La línea de arriba del cuadro. `null` si no hay ninguno.
 *
 * 🔴 Dice que NO SE LE PUEDE CALCULAR PAGO, y eso es lo importante: sin ficha no
 * hay salario, ni jornada, ni empresa. Un cero silencioso en una planilla es el
 * error que nadie ve hasta que alguien reclama su pago.
 */
export function textoCodigosSinFicha(codigos: readonly CodigoSinFicha[]): string | null {
  if (codigos.length === 0) return null;
  const total = codigos.reduce((a, c) => a + c.marcaciones, 0);
  const lista = codigos.map((c) => c.codigo).join(", ");
  const cuales = codigos.length === 1 ? `código ${lista}` : `códigos ${lista}`;
  return codigos.length === 1
    ? `1 código marcó ${total} ${total === 1 ? "vez" : "veces"} y no tiene ficha (${cuales}). `
      + "Hasta saber quién es, no se le puede calcular pago."
    : `${codigos.length} códigos marcaron ${total} veces y no tienen ficha (${cuales}). `
      + "Hasta saber quiénes son, no se les puede calcular pago.";
}
