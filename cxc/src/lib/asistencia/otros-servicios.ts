/* ─────────────────────────────────────────────────────────────────────────────
 * «OTROS SERVICIOS» — la regla. Módulo PURO: sin base, sin red, sin `new Date()`.
 *
 * Daniel, textual: *«debería de haber un campo en la ficha que diga "otros
 * servicios", y a qué quincena se le aplica ese extra (debe de ser la misma en
 * la que trabajó)»* · *«que sea como está, el total, ya el detalle debería estar
 * en el perfil»* · *«no paga seguro social y educativo»*.
 *
 * ── 🩸 EL CASO QUE LO ORIGINÓ ────────────────────────────────────────────────
 * JULIO GARAY, 1–15 sep: $31.00 de mensajería y flete + $120.00 de una fiesta
 * religiosa = $151.00. Hoy eso vive en una nota suelta del Excel de la
 * contadora y en la planilla es UN número tecleado a mano, sin nada que diga de
 * dónde salió.
 *
 * ── 🔴 NO SE ELIGE FECHA NI QUINCENA ─────────────────────────────────────────
 * Daniel, 15-sep-2026 (su propia idea): *«se anota el día que se hace la gestión
 * y entra en esa quincena, sin elegir fecha»*. La fecha es la de HOY en Panamá,
 * la pone el servidor, y de ahí sale la quincena — así SIEMPRE cae en la
 * quincena abierta, y desaparece entera la pregunta de qué pasa si alguien
 * anota algo con fecha de una quincena ya cerrada y pagada.
 *
 * ⚠️ Lo único que se pierde es cuándo pasó de verdad si se anota tarde, y eso
 * lo cubre el CONCEPTO, que es obligatorio.
 *
 * ── 🔴 LO QUE NO CAMBIA ──────────────────────────────────────────────────────
 * La casilla «Otros servicios (+)» del cuadro sigue siendo UNA con el total. Lo
 * que cambia es que el número ENTRA SOLO desde la ficha, y se puede seguir
 * escribiendo a mano encima — el mismo trato que la cuota de préstamo. Se SUMA
 * al neto DESPUÉS de las deducciones y no paga seguro social ni educativo: eso
 * ya lo hacía `calcularDinero` y acá no se toca ni un centavo de esa cuenta.
 * ────────────────────────────────────────────────────────────────────────── */

import { centavos } from "./planilla";
import type { DineroLinea, ManualesLinea } from "./planilla";

/** Un renglón, tal como se guarda y como se lee. */
export interface OtroServicio {
  id: string;
  codigo: string;
  /** Clave «AAAA-MM-N», la misma de los montos a mano. */
  quincena: string;
  /** El día en que se anotó (Panamá). */
  fecha: string;
  monto: number;
  concepto: string;
  anotadoPor: string;
}

/** El archivo que Daniel tiene que correr. Se le muestra tal cual. */
export const MIGRACION_OTROS_SERVICIOS =
  "20261202120000_asistencia_otros_servicios.sql";

export function avisoMigracionOtrosServicios(): string {
  return (
    "«Otros servicios» todavía no se puede cargar desde la ficha: falta preparar la base. "
    + `Pídele a Daniel que corra el archivo ${MIGRACION_OTROS_SERVICIOS} en Supabase. `
    + "Mientras tanto la casilla de la planilla se escribe a mano, como hasta ahora."
  );
}

