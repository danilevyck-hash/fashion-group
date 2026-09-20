/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL CUADRE DE PROVEEDORES: NADA SE PIERDE AL DAR VUELTA LA LISTA
 * (20-sep-2026)
 *
 * La pantalla pasó de ser los 31 proveedores del grupo a ser sus SIETE
 * empresas, y los tramos de edad pasaron de tres a cuatro. Las dos cosas
 * reparten lo mismo de otra forma, así que este archivo mide exactamente eso,
 * con los OCHO buckets REALES de Switch medidos contra producción ese día:
 *
 *   1. la suma de las siete empresas ES el total del pie ($4.829.819,40);
 *   2. los CUATRO tramos suman lo mismo que los OCHO de Switch, empresa por
 *      empresa y en el total;
 *   3. «Le debes − Tienes a favor» da el «Por pagar», en todos los niveles.
 *
 * Si alguna de las tres deja de valer, un número de la pantalla dejó de ser el
 * de Switch — y eso es lo único que esta pantalla no puede hacer.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { buildPorEmpresa, type FilaCxp } from "@/lib/proveedores/por-empresa";
import { BUCKETS_SWITCH, totalDeTramos } from "@/lib/proveedores/tramos";

// Los ocho buckets de cada empresa, sumados en producción el 20-sep-2026
// (`switch_proveedor_estadocuenta`, 67 filas). En el orden de BUCKETS_SWITCH.
const MEDIDO: Record<string, number[]> = {
  fashion_wear: [-34519.22, -46678.29, -127788.23, -166039.56, 340029.71, -41646.12, 750234.86, 1304607.47],
  fashion_shoes: [175900.77, 90448.68, 178707.45, 182274.69, 276219.78, 406185.56, 36685.84, 0],
  vistana: [133930.02, 214569.72, 25337.91, 135267.08, 336572.24, 79175.65, 0, 0],
  active_shoes: [101811.06, 58349.76, 46829.47, 126709.42, 0, 0, 0, 10352.71],
  american_classic: [33959.02, 42578.51, 19066.11, 19252.75, 41965.41, -13041.16, -615.84, -1233.76],
  active_wear: [3379.17, 6471.62, 0, 43371.23, 0, 0, 0, 19948.72],
  joystep: [0, 1144.9, 0, 0, 0, -30000, -41281.84, 91326.13],
};

// El «Por pagar» de cada empresa, medido el MISMO día contra `saldo_total`.
// Es la tabla que Daniel tiene en la mano.
const POR_PAGAR: Record<string, number> = {
  fashion_wear: 1978200.62,
  fashion_shoes: 1346422.77,
  vistana: 924852.62,
  active_shoes: 344052.42,
  american_classic: 141931.04,
  active_wear: 73170.74,
  joystep: 21189.19,
};
const TOTAL = 4829819.4;

// Una fila por empresa con sus ocho buckets: alcanza para medir el cuadre, que
// es de plata y no de identidad (esa tiene su propio candado).
const FILAS: FilaCxp[] = Object.entries(MEDIDO).map(([empresa_key, saldos], i) => ({
  empresa_key,
  proveedor_switch_id: i + 1,
  nombre: `PROVEEDOR DE ${empresa_key.toUpperCase()}`,
  saldo_total: saldos.reduce((s, n) => s + n, 0),
  aging: BUCKETS_SWITCH.map((title, j) => ({ title, saldo: saldos[j] })),
  ultimo_pago_fecha: null,
  ultimo_pago_dias: null,
  synced_at: "2026-09-20T09:32:03.668+00:00",
}));

const cartera = buildPorEmpresa(FILAS, []);
const de = (k: string) => cartera.empresas.find((e) => e.empresa_key === k)!;

describe("🔴 el «Por pagar» de cada empresa es el de Switch", () => {
  for (const [key, esperado] of Object.entries(POR_PAGAR)) {
    it(`${key}: $${esperado.toLocaleString("en-US")}`, () => {
      expect(de(key).saldo.por_pagar).toBeCloseTo(esperado, 2);
    });
  }

  it("⚠️ Boston NO está: tiene 0 filas y está excluida a propósito", () => {
    expect(cartera.empresas.map((e) => e.empresa_key)).not.toContain("confecciones_boston");
    expect(cartera.empresas).toHaveLength(7);
  });

  it("las empresas se leen de la más grande a la más chica", () => {
    expect(cartera.empresas.map((e) => e.empresa_key)).toEqual([
      "fashion_wear", "fashion_shoes", "vistana", "active_shoes",
      "american_classic", "active_wear", "joystep",
    ]);
  });
});

