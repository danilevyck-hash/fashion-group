// 🔴 MULTIFASHION › PRODUCTOS: «RANGO DE FECHAS» (Daniel, 5-oct-2026).
// Los artículos vendidos entre dos fechas, con la MISMA ruta y las MISMAS
// funciones que el mes. Medido contra producción: septiembre 2026 por mes y por
// rango 1–30 sep da lo mismo (1.682 unidades · $44.372,86 · utilidad
// $13.941,16) y el comparativo es el mismo rango un año antes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  mesVecino, ajustarPeriodo, opcionesPeriodo, periodoAUrl, periodoDesdeUrl, rangoInicial, ROTULO_RANGO, VALOR_RANGO,
} from "@/lib/multifashion/periodo";
import { leerRango } from "@/lib/multifashion/productos-ranking";
import { pestanasDelRol } from "@/lib/navegacion/tab-bar";

const corte = { anio: 2026, mes: 10 };

describe("el período «rango»", () => {
  it("va y vuelve por la URL; la basura cae al default", () => {
    const p = { tipo: "rango" as const, desde: "2026-09-01", hasta: "2026-09-15" };
    expect(periodoAUrl(p)).toBe("2026-09-01_2026-09-15");
    expect(periodoDesdeUrl("2026-09-01_2026-09-15")).toEqual(p);
    expect(periodoDesdeUrl("2026-09-15_2026-09-01")).toBeNull();
    expect(periodoDesdeUrl("2026-02-30_2026-03-01")).toBeNull();
  });
  // 5-oct-2026 · NOTA FECHADA — Vendedoras y Clientes también ofrecen «Rango de
  // fechas» (Daniel: «flechita… acceso más rápido»). Solo el Resumen lo baja a su mes.
  it("Productos, Vendedoras y Clientes lo ofrecen; el Resumen lo baja a su mes", () => {
    const de = (tab: "productos" | "vendedoras" | "clientes" | "resumen") =>
      opcionesPeriodo({ tab, anios: [2026], corte }).filter((o) => o.valor === VALOR_RANGO);
    for (const t of ["productos", "vendedoras", "clientes"] as const)
      expect(de(t)).toEqual([{ valor: VALOR_RANGO, label: ROTULO_RANGO, grupo: "Rangos" }]);
    expect(de("resumen")).toEqual([]);
    expect(ajustarPeriodo({ tipo: "rango", desde: "2026-09-01", hasta: "2026-09-15" }, "resumen", corte))
      .toEqual({ tipo: "mes", anio: 2026, mes: 9 });
  });
  it("al elegirlo abre con el mes que se miraba, nunca después de hoy", () => {
    expect(rangoInicial({ tipo: "mes", anio: 2026, mes: 10 }, corte, "2026-10-05"))
      .toEqual({ tipo: "rango", desde: "2026-10-01", hasta: "2026-10-05" });
    expect(rangoInicial({ tipo: "mes", anio: 2026, mes: 8 }, corte, "2026-10-05"))
      .toEqual({ tipo: "rango", desde: "2026-08-01", hasta: "2026-08-31" });
  });
});

describe("la ruta: `desde`/`hasta`", () => {
  it("valida fechas, orden y tope", () => {
    expect(leerRango(null, null)).toBeNull();
    expect(leerRango("2026-09-01", "2026-09-15")).toEqual({ desde: "2026-09-01", hasta: "2026-09-15" });
    expect(leerRango("2026-09-15", "2026-09-01")).toHaveProperty("error");
    expect(leerRango("2026-13-01", "2026-10-01")).toHaveProperty("error");
    expect(leerRango("2026-09-31", "2026-10-01")).toHaveProperty("error");
    expect(leerRango("2026-09-01", null)).toHaveProperty("error");
    expect(leerRango("2023-01-01", "2026-01-01")).toHaveProperty("error");
  });
  it("la ruta usa el rango y no inventa otra cuenta", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/multifashion/productos/route.ts"), "utf8");
    expect(src).toContain('leerRango(sp.get("desde"), sp.get("hasta"))');
    expect(src).toContain("rangoPedido ? rangoPedido.desde");
  });
});

describe("la secretaria tiene Multifashion en su barra (5-oct-2026)", () => {
  it("va fija aunque su uso medido la deje atrás", () => {
    const mods = ["cargar", "catalogos", "guias", "marketing", "comisiones", "cheques", "multifashion"];
    const barra = pestanasDelRol("secretaria", mods, ["cargar", "catalogos", "guias"]).map((m) => m.key);
    expect(barra).toContain("multifashion");
  });
});

// 5-oct-2026 · las flechas ‹ › del selector (Daniel: «flechita de meses atrás y adelante»).
describe("mesVecino — ‹ ›", () => {
  const ops = opcionesPeriodo({ tab: "vendedoras", anios: [2026, 2025], corte });
  it("mueve un mes, cruza el año y nunca va al futuro", () => {
    expect(mesVecino({ tipo: "mes", anio: 2026, mes: 1 }, -1, ops)).toBe("2025-12");
    expect(mesVecino({ tipo: "mes", anio: 2025, mes: 12 }, 1, ops)).toBe("2026-01");
    expect(mesVecino({ tipo: "mes", anio: corte.anio, mes: corte.mes }, 1, ops)).toBeNull();
    expect(mesVecino({ tipo: "mes", anio: 2025, mes: 1 }, -1, ops)).toBeNull();
  });
  it("con año, últimos N o rango se apagan", () => {
    expect(mesVecino({ tipo: "anio", anio: 2026 }, -1, ops)).toBeNull();
    expect(mesVecino({ tipo: "ultimos", n: 3 }, 1, ops)).toBeNull();
    expect(mesVecino({ tipo: "rango", desde: "2026-09-01", hasta: "2026-09-15" }, -1, ops)).toBeNull();
  });
});
