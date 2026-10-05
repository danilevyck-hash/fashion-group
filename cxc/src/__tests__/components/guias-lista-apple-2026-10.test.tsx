/**
 * CANDADO · GUÍAS: LA LISTA, EL DETALLE Y ETIQUETAS › ENVÍOS ESTILO APPLE
 * (4-oct-2026, `GUIAS_LISTA_APPLE_2026_10`; prendida el 5-oct-2026, Daniel: «sigue»).
 *
 * 1. Apagado, nada cambia: la fila abre el acordeón y el aviso ámbar sigue.
 * 2. Prendido: «N guías hoy · M pendientes de despacho» arriba; las pendientes
 *    de CUALQUIER fecha en su sección aunque el período sea otro mes; el resto
 *    sigue al período, salvo al buscar; un toque lleva a la guía.
 * 3. Etiquetas: «N envíos hoy · M pendientes de guía» y tarjetas en el celular.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const flags = vi.hoisted(() => ({ apple: false }));
vi.mock("@/lib/guias/lista-apple-2026-10", async (orig) => {
  const real = await orig<typeof import("@/lib/guias/lista-apple-2026-10")>();
  return { ...real, get GUIAS_LISTA_APPLE_2026_10() { return flags.apple; } };
});

import GuiasList from "@/app/guias/components/GuiasList";
import EtiquetasPorEnvio from "@/app/guias/components/EtiquetasPorEnvio";
import "@/lib/guias/papel-de-la-guia";
import type { Guia, GuiaItem } from "@/app/guias/components/types";
import type { EtiquetaFila } from "@/lib/guias/etiquetas";
import * as real from "@/lib/guias/lista-apple-2026-10";

const { aniosConGuias, enElPeriodo, resumenDeEnvios, resumenDeGuias } = real;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T15:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  flags.apple = false;
});

describe("las cuentas", () => {
  // 5-oct-2026: Daniel aprobó las capturas («sigue») y el interruptor se prendió.
  // Antes este caso exigía `false`.
  it("el interruptor está prendido (aprobado el 5-oct-2026)", async () => {
    const mod = await vi.importActual<typeof import("@/lib/guias/lista-apple-2026-10")>("@/lib/guias/lista-apple-2026-10");
    expect(mod.GUIAS_LISTA_APPLE_2026_10).toBe(true);
  });
  it("período: mes exacto, o todo el año con mes 0", () => {
    expect(enElPeriodo("2026-10-01", { year: 2026, mes: 10 })).toBe(true);
    expect(enElPeriodo("2026-09-30", { year: 2026, mes: 10 })).toBe(false);
    expect(enElPeriodo("2026-01-15", { year: 2026, mes: 0 })).toBe(true);
    expect(enElPeriodo("2025-12-31", { year: 2026, mes: 0 })).toBe(false);
    expect(enElPeriodo(null, { year: 2026, mes: 0 })).toBe(false);
  });
  it("años: los que tienen guías, nunca el futuro, siempre el año en curso", () => {
    expect(aniosConGuias(["2025-03-01", "2027-01-01", null, "2026-10-01"], 2026)).toEqual([2025, 2026]);
    expect(aniosConGuias([], 2026)).toEqual([2026]);
  });
  it("resúmenes: lo de hoy y lo pendiente; sin pendientes no hay segunda parte", () => {
    expect(resumenDeGuias([{ fecha: "2026-10-04" }, { fecha: "2026-10-03" }], 1, "2026-10-04"))
      .toEqual({ hoy: "1 guía hoy", pendientes: "1 pendiente de despacho" });
    expect(resumenDeGuias([], 0, "2026-10-04")).toEqual({ hoy: "0 guías hoy", pendientes: null });
    const dia = (iso: string) => iso.slice(0, 10);
    expect(resumenDeEnvios(
      [{ creado_en: "2026-10-04T10", guia_numero: null }, { creado_en: "2026-10-04T11", guia_numero: 5 }, { creado_en: "2026-09-01", guia_numero: null }],
      "2026-10-04", dia,
    )).toEqual({ hoy: "2 envíos hoy", pendientes: "2 pendientes de guía" });
  });
});

// ─── La lista ────────────────────────────────────────────────────────────────

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

const HOY = guia({ id: "gHoy", numero: 250, fecha: "2026-10-04" });
const SEP = guia({ id: "gSep", numero: 240, fecha: "2026-09-18", guia_items: [item({ cliente: "Golden Mall", cliente_codigo: "" })] });
const PEND_VIEJA = guia({ id: "gPend", numero: 230, fecha: "2026-08-20", estado: "Pendiente Bodega" });

function pintar(props: Record<string, unknown> = {}) {
  const onDespachar = vi.fn();
  const onToggleExpand = vi.fn();
  render(
    <GuiasList
      guias={[HOY, SEP, PEND_VIEJA]} loading={false} error={null} search="" setSearch={() => {}}
      showPending={false} setShowPending={() => {}} role="admin" onNewGuia={() => {}}
      expandedId={null} expandedGuia={null} expandedLoading={false} onToggleExpand={onToggleExpand}
      onEditar={() => {}} onDespachar={onDespachar} onDelete={() => {}} onAtarCliente={() => {}}
      {...props}
    />,
  );
  return { onDespachar, onToggleExpand };
}
const filaDe = (numero: string) =>
  screen.getAllByText(numero)[0].closest("button") as HTMLButtonElement;

describe("la lista", () => {
  it("apagado: la de hoy (acordeón y aviso ámbar), aunque llegue un período", () => {
    const { onToggleExpand, onDespachar } = pintar({ periodo: { year: 2026, mes: 10 } });
    expect(document.querySelector("[data-resumen-guias]")).toBeNull();
    expect(screen.getByText(/1 guía sin despachar/)).toBeTruthy();
    fireEvent.click(filaDe("GT-250"));
    expect(onToggleExpand).toHaveBeenCalledWith("gHoy");
    expect(onDespachar).not.toHaveBeenCalled();
  });

  it("prendido: resumen arriba, pendientes de cualquier fecha, el resto sigue al período", () => {
    flags.apple = true;
    pintar({ periodo: { year: 2026, mes: 10 } });
    expect(document.querySelector("[data-resumen-guias]")?.textContent).toBe("1 guía hoy · 1 pendiente de despacho");
    expect(screen.queryByText(/sin despachar/)).toBeNull();
    expect(screen.getByText("Pendientes de despacho")).toBeTruthy();
    expect(screen.getAllByText("GT-230").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GT-250").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("GT-240")).toHaveLength(0);
    expect(screen.queryByText(/Ver guías más viejas/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Despachar" })).toBeNull();
  });

  it("prendido: buscar encuentra fuera del período", () => {
    flags.apple = true;
    pintar({ periodo: { year: 2026, mes: 10 }, search: "golden" });
    expect(screen.getAllByText("GT-240").length).toBeGreaterThan(0);
  });

  it("prendido: un toque abre la guía, no el acordeón", () => {
    flags.apple = true;
    const { onDespachar, onToggleExpand } = pintar({ periodo: { year: 2026, mes: 10 } });
    fireEvent.click(filaDe("GT-250"));
    expect(onDespachar).toHaveBeenCalledWith("gHoy");
    expect(onToggleExpand).not.toHaveBeenCalled();
  });
});

// ─── Etiquetas › envíos ──────────────────────────────────────────────────────

function etq(over: Partial<EtiquetaFila>): EtiquetaFila {
  return {
    id: 1, empresa_key: "fashion_shoes", empresa: "Fashion Shoes", switch_factura_id: 1,
    secuencial: "11-000000001", fecha_factura: "2026-10-04", cliente_codigo: "D-7", cliente_nombre: "Nova Lux",
    destino: "Paso Canoas", cajas: 4, creado_en: "2026-10-04T10:00:00-05:00", guia_numero: null,
    envio_id: "e1", orden_en_envio: 1, nota: null, ...over,
  } as EtiquetaFila;
}

function servir(etiquetas: EtiquetaFila[]) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etiquetas }) })));
}

describe("Etiquetas › envíos", () => {
  const FILAS = [etq({}), etq({ id: 2, envio_id: "e2", secuencial: "11-000000002", guia_numero: 250, creado_en: "2026-10-01T10:00:00-05:00" })];

  it("apagado: chips con su cuenta, sin resumen ni tarjetas", async () => {
    servir(FILAS);
    render(<EtiquetasPorEnvio />);
    await waitFor(() => expect(screen.getByText("Pendientes de guía · 1")).toBeTruthy());
    expect(document.querySelector("[data-resumen-envios]")).toBeNull();
    expect(document.querySelector("[data-envios-tarjetas]")).toBeNull();
  });

  it("prendido: «1 envío hoy · 1 pendiente de guía», chips sin cuenta y tarjetas", async () => {
    flags.apple = true;
    servir(FILAS);
    render(<EtiquetasPorEnvio />);
    await waitFor(() => expect(document.querySelector("[data-resumen-envios]")?.textContent).toBe("1 envío hoy · 1 pendiente de guía"));
    expect(screen.getByRole("button", { name: "Pendientes de guía" })).toBeTruthy();
    expect(document.querySelectorAll("[data-envios-tarjetas] li")).toHaveLength(1);
    expect(document.querySelector("[data-envios-tarjetas]")?.textContent).toContain("Nova Lux");
  });

  // 5-oct-2026, Daniel: «poné Nuevo envío al nivel» — igual que «Nueva guía».
  it("prendido: «Nuevo envío» con el mismo texto, estilo y ancho de contenido que «Nueva guía»", async () => {
    flags.apple = true;
    servir(FILAS);
    const { container } = render(<EtiquetasPorEnvio />);
    const boton = await screen.findByRole("button", { name: "Nuevo envío" });
    const nuevaGuia = "text-sm bg-black text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all";
    expect(boton.className.startsWith(nuevaGuia)).toBe(true);
    expect(boton.parentElement!.className).toBe("flex items-center justify-end mb-6 flex-wrap gap-4");
    expect((container.firstElementChild as HTMLElement).className).toContain("max-w-6xl");
  });
});
