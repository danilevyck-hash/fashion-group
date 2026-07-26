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

  it("un año entra al crecimiento de la META si la empresa ya vendía en sus primeros 31 días", () => {
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

  it("mejora TODAS las bandas contra el estado actual, en grupo y por empresa", () => {
    for (const banda of ["ene-feb", "mar-may", "jun-dic", "total"] as const) {
      expect(
        despues[banda].errorEmpresaPct,
        `error por empresa en ${banda}`,
      ).toBeLessThanOrEqual(antes[banda].errorEmpresaPct);
    }
    expect(despues.total.errorGrupoPct).toBeLessThan(antes.total.errorGrupoPct);
    expect(despues.total.errorEmpresaPct).toBeLessThan(antes.total.errorEmpresaPct);
  });

  it("el error por empresa baja de 32.8% a 23.2% y el del grupo de 7.4% a 5.8%", () => {
    expect(antes.total.errorEmpresaPct).toBe(32.8);
    expect(despues.total.errorEmpresaPct).toBe(23.2);
    expect(antes.total.errorGrupoPct).toBe(7.4);
    expect(despues.total.errorGrupoPct).toBe(5.8);
  });

  it("el pico de marzo-mayo por empresa se corta casi a la mitad", () => {
    expect(antes["mar-may"].errorEmpresaPct).toBe(68.7);
    expect(despues["mar-may"].errorEmpresaPct).toBe(41.2);
  });

  it("toda la precisión la pone el clamp; el resto son arreglos de correctitud", () => {
    // Contra el backtest, (B) (C) y (D) quedan planos: sacan números inventados
    // (joystep, la meta sugerida) sin mover la aguja del error medio.
    expect(soloClamp.total.errorGrupoPct).toBe(5.8);
    expect(soloClamp.total.errorEmpresaPct).toBe(23.1);
    expect(Math.abs(despues.total.errorEmpresaPct - soloClamp.total.errorEmpresaPct)).toBeLessThan(0.5);
    expect(despues.total.errorGrupoPct).toBe(soloClamp.total.errorGrupoPct);
  });

  it("cada variante descartada es peor en el eje por el que se descartó", () => {
    // Ninguna es peor en TODO — por eso el fixture guarda en qué eje pierde cada
    // una, y el test lo verifica ahí y no en un promedio que la tape.
    for (const [nombre, v] of Object.entries(descartados)) {
      const eje = v.porQueSeDescarto as "errorGrupoPct" | "errorEmpresaPct";
      expect(v.total[eje], `variante ${nombre} en ${eje}`).toBeGreaterThan(despues.total[eje]);
    }
  });

  it("aplicar la regla de año base también a la proyección empeora el grupo", () => {
    // Es la decisión que más se pensó: el crecimiento inflado de +50% venía
    // tapando por casualidad el sesgo a la baja de enero-febrero.
    const v = descartados.anioBaseTambienEnLaProyeccion;
    expect(v.total.errorGrupoPct).toBe(6.5);
    expect(v["ene-feb"].errorGrupoPct).toBe(14.3);
    expect(despues["ene-feb"].errorGrupoPct).toBe(10.2);
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

  it("joystep tampoco queda con un piso falso en el resto del año", () => {
    // Sin la cobertura, el clamp lo habría dejado clavado en $124,273 (el 75%
    // del cierre de 2025) desde enero hasta julio.
    const serie = fixture.joystepDuranteElAnio;
    expect(serie.map((x) => x.algoritmo)).toEqual(["fallback_lineal", "fallback_lineal", "fallback_lineal"]);
    for (const punto of serie) {
      expect(punto.proyeccion, punto.corte).toBeLessThan(124273);
      expect(punto.proyeccion, punto.corte).toBeGreaterThan(punto.ventasYtd);
    }
  });

  it("el total del grupo se mueve solo lo que se mueve joystep", () => {
    const j = empresas.find((e) => e.empresa === "joystep")!;
    const deltaJoystep = j.proyeccionDespues - j.proyeccionAntes;
    expect(grupoDespues - grupoAntes).toBeCloseTo(deltaJoystep, 0);
    expect(grupoAntes).toBe(12501905.9);
    expect(grupoDespues).toBe(12340341.5);
  });

  it("grupoAntes es el número que devolvió la RPC viva, no una cuenta aparte", () => {
    // ventas_proyeccion_cierre_v6(2026) contra producción: 12501905.913054144
    expect(grupoAntes).toBe(12501905.9);
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

  it("arreglar la meta NO movió ninguna proyección", () => {
    // La regla de año base vive en su propia cadena de crecimiento; si alguien
    // la conecta al factor de la proyección, esto falla.
    const cambiaMeta = empresas.filter((e) => e.metaSugeridaAntes !== e.metaSugeridaDespues);
    expect(cambiaMeta.map((e) => e.empresa).sort()).toEqual([
      "active_wear",
      "american_classic",
      "confecciones_boston",
    ]);
    for (const e of cambiaMeta) expect(e.proyeccionDespues, e.empresa).toBe(e.proyeccionAntes);
  });
});

describe("el cierre del año pasado sigue siendo un hecho, no una estimación", () => {
  it("la regla de año base solo filtra el cálculo de crecimiento", () => {
    // cierre_anio_anterior sale de total_prev_year (el cierre real del vw), NO
    // de base_crecimiento. Si esto se invierte, joystep pasaría a mostrar
    // "Cerró 2025: $0" cuando en realidad cerró en $165,697.
    expect(sql).toMatch(/'cierre_anio_anterior',\s*f\.total_prev_year/);
    expect(sql).toMatch(/'ventas_prev_year',\s*f\.total_prev_year/);
  });

  it("la meta y la proyección miden el crecimiento por caminos separados", () => {
    // `totales` (sin filtrar) alimenta la proyección; `totales_base` (solo años
    // completos) alimenta la meta. Mezclarlas fue lo que empeoró el grupo.
    expect(sql).toContain("totales_base");
    expect(sql).toMatch(/ritmo_meta/);
    expect(sql).toMatch(/r\.ritmo_meta \* 0\.7\)\) END AS meta_sugerida/);
    // El factor de la proyección sigue usando ritmo_historico, no ritmo_meta.
    expect(sql).toMatch(/1 \+ b\.ritmo_historico \* 0\.7/);
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
