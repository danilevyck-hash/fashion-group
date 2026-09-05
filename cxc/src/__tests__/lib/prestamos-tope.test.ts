/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DEL TOPE: NADIE DEBE MÁS DE UN SUELDO MENSUAL.
 *
 * Daniel, 5-sep-2026. Lo que este archivo amarra, en orden de qué duele más si
 * se rompe:
 *
 *   1. 🔴 El tope mira la deuda **TOTAL** (préstamo + daño), no solo la de
 *      préstamos. Mirar solo una cuenta deja pasar exactamente el caso que el
 *      tope existe para frenar.
 *   2. 🔴 El **daño de mercancía NUNCA se frena**. No es plata que se entrega:
 *      es plata que ya se perdió, y no anotarla no la devuelve.
 *   3. Sin salario cargado el tope es **$500** — no «sin tope» ni «cero», que
 *      serían dos decisiones que nadie tomó.
 *   4. Lo pendiente **caduca a los 7 días**, por DÍA de Panamá.
 *
 * Módulo puro: fechas fijas, nunca `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import {
  BOTON_MANDAR_APROBACION,
  DIAS_CADUCIDAD_PENDIENTE,
  TOPE_SIN_SALARIO,
  desdeCuandoEspera,
  evaluarTopePrestamo,
  pendienteCaducado,
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

  it("⚠️ a quien YA pasa el tope no se le pide nada por lo que ya debe", () => {
    // ÁNGELA GARCÍA: $1.798,05 con sueldo $800. Su deuda de hoy no dispara nada
    // — el tope solo mira un préstamo NUEVO, y `monto: 0` no es un préstamo.
    const e = evaluarTopePrestamo({ deudaActual: 1798.05, monto: 0, salarioMensual: 800 });
    expect(e.pasa).toBe(false); // pediría aprobación SI pidiera algo…
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

describe("el aviso dice los números, no solo «necesita aprobación»", () => {
  it("con sueldo cargado nombra el sueldo", () => {
    const e = evaluarTopePrestamo({ deudaActual: 400, monto: 300, salarioMensual: 600 });
    const t = textoAvisoTope(e);
    expect(t).toContain("Este préstamo necesita aprobación de Daniel");
    expect(t).toContain("$400.00");
    expect(t).toContain("$300.00");
    expect(t).toContain("$700.00");
    expect(t).toContain("su sueldo mensual ($600.00)");
  });

  it("sin sueldo cargado DICE que falta, en vez de inventar un techo", () => {
    const e = evaluarTopePrestamo({ deudaActual: 400, monto: 300, salarioMensual: null });
    expect(textoAvisoTope(e)).toContain("no tiene sueldo cargado en Asistencia");
  });

  it("el botón lo dice antes de tocarlo", () => {
    expect(BOTON_MANDAR_APROBACION).toBe("Mandar aprobación");
  });

  it("🔴 el Telegram trae los CINCO datos con los que se decide sin abrir la app", () => {
    const t = textoTelegramTope({
      nombre: "ANGELA GARCIA",
      empresa: "Vistana International",
      evaluacion: evaluarTopePrestamo({ deudaActual: 1798.05, monto: 200, salarioMensual: 800 }),
    });
    expect(t).toContain("ANGELA GARCIA");            // quién
    expect(t).toContain("Pide: $200.00");            // cuánto pide
    expect(t).toContain("Ya debe: $1798.05");        // cuánto debe
    expect(t).toContain("Sueldo mensual: $800.00");  // su sueldo
    expect(t).toContain("Quedaría debiendo: $1998.05"); // cuánto quedaría
    // 🔴 NO lleva el prefijo de sistema: un préstamo que espera no es una avería.
    expect(t).not.toContain("SISTEMA");
    expect(t).toContain(`${DIAS_CADUCIDAD_PENDIENTE} días`);
  });
});

describe("🔴 lo pendiente caduca a los 7 días, por DÍA de Panamá", () => {
  it("son 7, y ni uno menos", () => {
    expect(DIAS_CADUCIDAD_PENDIENTE).toBe(7);
    expect(pendienteCaducado("2026-09-01", "2026-09-07")).toBe(false); // día 6
    expect(pendienteCaducado("2026-09-01", "2026-09-08")).toBe(true);  // día 7
    expect(pendienteCaducado("2026-09-01", "2026-09-20")).toBe(true);
  });

  it("cruza meses y años sin trucos", () => {
    expect(pendienteCaducado("2026-12-28", "2027-01-04")).toBe(true);
    expect(pendienteCaducado("2026-12-28", "2027-01-03")).toBe(false);
    expect(pendienteCaducado("2028-02-25", "2028-03-03")).toBe(true); // año bisiesto
  });

  it("una fecha que no es fecha NO caduca nada — en la duda, no se borra plata", () => {
    expect(pendienteCaducado("", "2026-09-20")).toBe(false);
    expect(pendienteCaducado("ayer", "2026-09-20")).toBe(false);
  });

  it("«desde cuándo espera» se lee en español neutro", () => {
    expect(desdeCuandoEspera("2026-09-05", "2026-09-05")).toBe("hoy");
    expect(desdeCuandoEspera("2026-09-04", "2026-09-05")).toBe("desde ayer");
    expect(desdeCuandoEspera("2026-09-01", "2026-09-05")).toBe("hace 4 días");
  });
});
