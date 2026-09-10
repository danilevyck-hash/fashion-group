/* ─────────────────────────────────────────────────────────────────────────────
 * AL CERRAR, EL PAGO DEL PRÉSTAMO SE ESCRIBE SOLO.
 *
 * 🩸 Quincena del 1 al 15 de agosto de 2026, medido contra producción:
 *
 *     El módulo de Préstamos registró .......... 9 descuentos · $360,00
 *     La casilla de la planilla decía .......... 7 descuentos · $265,00
 *
 * KEVIN LUBO ($50), LUIS PARAJON ($45) y YULICAR CORONA ($50) tenían el
 * descuento anotado en el módulo y la casilla EN CERO: se les bajó la deuda por
 * plata que nunca se les quitó del sueldo. LUIS ARROYO al revés.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import {
  CONCEPTO_DE_CUENTA,
  ORIGEN_QUINCENA,
  TEXTO_OMISION,
  planDeCierre,
  textoPlan,
  type DeudaDePersona,
} from "@/lib/asistencia/cierre-prestamo";
import { validarAbono, ORIGENES_ABONO, ORIGEN_DE_LA_QUINCENA } from "@/lib/asistencia/abono-extra";
import type { DineroLinea, LineaPlanilla } from "@/lib/asistencia/planilla";

const DINERO = (prestamo: number): DineroLinea => ({
  rataHora: 3, valorMinuto: 0.05, salarioQuincenal: 260,
  extraDiurno: 0, extraNocturno: 0, excedente: 0,
  domingos: 0, feriados: 0, ausencias: 0,
  ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  tardanzas: 0, totalBruto: 260, baseSeguros: null,
  seguroSocial: 0, seguroEducativo: 0, isr: 0,
  prestamo, terceros: 0, mercancia: 0,
  totalDeducciones: prestamo, otrosServicios: 0, netoPagar: 260 - prestamo,
});

const linea = (codigo: string, etiqueta: string, prestamo: number): LineaPlanilla =>
  ({ codigo, etiqueta, nombre: etiqueta, dinero: DINERO(prestamo), horas: {} } as unknown as LineaPlanilla);

/** Una línea con las TRES casillas de descuento puestas a mano. */
const lineaCon = (
  codigo: string, etiqueta: string,
  c: { prestamo?: number; terceros?: number; mercancia?: number },
): LineaPlanilla => ({
  codigo, etiqueta, nombre: etiqueta, horas: {},
  dinero: { ...DINERO(c.prestamo ?? 0), terceros: c.terceros ?? 0, mercancia: c.mercancia ?? 0 },
} as unknown as LineaPlanilla);

const deuda = (o: Partial<DeudaDePersona> & { codigo: string }): DeudaDePersona => ({
  fichaId: `f-${o.codigo}`, nombrePrestamos: "X",
  saldoPrestamo: 500, saldoDano: 0, saldoTerceros: 0,
  cuotaPrestamo: 50, cuotaTerceros: 0,
  yaDescontado: 0, yaDescontadoTerceros: 0, yaDescontadoDano: 0, ...o,
});

const mapa = (...ds: DeudaDePersona[]) => new Map(ds.map((d) => [d.codigo, d]));

