// ─────────────────────────────────────────────────────────────────────────────
// EL TOPE: NADIE DEBE MÁS DE UN SUELDO MENSUAL.
//
// Daniel, 5-sep-2026. La regla, entera:
//
//   · Se compara **deuda total (préstamo + daño) + lo que pide** contra el
//     **salario mensual** de la ficha de Asistencia (`asistencia_personas`).
//   · **Sin salario cargado, el tope es $500.** Hay 3 fichas sin salario.
//   · Se **recalcula siempre**, con el sueldo del momento: no hay foto.
//   · 🔴 Solo frena el **PRÉSTAMO**. Un **daño de mercancía se registra
//     siempre**, sin freno: no es plata que se entrega, es plata que ya se
//     perdió, y no anotarla no la hace desaparecer.
//   · Si pasa: se guarda **pendiente**, sale un Telegram al chat privado de
//     Daniel y él aprueba o rechaza. **7 días sin respuesta → se elimina solo.**
//
// ── 🔴 LO PENDIENTE NO SUMA AL SALDO, PERO SE VE ─────────────────────────────
//
// 🩸 Es la lección de los $700 de LUIS ADRIAN ARROYO: el freno de $500 que
// existió hasta el 27-ago-2026 dejó un préstamo *escondido* en
// `pendiente_aprobacion` durante **22 días** — su saldo decía $0, no se le
// descontaba nada, y se supo porque la contadora lo mencionó de pasada. El
// freno no protegía: escondía.
//
// La diferencia de este tope con aquel no es el número, es que **lo que espera
// se ve**: línea gris en la ficha («Esperando aprobación $200.00») y el
// movimiento resaltado con «Esperando a Daniel · hace N días». Rechazar sí,
// esconder no.
//
// ⚠️ HOY DOS PERSONAS YA PASAN EL TOPE — ÁNGELA GARCÍA $1.798,05 con sueldo
// $800 y ANDRÉS GONZÁLEZ $900 con $850. **No se les pide nada por lo que ya
// deben.** El tope solo mira un préstamo NUEVO.
//
// Módulo PURO: sin base, sin red y sin `new Date()`.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 El tope de quien no tiene salario cargado en Asistencia. */
export const TOPE_SIN_SALARIO = 500;

/** Días que un préstamo puede esperar la respuesta de Daniel antes de caducar. */
export const DIAS_CADUCIDAD_PENDIENTE = 7;

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
  /** Deuda TOTAL de hoy: préstamo + daño. Lo pendiente NO cuenta (no se entregó). */
  deudaActual: number;
  /** Lo que está pidiendo ahora. */
  monto: number;
  /** El salario mensual de `asistencia_personas`, o `null` si no está cargado. */
  salarioMensual: number | null | undefined;
}

export interface EvaluacionTope {
  /** `true` = entra derecho, sin aprobación. */
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
 * ¿Este préstamo necesita la aprobación de Daniel?
 *
 * 🔑 Se mira la deuda TOTAL, no solo la de préstamos: un daño de mercancía es
 * plata que la persona debe igual, y sumarle un préstamo encima es exactamente
 * el caso que el tope existe para frenar.
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
 * El aviso de la pantalla, cuando el préstamo pasa el tope. Dice el detalle: sin
 * los números, «necesita aprobación» es una puerta cerrada sin explicación.
 */
export function textoAvisoTope(e: EvaluacionTope): string {
  const techo = e.haySalario
    ? `su sueldo mensual (${plata(e.tope)})`
    : `${plata(e.tope)} — no tiene sueldo cargado en Asistencia`;
  return (
    `Este préstamo necesita aprobación de Daniel. `
    + `Debe ${plata(e.deudaActual)} y pide ${plata(e.monto)}: quedaría en ${plata(e.quedaria)}, `
    + `${plata(e.excedente)} por encima de ${techo}.`
  );
}

/** Lo que dice el botón cuando hace falta aprobación. */
export const BOTON_MANDAR_APROBACION = "Mandar aprobación";

export interface AvisoTelegramTope {
  nombre: string;
  empresa: string | null;
  evaluacion: EvaluacionTope;
}

/**
 * El Telegram al chat PRIVADO de Daniel (`enviarNegocioPrivado`: destino de
 * sistema, trato de negocio, SIN el prefijo 🔧 SISTEMA — un préstamo que espera
 * no es una avería). Dice quién, cuánto pide, cuánto debe, su sueldo y cuánto
 * quedaría: los cinco datos con los que se decide sin abrir la app.
 */
export function textoTelegramTope(a: AvisoTelegramTope): string {
  const e = a.evaluacion;
  const sueldo = e.haySalario
    ? `Sueldo mensual: ${plata(e.tope)}`
    : `Sueldo mensual: sin cargar en Asistencia (tope ${plata(TOPE_SIN_SALARIO)})`;
  return [
    "💵 Préstamo esperando tu aprobación",
    "",
    `${a.nombre}${a.empresa ? ` · ${a.empresa}` : ""}`,
    `Pide: ${plata(e.monto)}`,
    `Ya debe: ${plata(e.deudaActual)}`,
    sueldo,
    `Quedaría debiendo: ${plata(e.quedaria)} (${plata(e.excedente)} sobre el tope)`,
    "",
    `Se aprueba o se rechaza en Préstamos › Por aprobar. Si nadie contesta en ${DIAS_CADUCIDAD_PENDIENTE} días, se elimina solo.`,
  ].join("\n");
}

/** Suma días a una fecha YYYY-MM-DD. Puro, sin zona horaria. */
function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/**
 * ¿Este pendiente ya caducó? Se compara por DÍA de Panamá (las dos fechas
 * llegan como YYYY-MM-DD), nunca por milisegundos: el cron corre una vez al día
 * y un umbral de horas haría que el mismo préstamo caduque o no según a qué
 * hora se pidió.
 */
export function pendienteCaducado(fechaPedido: string, hoy: string): boolean {
  const f = String(fechaPedido).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  return hoy >= sumarDias(f, DIAS_CADUCIDAD_PENDIENTE);
}

/** «hace 3 días» / «hoy» / «ayer» — cuánto lleva esperando. */
export function desdeCuandoEspera(fechaPedido: string, hoy: string): string {
  const f = String(fechaPedido).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return "";
  const [ay, am, ad] = f.split("-").map(Number);
  const [by, bm, bd] = hoy.split("-").map(Number);
  const dias = Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000,
  );
  if (dias <= 0) return "hoy";
  if (dias === 1) return "desde ayer";
  return `hace ${dias} días`;
}
