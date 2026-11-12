// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL DESGLOSE POR EMPRESA EN LA HOJA DEL CELULAR (12-nov-2026, PRENDIDO —
// Daniel aprobó la «Variante B» de `celular-variantes.html`).
//
// Al tocar un cliente en la lista del celular, la hoja abre con:
//   · el NOMBRE del cliente de título y el total grande, con centavos;
//   · «Desglose por empresa (N)»: Empresa · 0-90 · 91-120 · +120 · Total, como
//     la computadora, montos SIN centavos (igual que la lista) para que el
//     cliente más grande quepa en 375 px; debajo de cada empresa «Últ. pago ·
//     Últ. compra», y la fila de Total;
//   · «Enviar estado de cuenta» (negro), que despliega las cuatro salidas de
//     siempre, y «Ver ficha completa ›».
//
// 🔴 NO HAY UNA LECTURA NUEVA: todo sale del aging que ya trajo la lista
// (`empresasDelCliente`). Los tramos se suman con la regla de la computadora.
// Es EDAD del documento, no mora: los rangos van en días.
//
// Interruptor `CXC_DESGLOSE_CELULAR_2026_11`: `false` = la hoja de antes.
// La computadora NO usa esto. Candado `cxc-desglose-celular-2026-11.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────
import { montoExacto, type RenglonEmpresaCliente } from "./lista-celular";

export const CXC_DESGLOSE_CELULAR_2026_11 = true;

/**
 * «Vistana International» es la única que baja de línea a 375 px: se acorta a
 * «Vistana». Las demás van completas.
 */
export function nombreCortoEmpresa(key: string, nombre: string): string {
  return key === "vistana" ? "Vistana" : nombre;
}

/** `20,076` — sin centavos ni signo de dólar (la columna ya dice qué es). Cero = «0». */
export function montoDeTabla(n: number): string {
  return montoExacto(n).replace("$", "");
}

export interface TotalDesglose {
  current: number;
  watch: number;
  overdue: number;
  total: number;
}

/** La fila de Total: la suma, al centavo, de las filas de arriba. */
export function totalDelDesglose(filas: RenglonEmpresaCliente[]): TotalDesglose {
  const t = filas.reduce(
    (a, f) => ({
      current: a.current + f.current,
      watch: a.watch + f.watch,
      overdue: a.overdue + f.overdue,
      total: a.total + f.total,
    }),
    { current: 0, watch: 0, overdue: 0, total: 0 },
  );
  const r = (n: number) => Math.round(n * 100) / 100;
  return { current: r(t.current), watch: r(t.watch), overdue: r(t.overdue), total: r(t.total) };
}
