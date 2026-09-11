// ─────────────────────────────────────────────────────────────────────────────
// EL TOPE: NADIE DEBE MÁS DE UN SUELDO MENSUAL — y desde el 11-sep-2026 AVISA,
// NO FRENA.
//
// Daniel, 5-sep-2026. La regla, entera:
//
//   · Se compara **deuda total (préstamo + daño) + lo que pide** contra el
//     **salario mensual** de la ficha de Asistencia (`asistencia_personas`).
//   · **Sin salario cargado, el tope es $500.** Hay 3 fichas sin salario.
//   · Se **recalcula siempre**, con el sueldo del momento: no hay foto.
//   · 🔴 Solo mira el **PRÉSTAMO**. Un **daño de mercancía se registra
//     siempre**, sin aviso: no es plata que se entrega, es plata que ya se
//     perdió, y no anotarla no la hace desaparecer.
//
// ── 🔴 YA NO HAY APROBACIÓN (11-sep-2026) ────────────────────────────────────
//
// Daniel, textual: *«Aprobar préstamos: eso también se quita»*.
//
// Hasta ese día un préstamo sobre el tope se guardaba `pendiente_aprobacion`,
// le llegaba un Telegram a Daniel, él aprobaba o rechazaba en «Préstamos › Por
// aprobar» y a los 7 días sin respuesta se borraba solo (cron
// `prestamos-caducan`). Medido el 11-sep-2026 antes de retirarlo: **0 préstamos
// esperando** (447 movimientos, todos `aprobado`) — nada quedó a medias.
//
// Ahora el préstamo queda ACTIVO de una, lo registre quien lo registre. El tope
// se sigue calculando, pero lo único que hace es DECIRLO: en pantalla (antes de
// guardar) y por Telegram al chat privado de Daniel (después), para que se
// entere de que alguien pidió más de un sueldo. Rechazar sí, esconder no — y
// esconder era justamente lo que hacía el estado pendiente (🩸 los $700 de LUIS
// ADRIAN ARROYO, 22 días en cero).
//
// ⚠️ HOY DOS PERSONAS YA PASAN EL TOPE — ÁNGELA GARCÍA $1.798,05 con sueldo
// $800 y ANDRÉS GONZÁLEZ $900 con $850. **No se les dice nada por lo que ya
// deben.** El tope solo mira un préstamo NUEVO.
//
// Módulo PURO: sin base, sin red y sin `new Date()`.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 El tope de quien no tiene salario cargado en Asistencia. */
export const TOPE_SIN_SALARIO = 500;

function num(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * El tope de una persona. Sin salario cargado son $500 — no «sin tope» ni
 * «tope cero»: las dos serían una decisión que nadie tomó.
 */
export function topeDePrestamo(salarioMensual: number | null | undefined): number {
  const s = salarioMensual === null || salarioMensual === undefined ? 0 : num(salarioMensual);
  return s > 0 ? centavos(s) : TOPE_SIN_SALARIO;
}

export interface EntradaTope {
  /** Deuda TOTAL de hoy: préstamo + daño. */
  deudaActual: number;
  /** Lo que está pidiendo ahora. */
  monto: number;
  /** El salario mensual de `asistencia_personas`, o `null` si no está cargado. */
  salarioMensual: number | null | undefined;
}

export interface EvaluacionTope {
  /** `true` = queda dentro del tope. `false` = lo pasa (se registra igual, y se dice). */
  pasa: boolean;
  /** El techo que se aplicó. */
  tope: number;
  /** `false` cuando el tope salió del piso de $500 por falta de salario. */
  haySalario: boolean;
  deudaActual: number;
  monto: number;
  /** `deudaActual + monto`. Lo que quedaría debiendo. */
  quedaria: number;
  /** Cuánto se pasa del tope. 0 si no se pasa. */
  excedente: number;
}

/**
 * ¿Este préstamo pasa el tope?
 *
 * 🔑 Se mira la deuda TOTAL, no solo la de préstamos: un daño de mercancía es
 * plata que la persona debe igual, y sumarle un préstamo encima es exactamente
 * el caso que el tope existe para señalar.
 */
export function evaluarTopePrestamo(e: EntradaTope): EvaluacionTope {
  const tope = topeDePrestamo(e.salarioMensual);
  const haySalario = num(e.salarioMensual) > 0;
  const deudaActual = centavos(Math.max(0, num(e.deudaActual)));
  const monto = centavos(Math.max(0, num(e.monto)));
  const quedaria = centavos(deudaActual + monto);
  const excedente = centavos(Math.max(0, quedaria - tope));
  return { pasa: quedaria <= tope, tope, haySalario, deudaActual, monto, quedaria, excedente };
}

function plata(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * El aviso de la pantalla, cuando el préstamo pasa el tope. Dice el detalle y
 * dice que SE REGISTRA IGUAL: sin los números, «pasa el tope» es una puerta
 * cerrada sin explicación; sin el «igual», parece que no se guardó.
 */
export function textoAvisoTope(e: EvaluacionTope): string {
  const techo = e.haySalario
    ? `su sueldo mensual (${plata(e.tope)})`
    : `${plata(e.tope)} — no tiene sueldo cargado en Asistencia`;
  return (
    `Este préstamo pasa el tope de un sueldo. `
    + `Debe ${plata(e.deudaActual)} y pide ${plata(e.monto)}: quedaría en ${plata(e.quedaria)}, `
    + `${plata(e.excedente)} por encima de ${techo}. Se registra igual y se le avisa a Daniel.`
  );
}

export interface AvisoTelegramTope {
  nombre: string;
  empresa: string | null;
  evaluacion: EvaluacionTope;
  /** Quién lo registró (el usuario de la sesión). */
  registradoPor: string;
}

/**
 * El Telegram al chat PRIVADO de Daniel (`enviarNegocioPrivado`: destino de
 * sistema, trato de negocio, SIN el prefijo 🔧 SISTEMA — un préstamo grande no
 * es una avería). Dice quién, cuánto pidió, cuánto debe, su sueldo y cuánto
 * queda: los cinco datos, más quién lo registró. Es para ENTERARSE; no hay nada
 * que aprobar.
 */
export function textoTelegramTope(a: AvisoTelegramTope): string {
  const e = a.evaluacion;
  const sueldo = e.haySalario
    ? `Sueldo mensual: ${plata(e.tope)}`
    : `Sueldo mensual: sin cargar en Asistencia (tope ${plata(TOPE_SIN_SALARIO)})`;
  return [
    "💵 Préstamo sobre el tope — ya registrado",
    "",
    `${a.nombre}${a.empresa ? ` · ${a.empresa}` : ""}`,
    `Pidió: ${plata(e.monto)}`,
    `Ya debía: ${plata(e.deudaActual)}`,
    sueldo,
    `Queda debiendo: ${plata(e.quedaria)} (${plata(e.excedente)} sobre el tope)`,
    "",
    `Lo registró ${a.registradoPor}. Está activo y entra al descuento de la quincena; se ve en Préstamos.`,
  ].join("\n");
}
