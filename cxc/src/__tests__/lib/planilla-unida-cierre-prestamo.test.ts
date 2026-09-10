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
  repartirEntreCuentas,
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

const deuda = (o: Partial<DeudaDePersona> & { codigo: string }): DeudaDePersona => ({
  fichaId: `f-${o.codigo}`, nombrePrestamos: "X",
  saldoPrestamo: 500, saldoDano: 0, cuotaPrestamo: 50, cuotaDano: 0,
  yaDescontado: 0, cuentaMasVieja: "prestamo", ...o,
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
describe("D. CÓMO SE PARTE LA CASILLA ENTRE LAS DOS CUENTAS", () => {
  // 🔴 La planilla propone la SUMA de las dos cuotas en UNA casilla (Daniel:
  // *«juntos»*), así que al escribir hay que volver a partirla.
  it("con la casilla igual a la propuesta, cada cuenta recibe SU cuota", () => {
    const r = repartirEntreCuentas(40, {
      saldoPrestamo: 1000, saldoDano: 100, cuotaPrestamo: 30, cuotaDano: 10, cuentaMasVieja: "prestamo",
    });
    expect(r).toEqual({ prestamo: 30, dano: 10, sobrante: 0 });
  });

  it("y eso genera DOS movimientos, uno por cuenta", () => {
    const plan = planDeCierre({
      lineas: [linea("8", "BRICEIDA", 40)],
      deudas: mapa(deuda({ codigo: "8", saldoPrestamo: 1000, saldoDano: 100, cuotaPrestamo: 30, cuotaDano: 10 })),
      fecha: "2026-08-15",
    });
    expect(plan.pagos.map((p) => [p.cuenta, p.monto])).toEqual([["prestamo", 30], ["dano", 10]]);
    expect(plan.total).toBe(40);
  });

  // 🔑 Cada cuenta se capea a SU saldo. Capear la suma contra el total dejaría
  // cobrar de más en una cuenta lo que sobra en la otra.
  it("cada cuenta se capea a su propio saldo", () => {
    const r = repartirEntreCuentas(35, {
      saldoPrestamo: 20, saldoDano: 100, cuotaPrestamo: 30, cuotaDano: 10, cuentaMasVieja: "prestamo",
    });
    expect(r.prestamo).toBe(20);
  });

  // Corregida a mano → la cuenta MÁS VIEJA primero, que es la regla que el
  // módulo ya usa cuando alguien debe las dos.
  it("corregida a mano, va a la cuenta más vieja primero", () => {
    const r = repartirEntreCuentas(25, {
      saldoPrestamo: 1000, saldoDano: 100, cuotaPrestamo: 30, cuotaDano: 10, cuentaMasVieja: "prestamo",
    });
    expect(r).toEqual({ prestamo: 25, dano: 0, sobrante: 0 });
  });

  it("si la más vieja es el daño, ahí va primero", () => {
    const r = repartirEntreCuentas(25, {
      saldoPrestamo: 1000, saldoDano: 100, cuotaPrestamo: 30, cuotaDano: 10, cuentaMasVieja: "dano",
    });
    expect(r).toEqual({ prestamo: 0, dano: 25, sobrante: 0 });
  });

  // ⚠️ Lo que sobra después de capear las DOS cuentas NO se escribe: pagar más
  // de lo que se debe dejaría un saldo a favor que nadie pidió.
  it("lo que pasa de las dos deudas no se escribe, se devuelve como sobrante", () => {
    const r = repartirEntreCuentas(500, {
      saldoPrestamo: 100, saldoDano: 50, cuotaPrestamo: 999, cuotaDano: 999, cuentaMasVieja: "prestamo",
    });
    expect(r.prestamo + r.dano).toBe(150);
    expect(r.sobrante).toBe(350);
  });

  it("una casilla en cero no reparte nada", () => {
    expect(repartirEntreCuentas(0, {
      saldoPrestamo: 100, saldoDano: 100, cuotaPrestamo: 10, cuotaDano: 10, cuentaMasVieja: "prestamo",
    })).toEqual({ prestamo: 0, dano: 0, sobrante: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
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