// ─────────────────────────────────────────────────────────────────────────────
describe("A. SE ESCRIBE LO QUE DICE LA CASILLA, y con los datos correctos", () => {
  it("una persona con $50 en la casilla genera UN pago de $50", () => {
    const plan = planDeCierre({
      lineas: [linea("6", "KEVIN LUBO", 50)],
      deudas: mapa(deuda({ codigo: "6" })),
      fecha: "2026-08-15",
    });
    expect(plan.pagos).toHaveLength(1);
    expect(plan.pagos[0]).toMatchObject({
      codigo: "6", cuenta: "prestamo", monto: 50,
      concepto: "Pago", fecha: "2026-08-15", origenPago: ORIGEN_QUINCENA,
    });
    expect(plan.total).toBe(50);
  });

  // 🔴 LA FECHA ES EL ÚLTIMO DÍA DEL PERÍODO: el día que la plata se le quitó
  // del sueldo. Entra por parámetro; el módulo no mira el reloj.
  it("la fecha del pago es la que se le pasa, nunca «hoy»", () => {
    const plan = planDeCierre({
      lineas: [linea("6", "K", 50)], deudas: mapa(deuda({ codigo: "6" })), fecha: "2026-01-31",
    });
    expect(plan.pagos[0].fecha).toBe("2026-01-31");
  });

  // 🔴 LOS CONCEPTOS SON LOS DE SIEMPRE. Renombrar uno no revienta nada: deja
  // de contarse en silencio, porque `cuentaDeMovimiento` los usa para saber a
  // qué cuenta va un movimiento viejo.
  it("los conceptos no se renombran", () => {
    expect(CONCEPTO_DE_CUENTA.prestamo).toBe("Pago");
    expect(CONCEPTO_DE_CUENTA.dano).toBe("Pago de responsabilidad");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. 🔴 SI EL MÓDULO YA LO REGISTRÓ, NO SE ESCRIBE NADA", () => {
  // Es el «caso 1» de `montoDeFicha`: un hecho consumado. Escribir encima sería
  // cobrarle DOS VECES a la misma persona la misma quincena.
  it("con `yaDescontado` no se genera pago, y se dice por qué", () => {
    const plan = planDeCierre({
      lineas: [linea("6", "KEVIN LUBO", 50)],
      deudas: mapa(deuda({ codigo: "6", yaDescontado: 50 })),
      fecha: "2026-08-15",
    });
    expect(plan.pagos).toHaveLength(0);
    expect(plan.omisiones).toEqual([
      { codigo: "6", etiqueta: "KEVIN LUBO", monto: 50, motivo: "ya-registrado" },
    ]);
  });

  it("aunque lo registrado sea un monto distinto al de la casilla", () => {
    const plan = planDeCierre({
      lineas: [linea("6", "K", 50)],
      deudas: mapa(deuda({ codigo: "6", yaDescontado: 30 })),
      fecha: "2026-08-15",
    });
    expect(plan.pagos).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. LO QUE NO SE ESCRIBE, SE DICE — nunca en silencio", () => {
  it("casilla en cero de alguien que DEBE: se nombra", () => {
    const plan = planDeCierre({
      lineas: [linea("15", "YULICAR CORONA", 0)],
      deudas: mapa(deuda({ codigo: "15", saldoPrestamo: 300 })),
      fecha: "2026-08-15",
    });
    expect(plan.omisiones[0]).toMatchObject({ codigo: "15", motivo: "casilla-en-cero" });
  });

  // 🔑 Pero NO se nombra a quien no debe nada: decirle a la contadora «a estas
  // 30 personas no se les descontó» sobre gente sin deuda es ruido, y el ruido
  // hace que un aviso de verdad pase desapercibido.
  it("casilla en cero de alguien SIN deuda: no es noticia", () => {
    const plan = planDeCierre({
      lineas: [linea("99", "SIN DEUDA", 0)],
      deudas: mapa(deuda({ codigo: "99", saldoPrestamo: 0, saldoDano: 0 })),
      fecha: "2026-08-15",
    });
    expect(plan.omisiones).toHaveLength(0);
  });

  // 🔴 EL AMARRE ES EL CÓDIGO, NUNCA EL NOMBRE. Sin ficha atada se DICE; no se
  // busca por parecido.
  it("se le descontó pero no está atado a ninguna ficha: se nombra", () => {
    const plan = planDeCierre({
      lineas: [linea("77", "SIN FICHA", 50)], deudas: mapa(), fecha: "2026-08-15",
    });
    expect(plan.pagos).toHaveLength(0);
    expect(plan.omisiones[0]).toMatchObject({ codigo: "77", motivo: "sin-ficha", monto: 50 });
  });

  it("cada motivo tiene UNA sola redacción", () => {
    expect(Object.keys(TEXTO_OMISION).sort()).toEqual(
      ["casilla-en-cero", "sin-ficha", "sin-saldo", "ya-registrado"],
    );
    for (const t of Object.values(TEXTO_OMISION)) expect(t.trim()).not.toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. UNA CASILLA, UNA CUENTA — las tres, sin repartir nada", () => {
  // 🩸 ESTE BLOQUE EXIGÍA LO CONTRARIO HASTA EL 10-SEP-2026, y cambió de
  // dirección, no se borró. Se llamaba «CÓMO SE PARTE LA CASILLA ENTRE LAS DOS
  // CUENTAS»: la casilla «Préstamo» traía la suma de las dos cuotas (Daniel:
  // *«juntos»*) y al cerrar había que volver a partirla.
  //
  // Lo cambió la contadora al separar los renglones del comprobante. Ahora cada
  // cuenta tiene SU casilla, así que el reparto —la única parte de este archivo
  // que podía mandar plata a la cuenta equivocada— dejó de existir.
  //
  // 🔑 LA REGLA DE FONDO NO CAMBIÓ: nunca se anota más de lo que se debe.

  it("la casilla «Préstamo» va a la cuenta préstamo, y nada más", () => {
    const plan = planDeCierre({
      lineas: [linea("6", "KEVIN LUBO", 50)],
      deudas: mapa(deuda({ codigo: "6", saldoPrestamo: 500, saldoDano: 500, saldoTerceros: 500 })),
      fecha: "2026-08-15",
    });
    expect(plan.pagos.map((p) => [p.cuenta, p.monto])).toEqual([["prestamo", 50]]);
  });

  it("la casilla «Terceros» va a la cuenta terceros, con su concepto", () => {
    const plan = planDeCierre({
      lineas: [lineaCon("23", "ANDRES GONZALEZ", { terceros: 40 })],
      deudas: mapa(deuda({ codigo: "23", saldoPrestamo: 0, saldoTerceros: 79.94 })),
      fecha: "2026-08-15",
    });
    expect(plan.pagos).toHaveLength(1);
    expect(plan.pagos[0]).toMatchObject({
      cuenta: "terceros", monto: 40, concepto: "Pago de terceros",
    });
  });

  it("la casilla «Mercancía» va a la cuenta daño, con su concepto", () => {
    const plan = planDeCierre({
      lineas: [lineaCon("21", "RAMON MIRANDA", { mercancia: 16 })],
      deudas: mapa(deuda({ codigo: "21", saldoPrestamo: 0, saldoDano: 120 })),
      fecha: "2026-08-15",
    });
    expect(plan.pagos).toHaveLength(1);
    expect(plan.pagos[0]).toMatchObject({
      cuenta: "dano", monto: 16, concepto: "Pago de responsabilidad",
    });
  });

  it("las TRES a la vez son TRES movimientos, uno por cuenta", () => {
    const plan = planDeCierre({
      lineas: [lineaCon("8", "BRICEIDA", { prestamo: 30, terceros: 40, mercancia: 16 })],
      deudas: mapa(deuda({ codigo: "8", saldoPrestamo: 300, saldoTerceros: 200, saldoDano: 100 })),
      fecha: "2026-08-15",
    });
    expect(plan.pagos.map((p) => [p.cuenta, p.monto])).toEqual([
      ["prestamo", 30], ["terceros", 40], ["dano", 16],
    ]);
    expect(plan.total).toBe(86);
  });

  // ⚠️ Nunca se anota más de lo que se debe: pagar de más dejaría un saldo a
  // favor que nadie pidió.
  it("lo que pasa del saldo de SU cuenta se recorta", () => {
    const plan = planDeCierre({
      lineas: [lineaCon("9", "LUIS", { prestamo: 500, terceros: 500, mercancia: 500 })],
      deudas: mapa(deuda({ codigo: "9", saldoPrestamo: 100, saldoTerceros: 50, saldoDano: 25 })),
      fecha: "2026-08-15",
    });
    expect(plan.pagos.map((p) => [p.cuenta, p.monto])).toEqual([
      ["prestamo", 100], ["terceros", 50], ["dano", 25],
    ]);
  });

  // 🔴 EL «YA DESCONTADO» ES POR CUENTA. Si fuera uno solo, un pago de terceros
  // apagaría el descuento del préstamo — la persona pagaría una cuenta y se le
  // perdonaría la otra en silencio.
  it("un pago ya registrado de UNA cuenta no apaga a las otras", () => {
    const plan = planDeCierre({
      lineas: [lineaCon("8", "BRICEIDA", { prestamo: 30, terceros: 40 })],
      deudas: mapa(deuda({
        codigo: "8", saldoPrestamo: 300, saldoTerceros: 200,
        yaDescontadoTerceros: 40,
      })),
      fecha: "2026-08-15",
    });
    // Terceros se omite (hecho consumado); el préstamo SÍ se anota.
    expect(plan.pagos.map((p) => [p.cuenta, p.monto])).toEqual([["prestamo", 30]]);
    expect(plan.omisiones.map((o) => o.motivo)).toEqual(["ya-registrado"]);
  });

  it("una casilla en cero no anota nada en su cuenta", () => {
    const plan = planDeCierre({
      lineas: [lineaCon("8", "BRICEIDA", { prestamo: 0, terceros: 0, mercancia: 0 })],
      deudas: mapa(deuda({ codigo: "8", saldoPrestamo: 300, saldoTerceros: 200, saldoDano: 100 })),
      fecha: "2026-08-15",
    });
    expect(plan.pagos).toEqual([]);
  });

  // 🔴 EL DAÑO NO PROPONE, ASÍ QUE SU CASILLA VACÍA ES LO NORMAL — y no se
  // avisa. Las dos automáticas SÍ: una casilla en cero sobre una deuda viva es
  // un descuento que faltó.
  it("la casilla vacía del DAÑO no genera aviso; las automáticas sí", () => {
    const plan = planDeCierre({
      lineas: [lineaCon("8", "BRICEIDA", { prestamo: 0, terceros: 0, mercancia: 0 })],
      deudas: mapa(deuda({ codigo: "8", saldoPrestamo: 300, saldoTerceros: 200, saldoDano: 100 })),
      fecha: "2026-08-15",
    });
    // Dos avisos (préstamo y terceros), NO tres.
    expect(plan.omisiones).toHaveLength(2);
    expect(plan.omisiones.every((o) => o.motivo === "casilla-en-cero")).toBe(true);
  });
});

describe("E. LO QUE SE DICE ANTES DE CERRAR", () => {
  it("con pagos, se dice cuántas personas y cuánto", () => {
    const plan = planDeCierre({
      lineas: [linea("6", "K", 50), linea("10", "L", 45)],
      deudas: mapa(deuda({ codigo: "6" }), deuda({ codigo: "10" })),
      fecha: "2026-08-15",
    });
    const t = textoPlan(plan)!;
    expect(t).toContain("2 personas");
    expect(t).toContain("95.00");
    // Y se dice que nadie lo teclea: es el cambio entero.
    expect(t).toMatch(/nadie lo teclea/i);
  });

  it("sin nada que anotar no se dice nada", () => {
    expect(textoPlan({ pagos: [], omisiones: [], total: 0 })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("F. EL ABONO EXTRAORDINARIO NUNCA SE DISFRAZA DE QUINCENA", () => {
  // 🔴 Ese origen lo escribe el cierre, y SOLO el cierre. Un abono anotado así
  // lo leería la casilla como «ya descontado» y esa quincena no le descontaría
  // nada a la persona: el mismo pago contado dos veces, al revés.
  it("«Quincena» no está entre los orígenes que se ofrecen", () => {
    expect(ORIGENES_ABONO).not.toContain(ORIGEN_DE_LA_QUINCENA);
  });

  it("y el servidor lo rechaza aunque alguien lo mande a mano", () => {
    const r = validarAbono({
      fichaId: "f-1", cuenta: "prestamo", monto: 50, fecha: "2026-08-20", origen: "Quincena",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cierre de la planilla/i);
  });

  it("un abono bueno pasa entero", () => {
    const r = validarAbono({
      fichaId: "f-1", cuenta: "dano", monto: 25.5, fecha: "2026-08-20", origen: "Efectivo",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toMatchObject({ cuenta: "dano", monto: 25.5, origen: "Efectivo", notas: null });
  });

  it("sin monto, sin fecha o sin cuenta se dice qué falta, en palabras normales", () => {
    for (const body of [
      { fichaId: "f", cuenta: "prestamo", monto: 0, fecha: "2026-08-20", origen: "Efectivo" },
      { fichaId: "f", cuenta: "prestamo", monto: 10, fecha: "ayer", origen: "Efectivo" },
      { fichaId: "f", cuenta: "otra", monto: 10, fecha: "2026-08-20", origen: "Efectivo" },
      { cuenta: "prestamo", monto: 10, fecha: "2026-08-20", origen: "Efectivo" },
    ]) {
      const r = validarAbono(body);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).not.toMatch(/undefined|null|Error|prestamos_movimientos/);
        expect(r.error.length).toBeGreaterThan(10);
      }
    }
  });
});
