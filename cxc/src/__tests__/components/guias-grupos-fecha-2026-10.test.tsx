/**
 * CANDADO · DESPACHOS › GUÍAS DE DESPACHO: SIETE GRUPOS, SEPARADOS
 * (7-oct-2026, `GUIAS_GRUPOS_FECHA_2026_10`). Segunda mitad del pedido del
 * 7-oct-2026 — la primera fue el chip «Pendiente» (commit 4a39e288).
 *
 * 1. Apagado: la lista se agrupa EXACTAMENTE como hoy (Hoy · Ayer · Esta
 *    semana · Anteriores), con el encabezado de siempre — nada sobrio
 *    adicional, nada de mayúsculas nuevas.
 * 2. Prendido, «Todo el año»: aparecen los siete grupos y el encabezado se
 *    separa (más aire arriba, mayúsculas con tracking).
 * 3. Prendido, con un mes puntual elegido y sin buscar: «Este mes» y «Mes
 *    pasado» no aparecen — no se contradicen con el selector de arriba.
 * 4. Prendido, mismo mes puntual, pero BUSCANDO: la búsqueda ignora el filtro
 *    de mes y los grupos de mes pueden volver a aparecer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const flags = vi.hoisted(() => ({ grupos: false }));
vi.mock("@/lib/guias/grupos-fecha-2026-10", async (orig) => {
  const real = await orig<typeof import("@/lib/guias/grupos-fecha-2026-10")>();
  return { ...real, get GUIAS_GRUPOS_FECHA_2026_10() { return flags.grupos; } };
});

import GuiasList from "@/app/despachos/components/GuiasList";
import "@/lib/guias/papel-de-la-guia";
import type { Guia, GuiaItem } from "@/app/despachos/components/types";

// Jueves 22-oct-2026 — ver guias-grupos-fecha-2026-10.test.ts (lib) para el
// porqué de esta fecha: deja al menos una guía en CADA uno de los 7 grupos.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T15:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  flags.grupos = false;
});

function item(over: Partial<GuiaItem> = {}): GuiaItem {
  return {
    id: "i1", orden: 1, cliente: "City Mall", cliente_codigo: "D-25", direccion: "David",
    empresa: "Fashion Wear", facturas: "2520", bultos: 7, numero_guia_transp: "725", ...over,
  } as GuiaItem;
}
function guia(over: Partial<Guia>): Guia {
  return {
    transportista: "RedNblue", modo_entrega: "transportista", transportista_id: "t1", placa: "EK0700",
    observaciones: "", item_count: 1, estado: "Completada", entregado_por: "Julio", receptor_nombre: "Eric",
    cedula: "8-930-2142", numero_guia_transp: "725", total_bultos: 7, guia_items: [item()], ...over,
  } as Guia;
}

const G_HOY = guia({ id: "gHoy", numero: 400, fecha: "2026-10-22" });
const G_AYER = guia({ id: "gAyer", numero: 399, fecha: "2026-10-21" });
const G_ESTA_SEMANA = guia({ id: "gSemana", numero: 398, fecha: "2026-10-19" });
const G_SEMANA_PASADA = guia({ id: "gSemanaPasada", numero: 397, fecha: "2026-10-15" });
const G_ESTE_MES = guia({ id: "gEsteMes", numero: 396, fecha: "2026-10-05" });
const G_MES_PASADO = guia({ id: "gMesPasado", numero: 395, fecha: "2026-09-20", guia_items: [item({ cliente: "Golden Mall", cliente_codigo: "" })] });
const G_ANTERIORES = guia({ id: "gAnteriores", numero: 394, fecha: "2026-07-01" });

const TODAS = [G_HOY, G_AYER, G_ESTA_SEMANA, G_SEMANA_PASADA, G_ESTE_MES, G_MES_PASADO, G_ANTERIORES];

function pintar(props: Record<string, unknown> = {}) {
  render(
    <GuiasList
      guias={TODAS} loading={false} error={null} search="" setSearch={() => {}}
      showPending={false} setShowPending={() => {}} role="admin" onNewGuia={() => {}}
      expandedId={null} expandedGuia={null} expandedLoading={false} onToggleExpand={() => {}}
      onEditar={() => {}} onDespachar={() => {}} onDelete={() => {}} onAtarCliente={() => {}}
      {...props}
    />,
  );
}

/** Los textos de los encabezados de grupo dibujados ahora mismo. */
function encabezados(): string[] {
  return ["Hoy", "Ayer", "Esta semana", "Semana pasada", "Este mes", "Mes pasado", "Anteriores"]
    .filter((label) => screen.queryByText(label) !== null);
}

