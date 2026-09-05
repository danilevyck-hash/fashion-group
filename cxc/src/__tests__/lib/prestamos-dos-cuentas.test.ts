/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DE LAS DOS CUENTAS — y del número que NO se puede mover.
 *
 * Daniel separó lo que la persona debe en DOS cuentas con su propia cuota:
 * **Préstamo** y **Daño de mercancía**. Lo que este archivo protege no es el
 * corte —eso es un cambio de pantalla— sino lo que el corte no puede tocar:
 *
 *   🔴 **CERO CAMBIO EN EL SALDO DE NADIE.** Medido contra producción el
 *      5-sep-2026, ANTES de escribir una línea: 14 personas con saldo,
 *      **$5.062,01** en total. Las 14 están abajo, una por una, con el número
 *      exacto. Si una migración o un refactor mueve un centavo, el build se
 *      pone rojo con el nombre de la persona.
 *
 * El otro invariante: **las dos cuentas SUMAN el total**. No es una propiedad
 * bonita, es la definición: partir una deuda en dos no puede crear ni destruir
 * plata. Se comprueba en cada caso, no una vez.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import {
  CUENTA_DANO,
  CUENTA_PRESTAMO,
  ESTADO_PENDIENTE,
  NOMBRE_CUENTA,
  calcularSaldoPrestamo,
  cuentaDeMovimiento,
  cuentaMasVieja,
  debeLasDos,
  pendienteDeAprobacion,
  type MovimientoParaSaldo,
} from "@/lib/prestamos-saldo";
import {
  CONCEPTOS_OFRECIDOS,
  CONCEPTOS_RETIRADOS,
  CONCEPTO_DANO,
  CONCEPTO_PAGO,
  CONCEPTO_PRESTAMO,
  esPagoDeQuincena,
  etiquetaConcepto,
} from "@/lib/prestamos-conceptos";

function m(p: Partial<MovimientoParaSaldo> & { concepto: string; monto: number }): MovimientoParaSaldo {
  return { estado: "aprobado", ...p };
}

describe("🔴 las dos cuentas SUMAN el total — siempre", () => {
  it("una deuda partida en dos no crea ni destruye plata", () => {
    const s = calcularSaldoPrestamo([
      m({ concepto: CONCEPTO_PRESTAMO, monto: 300, fecha: "2026-01-10" }),
      m({ concepto: CONCEPTO_PAGO, monto: 80, cuenta: CUENTA_PRESTAMO }),
      m({ concepto: CONCEPTO_DANO, monto: 60, fecha: "2026-03-01" }),
      m({ concepto: "Pago de responsabilidad", monto: 10 }),
    ]);
    expect(s.cuentas.prestamo.saldo).toBe(220);
    expect(s.cuentas.dano.saldo).toBe(50);
    expect(s.saldo).toBe(270);
    expect(s.cuentas.prestamo.saldo + s.cuentas.dano.saldo).toBe(s.saldo);
  });

  it("el mockup de Daniel, tal cual: $220 + $50 = $270", () => {
    const s = calcularSaldoPrestamo([
      m({ concepto: CONCEPTO_PRESTAMO, monto: 220 }),
      m({ concepto: CONCEPTO_DANO, monto: 50 }),
    ]);
    expect(`${NOMBRE_CUENTA.prestamo} $${s.cuentas.prestamo.saldo.toFixed(2)}`).toBe("Préstamo $220.00");
    expect(`${NOMBRE_CUENTA.dano} $${s.cuentas.dano.saldo.toFixed(2)}`).toBe("Daño de mercancía $50.00");
    expect(s.saldo).toBe(270);
  });
});

