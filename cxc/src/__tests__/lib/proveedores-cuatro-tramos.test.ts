/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — CUATRO TRAMOS DE EDAD, Y NINGÚN NÚMERO CAMBIA
 *
 * 🩸 20-sep-2026. Proveedores condensaba los OCHO tramos de Switch en TRES y
 * todo lo de más de 120 días caía junto en «121D+». Medido ese día contra
 * producción, eso escondía que **$1.304.607,47 de Fashion Wear llevan MÁS DE UN
 * AÑO** —el 66 % de su deuda— mezclados con deuda de cuatro meses.
 *
 * Lo único que este candado deja pasar es un reparto que SUMA LO MISMO: los
 * cuatro tramos son sumas de los ocho de Switch y nada más.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import {
  BUCKETS_SWITCH,
  TRAMOS,
  TRAMOS_KEYS,
  tramoDelBucket,
  repartirEnTramos,
  sumarTramos,
  totalDeTramos,
  tramosCero,
  partirSaldo,
  sumarPartidos,
  partidoCero,
} from "@/lib/proveedores/tramos";

// Los ocho buckets de Fashion Wear, medidos contra producción el 20-sep-2026.
const FASHION_WEAR = [
  { title: "0-30", saldo: -34519.22 },
  { title: "31-60", saldo: -46678.29 },
  { title: "61-90", saldo: -127788.23 },
  { title: "91-120", saldo: -166039.56 },
  { title: "121-180", saldo: 340029.71 },
  { title: "181-270", saldo: -41646.12 },
  { title: "271-365", saldo: 750234.86 },
  { title: "Mas de 365", saldo: 1304607.47 },
];
const FASHION_WEAR_POR_PAGAR = 1978200.62;

describe("🔴 los cuatro tramos son los ocho de Switch, repartidos", () => {
  it("cada uno de los OCHO buckets cae en exactamente UN tramo", () => {
    const vistos = TRAMOS.flatMap((t) => t.buckets);
    expect([...vistos].sort()).toEqual([...BUCKETS_SWITCH].sort());
    expect(new Set(vistos).size).toBe(BUCKETS_SWITCH.length);
  });

  it("🔴 el reparto es el que dictó Daniel, bucket por bucket", () => {
    expect(tramoDelBucket("0-30")).toBe("t0_90");
    expect(tramoDelBucket("31-60")).toBe("t0_90");
    expect(tramoDelBucket("61-90")).toBe("t0_90");
    expect(tramoDelBucket("91-120")).toBe("t91_120");
    expect(tramoDelBucket("121-180")).toBe("t121_365");
    expect(tramoDelBucket("181-270")).toBe("t121_365");
    expect(tramoDelBucket("271-365")).toBe("t121_365");
    expect(tramoDelBucket("Mas de 365")).toBe("tMas365");
  });

  it("son CUATRO y se leen por su rango — nunca «vencido»", () => {
    expect(TRAMOS.map((t) => t.label)).toEqual(["0-90D", "91-120D", "121-365D", "+1 año"]);
    for (const t of TRAMOS) {
      expect(t.label.toLowerCase()).not.toContain("vencid");
      expect(t.label.toLowerCase()).not.toContain("por vencer");
    }
  });

  it("🔴 NINGÚN NÚMERO CAMBIA: los 4 tramos suman lo mismo que los 8 de Switch", () => {
    const ocho = FASHION_WEAR.reduce((s, b) => s + b.saldo, 0);
    const cuatro = totalDeTramos(repartirEnTramos(FASHION_WEAR));
    expect(cuatro).toBeCloseTo(ocho, 2);
    expect(cuatro).toBeCloseTo(FASHION_WEAR_POR_PAGAR, 2);
  });

  it("el reparto de Fashion Wear, número por número (medido el 20-sep-2026)", () => {
    const t = repartirEnTramos(FASHION_WEAR);
    expect(t.t0_90).toBeCloseTo(-208985.74, 2);
    expect(t.t91_120).toBeCloseTo(-166039.56, 2);
    expect(t.t121_365).toBeCloseTo(1048618.45, 2);
    expect(t.tMas365).toBeCloseTo(1304607.47, 2);
  });

  it("🩸 el tramo viejo deja de esconderse dentro del de cuatro meses", () => {
    const t = repartirEnTramos(FASHION_WEAR);
    // Lo que antes era UN «121D+» de $2.353.225,92 ahora son dos números.
    expect(t.t121_365 + t.tMas365).toBeCloseTo(2353225.92, 2);
    expect(t.tMas365).not.toBeCloseTo(t.t121_365 + t.tMas365, 2);
  });

  it("un bucket que Switch no manda hoy no pierde plata: cae en el más viejo", () => {
    const t = repartirEnTramos([{ title: "366-500", saldo: 100 }]);
    expect(totalDeTramos(t)).toBe(100);
    expect(t.tMas365).toBe(100);
  });

  it("sin aging, cuatro ceros — nunca un NaN", () => {
    expect(repartirEnTramos(null)).toEqual(tramosCero());
    expect(repartirEnTramos([])).toEqual(tramosCero());
    expect(totalDeTramos(repartirEnTramos(undefined))).toBe(0);
    expect(repartirEnTramos([{ title: "0-30", saldo: "1234.50" }]).t0_90).toBe(1234.5);
  });

  it("sumar tramos conserva el total", () => {
    const a = repartirEnTramos(FASHION_WEAR);
    const b = repartirEnTramos([{ title: "0-30", saldo: 10 }, { title: "Mas de 365", saldo: 5 }]);
    expect(totalDeTramos(sumarTramos(a, b))).toBeCloseTo(FASHION_WEAR_POR_PAGAR + 15, 2);
    for (const k of TRAMOS_KEYS) expect(typeof sumarTramos(a, b)[k]).toBe("number");
  });
});