describe("apagado: la lista de siempre, byte por byte", () => {
  it("cuatro grupos, nunca «Semana pasada» ni «Este/Mes pasado»", () => {
    pintar({ periodo: { year: 2026, mes: 0 } });
    expect(encabezados()).toEqual(["Hoy", "Ayer", "Esta semana", "Anteriores"]);
  });

  it("el encabezado no lleva la separación nueva (sin mayúsculas, sin mt-5)", () => {
    pintar({ periodo: { year: 2026, mes: 0 } });
    const etiqueta = screen.getByText("Hoy");
    expect(etiqueta.className).not.toContain("uppercase");
    const boton = etiqueta.closest("button")!;
    expect(boton.parentElement!.className ?? "").not.toContain("mt-5");
  });
});

describe("prendido: siete grupos, separados", () => {
  beforeEach(() => { flags.grupos = true; });

  it("«Todo el año»: los siete, cada uno con lo suyo", () => {
    pintar({ periodo: { year: 2026, mes: 0 } });
    expect(encabezados()).toEqual([
      "Hoy", "Ayer", "Esta semana", "Semana pasada", "Este mes", "Mes pasado", "Anteriores",
    ]);
  });

  it("el encabezado se separa: mayúsculas con tracking, aire y una línea tenue entre grupos", () => {
    pintar({ periodo: { year: 2026, mes: 0 } });
    expect(screen.getByText("Hoy").className).toContain("uppercase");
    // El corte es una línea tenue (border-gray-100) + aire — nada de cajas ni
    // colores nuevos — y se APAGA en el primer grupo vía `first:` (Tailwind:
    // misma clase en todos los grupos, el pseudo-elemento CSS decide; por
    // eso se verifica la clase, no un className distinto por grupo).
    const grupo = screen.getByText("Ayer").closest("button")!.parentElement!;
    expect(grupo.className).toContain("mt-6");
    expect(grupo.className).toContain("border-t");
    expect(grupo.className).toContain("border-gray-100");
    expect(grupo.className).toContain("first:border-t-0");
  });

  it("un mes puntual, sin buscar: SIN «Este mes» ni «Mes pasado» — no se contradicen con el selector", () => {
    pintar({ periodo: { year: 2026, mes: 10 } });
    const vistos = encabezados();
    expect(vistos).not.toContain("Este mes");
    expect(vistos).not.toContain("Mes pasado");
    // Lo que hubiera sido «Este mes» (gEsteMes, dentro de octubre) se ve
    // igual, solo que bajo «Anteriores» — no desaparece de la lista.
    expect(screen.getAllByText("GT-396").length).toBeGreaterThan(0);
  });

  it("mismo mes puntual, pero BUSCANDO: la búsqueda ignora el filtro y el grupo de mes puede volver", () => {
    // «golden» solo está en gMesPasado (setiembre): fuera de octubre, así que
    // sin buscar ni aparece en la lista — buscando, entra y cae en «Mes pasado».
    pintar({ periodo: { year: 2026, mes: 10 }, search: "golden" });
    expect(encabezados()).toContain("Mes pasado");
    expect(screen.getAllByText("GT-395").length).toBeGreaterThan(0);
  });
});