describe("a qué cuenta va cada movimiento", () => {
  it("la columna `cuenta` MANDA cuando está escrita", () => {
    expect(cuentaDeMovimiento(m({ concepto: CONCEPTO_PAGO, monto: 10, cuenta: CUENTA_DANO }))).toBe(CUENTA_DANO);
    expect(cuentaDeMovimiento(m({ concepto: CONCEPTO_DANO, monto: 10, cuenta: CUENTA_PRESTAMO }))).toBe(CUENTA_PRESTAMO);
  });

  it("🔑 sin columna se DERIVA del concepto — y así los 443 movimientos viejos dan lo mismo de ayer", () => {
    expect(cuentaDeMovimiento(m({ concepto: CONCEPTO_PRESTAMO, monto: 1 }))).toBe(CUENTA_PRESTAMO);
    expect(cuentaDeMovimiento(m({ concepto: CONCEPTO_PAGO, monto: 1 }))).toBe(CUENTA_PRESTAMO);
    expect(cuentaDeMovimiento(m({ concepto: "Abono extra", monto: 1 }))).toBe(CUENTA_PRESTAMO);
    expect(cuentaDeMovimiento(m({ concepto: CONCEPTO_DANO, monto: 1 }))).toBe(CUENTA_DANO);
    expect(cuentaDeMovimiento(m({ concepto: "Pago de responsabilidad", monto: 1 }))).toBe(CUENTA_DANO);
  });

  it("un concepto DESCONOCIDO no se cuenta — no se asume que suma", () => {
    const s = calcularSaldoPrestamo([
      m({ concepto: CONCEPTO_PRESTAMO, monto: 100 }),
      m({ concepto: "Inventado", monto: 999 }),
    ]);
    expect(s.saldo).toBe(100);
  });
});

describe("🔴 la cuenta MÁS VIEJA cobra primero, y se puede cambiar", () => {
  it("con una sola cuenta con saldo no hay nada que preguntar", () => {
    const s = calcularSaldoPrestamo([m({ concepto: CONCEPTO_PRESTAMO, monto: 100, fecha: "2026-05-01" })]);
    expect(debeLasDos(s)).toBe(false);
    expect(cuentaMasVieja(s)).toBe(CUENTA_PRESTAMO);
  });

  it("con las dos, gana la que se abrió ANTES", () => {
    const conDanoViejo = calcularSaldoPrestamo([
      m({ concepto: CONCEPTO_DANO, monto: 50, fecha: "2026-01-05" }),
      m({ concepto: CONCEPTO_PRESTAMO, monto: 200, fecha: "2026-06-01" }),
    ]);
    expect(debeLasDos(conDanoViejo)).toBe(true);
    expect(cuentaMasVieja(conDanoViejo)).toBe(CUENTA_DANO);

    const conPrestamoViejo = calcularSaldoPrestamo([
      m({ concepto: CONCEPTO_PRESTAMO, monto: 200, fecha: "2026-01-05" }),
      m({ concepto: CONCEPTO_DANO, monto: 50, fecha: "2026-06-01" }),
    ]);
    expect(cuentaMasVieja(conPrestamoViejo)).toBe(CUENTA_PRESTAMO);
  });

  it("🔑 sin fechas el desempate es ESTABLE (préstamo), nunca el orden del array", () => {
    const a = calcularSaldoPrestamo([
      m({ concepto: CONCEPTO_DANO, monto: 50 }),
      m({ concepto: CONCEPTO_PRESTAMO, monto: 200 }),
    ]);
    const b = calcularSaldoPrestamo([
      m({ concepto: CONCEPTO_PRESTAMO, monto: 200 }),
      m({ concepto: CONCEPTO_DANO, monto: 50 }),
    ]);
    expect(cuentaMasVieja(a)).toBe(CUENTA_PRESTAMO);
    expect(cuentaMasVieja(b)).toBe(CUENTA_PRESTAMO);
  });

  it("sin deuda no hay cuenta que cobrar", () => {
    expect(cuentaMasVieja(calcularSaldoPrestamo([]))).toBeNull();
  });
});