describe("🔴 LA SUMA DE LAS SIETE EMPRESAS DA EL TOTAL DEL PIE", () => {
  it("$4.829.819,40, y no un número leído aparte", () => {
    const suma = cartera.empresas.reduce((s, e) => s + e.saldo.por_pagar, 0);
    expect(suma).toBeCloseTo(TOTAL, 2);
    expect(cartera.total.saldo.por_pagar).toBeCloseTo(TOTAL, 2);
    expect(cartera.total.saldo.por_pagar).toBeCloseTo(suma, 2);
  });

  it("y es también la suma de los `saldo_total` que manda Switch", () => {
    expect(FILAS.reduce((s, f) => s + f.saldo_total, 0)).toBeCloseTo(TOTAL, 2);
  });

  it("los tramos del pie son la suma de los tramos de las empresas", () => {
    for (const k of ["t0_90", "t91_120", "t121_365", "tMas365"] as const) {
      const suma = cartera.empresas.reduce((s, e) => s + e.tramos[k], 0);
      expect(cartera.total.tramos[k]).toBeCloseTo(suma, 2);
    }
  });
});

describe("🔴 LOS CUATRO TRAMOS SUMAN LO MISMO QUE LOS OCHO DE SWITCH", () => {
  for (const [key, saldos] of Object.entries(MEDIDO)) {
    it(`${key}: los 4 = los 8 = su «Por pagar»`, () => {
      const ocho = saldos.reduce((s, n) => s + n, 0);
      expect(totalDeTramos(de(key).tramos)).toBeCloseTo(ocho, 2);
      expect(totalDeTramos(de(key).tramos)).toBeCloseTo(POR_PAGAR[key], 2);
    });
  }

  it("y en el total del grupo, igual", () => {
    const ocho = Object.values(MEDIDO).flat().reduce((s, n) => s + n, 0);
    expect(totalDeTramos(cartera.total.tramos)).toBeCloseTo(ocho, 2);
    expect(totalDeTramos(cartera.total.tramos)).toBeCloseTo(TOTAL, 2);
  });

  it("🩸 el tramo de más de un año deja de esconderse: $1.304.607,47 de Fashion Wear", () => {
    const fw = de("fashion_wear");
    expect(fw.tramos.tMas365).toBeCloseTo(1304607.47, 2);
    // Era el 66 % de su deuda, mezclado con la de cuatro meses dentro de «121D+».
    expect(fw.tramos.tMas365 / fw.saldo.por_pagar).toBeGreaterThan(0.65);
    expect(fw.tramos.t121_365).toBeCloseTo(1048618.45, 2);
  });
});

describe("🔴 «Le debes» menos «Tienes a favor» da el «Por pagar»", () => {
  it("empresa por empresa", () => {
    for (const e of cartera.empresas) {
      expect(e.saldo.debes - e.saldo.a_favor).toBeCloseTo(e.saldo.por_pagar, 2);
    }
  });

  it("y en el total del grupo", () => {
    const { debes, a_favor, por_pagar } = cartera.total.saldo;
    expect(debes - a_favor).toBeCloseTo(por_pagar, 2);
    expect(por_pagar).toBeCloseTo(TOTAL, 2);
  });

  it("🩸 Fashion Wear tiene crédito en CINCO de los ocho tramos, y se ve", () => {
    const negativos = MEDIDO.fashion_wear.filter((n) => n < 0);
    expect(negativos).toHaveLength(5);
    expect(de("fashion_wear").saldo.a_favor).toBeCloseTo(-negativos.reduce((s, n) => s + n, 0), 2);
    // Antes ese crédito se compensaba adentro del neto y desaparecía.
    expect(de("fashion_wear").saldo.a_favor).toBeGreaterThan(400000);
  });
});
