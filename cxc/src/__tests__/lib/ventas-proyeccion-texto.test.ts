// La proyección de cierre tiene que explicarse sola, en castellano llano.
//
// El #296 movió el desglose a la fila transformada y perdió la línea que decía
// cómo salía el número. Volvió sin la jerga: nada de "Proyección = YTD /
// fracción", nada de "algoritmo estacional".

import { describe, it, expect } from "vitest";
import { SIN_COMPARATIVO } from "@/lib/variacion";
import { readFileSync } from "fs";
import path from "path";
import {
  explicacionProyeccion,
  buildSlotsProyeccion,
  diaCorto,
  type ProyeccionExplicable,
} from "@/lib/ventas/proyeccion-texto";

const estacional: ProyeccionExplicable = {
  ventas_ytd: 1_200_000,
  ventas_prev_ytd_sp: 1_000_000,
  cierre_anio_anterior: 1_900_000,
  proyeccion_cierre: 2_130_000,
  algoritmo: "estacional",
  frac_ytd_estacional: 0.563,
  factor_final: null,
  es_fallback_lineal: false,
};

const mixto: ProyeccionExplicable = {
  ...estacional,
  algoritmo: "mixto",
  frac_ytd_estacional: null,
  factor_final: 1.12,
};

const lineal: ProyeccionExplicable = {
  ...estacional,
  algoritmo: "fallback_lineal",
  frac_ytd_estacional: null,
  factor_final: null,
  es_fallback_lineal: true,
};

describe("diaCorto", () => {
  it("convierte la fecha de corte en algo legible", () => {
    expect(diaCorto("2026-07-26")).toBe("26 jul");
    expect(diaCorto("2026-01-05")).toBe("5 ene");
  });

  it("aguanta null y basura sin romper la frase", () => {
    expect(diaCorto(null)).toBe("");
    expect(diaCorto("no-es-fecha")).toBe("");
  });
});

describe("explicacionProyeccion", () => {
  it("estacional: dice cuánto llevaba el año pasado a esta misma altura", () => {
    const t = explicacionProyeccion(estacional, 2025, { fechaCorte: "2026-07-26" });
    expect(t).toBe("En 2025 al 26 jul llevabas el 56% del año. A ese ritmo cierras en $2.13M.");
  });

  it("mixto: dice qué tan arriba/abajo va contra el año pasado", () => {
    const t = explicacionProyeccion(mixto, 2025, { fechaCorte: "2026-02-10" });
    expect(t).toContain("Vas 12% arriba de 2025");
    expect(t).toContain("cierras en $2.13M");
  });

  it("mixto en baja lo dice sin eufemismos", () => {
    const t = explicacionProyeccion({ ...mixto, factor_final: 0.91 }, 2025);
    expect(t).toContain("Vas 9% abajo de 2025");
  });

  it("fallback: admite que no hay historia suficiente", () => {
    const t = explicacionProyeccion(lineal, 2025);
    expect(t).toContain("Sin historia suficiente de 2025");
  });

  it("la versión corta de celular entra en un renglón", () => {
    const t = explicacionProyeccion(estacional, 2025, { fechaCorte: "2026-07-26", corto: true });
    expect(t).toBe("En 2025 llevabas 56% del año");
    expect(t.length).toBeLessThanOrEqual(40);
  });

  it("sin fecha de corte la frase sigue siendo gramatical", () => {
    expect(explicacionProyeccion(estacional, 2025)).toBe(
      "En 2025 llevabas el 56% del año. A ese ritmo cierras en $2.13M.",
    );
  });

  it("cero jerga: ni fórmulas, ni 'YTD', ni nombres de algoritmo", () => {
    for (const p of [estacional, mixto, lineal]) {
      const t = explicacionProyeccion(p, 2025, { fechaCorte: "2026-07-26" });
      for (const jerga of ["YTD", "fracción", "Proyección =", "factor", "estacional", "lineal", "algoritmo"]) {
        expect(t).not.toContain(jerga);
      }
    }
  });
});

describe("buildSlotsProyeccion", () => {
  it("escritorio lleva los 3 números que sostienen la frase", () => {
    const s = buildSlotsProyeccion(estacional, 2025, { fechaCorte: "2026-07-26" });
    expect(s.map(x => x.key)).toEqual(["ytd", "cierre", "cierre-prev"]);
    expect(s[0].label).toBe("Vas al 26 jul");
    expect(s[0].valor).toBe("$1.20M");
    expect(s[0].delta).toBe("+20%");
    expect(s[1].valor).toBe("$2.13M");
    expect(s[1].destacado).toBe(true);
    expect(s[2].label).toBe("Cerró 2025");
  });

  it("no hay slot con el nombre del método: en 1440px truncaba la frase", () => {
    const s = buildSlotsProyeccion(estacional, 2025, { fechaCorte: "2026-07-26" });
    expect(s.some(x => x.key === "metodo")).toBe(false);
  });

  it("celular baja a 2 slots (en 356px no entran 4 con el nombre y la ×)", () => {
    const s = buildSlotsProyeccion(estacional, 2025, { fechaCorte: "2026-07-26", compacto: true });
    expect(s.map(x => x.key)).toEqual(["ytd", "cierre"]);
    expect(s[0].prev).toBeNull();
  });

  it("sin año previo no inventa un Δ: dice n/a", () => {
    const s = buildSlotsProyeccion({ ...estacional, ventas_prev_ytd_sp: 0 }, 2025);
    // "n/a" y no "—": hay valor actual (el YTD), lo que falta es contra qué
    // compararlo. Es la misma palabra que usa el heatmap de /ventas — una sola
    // forma en toda la app (ver src/lib/variacion.ts).
    expect(s[0].delta).toBe(SIN_COMPARATIVO);
    expect(s[0].prev).toBeNull();
  });

  it("una base de centavos tampoco produce un Δ", () => {
    // El caso del +363024750%: base ridícula, no cero.
    const s = buildSlotsProyeccion({ ...estacional, ventas_prev_ytd_sp: 0.01 }, 2025);
    expect(s[0].delta).toBe(SIN_COMPARATIVO);
  });
});

describe("el desglose viejo con jerga no volvió a la UI", () => {
  const dir = path.resolve(__dirname, "../../components/ventas");
  const resumen = readFileSync(path.join(dir, "ResumenView.tsx"), "utf8");
  const mobile = readFileSync(path.join(dir, "ResumenViewMobile.tsx"), "utf8");

  it("ResumenView ya no arma sus propios slots de proyección", () => {
    expect(resumen).not.toContain("function buildSlotsProyeccion");
    expect(resumen).not.toContain("Fracción");
    expect(resumen).not.toContain("Factor de crecimiento");
  });

  it("las dos vistas usan la MISMA explicación (un solo texto que mantener)", () => {
    expect(resumen).toContain("explicacionProyeccion");
    expect(mobile).toContain("explicacionProyeccion");
  });

  it("en celular la proyección ya se puede tocar (antes era un td mudo)", () => {
    expect(mobile).toContain('celdaKey("m", filaId, "proy")');
  });
});
