/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DEL TOPE: NADIE DEBE MÁS DE UN SUELDO MENSUAL — Y EL TOPE AVISA, NO FRENA.
 *
 * Daniel, 5-sep-2026. Lo que este archivo amarra, en orden de qué duele más si
 * se rompe:
 *
 *   1. 🔴 El tope mira la deuda **TOTAL** (préstamo + daño), no solo la de
 *      préstamos. Mirar solo una cuenta deja pasar exactamente el caso que el
 *      tope existe para señalar.
 *   2. 🔴 El **daño de mercancía NUNCA se frena**. No es plata que se entrega:
 *      es plata que ya se perdió, y no anotarla no la devuelve.
 *   3. Sin salario cargado el tope es **$500** — no «sin tope» ni «cero», que
 *      serían dos decisiones que nadie tomó.
 *   4. 🔴 Desde el 11-sep-2026 NO HAY APROBACIÓN (Daniel: *«Aprobar préstamos:
 *      eso también se quita»*): el aviso dice que SE REGISTRA IGUAL, y el
 *      Telegram a Daniel es para enterarse, no para decidir.
 *
 * ⚠️ CAMBIÓ DE DIRECCIÓN EL 11-SEP-2026, NO SE BORRÓ. Hasta ese día el punto 4
 * decía «lo pendiente caduca a los 7 días, por DÍA de Panamá», y había casos
 * para `DIAS_CADUCIDAD_PENDIENTE`, `pendienteCaducado`, `desdeCuandoEspera` y
 * el botón «Mandar aprobación». Todo eso se retiró con el estado pendiente
 * (medido antes: 0 préstamos esperando en producción).
 *
 * Módulo puro: fechas fijas, nunca `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import * as tope from "@/lib/prestamos-tope";
import {
  TOPE_SIN_SALARIO,
  evaluarTopePrestamo,
  textoAvisoTope,
  textoTelegramTope,
  topeDePrestamo,
} from "@/lib/prestamos-tope";

describe("el tope de cada persona", () => {
  it("es su salario mensual", () => {
    expect(topeDePrestamo(800)).toBe(800);
    expect(topeDePrestamo(523.47)).toBe(523.47);
  });

  it("🔴 sin salario cargado son $500 — ni «sin tope» ni cero", () => {
    expect(TOPE_SIN_SALARIO).toBe(500);
    expect(topeDePrestamo(null)).toBe(500);
    expect(topeDePrestamo(undefined)).toBe(500);
    expect(topeDePrestamo(0)).toBe(500);
  });

  it("se recalcula SIEMPRE con el sueldo del momento: no hay foto guardada", () => {
    // Si el sueldo sube, el tope sube en la misma llamada.
    expect(evaluarTopePrestamo({ deudaActual: 400, monto: 300, salarioMensual: 600 }).pasa).toBe(false);
    expect(evaluarTopePrestamo({ deudaActual: 400, monto: 300, salarioMensual: 800 }).pasa).toBe(true);
  });
});

describe("🔴 el tope mira la deuda TOTAL, no solo la de préstamos", () => {
  it("un daño de $200 encima de $400 de préstamo pasa el tope de $500", () => {
    // Con solo la cuenta de préstamo ($400 + $100 = $500) esto pasaría derecho.
    const e = evaluarTopePrestamo({ deudaActual: 600, monto: 100, salarioMensual: 500 });
    expect(e.pasa).toBe(false);
    expect(e.quedaria).toBe(700);
    expect(e.excedente).toBe(200);
  });

  it("justo en el tope PASA; un centavo más, no", () => {
    expect(evaluarTopePrestamo({ deudaActual: 700, monto: 100, salarioMensual: 800 }).pasa).toBe(true);
    expect(evaluarTopePrestamo({ deudaActual: 700, monto: 100.01, salarioMensual: 800 }).pasa).toBe(false);
  });

  it("⚠️ a quien YA pasa el tope no se le dice nada por lo que ya debe", () => {
    // ÁNGELA GARCÍA: $1.798,05 con sueldo $800. Su deuda de hoy no dispara nada
    // — el tope solo mira un préstamo NUEVO, y `monto: 0` no es un préstamo.
    const e = evaluarTopePrestamo({ deudaActual: 1798.05, monto: 0, salarioMensual: 800 });
    expect(e.pasa).toBe(false); // pasaría el tope SI pidiera algo…
    expect(e.monto).toBe(0);    // …y no está pidiendo nada.
  });

  it("los dos casos reales de hoy, medidos", () => {
    // ÁNGELA GARCÍA $1.798,05 con sueldo $800 · ANDRÉS GONZÁLEZ $900 con $850.
    expect(evaluarTopePrestamo({ deudaActual: 1798.05, monto: 50, salarioMensual: 800 }).pasa).toBe(false);
    expect(evaluarTopePrestamo({ deudaActual: 900, monto: 50, salarioMensual: 850 }).pasa).toBe(false);
    // Y alguien tranquilo sigue tranquilo: LUIS PARAJON debe $40 con $523,47.
    expect(evaluarTopePrestamo({ deudaActual: 40, monto: 100, salarioMensual: 523.47 }).pasa).toBe(true);
  });
});

describe("🔴 el aviso dice los números Y que se registra igual", () => {
  it("con sueldo cargado nombra el sueldo", () => {
    const e = evaluarTopePrestamo({ deudaActual: 400, monto: 300, salarioMensual: 600 });
    const t = textoAvisoTope(e);
    expect(t).toContain("pasa el tope");
    expect(t).toContain("$400.00");
    expect(t).toContain("$300.00");
    expect(t).toContain("$700.00");
    expect(t).toContain("su sueldo mensual ($600.00)");
    // 🔴 Lo que cambió el 11-sep-2026: no «necesita aprobación», sino que se
    // registra igual y se le avisa a Daniel.
    expect(t).toContain("Se registra igual");
    expect(t).not.toMatch(/necesita aprobación/i);
  });

  it("sin sueldo cargado DICE que falta, en vez de inventar un techo", () => {
    const e = evaluarTopePrestamo({ deudaActual: 400, monto: 300, salarioMensual: null });
    expect(textoAvisoTope(e)).toContain("no tiene sueldo cargado en Asistencia");
  });

  it("🔴 el Telegram trae los CINCO datos, quién lo registró, y no pide nada", () => {
    const t = textoTelegramTope({
      nombre: "ANGELA GARCIA",
      empresa: "Vistana International",
      evaluacion: evaluarTopePrestamo({ deudaActual: 1798.05, monto: 200, salarioMensual: 800 }),
      registradoPor: "Contabilidad",
    });
    expect(t).toContain("ANGELA GARCIA");             // quién
    expect(t).toContain("Pidió: $200.00");            // cuánto pidió
    expect(t).toContain("Ya debía: $1798.05");        // cuánto debía
    expect(t).toContain("Sueldo mensual: $800.00");   // su sueldo
    expect(t).toContain("Queda debiendo: $1998.05");  // cuánto queda
    expect(t).toContain("Lo registró Contabilidad");  // quién
    // 🔴 NO lleva el prefijo de sistema: un préstamo grande no es una avería.
    expect(t).not.toContain("SISTEMA");
    // 🔴 Y no hay nada que aprobar ni nada que caduque.
    expect(t).not.toMatch(/aprob|se elimina solo|días/i);
    expect(t).toContain("ya registrado");
  });
});

describe("🔴 lo que se retiró el 11-sep-2026 no vuelve", () => {
  it("ni caducidad, ni «desde cuándo espera», ni el botón de mandar aprobación", () => {
    const m = tope as Record<string, unknown>;
    for (const nombre of ["DIAS_CADUCIDAD_PENDIENTE", "pendienteCaducado", "desdeCuandoEspera", "BOTON_MANDAR_APROBACION"]) {
      expect(nombre in m, nombre).toBe(false);
    }
  });
});