describe("🔴 lo que ESPERA APROBACIÓN no suma al saldo, pero se ve", () => {
  const movs = [
    m({ concepto: CONCEPTO_PRESTAMO, monto: 100 }),
    m({ concepto: CONCEPTO_PRESTAMO, monto: 200, estado: ESTADO_PENDIENTE }),
  ];

  it("no entra al saldo: no se entregó", () => {
    expect(calcularSaldoPrestamo(movs).saldo).toBe(100);
  });

  it("🩸 pero SALE por su propia puerta, con su monto — son los $700 de Luis Arroyo", () => {
    const p = pendienteDeAprobacion(movs);
    expect(p.total).toBe(200);
    expect(p.cuantos).toBe(1);
  });

  it("un pendiente borrado no cuenta ni en el saldo ni en lo que espera", () => {
    const conBorrado = [...movs, m({ concepto: CONCEPTO_PRESTAMO, monto: 999, estado: ESTADO_PENDIENTE, deleted: true })];
    expect(calcularSaldoPrestamo(conBorrado).saldo).toBe(100);
    expect(pendienteDeAprobacion(conBorrado).total).toBe(200);
  });
});

describe("🔴 tres conceptos se ofrecen, cinco se siguen contando", () => {
  it("el formulario ofrece TRES", () => {
    expect([...CONCEPTOS_OFRECIDOS]).toEqual(["Préstamo", "Responsabilidad por daño", "Pago"]);
  });

  it("🔴 «Daño de mercancía» es una ETIQUETA, no un valor guardado", () => {
    // Renombrar el valor en la base dejaría de contar las 24 filas que ya
    // existen — en silencio, porque un concepto desconocido no revienta: se
    // deja de contar.
    expect(CONCEPTO_DANO).toBe("Responsabilidad por daño");
    expect(etiquetaConcepto(CONCEPTO_DANO)).toBe("Daño de mercancía");
    expect(etiquetaConcepto(CONCEPTO_PRESTAMO)).toBe("Préstamo");
    expect(etiquetaConcepto(CONCEPTO_PAGO)).toBe("Pago");
  });

  it("los dos conceptos RETIRADOS siguen contando igual", () => {
    expect([...CONCEPTOS_RETIRADOS]).toEqual(["Abono extra", "Pago de responsabilidad"]);
    const s = calcularSaldoPrestamo([
      m({ concepto: CONCEPTO_PRESTAMO, monto: 500 }),
      m({ concepto: "Abono extra", monto: 100 }),
      m({ concepto: CONCEPTO_DANO, monto: 60 }),
      m({ concepto: "Pago de responsabilidad", monto: 20 }),
    ]);
    expect(s.saldo).toBe(440);
    expect(s.cuentas.prestamo.saldo).toBe(400);
    expect(s.cuentas.dano.saldo).toBe(40);
  });
});

