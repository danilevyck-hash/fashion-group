// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — PRÉSTAMOS ESTILO APPLE (4-oct-2026)
//
// 1. PRENDIDO el 9-oct-2026 con el «sí» de Daniel.
// 2. «Próximo descuento» es la suma de lo que proponen las funciones de la
//    planilla (cada cuota capeada a SU saldo), no una cuenta nueva.
// 3. Ningún número se mueve: ni una ruta ni el motor importan el interruptor.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  PRESTAMOS_APPLE_2026_10,
  conAtencionArriba,
  proximoDescuento,
  totalProximoDescuento,
} from "@/lib/prestamos-apple-2026-10";

const base = { saldoPrestamo: 0, saldoDano: 0, saldoTerceros: 0, cuota: 0, cuotaDano: 0, cuotaTerceros: 0 };

describe("préstamos estilo Apple", () => {
  it("está PRENDIDO (9-oct-2026, Daniel)", () => {
    expect(PRESTAMOS_APPLE_2026_10).toBe(true);
  });

  it("próximo descuento: las tres cuotas, cada una capeada a su saldo", () => {
    expect(proximoDescuento({ ...base, saldoPrestamo: 220, cuota: 30, saldoDano: 50, cuotaDano: 10 })).toBe(40);
    // última cuota: no se descuenta más de lo que debe
    expect(proximoDescuento({ ...base, saldoPrestamo: 12.5, cuota: 30 })).toBe(12.5);
    // sin cuota no propone nada; sin saldo tampoco
    expect(proximoDescuento({ ...base, saldoPrestamo: 300 })).toBe(0);
    expect(proximoDescuento({ ...base, cuota: 30 })).toBe(0);
    // terceros cuenta, y un saldo a favor no resta
    expect(proximoDescuento({ ...base, saldoTerceros: 100, cuotaTerceros: 25, saldoPrestamo: -20, cuota: 30 })).toBe(25);
    expect(
      totalProximoDescuento([
        { ...base, saldoPrestamo: 220, cuota: 30 },
        { ...base, saldoDano: 5, cuotaDano: 10 },
      ]),
    ).toBe(35);
  });

  it("lo que requiere atención arriba: sin colaborador primero, después el saldo mayor", () => {
    const orden = conAtencionArriba([
      { codigo: "1", saldo: 100, nombre: "Ana" },
      { codigo: null, saldo: 10, nombre: "Sin Atar" },
      { codigo: "2", saldo: 300, nombre: "Beto" },
      { codigo: "3", saldo: 100, nombre: "Aaron" },
    ]).map((f) => f.nombre);
    expect(orden).toEqual(["Sin Atar", "Beto", "Aaron", "Ana"]);
  });

  it("ni una ruta ni el motor importan el interruptor", () => {
    const src = join(__dirname, "..");
    const malos: string[] = [];
    const barrer = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) barrer(p);
        else if (/\.tsx?$/.test(n) && readFileSync(p, "utf8").includes("prestamos-apple-2026-10")) malos.push(p);
      }
    };
    barrer(join(src, "app/api"));
    barrer(join(src, "lib/asistencia"));
    expect(malos).toEqual([]);
  });
});
