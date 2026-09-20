// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA TIRA DE TOTALES DICE PLATA, NO CONTEOS (20-sep-2026, pedido de Daniel).
//
// 🩸 QUÉ DECÍA. Debajo de los tres montos de la tira salía **12 · 32 · 76**.
// Parecen las tres partes de los **100 clientes** de la cartera y no lo son:
// **suman 120**, porque **27 clientes están contados dos veces** —uno puede
// tener plata en los tres tramos a la vez— y **7 no están en ninguno**. Tres
// números pegados a los montos, que invitaban a una suma que nunca cuadra.
//
// LA CUENTA, con la definición que tenía cada chip:
//   · 0-90d   = los que NO tienen nada en 91-120 ni en 121+   → 12
//   · 91-120d = los que tienen ALGO en 91-120                  → 32
//   · 121d+   = los que tienen ALGO en 121+                    → 76
// El primero es excluyente y los otros dos no: por eso se solapan.
//
// ⚠️ QUEDA «Total · N», que sí es el número de clientes de la lista y no es una
// parte de nada.
//
// ⚠️ Y NI UN MONTO SE MOVIÓ: los tramos siguen siendo 0-90 / 91-120 / 121+, cada
// chip sigue filtrando y el aviso «sin pagar hace +90 d» sigue con su cuenta,
// que es otra cosa (dice a cuántos hay que ir a buscar, no una parte de un
// total).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const plano = (rel: string) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

const TIRA = "src/app/cxc/components/TiraTotales.tsx";
const CELULAR = "src/app/cxc/components/PanelCxcMobile.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// 1 · La cuenta que motivó el cambio, reproducida
// ─────────────────────────────────────────────────────────────────────────────

describe("🩸 1 · por qué los tres conteos no eran las tres partes de nada", () => {
  // Cuatro clientes que reproducen el solapamiento medido en producción.
  const CARTERA = [
    { current: 100, watch: 0, overdue: 0 },    // solo 0-90     → cuenta en 1
    { current: 50, watch: 20, overdue: 10 },   // en los TRES   → cuenta en 2
    { current: 0, watch: 30, overdue: 40 },    // en dos        → cuenta en 2
    { current: 0, watch: 0, overdue: 0, total: -5 }, // saldo a favor → en NINGUNO
  ];

  const n = {
    current: CARTERA.filter((c) => c.overdue === 0 && c.watch === 0).length,
    watch: CARTERA.filter((c) => c.watch > 0).length,
    overdue: CARTERA.filter((c) => c.overdue > 0).length,
  };

  it("los tres conteos suman MÁS que los clientes: se solapan", () => {
    expect(n.current + n.watch + n.overdue).toBeGreaterThan(CARTERA.length);
  });

  it("el primero es excluyente y los otros dos no — por eso no son partes", () => {
    expect(n.current).toBe(2); // el de solo 0-90 y el de saldo a favor
    expect(n.watch).toBe(2);
    expect(n.overdue).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · La tira del escritorio
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 2 · la tira de la computadora solo dice plata", () => {
  const src = plano(TIRA);

  it("🩸 ya no se cuentan los clientes de cada tramo", () => {
    for (const cuenta of [
      "roleClients.filter((c) => c.overdue === 0 && c.watch === 0).length",
      "roleClients.filter((c) => c.watch > 0).length",
      "roleClients.filter((c) => c.overdue > 0).length",
    ]) {
      expect(src, `volvió el conteo «${cuenta}»`).not.toContain(cuenta);
    }
    expect(src, "volvió el conteo por tramo").not.toContain("valores[k].n");
  });

  it("el chip dibuja el rango y el monto, y nada más", () => {
    expect(src).toContain("AGING[k].colLabel");
    expect(src).toContain("${fmt(valores[k])}");
  });

  it("…y tampoco se cuelan en el texto que sale al pasar el dedo", () => {
    expect(src, "el conteo volvió por el título").not.toMatch(/valores\[k\][\s\S]{0,40}clientes/);
  });

  it("⚠️ «Total · N» se queda: ése SÍ es el número de clientes", () => {
    expect(src).toContain("Total · {roleClients.length}");
  });

  it("⚠️ y los tres montos no se movieron", () => {
    expect(src).toContain("s + c.current");
    expect(src).toContain("s + c.watch");
    expect(src).toContain("s + c.overdue");
    // Cada chip sigue filtrando con su clave.
    expect(src).toContain("onRiskFilterChange(k)");
  });

  it("⚠️ el aviso «sin pagar hace +90 d» conserva SU cuenta: es otra cosa", () => {
    expect(src).toContain("rotuloSinPagar(sinPagar.cuantos)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Los mismos chips en el celular
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 3 · los chips del celular tampoco cuentan", () => {
  const src = plano(CELULAR);

  it("🩸 se fueron los tres contadores…", () => {
    for (const v of ["cCount", "wCount", "oCount"]) {
      expect(src, `volvió «${v}» al celular`).not.toContain(v);
    }
    expect(src).not.toContain("counts");
  });

  it("…que además contaban con OTRA regla que la computadora", () => {
    // Eran excluyentes (`else if`), o sea una segunda definición del mismo chip
    // en el mismo módulo. Esa divergencia es la que este candado impide volver.
    expect(src).not.toContain("else if (c.watch > 0)");
  });

  it("⚠️ el chip sigue mostrando su rango, su monto y sigue filtrando", () => {
    expect(src).toContain("formatCompactCurrency(value)");
    expect(src).toContain("AGING[key].colLabel");
    expect(src).toContain("onChange(key)");
  });

  it("⚠️ y la tarjeta negra conserva el Total pendiente", () => {
    expect(src).toContain("Total pendiente");
    expect(src).toContain("formatCompactCurrency(total)");
  });
});