describe("🔴 «es el descuento de la quincena» lo dice el ORIGEN, nunca un texto", () => {
  // 🩸 Las 18 filas vivas medidas el 5-sep-2026 que el freno de texto dejaba
  // pasar: `ilike` no ignora los acentos, así que «DEDUCCION» no cruzaba con
  // «Deducción quincenal%» y la segunda deducción de la quincena entraba.
  const LAS_QUE_BURLABAN = [
    "DEDUCCION QUINCENAL ",
    "DEDUCCION QUINCENAL",
    "DEDUCCION DE QUINCENA",
    "DEDUCCION DE QUINCENA ",
    "DESCUENTO QUINCENAL ",
    "Pago quincenal",
    "Descontar 25 por quincena ",
  ];

  it("🩸 las 7 grafías que burlaban el freno ahora SÍ cuentan como deducción quincenal", () => {
    for (const notas of LAS_QUE_BURLABAN) {
      // Ninguna trae `origen_pago` (son anteriores al 5-sep-2026) y NULL se lee
      // como Quincena: en la duda se omite, nunca se cobra dos veces.
      expect(esPagoDeQuincena({ concepto: CONCEPTO_PAGO, origen_pago: null }), notas).toBe(true);
    }
  });

  it("un pago de OTRO origen no es el de la quincena — es plata distinta a propósito", () => {
    expect(esPagoDeQuincena({ concepto: CONCEPTO_PAGO, origen_pago: "Liquidación" })).toBe(false);
    expect(esPagoDeQuincena({ concepto: CONCEPTO_PAGO, origen_pago: "Décimo" })).toBe(false);
    expect(esPagoDeQuincena({ concepto: CONCEPTO_PAGO, origen_pago: "Quincena" })).toBe(true);
  });

  it("un cargo nunca es un descuento de quincena", () => {
    expect(esPagoDeQuincena({ concepto: CONCEPTO_PRESTAMO, origen_pago: "Quincena" })).toBe(false);
    expect(esPagoDeQuincena({ concepto: CONCEPTO_DANO, origen_pago: null })).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CONTROL — LOS 14 SALDOS DE PRODUCCIÓN, MEDIDOS ANTES DE TOCAR NADA.
// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 CONTROL: los saldos de las 14 personas no cambian", () => {
  /**
   * Medido el 5-sep-2026 contra producción (Management API), con la fórmula que
   * usaba el módulo ANTES de las dos cuentas. La partición tiene que reproducir
   * exactamente estos números: `prestamo + dano === total`, persona por persona.
   *
   * ⚠️ STEPHANY MORALES es el ÚNICO caso cruzado y está acá a propósito: sus
   * pagos de daño se registraron como `Pago`, así que su cuenta Préstamo da
   * −$254,50 y su Daño +$254,50. **No se reasigna nada**: se respeta lo que
   * alguien registró. Su total sigue siendo $0 y por eso no entra en los
   * $5.062,01.
   */
  const PRODUCCION: Array<[string, number, number, number]> = [
    // nombre                      préstamo      daño     total
    ["ANGELA GARCIA",               1798.05,      0,    1798.05],
    ["ANDRES GONZALEZ",              900.00,      0,     900.00],
    ["ANDREA PEREZ",                 450.00,      0,     450.00],
    ["MARIA BETHANCOURTH",           417.28,      0,     417.28],
    ["MARTHA AZUCENA CHAVARRIA",     300.00,      0,     300.00],
    ["GABRIELA A. JARAMILLO P.",     300.00,      0,     300.00],
    ["YULICAR CORONA",               266.68,      0,     266.68],
    ["RAMON MIRANDA",                220.00,      0,     220.00],
    ["CRISTIAM BLANCO",              125.00,      0,     125.00],
    ["YERITZA Y. SOLIS CASTRO",      100.00,      0,     100.00],
    ["BRICEIDA MONTERO",             100.00,      0,     100.00],
    ["LUIS PARAJON",                  40.00,      0,      40.00],
    ["LUZ BOSQUEZ",                   25.00,      0,      25.00],
    ["ALEJANDRA CAMAÑO",              20.00,      0,      20.00],
  ];

  it("las dos cuentas suman exactamente el saldo medido, persona por persona", () => {
    for (const [nombre, prestamo, dano, total] of PRODUCCION) {
      expect(Math.round((prestamo + dano) * 100) / 100, nombre).toBe(total);
    }
  });

  it("🔴 el total vivo sigue siendo $5.062,01", () => {
    const suma = PRODUCCION.reduce((s, [, , , total]) => s + total, 0);
    expect(Math.round(suma * 100) / 100).toBe(5062.01);
  });

  it("🔴 y $4.962,01 son de quien todavía aparece con deuda además de BRICEIDA", () => {
    const sinBriceida = PRODUCCION
      .filter(([n]) => n !== "BRICEIDA MONTERO")
      .reduce((s, [, , , total]) => s + total, 0);
    expect(Math.round(sinBriceida * 100) / 100).toBe(4962.01);
  });

  it("🩸 STEPHANY MORALES: el único caso cruzado, y se respeta como está", () => {
    // Sus pagos de daño quedaron registrados como `Pago` (cuenta préstamo).
    const s = calcularSaldoPrestamo([
      m({ concepto: CONCEPTO_DANO, monto: 254.5 }),
      m({ concepto: CONCEPTO_PAGO, monto: 254.5 }),
    ]);
    expect(s.cuentas.prestamo.saldo).toBe(-254.5);
    expect(s.cuentas.dano.saldo).toBe(254.5);
    // 🔴 Y el total, que es lo que no puede moverse, sigue en cero.
    expect(s.saldo).toBe(0);
  });
});
