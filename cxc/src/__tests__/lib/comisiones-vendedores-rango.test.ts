// Candado de VENDEDORES_RANGO_2026_10: el rango es para CONSULTAR y no mueve
// un centavo de los meses que se pagan (agosto 2026 = $5.978,55 en el grupo y
// $255,27 en Multifashion, medido contra producción el 1-oct-2026).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
import {
  VENDEDORES_RANGO_2026_10,
  comisionDeDetalle,
  periodoAnterior,
  piezasPorMes,
  porVendedor,
  rangoDeAtajo,
  vendedorasDeFilas,
  type FilaRango,
} from "@/lib/comisiones/vendedores-rango";
import { sePagaComision } from "@/lib/comisiones/sin-pago";
import { netearComisiones } from "@/lib/comisiones/descuentos";

const r2 = (n: number) => Math.round(n * 100) / 100;

// comision_b2b_v9, agosto 2026, comision_total por (empresa, vendedor) ≠ 0 — medido.
const AGOSTO_GRUPO: FilaRango[] = [
  ["vistana", "EDWIN", 652.42], ["vistana", "DANIEL LEVY", 470.23], ["vistana", "Rodrigo", 234.49],
  ["vistana", "DEFAULT", 201.9], ["vistana", "REY STOUTE AGUAS", 5.9],
  ["fashion_wear", "REYNALDO ESPINOSA", 3525.25], ["fashion_wear", "DEFAULT", 9.84],
  ["fashion_shoes", "REYNALDO ESPINOSA", 2993.23], ["fashion_shoes", "DEFAULT", 34.72],
  ["active_wear", "DEFAULT", 5.21], ["active_wear", "REYNALDO ESPINOSA", -641.55],
  ["active_shoes", "REYNALDO ESPINOSA", 787.79], ["active_shoes", "DEFAULT", 76.1],
].map(([empresa_key, vendedor, comision]) => ({ empresa_key, vendedor, ventas: 1, comision } as FilaRango));

// _multifashion_sf_vw, agosto 2026: SUM(subtotal_comision) por vendedora — medido.
const AGOSTO_MF = [
  ["Sheynee Batista", 18533.84], ["Jailine", 13765.555], ["Milagros Torres", 13524.32],
  ["Jennifer Miranda", 5256.04], ["Cindy De Gracia", -26.45],
] as const;

