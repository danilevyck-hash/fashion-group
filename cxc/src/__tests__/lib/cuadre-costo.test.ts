/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL CUADRE DE COSTO (3-sep-2026)
 *
 * `switch_costo_diario` tiene un lector: por (empresa, mes cerrado) se compara
 * contra la fuente del Resumen y, si difieren más de 2 % (y más de $100),
 * suena 🔧 SISTEMA. Este archivo revisa la DECISIÓN pura y el TEXTO.
 *
 * Los números son los medidos en producción el 3-sep-2026.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import {
  DIAS_ENTRE_AVISOS,
  MESES_CERRADOS_A_MIRAR,
  MIN_DIAS_COMPARADOS,
  PISO_DIFERENCIA_USD,
  PRIMER_MES_CON_COSTO_DIARIO,
  UMBRAL_CUADRE,
  evaluarCuadre,
  mensajeCuadre,
  nombreDeMes,
  tipoDeCuadre,
  ventanaMesesCerrados,
  type FilaCuadre,
} from "@/lib/alertas/cuadre-costo";

const fila = (over: Partial<FilaCuadre> = {}): FilaCuadre => ({
  empresa_key: "active_wear",
  mes: "2026-08-01",
  dias_comparados: 30,
  dias_sin_fila: 0,
  dias_foto_parcial: 0,
  costo_diario: "5558.17",
  costo_resumen: "5558.17",
  ...over,
});

describe("evaluarCuadre — dispara con >2 % y calla con <2 %", () => {
  it("Active Wear agosto 2026 SIN el arreglo: −44.483,03 contra 5.558,17 → dispara", () => {
    const d = evaluarCuadre(fila({ costo_resumen: "-44483.03" }));
    expect(d).not.toBeNull();
    expect(d!.diferencia).toBeCloseTo(-50041.2, 2);
    expect(d!.pct).toBeGreaterThan(UMBRAL_CUADRE);
  });

  it("Active Wear agosto 2026 CON el arreglo: 5.558,17 contra 5.558,17 → calla", () => {
    expect(evaluarCuadre(fila())).toBeNull();
  });

  it("los 32 pares medidos (may–ago 2026, 8 empresas) callan: la peor es Boston agosto, 0,75 %", () => {
    expect(evaluarCuadre(fila({ empresa_key: "confecciones_boston", costo_diario: "21414.59", costo_resumen: "21254.56" }))).toBeNull();
    expect(evaluarCuadre(fila({ empresa_key: "fashion_wear", mes: "2026-05-01", costo_diario: "449268.45", costo_resumen: "449268.54" }))).toBeNull();
    expect(evaluarCuadre(fila({ empresa_key: "joystep", mes: "2026-06-01", costo_diario: "29.43", costo_resumen: "29.43" }))).toBeNull();
  });

  it("justo en el umbral no dispara; un centavo más allá del umbral Y del piso, sí", () => {
    // 2,00 % exacto sobre $10.000 = $200 → calla (es «más de 2 %»).
    expect(evaluarCuadre(fila({ costo_diario: "10000", costo_resumen: "10200" }))).toBeNull();
    // 2,01 % → dispara.
    expect(evaluarCuadre(fila({ costo_diario: "10000", costo_resumen: "10200.01" }))).not.toBeNull();
    // de menos también cuenta
    expect(evaluarCuadre(fila({ costo_diario: "10000", costo_resumen: "9799.99" }))).not.toBeNull();
  });

  it("el piso de $100: joystep junio ($29,43) con $1 de diferencia es 3,4 % y NO avisa", () => {
    expect(evaluarCuadre(fila({ empresa_key: "joystep", mes: "2026-06-01", costo_diario: "29.43", costo_resumen: "30.43" }))).toBeNull();
    expect(PISO_DIFERENCIA_USD).toBe(100);
    // y con $100 justos sobre una base chica sí (>2 % y ≥ $100)
    expect(evaluarCuadre(fila({ costo_diario: "1000", costo_resumen: "1100" }))).not.toBeNull();
  });

  it("un mes con menos de MIN_DIAS_COMPARADOS días buenos se calla, por grande que sea la diferencia", () => {
    expect(evaluarCuadre(fila({ dias_comparados: MIN_DIAS_COMPARADOS - 1, costo_resumen: "-44483.03" }))).toBeNull();
    expect(evaluarCuadre(fila({ dias_comparados: MIN_DIAS_COMPARADOS, costo_resumen: "-44483.03" }))).not.toBeNull();
  });

  it("costo diario en cero: calla si el Resumen también da cero; dispara si el Resumen tiene plata", () => {
    expect(evaluarCuadre(fila({ costo_diario: "0", costo_resumen: "0" }))).toBeNull();
    const d = evaluarCuadre(fila({ costo_diario: "0", costo_resumen: "500" }));
    expect(d).not.toBeNull();
    expect(d!.pct).toBe(Infinity);
  });

  it("los días excluidos viajan en el hallazgo para que el mensaje los diga", () => {
    const d = evaluarCuadre(fila({ dias_comparados: 28, dias_sin_fila: 1, dias_foto_parcial: 1, costo_resumen: "-44483.03" }));
    expect(d!.diasSinFila).toBe(1);
    expect(d!.diasFotoParcial).toBe(1);
    expect(d!.diasComparados).toBe(28);
  });
});

