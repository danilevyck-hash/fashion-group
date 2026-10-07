/**
 * CANDADO · DESPACHOS › GUÍAS DE DESPACHO: CINCO GRUPOS DE FECHA (7-oct-2026)
 *
 * Segunda mitad del pedido del 7-oct-2026 (la primera fue el chip «Pendiente»,
 * commit 4a39e288). Daniel: «que sea hoy, ayer, esta semana, semana pasada,
 * este mes, mes pasado, algo así» y, tras ver el mockup: «quiero hasta semana
 * pasada, después es historial».
 *
 * 1. Sin `opts` (como llama todo el resto del sistema), `groupByTimePeriod`
 *    con el modo "guias" sigue dando EXACTAMENTE los cuatro grupos de siempre
 *    — nada cambia para quien no pasa el nuevo parámetro.
 * 2. Con `opts.extendido: true`, aparecen los cinco: Hoy · Ayer · Esta
 *    semana · Semana pasada · Historial — «historial» junta todo lo más
 *    viejo, sin distinguir mes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { groupByTimePeriod } from "@/lib/group-by-time";
import { GUIAS_GRUPOS_FECHA_2026_10 } from "@/lib/guias/grupos-fecha-2026-10";

// Jueves 22-oct-2026: semana actual = lun 19 a hoy; semana pasada = lun 12 a
// dom 18; «historial» = todo antes del 12-oct.
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
  historialReciente: "2026-10-05",
  historialViejo: "2026-07-01",
};

const TODAS: Fila[] = Object.entries(FECHAS).map(([k, f]) => fila(k, f));

describe("el interruptor", () => {
  it("está prendido (Daniel, 7-oct-2026, sobre el mockup final: «dale así»)", () => {
    expect(GUIAS_GRUPOS_FECHA_2026_10).toBe(true);
  });
});

describe("groupByTimePeriod — modo guias, con y sin opts", () => {
  it("sin opts: los CUATRO grupos de siempre, sin tocar una fecha", () => {
    const grupos = groupByTimePeriod(TODAS, "fecha", "guias");
    expect(grupos.map((g) => g.label)).toEqual(["Hoy", "Ayer", "Esta semana", "Anteriores"]);
    const anteriores = grupos.find((g) => g.label === "Anteriores")!;
    expect(anteriores.items.map((i) => i.id).sort()).toEqual(
      ["semanaPasada", "historialReciente", "historialViejo"].sort(),
    );
  });

  it("opts.extendido: los CINCO grupos, cada fecha en el suyo", () => {
    const grupos = groupByTimePeriod(TODAS, "fecha", "guias", { extendido: true });
    expect(grupos.map((g) => g.label)).toEqual([
      "Hoy", "Ayer", "Esta semana", "Semana pasada", "Historial",
    ]);
    const porId = (label: string) => grupos.find((x) => x.label === label)!.items.map((i) => i.id).sort();
    expect(porId("Hoy")).toEqual(["hoy"]);
    expect(porId("Ayer")).toEqual(["ayer"]);
    expect(porId("Esta semana")).toEqual(["estaSemana"]);
    expect(porId("Semana pasada")).toEqual(["semanaPasada"]);
    // «Historial» junta todo lo más viejo, sin distinguir mes.
    expect(porId("Historial")).toEqual(["historialReciente", "historialViejo"].sort());
  });

  it("un grupo sin guías no se dibuja (ya valía antes; sigue valiendo)", () => {
    const soloHoy = [fila("hoy", FECHAS.hoy)];
    const grupos = groupByTimePeriod(soloHoy, "fecha", "guias", { extendido: true });
    expect(grupos.map((g) => g.label)).toEqual(["Hoy"]);
  });
});