describe("VENDEDORES_RANGO_2026_10", () => {
  // Daniel aprobó las capturas el 2-oct-2026: «sí».
  it("el interruptor está prendido (2-oct-2026)", () => {
    expect(VENDEDORES_RANGO_2026_10).toBe(true);
  });

  it("los atajos terminan HOY (Panamá) y el anterior es equivalente", () => {
    const hoy = "2026-10-01";
    expect(rangoDeAtajo("semana", hoy)).toMatchObject({ desde: "2026-09-25", hasta: hoy });
    expect(rangoDeAtajo("mes", hoy).desde).toBe("2026-09-02");
    expect(rangoDeAtajo("3m", hoy).desde).toBe("2026-07-02");
    expect(rangoDeAtajo("6m", hoy).desde).toBe("2026-04-02");
    expect(rangoDeAtajo("anio", hoy).desde).toBe("2026-01-01");
    expect(rangoDeAtajo("mes", "2026-03-31").desde).toBe("2026-03-01"); // 28-feb + 1
    // CALENDARIO_SIMPLE_2026_10 (5-oct-2026): todo rango contra los MISMOS días del año pasado.
    expect(periodoAnterior(rangoDeAtajo("semana", hoy))).toEqual({ desde: "2025-09-25", hasta: "2025-10-01" });
    expect(periodoAnterior(rangoDeAtajo("anio", hoy))).toEqual({ desde: "2025-01-01", hasta: "2025-10-01" });
    expect(periodoAnterior({ desde: "2028-01-01", hasta: "2028-02-29", atajo: "anio" }).hasta).toBe("2027-02-28");
  });

  it("un mes entero es UNA pieza entera (sale de la MISMA RPC del mes)", () => {
    expect(piezasPorMes("2026-08-01", "2026-08-31")).toEqual([
      { year: 2026, mes: 8, desde: "2026-08-01", hasta: "2026-08-31", entero: true },
    ]);
    const p = piezasPorMes("2026-07-02", "2026-10-01");
    expect(p.map((x) => [x.mes, x.entero])).toEqual([[7, false], [8, true], [9, true], [10, false]]);
    expect(p[0].desde).toBe("2026-07-02");
    expect(p[3].hasta).toBe("2026-10-01");
  });

  it("el detalle recortado usa la cuenta de la RPC (cada parte redondeada)", () => {
    const d = {
      tasa_venta: 0.005, tasa_cobro: 0.005,
      ventas: [{ fecha: "2026-09-01", subtotal: 1001 }, { fecha: "2026-09-20", subtotal: -1 }],
      cobros: [{ fecha: "2026-09-05", monto: 333 }, { fecha: "2026-09-30", monto: 1000 }],
    };
    expect(comisionDeDetalle(d, "2026-09-01", "2026-09-30")).toBe(r2(1000 * 0.005) + r2(1333 * 0.005));
    expect(comisionDeDetalle(d, "2026-09-02", "2026-09-29")).toBe(r2(-0.005) + r2(333 * 0.005));
  });

  it("agosto 2026 en el grupo: el rango da el bruto y el mes pagado sigue en $5.978,55", () => {
    const filas = porVendedor(AGOSTO_GRUPO, []);
    const bruto = r2(filas.filter((f) => sePagaComision(f.vendedor)).reduce((a, f) => a + f.comision, 0));
    expect(bruto).toBe(7551.63); // sin retirados ni no pagables
    // Lo que se paga = el mismo bruto menos los descuentos fijos del mes (Reynaldo, $1.573,08).
    const neto = netearComisiones([{ vendedor: "REYNALDO ESPINOSA", comision_total: 6664.72 }], { "REYNALDO ESPINOSA": 1573.08 });
    expect(r2(bruto - 6664.72 + neto[0].comision_total)).toBe(5978.55);
    // Una persona, una fila: Reynaldo junta sus 4 empresas; DEFAULT y Daniel quedan, marcados aparte.
    expect(filas.find((f) => f.vendedor === "REYNALDO ESPINOSA")?.comision).toBe(6664.72);
    expect(filas.some((f) => f.vendedor === "REY STOUTE AGUAS")).toBe(false);
  });

  it("agosto 2026 en Multifashion = $255,27, sin DEFAULT y nunca con el grupo", () => {
    const filas = vendedorasDeFilas([
      ...AGOSTO_MF.map(([vendedor_canonico, b]) => ({ vendedor: vendedor_canonico, vendedor_canonico, subtotal: b, subtotal_comision: b })),
      { vendedor: "DEFAULT", vendedor_canonico: "DEFAULT", subtotal: 999, subtotal_comision: 999 },
    ]);
    expect(r2(filas.reduce((a, f) => a + f.comision, 0))).toBe(255.27);
    expect(filas.every((f) => f.empresa_key === "american_classic")).toBe(true);
  });

  it("la variación es contra el anterior; sin venta antes dice «Nuevo» (null)", () => {
    const f = porVendedor(
      [{ empresa_key: "vistana", vendedor: "EDWIN", ventas: 120, comision: 1 }, { empresa_key: "vistana", vendedor: "X", ventas: 5, comision: 0 }],
      [{ empresa_key: "vistana", vendedor: "EDWIN", ventas: 100, comision: 1 }],
    );
    expect(f[0].variacion).toBeCloseTo(0.2);
    expect(f[1].variacion).toBeNull();
    expect(porVendedor(AGOSTO_GRUPO, [], "fashion_wear").map((x) => x.vendedor).sort()).toEqual(["DEFAULT", "REYNALDO ESPINOSA"]);
  });

  it("los meses que se pagan no conocen el rango (rutas y RPC de siempre)", () => {
    const raiz = join(__dirname, "../../app/api");
    for (const ruta of ["ventas/comisiones/route.ts", "ventas/comisiones/consolidado/route.ts", "multifashion/vendedoras/route.ts"]) {
      expect(readFileSync(join(raiz, ruta), "utf8")).not.toMatch(/vendedores-rango/);
    }
  });
});
