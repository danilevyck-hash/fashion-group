// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — «Últimos pagos» se abre con UN clic desde la fila CERRADA.
//
// Daniel vio el bloque adentro del panel expandido (commit 0db570f3) y dijo,
// textual (4-sep-2026): *"lo quiero ahí mismo pero con un botón para expandir,
// no solo al expandir el card, tendría que hacer dos expandir para verlo"*.
//
// Lo que se protege, pintando de verdad las dos pantallas del grupo:
//  1. En la fila cerrada hay un botón «Últimos pagos» (escritorio y celular).
//     Sin el botón, este archivo se pone rojo.
//  2. Un clic en el botón trae los pagos y los muestra, y el cliente sigue
//     CERRADO: abrir los pagos no es expandir.
//  3. La consulta se dispara recién al clic —nunca al pintar la lista de los
//     211— y cerrar/abrir no vuelve a pedir.
//  4. Expandir el cliente NO trae los pagos: el bloque vive en UN solo lugar
//     (la sub-fila del botón), no también adentro del panel. Dos lugares eran
//     dos estados del mismo dato.
//  5. Boston conserva su botón (el mismo archivo) y su lectura APARTE.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import type { ConsolidatedClient } from "@/lib/types";
import type { Company } from "@/lib/companies";

vi.mock("@/components/shared/SyncStatus", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));
vi.mock("@/lib/vendors", () => ({ VENDOR_MAP: {} }));

import ClientTable from "@/app/admin/components/ClientTable";
import PanelCxcMobile from "@/app/admin/components/PanelCxcMobile";
import { ContextMenuProvider } from "@/components/ui";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const EMPRESAS: Company[] = [
  { key: "fashion_wear", name: "Fashion Wear" },
  { key: "fashion_shoes", name: "Fashion Shoes" },
] as Company[];

const vacio = { d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0 };

const CLIENTE: ConsolidatedClient = {
  nombre_normalized: "CITY MALL PASO CANOA",
  companies: {
    fashion_wear: {
      nombre: "City Mall Paso Canoa", codigo: "D-25", ...vacio,
      d0_30: 100000, total: 100000,
      ultimoPagoFecha: "2026-08-20", ultimoPagoMonto: 63592.15,
    },
    fashion_shoes: {
      nombre: "City Mall Paso Canoa", codigo: "D-25", ...vacio,
      d0_30: 500, total: 500,
      ultimoPagoFecha: null, ultimoPagoMonto: null,
    },
  },
  correo: "", telefono: "", celular: "", contacto: "", resultado_contacto: "",
  total: 100500, current: 100500, watch: 0, overdue: 0,
  d0_30: 100500, d31_60: 0, d61_90: 0, d91_120: 0, d121_plus: 0,
  hasOverride: false,
} as unknown as ConsolidatedClient;

/** Lo que contesta `/api/cxc/ultimos-pagos?codigo=D-25`: tres en una empresa,
 *  ninguno en la otra. */
