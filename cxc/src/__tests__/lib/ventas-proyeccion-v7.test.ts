// La proyección de cierre y la evidencia que la sostiene.
//
// Los números de `fixtures/proyeccion-backtest.json` NO son inventados: salen de
// correr la proyección sobre 120 cortes reales de 2024 y 2025 (días 5/11/17/23/29
// de cada mes) y comparar contra el cierre real de cada año. El modelo con el que
// se midió se validó primero contra la RPC viva: reprodujo
// ventas_proyeccion_cierre_v6(2026) al centavo en las 8 empresas y en el grupo.
//
// Este test es el candado de esa evidencia. Si alguien mueve una constante en la
// migración —el clamp, el piso de cobertura, los días de año base— el test falla
// y obliga a volver a medir en vez de tocar el número hasta que "se vea bien".
//
// Lo que NO hace: recalcular la proyección en TypeScript. La proyección vive en
// la RPC y tiene que vivir en un solo lugar; una copia en TS sería una segunda
// verdad que se desincroniza sola.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import fixture from "../fixtures/proyeccion-backtest.json";

const RAIZ = path.resolve(__dirname, "../../..");
const sql = readFileSync(
  path.join(RAIZ, "supabase/migrations/20260726120000_ventas_proyeccion_cierre_v7.sql"),
  "utf8",
);
const queries = readFileSync(path.join(RAIZ, "src/lib/ventas/queries.ts"), "utf8");
const rutaWrapper = readFileSync(
  path.join(RAIZ, "src/app/api/ventas/proyeccion-cierre/route.ts"),
  "utf8",
);

/** Lee `nombre CONSTANT <tipo> := <valor>;` del DECLARE de la función. */
function constanteSql(nombre: string): number {
  const m = sql.match(new RegExp(`${nombre}\\s+CONSTANT\\s+\\w+\\s*:=\\s*(-?[\\d.]+)\\s*;`));
  if (!m) throw new Error(`No se encontró la constante ${nombre} en la migración de v7`);
  return Number(m[1]);
}

describe("las constantes de la RPC son las que se midieron", () => {
  const r = fixture.reglas;

  it("el clamp acota a cierre_año_previo × [0.75, 1.60]", () => {
    expect(constanteSql("c_clamp_min")).toBe(r.clampMin);
    expect(constanteSql("c_clamp_max")).toBe(r.clampMax);
    expect(r.clampMin).toBe(0.75);
    expect(r.clampMax).toBe(1.6);
  });

  it("el clamp se apaga pasada la mitad del año previo", () => {
    expect(constanteSql("c_frac_sin_clamp")).toBe(r.fracSinClamp);
    expect(r.fracSinClamp).toBe(0.5);
  });

  it("el piso de cobertura del año previo es 0.10", () => {
    expect(constanteSql("c_cobertura_min")).toBe(r.coberturaMinima);
    expect(r.coberturaMinima).toBe(0.1);
  });

  it("un año sirve de base de crecimiento si la empresa ya vendía en sus primeros 31 días", () => {
    expect(constanteSql("c_dias_anio_base")).toBe(r.diasAnioBase);
    expect(r.diasAnioBase).toBe(31);
  });

  it("el piso viejo de la rama estacional no se tocó", () => {
    expect(constanteSql("c_frac_estacional")).toBe(r.fracEstacional);
    expect(r.fracEstacional).toBe(0.05);
  });
});

describe("el backtest de 120 cortes (2024 y 2025)", () => {
  const { antes, despues, soloClamp, descartados } = fixture.backtest;

  it("mide los mismos 120 cortes antes y después", () => {
    expect(antes.cortes).toBe(120);
    expect(despues.cortes).toBe(120);
    expect(antes.total.n + 0).toBe(120);
  });

  it("los cuatro arreglos juntos mejoran TODAS las bandas contra el estado actual", () => {
    for (const banda of ["ene-feb", "mar-may", "jun-dic", "total"] as const) {
      expect(
        despues[banda].errorEmpresaPct,
        `error por empresa en ${banda}`,
      ).toBeLessThanOrEqual(antes[banda].errorEmpresaPct);
    }
    expect(despues.total.errorGrupoPct).toBeLessThan(antes.total.errorGrupoPct);
    expect(despues.total.errorEmpresaPct).toBeLessThan(antes.total.errorEmpresaPct);
  });

  it("el error por empresa baja de 32.8% a 22.8% y el del grupo de 7.4% a 6.6%", () => {
    expect(antes.total.errorEmpresaPct).toBe(32.8);
    expect(despues.total.errorEmpresaPct).toBe(22.8);
    expect(antes.total.errorGrupoPct).toBe(7.4);
    expect(despues.total.errorGrupoPct).toBe(6.6);
  });

  it("el pico de marzo-mayo por empresa se corta casi a la mitad", () => {
    expect(antes["mar-may"].errorEmpresaPct).toBe(68.7);
    expect(despues["mar-may"].errorEmpresaPct).toBe(41.1);
  });

  it("el clamp solo es lo que más aporta; el resto del costo en ene-feb lo pone la regla de año base", () => {
    // El crecimiento inflado (+50% contra un 2022 de dos meses) venía tapando,
    // por casualidad, el sesgo a la baja que la proyección tiene en ene-feb.
    expect(soloClamp.total.errorGrupoPct).toBe(5.8);
    expect(soloClamp["ene-feb"].errorGrupoPct).toBeLessThan(despues["ene-feb"].errorGrupoPct);
    // Aun así, contra el estado actual ene-feb mejora.
    expect(despues["ene-feb"].errorGrupoPct).toBeLessThan(antes["ene-feb"].errorGrupoPct);
  });

  it("las tres variantes que se probaron y se descartaron eran peores", () => {
    for (const [nombre, v] of Object.entries(descartados)) {
      expect(v.total.errorEmpresaPct, `variante ${nombre}`).toBeGreaterThan(
        despues.total.errorEmpresaPct,
      );
    }
  });
});

