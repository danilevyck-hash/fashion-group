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
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔄 CAMBIÓ DE DIRECCIÓN EL 5-sep-2026, y no se borró.
//
// El botón desapareció con el rediseño de Cuentas por Cobrar, pero **el
// problema que lo motivó sigue resuelto y este archivo lo sigue vigilando**:
// no hay que hacer «dos expandir» para ver los pagos, y no hay dos lugares
// donde se dibujen.
//
// Qué cambió y por qué. El bloque se agrupaba POR EMPRESA, y medido contra
// producción los clientes grandes le pagan a varias empresas EL MISMO DÍA —el
// 29-jun-2026, D-25 pagó $241.857,77 repartido en las SEIS—: eran **18 líneas
// para decir lo que dicen 3**, en una sub-fila aparte. Ahora los pagos se
// agrupan POR FECHA y viven DENTRO del panel expandido, junto al desglose por
// empresa. Con eso, «abrir el cliente» ya trae todo: el botón extra sobraba.
//
// Lo que este archivo exige hoy:
//  1. No queda ni un rastro del botón ni de su sub-fila.
//  2. El panel abierto trae los pagos, en UN solo lugar, y con UNA lectura.
//  3. La consulta se dispara al ABRIR, nunca al pintar la lista de los 100.
//  4. Boston sigue leyendo por SU camino, sin cruzarse con el del grupo.
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

import ClientTable from "@/app/cxc/components/ClientTable";
import PanelCxcMobile from "@/app/cxc/components/PanelCxcMobile";
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

/** Lo que contesta `/api/cxc/ultimos-pagos?codigo=D-25`: las 3 últimas FECHAS
 *  en que pagó, con el total del día y en qué empresas. */
const RESPUESTA = {
  porFecha: [
    { fecha: "2026-08-20", monto: 234189.21, empresas: ["fashion_wear", "fashion_shoes"] },
    { fecha: "2026-07-29", monto: 70129.85, empresas: ["fashion_wear"] },
    { fecha: "2026-07-22", monto: 187651.51, empresas: ["fashion_wear"] },
  ],
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

const noop = () => {};
const sinAviso = () => null;

// ─────────────────────────── ESCRITORIO ───────────────────────────

function pintarEscritorio() {
  render(
    <ContextMenuProvider>
      <ClientTable
        filtered={[CLIENTE]}
        roleCompanies={EMPRESAS}
        companyFilter="all"
        toggleSort={noop}
        sortArrow={() => ""}
        onCobrar={noop}
        onOpenEstado={noop}
        seleccion={new Set()}
        onSeleccionar={noop}
        onSeleccionarTodos={noop}
        avisoSinPagarDe={sinAviso}
        marcaEnvioDe={sinAviso}
      />
    </ContextMenuProvider>,
  );
}

function pintarCelular() {
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
      onOpenEstado={noop}
      onCobrar={noop}
      sinPagar={null}
      sinPagarActivo={false}
      onToggleSinPagar={noop}
      avisoSinPagarDe={sinAviso}
      marcaEnvioDe={sinAviso}
      canExport={false}
      onExportarCsv={noop}
      empresaRestriction={null}
    />,
  );
}

/** Las peticiones a la ruta de los últimos pagos (y solo ésas). */
const pedidosDePagos = () =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/cxc/ultimos-pagos"));

describe("🩸 el botón «Últimos pagos ›» y su sub-fila ya no existen", () => {
  it("no está en el escritorio", () => {
    pintarEscritorio();
    expect(screen.queryByRole("button", { name: /Últimos pagos de/ })).toBeNull();
  });

  it("no está en el celular", () => {
    pintarCelular();
    expect(screen.queryByRole("button", { name: /Últimos pagos de/ })).toBeNull();
  });

  it("ni queda el componente que lo dibujaba", () => {
    expect(fs.existsSync(path.join(RAIZ, "src/components/cxc/BotonUltimosPagos.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(RAIZ, "src/app/cxc/components/UltimosPagosFila.tsx"))).toBe(false);
  });
});

describe("🔴 con la lista pintada NO se pide nada", () => {
  it("escritorio: cero lecturas hasta que alguien abra un cliente", () => {
    pintarEscritorio();
    expect(pedidosDePagos()).toHaveLength(0);
  });

  it("celular: igual", () => {
    pintarCelular();
    expect(pedidosDePagos()).toHaveLength(0);
  });
});

describe("🔴 abrir el cliente trae los pagos — UN clic, y en UN solo lugar", () => {
  it("escritorio: al expandir salen las TRES FECHAS con su total y sus empresas", async () => {
    pintarEscritorio();
    fireEvent.click(screen.getByTitle("CITY MALL PASO CANOA"));
    await waitFor(() => expect(pedidosDePagos()).toHaveLength(1));
    await screen.findByText(/20 ago/);
    const bloque = screen.getByText("Últimos pagos").parentElement!;
    const lineas = within(bloque).getAllByRole("listitem").map((li) => li.textContent);
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toContain("$234,189.21");
    expect(lineas[0]).toContain("Fashion Wear");
    expect(lineas[0]).toContain("Fashion Shoes");
  });

  it("🔴 el bloque se dibuja UNA sola vez, no dos", async () => {
    pintarEscritorio();
    fireEvent.click(screen.getByTitle("CITY MALL PASO CANOA"));
    await screen.findByText(/20 ago/);
    expect(screen.getAllByText("Últimos pagos")).toHaveLength(1);
  });

  it("celular: al abrir la tarjeta pasa lo mismo, con UNA sola lectura", async () => {
    pintarCelular();
    fireEvent.click(screen.getByText("Ver detalle"));
    await waitFor(() => expect(pedidosDePagos()).toHaveLength(1));
    await screen.findByText(/20 ago/);
    expect(screen.getAllByText("Últimos pagos")).toHaveLength(1);
  });

  it("cerrar y volver a abrir no vuelve a pedir", async () => {
    pintarEscritorio();
    const fila = screen.getByTitle("CITY MALL PASO CANOA");
    fireEvent.click(fila);
    await waitFor(() => expect(pedidosDePagos()).toHaveLength(1));
    fireEvent.click(fila);
    fireEvent.click(fila);
    await waitFor(() => expect(screen.getAllByText("Últimos pagos").length).toBe(1));
    expect(pedidosDePagos()).toHaveLength(1);
  });
});

describe("🔴 Boston lee por SU camino, sin cruzarse con el del grupo", () => {
  it("su cajón usa el hook de Boston; el grupo, el suyo", () => {
    const cajonBoston = leer("src/components/cxc/BostonDocumentosDrawer.tsx");
    expect(cajonBoston).toContain("useUltimosPagosBoston");
    expect(cajonBoston).not.toContain("useUltimosPagosGrupo");

    const panelGrupo = leer("src/app/cxc/components/ContactPanel.tsx");
    expect(panelGrupo).toContain("useUltimosPagosGrupo");
    expect(panelGrupo).not.toContain("useUltimosPagosBoston");

    expect(leer("src/app/cxc/hooks/useUltimosPagosGrupo.ts")).toContain("/api/cxc/ultimos-pagos");
    expect(leer("src/components/cxc/useUltimosPagosBoston.ts")).toContain("/api/cxc/boston/ultimos-pagos");
  });
});