const RESPUESTA = {
  porEmpresa: {
    fashion_wear: [
      { fecha: "2026-08-20", monto: 63592.15 },
      { fecha: "2026-07-22", monto: 187651.51 },
      { fecha: "2026-06-29", monto: 117777.33 },
    ],
    fashion_shoes: [],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => RESPUESTA }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** El acordeón más cercano que envuelve a `el`: abierto = `1fr`. */
function acordeonAbierto(el: HTMLElement): boolean {
  let n: HTMLElement | null = el;
  while (n) {
    if (n.style && n.style.gridTemplateRows) return n.style.gridTemplateRows === "1fr";
    n = n.parentElement;
  }
  throw new Error("no está adentro de un AccordionContent");
}

// ─────────────────────────── ESCRITORIO ───────────────────────────

function pintarEscritorio() {
  const noop = () => {};
  render(
    <ContextMenuProvider>
      <ClientTable
        filtered={[CLIENTE]}
        roleCompanies={EMPRESAS}
        roleClients={[CLIENTE]}
        companyFilter="all"
        setCompanyFilter={noop}
        riskFilter="all"
        search=""
        sortKey="total"
        sortDir="desc"
        toggleSort={noop}
        sortArrow={() => ""}
        userRole="admin"
        onOpenEmail={noop}
        onWhatsApp={noop}
        onCopyMessage={noop}
        onOpenEstado={noop}
      />
    </ContextMenuProvider>,
  );
}

const boton = () => screen.getByRole("button", { name: "Últimos pagos de CITY MALL PASO CANOA" });
const panelCliente = () => screen.getByText("Ver ficha completa ›");

describe("CXC escritorio — la fila cerrada", () => {
  it("🔴 tiene el botón «Últimos pagos», cerrado, y al pintar la lista NO pide nada", () => {
    pintarEscritorio();
    expect(boton().getAttribute("aria-expanded")).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(acordeonAbierto(panelCliente())).toBe(false);
  });

  it("🔴 UN clic trae los 3 pagos por empresa y el cliente sigue CERRADO", async () => {
    pintarEscritorio();
    fireEvent.click(boton());
    expect(boton().getAttribute("aria-expanded")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/cxc/ultimos-pagos?codigo=D-25");

    const subfila = await screen.findByTestId("ultimos-pagos-CITY MALL PASO CANOA");
    await waitFor(() => expect(within(subfila).getAllByRole("listitem").length).toBe(3));
    expect(acordeonAbierto(subfila)).toBe(true);
    expect(within(subfila).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "20 ago 2026 · $63,592.15",
      "22 jul 2026 · $187,651.51",
      "29 jun 2026 · $117,777.33",
    ]);
    // Un bloque POR EMPRESA: la que no tiene pagos lo dice, no se mezcla.
    expect(within(subfila).getByText("Fashion Wear", { exact: false })).toBeTruthy();
    expect(within(subfila).getByText("Sin pagos registrados")).toBeTruthy();

    // El panel del cliente (desglose + acciones) NO se abrió: un clic, no dos.
    expect(acordeonAbierto(panelCliente())).toBe(false);
  });

  it("cerrar y volver a abrir no vuelve a pedir", async () => {
    pintarEscritorio();
    fireEvent.click(boton());
    await screen.findAllByRole("listitem");
    fireEvent.click(boton());
    expect(boton().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(boton());
    expect(boton().getAttribute("aria-expanded")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("🔴 expandir el cliente NO trae los pagos: el bloque vive solo en la sub-fila del botón", () => {
    pintarEscritorio();
    fireEvent.click(screen.getByText("CITY MALL PASO CANOA"));
    expect(acordeonAbierto(panelCliente())).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    // Y adentro del panel no hay un segundo bloque «Últimos pagos».
    const panel = panelCliente().closest("div.space-y-3")!;
    expect(within(panel).queryByText("Últimos pagos")).toBeNull();
    // El botón de la fila sigue disponible con el cliente abierto.
    expect(boton().getAttribute("aria-expanded")).toBe("false");
  });
});

// ───────────────────────────── CELULAR ─────────────────────────────

function pintarCelular() {
  const noop = () => {};
  render(
    <PanelCxcMobile
      filtered={[CLIENTE]}
      roleClients={[CLIENTE]}
      cxcCompanies={EMPRESAS}
      search=""
      setSearch={noop}
      riskFilter="all"
      setRiskFilter={noop}
      companyFilter="all"
      setCompanyFilter={noop}
      favorites={new Set()}
      onToggleFavorite={noop}
      onOpenEmail={noop}
      onWhatsApp={noop}
      onCopyMessage={noop}
      onOpenEstado={noop}
      canExport={false}
      onExportarCsv={noop}
      empresaRestriction={null}
    />,
  );
}

describe("CXC celular — la tarjeta cerrada", () => {
  it("🔴 tiene el botón, y UN toque trae los pagos sin expandir la tarjeta", async () => {
    pintarCelular();
    expect(boton().getAttribute("aria-expanded")).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
    // Cerrada: el desglose no está.
    expect(screen.queryByText(/Desglose por empresa/)).toBeNull();

    fireEvent.click(boton());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Adentro de la tarjeta (la lista de clientes de afuera también es un <ul>).
    const tarjeta = boton().closest("article")!;
    await waitFor(() => expect(within(tarjeta).getAllByRole("listitem").length).toBe(3));
    expect(within(tarjeta).getByText("Sin pagos registrados")).toBeTruthy();
    // Sigue cerrada.
    expect(screen.queryByText(/Desglose por empresa/)).toBeNull();
  });

  it("🔴 expandir la tarjeta NO trae los pagos ni repite el bloque", () => {
    pintarCelular();
    fireEvent.click(screen.getByText("CITY MALL PASO CANOA"));
    expect(screen.getByText(/Desglose por empresa/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    // El título del bloque es un <p>; el botón de la fila también dice
    // «Últimos pagos» y ese sí tiene que estar.
    const titulos = screen.queryAllByText("Últimos pagos").filter((e) => e.tagName === "P");
    expect(titulos).toEqual([]);
  });
});

// ─────────────────────── UN SOLO LUGAR, Y BOSTON APARTE ───────────────────────

describe("el bloque vive en un solo lugar por cartera", () => {
  it("el panel expandido (escritorio y celular) ya no lo monta", () => {
    const panel = leer("src/app/admin/components/ContactPanel.tsx");
    expect(panel).not.toMatch(/<UltimosPagos|useUltimosPagosGrupo\(/);
    const movil = leer("src/app/admin/components/PanelCxcMobile.tsx");
    const expandido = movil.slice(movil.indexOf("function MobileClientExpanded("));
    expect(expandido).not.toMatch(/<UltimosPagos|useUltimosPagosGrupo\(/);
  });

  it("el botón es UNO (`BotonUltimosPagos`), es dibujo puro, y lo usan las tres carteras", () => {
    const btn = leer("src/components/cxc/BotonUltimosPagos.tsx");
    expect(btn).not.toMatch(/fetch\(|useUltimosPagos\w*\(|supabase/);
    expect(btn).toContain("min-h-[44px]");
    for (const f of [
      "src/app/admin/components/ClientTable.tsx",
      "src/app/admin/components/PanelCxcMobile.tsx",
      "src/components/cxc/BostonTab.tsx",
    ]) {
      expect(leer(f), f).toContain('from "@/components/cxc/BotonUltimosPagos"');
      expect(leer(f), f).not.toContain("function BotonUltimosPagos");
    }
  });

  it("🔴 el grupo lee por SU hook y Boston por el SUYO — sin cruzarse", () => {
    const fila = leer("src/app/admin/components/UltimosPagosFila.tsx");
    expect(fila).toContain("useUltimosPagosGrupo(codigo, abierto)");
    expect(fila).not.toContain("useUltimosPagosBoston");
    const boston = leer("src/components/cxc/BostonTab.tsx");
    expect(boston).toContain("useUltimosPagosBoston(clienteSwitchId)");
    expect(boston).not.toContain("useUltimosPagosGrupo");
    expect(boston).not.toContain("UltimosPagosFila");
  });
});