describe("🔴 lo que está a favor se ve, y el neto no se mueve", () => {
  it("Fashion Wear: cinco tramos a favor, y el neto sigue siendo el mismo", () => {
    const p = partirSaldo(FASHION_WEAR);
    expect(p.a_favor).toBeCloseTo(34519.22 + 46678.29 + 127788.23 + 166039.56 + 41646.12, 2);
    expect(p.debes).toBeCloseTo(340029.71 + 750234.86 + 1304607.47, 2);
    expect(p.por_pagar).toBeCloseTo(FASHION_WEAR_POR_PAGAR, 2);
  });

  it("🔴 «Por pagar» SIEMPRE es «Le debes» menos «Tienes a favor»", () => {
    const p = partirSaldo(FASHION_WEAR);
    expect(p.por_pagar).toBeCloseTo(p.debes - p.a_favor, 2);
    const s = sumarPartidos(p, partirSaldo([{ title: "0-30", saldo: -100 }]));
    expect(s.por_pagar).toBeCloseTo(s.debes - s.a_favor, 2);
    expect(s.a_favor).toBeCloseTo(p.a_favor + 100, 2);
  });

  it("«a favor» viaja en POSITIVO: es un monto, no un signo", () => {
    const p = partirSaldo([{ title: "0-30", saldo: -250 }]);
    expect(p.a_favor).toBe(250);
    expect(p.debes).toBe(0);
    expect(p.por_pagar).toBe(-250);
  });

  it("sin nada a favor, la partición no inventa un bloque", () => {
    const p = partirSaldo([{ title: "0-30", saldo: 100 }]);
    expect(p.a_favor).toBe(0);
    expect(p.debes).toBe(100);
    expect(p.por_pagar).toBe(100);
    expect(partidoCero()).toEqual({ debes: 0, a_favor: 0, por_pagar: 0 });
  });

  it("CONTROL: el neto de la partición es el mismo que el de los tramos", () => {
    expect(partirSaldo(FASHION_WEAR).por_pagar).toBeCloseTo(
      totalDeTramos(repartirEnTramos(FASHION_WEAR)),
      2,
    );
  });
});