function num(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// A QUÉ QUINCENA CAE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La clave de la quincena que contiene a `fecha` («2026-09-1» / «2026-09-2»).
 *
 * 🔑 Es la MISMA clave con la que se guardan los montos a mano
 * (`asistencia_planilla_manual`, CHECK `AAAA-MM-N`): dos formas de decir «a qué
 * quincena pertenece esto» terminan guardando en una y leyendo de otra.
 *
 * `null` si la fecha no sirve — y entonces no se guarda nada.
 */
export function quincenaDeFecha(fecha: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha ?? "").trim());
  if (!m) return null;
  const dia = Number(m[3]);
  if (dia < 1 || dia > 31) return null;
  return `${m[1]}-${m[2]}-${dia <= 15 ? 1 : 2}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUÉ SE PUEDE GUARDAR
// ─────────────────────────────────────────────────────────────────────────────

export type Validacion =
  | { ok: true; monto: number; concepto: string }
  | { ok: false; error: string };

/** Lo máximo que puede medir un concepto. No es un párrafo: es una etiqueta. */
export const MAX_CONCEPTO = 120;

/**
 * 🔴 MONTO Y CONCEPTO, LOS DOS OBLIGATORIOS. Y nada más — Daniel: *«Cada
 * renglón: monto · concepto. Y nada más»*.
 *
 * El concepto es lo único que explica de dónde salió la plata (y lo que
 * reemplaza a la fecha que no se elige), así que un renglón sin él no se
 * guarda. El monto se SUMA al neto: un 0 no es un servicio.
 */
export function validarOtroServicio(montoRaw: unknown, conceptoRaw: unknown): Validacion {
  const concepto = String(conceptoRaw ?? "").trim().replace(/\s+/g, " ");
  const monto = centavos(num(montoRaw));
  if (!(monto > 0)) {
    return { ok: false, error: "Escribe el monto: tiene que ser mayor que cero." };
  }
  if (!concepto) {
    return { ok: false, error: "Escribe el concepto: es lo que explica de dónde salió el monto." };
  }
  if (concepto.length > MAX_CONCEPTO) {
    return { ok: false, error: `El concepto no puede pasar de ${MAX_CONCEPTO} caracteres.` };
  }
  return { ok: true, monto, concepto };
}

/** Lo que falta para poder guardar, para apagar el botón y DECIR por qué.
 *  `null` = se puede guardar. Misma idea que «Falta: la cuota» en Préstamos. */
export function faltaParaGuardar(montoRaw: unknown, conceptoRaw: unknown): string | null {
  const monto = centavos(num(montoRaw));
  const concepto = String(conceptoRaw ?? "").trim();
  if (!(monto > 0) && !concepto) return "Falta: el monto y el concepto";
  if (!(monto > 0)) return "Falta: el monto";
  if (!concepto) return "Falta: el concepto";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE SUMA Y CÓMO SE LEE
// ─────────────────────────────────────────────────────────────────────────────

/** El total de una lista, a centavos. */
export function totalOtrosServicios(renglones: readonly { monto: number }[]): number {
  return centavos(renglones.reduce((a, r) => a + num(r.monto), 0));
}

/** Por CÓDIGO, para que la planilla lea en una pasada. Nunca por nombre. */
export function totalPorCodigo(renglones: readonly OtroServicio[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of renglones) {
    const cod = String(r.codigo ?? "").trim();
    if (!cod) continue;
    out.set(cod, centavos(num(out.get(cod)) + num(r.monto)));
  }
  return out;
}

/** El resumen de la sección: «$151.00 en 2 conceptos» / «Nada esta quincena». */
export function resumenSeccion(renglones: readonly { monto: number }[]): string {
  if (renglones.length === 0) return "Nada esta quincena";
  const n = renglones.length;
  return `$${totalOtrosServicios(renglones).toFixed(2)} en ${n} concepto${n === 1 ? "" : "s"}`;
}

/**
 * La NOTA del comprobante, debajo del renglón OTROS SERVICIOS:
 * «mensajería y flete $31.00 · fiesta religiosa $120.00».
 *
 * 🔑 Reusa el mecanismo que ya tiene el renglón TARDANZAS (`notaTardanza` →
 * `RenglonComprobante.nota`): el monto y el lugar del renglón NO cambian, lo
 * único que se agrega es la explicación. Sin nada esa quincena, `null` — sale
 * en cero y sin nota, como hoy.
 */
export function notaOtrosServicios(
  renglones: readonly { concepto: string; monto: number }[],
): string | null {
  if (renglones.length === 0) return null;
  return renglones
    .map((r) => `${String(r.concepto ?? "").trim()} $${centavos(num(r.monto)).toFixed(2)}`)
    .join(" · ");
}

/**
 * 🔴 EL TOTAL DE LA FICHA ENTRA SOLO A LA CASILLA — y lo escrito a mano manda.
 *
 * Mismo trato que la cuota de préstamo (`aplicarPrestamoEnLinea`): con la
 * casilla en 0 (vacía) entra el total de la ficha; con un monto escrito, no se
 * pisa. ⚠️ «Otros servicios» NO tiene los tres estados de las casillas
 * automáticas —su columna es `NOT NULL DEFAULT 0`, así que 0 y vacío dicen lo
 * mismo— y eso está bien acá: no descontar «esta quincena» un pago EXTRA no es
 * una decisión que exista (se borra el renglón de la ficha y listo).
 *
 * 🔑 SE SUMA AL NETO Y NADA MÁS. No toca `totalBruto`, ni los seguros, ni el
 * total de deducciones: es la MISMA cuenta que `calcularDinero`
 * (`neto = bruto − deducciones + otros servicios`). Sin `dinero` (servicio
 * profesional, «Tú decides») no se toca nada, y sin nada que meter vuelve la
 * MISMA referencia.
 */
export function aplicarOtrosServiciosEnLinea<
  L extends {
    codigo: string;
    manuales: ManualesLinea;
    dinero: DineroLinea | null;
    parte?: { llevaElReloj: boolean } | null;
  },
>(linea: L, totalFicha: number): L & { otrosServiciosDeFicha?: number } {
  const d = linea.dinero;
  const total = centavos(Math.max(0, num(totalFicha)));
  if (!d || total <= 0) return linea;
  // 🔴 CON EL SUELDO REPARTIDO ENTRE DOS EMPRESAS, ESTO CAE EN UNA SOLA LÍNEA:
  // la del RELOJ, que es donde `armarLinea` ya manda todos los montos escritos
  // a mano (`parte && !parte.llevaElReloj ? MANUALES_CERO : manuales`). Sin
  // este candado, a Julio Garay —que cobra en Vistana y en Fashion Wear— se le
  // pagarían sus $151 DOS VECES, y nadie lo vería hasta el día de cobro.
  if (linea.parte && !linea.parte.llevaElReloj) return linea;
  // Lo escrito a mano manda: si hay un monto en la casilla, no entra nada.
  if (centavos(num(linea.manuales.otrosServicios)) > 0) return linea;
  const dinero: DineroLinea = {
    ...d,
    otrosServicios: centavos(d.otrosServicios + total),
    netoPagar: centavos(d.netoPagar + total),
  };
  return { ...linea, dinero, otrosServiciosDeFicha: total };
}
