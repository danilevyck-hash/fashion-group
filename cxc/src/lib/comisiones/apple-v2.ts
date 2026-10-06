// ─────────────────────────────────────────────────────────────────────────────
// COMISIONES «COMO LO HARÍA APPLE», v2 (6-oct-2026, PROPUESTA, apagada).
// Módulo PURO: sin React, sin fetch, sin reloj.
//
// El método que Daniel aprobó en Nueva guía, Ventas, CxC, Guías, Reclamos y
// Clientes: la MISMA pantalla, con las reglas de docs/diseno.md y las piezas ya
// aprobadas. La pregunta de la pantalla: «¿cuánto le pago a cada vendedor este
// mes?».
//
//   Celular y computadora
//   1 · El total a pagar es el NÚMERO GRANDE (la clase de Ventas y CxC, peso
//       normal) con UNA línea gris: en la computadora «Total a pagar · Ventas
//       $412k · Cobros $388k · Descuentos −$2k» y la frescura al lado; en el
//       celular «Total a pagar · Actualizado 4:00 pm ↻», como CxC. Va DEBAJO del selector y del
//       mes (primero se elige, abajo el resultado) y ARRIBA de la lista: no hay
//       barra negra al pie que el ☰ tape.
//   2 · Celular: cada vendedor son DOS renglones con › (nombre y monto; de qué
//       empresas sale, o «Com. venta · Com. cobro» en una empresa). Con una sola
//       empresa, tocar abre el detalle sin el paso intermedio.
//   3 · Celular: «Descargar» es el botón de texto del título (sin «···» con una
//       sola opción adentro). Computadora: UN «Descargar ▾» (PDF · Excel) en vez
//       de dos botones, y el ⓘ de criterios baja a la línea del pie.
//   Detalle del vendedor: se abre DEBAJO también en una empresa (era modal),
//   con UNA acción principal («Enviar») y UN «Descargar ▾»; «No pagable» como
//   chip, no como frase ámbar.
//   Configuración: el «guardado» sale en el aviso de la casa (abajo al centro),
//   los botones dicen lo que agregan y no son negros, y en el celular el título
//   dice «Configuración».
//
// 🔴 NINGÚN CÁLCULO CAMBIA. Los totales los siguen REPORTANDO las vistas con
// `sumarPagable` (las mismas cuentas del pie de la tabla); aquí solo se escribe
// el texto. Los descuentos se restan una sola vez, en el servidor: el que se
// muestra aquí es informativo, como el «bruto − descuento» de la celda.
// DEFAULT y Daniel Levy siguen detrás de «Mostrar no pagables».
//
// Interruptor `COMISIONES_APPLE_V2_2026_10`: `false` = todo como hoy. Candado
// `__tests__/comisiones/comisiones-apple-v2.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import { cifraDeLaTira } from "@/lib/ventas/celular";
import { fmtMoney } from "@/lib/ventas/format";
import { celdaVacia } from "./matriz-celda";

/** `false` = como hoy. Se prende con el «sí» de Daniel al mockup HOY vs RECOMENDACIÓN. */
export const COMISIONES_APPLE_V2_2026_10 = false;

/** El rótulo del número grande. */
export const ROTULO_TOTAL_V2 = "Total a pagar";

/** El botón único de papel (celular y computadora). */
export const ROTULO_DESCARGAR_V2 = "Descargar";

/** Lo que la vista dueña del número reporta hacia arriba. Ya sumado por ella. */
export interface ResumenDelTotal {
  total: number;
  /** Base de venta comisionable de lo que se paga. */
  ventas: number;
  /** Base de cobro de lo que se paga. */
  cobros: number;
  /** Descuentos fijos ya restados del total (informativo). */
  descuentos: number;
}

/**
 * «Total a pagar · Ventas $412k · Cobros $388k · Descuentos −$2k».
 * Las bases, cortas (la cifra de Ventas); los descuentos solo si hay.
 */
export function lineaBajoElTotal(r: ResumenDelTotal): string {
  const partes = [ROTULO_TOTAL_V2, `Ventas ${cifraDeLaTira(r.ventas)}`, `Cobros ${cifraDeLaTira(r.cobros)}`];
  if (r.descuentos > 0) partes.push(`Descuentos ${cifraDeLaTira(-r.descuentos)}`);
  return partes.join(" · ");
}

/** Las empresas de una fila de la matriz que tienen algo, en el orden de las columnas. */
export function empresasDeLaFila(
  porEmpresa: Record<string, number>,
  descuentoPorEmpresa: Record<string, number> | undefined,
  empresas: readonly string[],
): string[] {
  return empresas.filter((k) => !celdaVacia(porEmpresa[k], descuentoPorEmpresa?.[k] ?? 0));
}

/** Segundo renglón en «Todas»: «Vistana · Fashion Shoes». */
export function segundaLineaMatriz(empresas: readonly string[], nombre: (k: string) => string): string {
  return empresas.map(nombre).join(" · ");
}

/** Segundo renglón en una empresa: «Com. venta $25.88 · Com. cobro $41.20 · Descuento −$1,573.08». */
export function segundaLineaEmpresa(v: { comision: number; comision_cobro: number; descuento?: number }): string {
  const partes = [`Com. venta ${fmtMoney(v.comision ?? 0)}`, `Com. cobro ${fmtMoney(v.comision_cobro ?? 0)}`];
  if ((v.descuento ?? 0) > 0) partes.push(`Descuento −${fmtMoney(v.descuento ?? 0)}`);
  return partes.join(" · ");
}