describe("ventanaMesesCerrados — solo meses CERRADOS, y no antes de que exista la tabla", () => {
  it("el 3-sep-2026 mira jun, jul y ago: [2026-06-01, 2026-09-01)", () => {
    expect(ventanaMesesCerrados("2026-09-03")).toEqual({ desde: "2026-06-01", hasta: "2026-09-01" });
    expect(MESES_CERRADOS_A_MIRAR).toBe(3);
  });

  it("el mes en curso NUNCA entra (hasta es exclusivo y es el 1 del mes en curso)", () => {
    expect(ventanaMesesCerrados("2026-09-30").hasta).toBe("2026-09-01");
    expect(ventanaMesesCerrados("2026-09-01").hasta).toBe("2026-09-01");
  });

  it("cruza el año hacia atrás sin usar Date: el 15-ene-2027 mira oct, nov y dic de 2026", () => {
    expect(ventanaMesesCerrados("2027-01-15")).toEqual({ desde: "2026-10-01", hasta: "2027-01-01" });
    expect(ventanaMesesCerrados("2027-02-10")).toEqual({ desde: "2026-11-01", hasta: "2027-02-01" });
  });

  it("no retrocede antes de mayo 2026, cuando switch_costo_diario empezó a escribirse", () => {
    expect(PRIMER_MES_CON_COSTO_DIARIO).toBe("2026-05-01");
    expect(ventanaMesesCerrados("2026-06-03")).toEqual({ desde: "2026-05-01", hasta: "2026-06-01" });
    expect(ventanaMesesCerrados("2026-05-03")).toEqual({ desde: "2026-05-01", hasta: "2026-05-01" });
  });
});

describe("el mensaje y el anti-loop", () => {
  const descuadre = evaluarCuadre(fila({ dias_comparados: 28, dias_sin_fila: 1, dias_foto_parcial: 1, costo_resumen: "-44483.03" }))!;

  it("dice empresa, mes, cuánto, qué significa y qué hacer — sin nombres de tabla", () => {
    const m = mensajeCuadre([descuadre]);
    expect(m).toContain("Active Wear");
    expect(m).toContain("agosto 2026");
    expect(m).toContain("$50,041.20 de menos");
    expect(m).toContain("28 días comparables");
    expect(m).toContain("1 sin dato diario");
    expect(m).toContain("1 con foto parcial");
    expect(m).toContain("Qué significa:");
    expect(m).toContain("Qué hacer:");
    expect(m).toContain("una vez por semana");
    expect(m).not.toMatch(/switch_costo_diario|switch_articulo_diario|switch_factura_utilidad|_vw|_v2|rpc/i);
  });

  it("varios meses van en UN mensaje, con el conteo en la primera línea", () => {
    const otro = evaluarCuadre(fila({ empresa_key: "vistana", mes: "2026-07-01", costo_diario: "100000", costo_resumen: "110000" }))!;
    const m = mensajeCuadre([descuadre, otro]);
    expect(m.split("\n")[0]).toBe("El costo de 2 meses no cuadra entre las dos fuentes de Switch.");
    expect(m).toContain("Vistana International, julio 2026");
    expect(m).toContain("$10,000.00 de más (10,0 %)");
  });

  it("🔴 tuteo neutro, sin voseo (candado `nada-de-voseo`, aplicado también al texto del aviso)", () => {
    const m = mensajeCuadre([descuadre]);
    expect(m).not.toMatch(/\b(vos|mirá|revisá|avisame|fijate|acá|tenés|podés)\b/iu);
  });

  it("la clave del anti-loop es (empresa, mes) y el ritmo es el de los demás avisos: 7 días", () => {
    expect(tipoDeCuadre("active_wear", "2026-08-01")).toBe("cuadre_costo:active_wear:2026-08-01");
    expect(tipoDeCuadre("vistana", "2026-08-01")).not.toBe(tipoDeCuadre("active_wear", "2026-08-01"));
    expect(DIAS_ENTRE_AVISOS).toBe(7);
  });

  it("nombreDeMes", () => {
    expect(nombreDeMes("2026-08-01")).toBe("agosto 2026");
    expect(nombreDeMes("2027-01-01")).toBe("enero 2027");
  });
});