describe("qué cambia en pantalla el 25-jul-2026", () => {
  const { empresas, grupoAntes, grupoDespues } = fixture.hoy;

  it("la única empresa que cambia es joystep", () => {
    const cambian = empresas.filter((e) => e.proyeccionAntes !== e.proyeccionDespues);
    expect(cambian.map((e) => e.empresa)).toEqual(["joystep"]);
  });

  it("joystep deja de extrapolar contra un año en que casi no vendió", () => {
    const j = empresas.find((e) => e.empresa === "joystep")!;
    expect(j.proyeccionAntes).toBe(207121.5);
    expect(j.proyeccionDespues).toBe(45557.1);
    expect(j.algoritmoAntes).toBe("mixto");
    expect(j.algoritmoDespues).toBe("fallback_lineal");
  });

  it("el total del grupo se mueve solo lo que se mueve joystep", () => {
    const j = empresas.find((e) => e.empresa === "joystep")!;
    const deltaJoystep = j.proyeccionDespues - j.proyeccionAntes;
    expect(grupoDespues - grupoAntes).toBeCloseTo(deltaJoystep, 0);
    expect(grupoAntes).toBe(12501905.9);
    expect(grupoDespues).toBe(12340341.5);
  });

  it("el clamp no toca a ninguna empresa hoy: las otras 7 quedan al centavo", () => {
    for (const e of empresas) {
      if (e.empresa === "joystep") continue;
      expect(e.proyeccionDespues, e.empresa).toBe(e.proyeccionAntes);
    }
  });

  it("la meta sugerida se despega del tope en las empresas contaminadas por 2022", () => {
    const boston = empresas.find((e) => e.empresa === "confecciones_boston")!;
    const wear = empresas.find((e) => e.empresa === "active_wear")!;
    const ac = empresas.find((e) => e.empresa === "american_classic")!;
    expect(boston.metaSugeridaAntes).toBe(859343.5);
    expect(boston.metaSugeridaDespues).toBe(696220);
    expect(wear.metaSugeridaDespues!).toBeLessThan(wear.metaSugeridaAntes!);
    // American Classic abrió en may-2024: no le queda historia suficiente para
    // sugerir una meta, y decirlo es mejor que inventar un +43.6% de crecimiento.
    expect(ac.metaSugeridaAntes).toBe(857554.6);
    expect(ac.metaSugeridaDespues).toBeNull();
  });
});

describe("el cierre del año pasado sigue siendo un hecho, no una estimación", () => {
  it("la regla de año base solo filtra el cálculo de crecimiento", () => {
    // cierre_anio_anterior sale de total_prev_year (el cierre real del vw), NO
    // de base_crecimiento. Si esto se invierte, joystep pasaría a mostrar
    // "Cerró 2025: $0" cuando en realidad cerró en $165,697.
    expect(sql).toMatch(/'cierre_anio_anterior',\s*f\.total_prev_year/);
    expect(sql).toMatch(/'ventas_prev_year',\s*f\.total_prev_year/);
    expect(sql).not.toMatch(/'cierre_anio_anterior',\s*.*base_crecimiento/);
  });

  it("la etiqueta del método la decide la rama que de verdad calculó el número", () => {
    expect(sql).toMatch(/es_fallback_lineal/);
    expect(sql).toMatch(/\(c\.algoritmo = 'fallback_lineal'\) AS es_fallback_lineal/);
  });
});

describe("una sola versión de la proyección para todo el sistema", () => {
  it("el dashboard y el endpoint suelto llaman a la MISMA función", () => {
    for (const [nombre, src] of [
      ["queries.ts", queries],
      ["route.ts", rutaWrapper],
    ] as const) {
      expect(src, nombre).toContain("ventas_proyeccion_cierre_v7");
      expect(src, nombre).toContain("rpcConFallbackDeVersion");
      // v5 era la que hacía que el endpoint contestara distinto que el dashboard.
      expect(src, nombre).not.toContain("ventas_proyeccion_cierre_v5");
    }
  });

  it("ambos caen a v6 mientras la migración no haya corrido", () => {
    expect(queries).toContain("ventas_proyeccion_cierre_v6");
    expect(rutaWrapper).toContain("ventas_proyeccion_cierre_v6");
  });
});
