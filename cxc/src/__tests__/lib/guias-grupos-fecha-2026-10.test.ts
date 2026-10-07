/**
 * CANDADO · DESPACHOS › GUÍAS DE DESPACHO: SIETE GRUPOS DE FECHA (7-oct-2026)
 *
 * Segunda mitad del pedido del 7-oct-2026 (la primera fue el chip «Pendiente»,
 * commit 4a39e288). Daniel: «que sea hoy, ayer, esta semana, semana pasada,
 * este mes, mes pasado, algo así».
 *
 * 1. Sin `opts` (como llama todo el resto del sistema), `groupByTimePeriod`
 *    con el modo "guias" sigue dando EXACTAMENTE los cuatro grupos de siempre
 *    — nada cambia para quien no pasa el nuevo parámetro.
 * 2. Con `opts.incluirMeses: true`, aparecen los siete: Hoy · Ayer · Esta
 *    semana · Semana pasada · Este mes · Mes pasado · Anteriores.
 * 3. Con `opts.incluirMeses: false` (un mes puntual elegido arriba, sin
 *    buscar), «Este mes» y «Mes pasado» no existen: lo que hubiera caído ahí
 *    cae en «Anteriores».
 * 4. `incluirGruposDeMes`: solo `true` con «Todo el año» o al buscar.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { groupByTimePeriod } from "@/lib/group-by-time";
import { incluirGruposDeMes } from "@/lib/guias/grupos-fecha-2026-10";

// Jueves 22-oct-2026. Elegido para que CADA grupo tenga al menos un día real:
// semana actual = lun 19 a hoy; semana pasada = lun 12 a dom 18; este mes =
// 1 a 11 oct; mes pasado = setiembre entero; anteriores = antes de setiembre.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T15:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

interface Fila { id: string; fecha: string }
const fila = (id: string, fecha: string): Fila => ({ id, fecha });

const FECHAS = {
  hoy: "2026-10-22",
  ayer: "2026-10-21",
  estaSemana: "2026-10-19",
  semanaPasada: "2026-10-15",
  esteMes: "2026-10-05",
  mesPasado: "2026-09-20",
  anteriores: "2026-07-01",
};

const TODAS: Fila[] = Object.entries(FECHAS).map(([k, f]) => fila(k, f));

describe("groupByTimePeriod — modo guias, con y sin opts", () => {
  it("sin opts: los CUATRO grupos de siempre, sin tocar una fecha", () => {
    const grupos = groupByTimePeriod(TODAS, "fecha", "guias");
    expect(grupos.map((g) => g.label)).toEqual(["Hoy", "Ayer", "Esta semana", "Anteriores"]);
    // Todo lo que no es hoy/ayer/esta-semana cae en «Anteriores», exactamente
    // como hoy — incluido lo que con los meses prendidos sería otro grupo.
    const anteriores = grupos.find((g) => g.label === "Anteriores")!;
    expect(anteriores.items.map((i) => i.id).sort()).toEqual(
      ["semanaPasada", "esteMes", "mesPasado", "anteriores"].sort(),
    );
  });

  it("opts.incluirMeses=true: los SIETE grupos, cada fecha en el suyo", () => {
    const grupos = groupByTimePeriod(TODAS, "fecha", "guias", { incluirMeses: true });
    expect(grupos.map((g) => g.label)).toEqual([
      "Hoy", "Ayer", "Esta semana", "Semana pasada", "Este mes", "Mes pasado", "Anteriores",
    ]);
    for (const g of grupos) expect(g.items).toHaveLength(1);
    const porId = (label: string) => grupos.find((x) => x.label === label)!.items[0].id;
    expect(porId("Hoy")).toBe("hoy");
    expect(porId("Ayer")).toBe("ayer");
    expect(porId("Esta semana")).toBe("estaSemana");
    expect(porId("Semana pasada")).toBe("semanaPasada");
    expect(porId("Este mes")).toBe("esteMes");
    expect(porId("Mes pasado")).toBe("mesPasado");
    expect(porId("Anteriores")).toBe("anteriores");
  });

  it("opts.incluirMeses=false: SIN «Este mes» ni «Mes pasado» — caen en «Anteriores»", () => {
    const grupos = groupByTimePeriod(TODAS, "fecha", "guias", { incluirMeses: false });
    expect(grupos.map((g) => g.label)).toEqual([
      "Hoy", "Ayer", "Esta semana", "Semana pasada", "Anteriores",
    ]);
    const anteriores = grupos.find((g) => g.label === "Anteriores")!;
    expect(anteriores.items.map((i) => i.id).sort()).toEqual(["esteMes", "mesPasado", "anteriores"].sort());
  });

  it("un grupo sin guías no se dibuja (ya valía antes; sigue valiendo)", () => {
    const soloHoy = [fila("hoy", FECHAS.hoy)];
    const grupos = groupByTimePeriod(soloHoy, "fecha", "guias", { incluirMeses: true });
    expect(grupos.map((g) => g.label)).toEqual(["Hoy"]);
  });
});

describe("incluirGruposDeMes — el selector de mes no se contradice", () => {
  it("sin período (ninguna pantalla lo manda): true", () => {
    expect(incluirGruposDeMes(undefined, false)).toBe(true);
  });
  it("«Todo el año» (mes 0): true, aunque no se busque", () => {
    expect(incluirGruposDeMes({ year: 2026, mes: 0 }, false)).toBe(true);
  });
  it("un mes puntual, sin buscar: false — el selector ya lo dice", () => {
    expect(incluirGruposDeMes({ year: 2026, mes: 10 }, false)).toBe(false);
  });
  it("un mes puntual, pero buscando: true — la búsqueda mira todas las fechas", () => {
    expect(incluirGruposDeMes({ year: 2026, mes: 10 }, true)).toBe(true);
  });
});
