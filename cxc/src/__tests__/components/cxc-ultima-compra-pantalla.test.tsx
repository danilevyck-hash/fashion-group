/**
 * CANDADO DE PANTALLA — el CXC dice "última compra" al lado de "último pago",
 * y NUNCA muestra un pago de $0,00.
 *
 * 🩸 POR QUÉ RENDERIZA DE VERDAD, y no alcanza con probar la ruta: el bug que
 * Daniel cazó era lo que se LEE ("ultimo pago 0.00 hace 15 dias"), y el CXC lo
 * dibuja en DOS pantallas distintas con dos formateadores propios — la tabla del
 * escritorio (ContactPanel) y la tarjeta del celular (PanelCxcMobile). Un dato
 * bien traído que solo llega a una de las dos se ve normal y es una pantalla
 * mintiendo. Acá se pintan las dos y se leen las celdas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import React from "react";
import type { ConsolidatedClient } from "@/lib/types";
import type { Company } from "@/lib/companies";

// El banner de frescura y el botón de sync salen a la red: no son lo que se
// prueba acá y en jsdom solo agregan ruido.
vi.mock("@/components/shared/SyncStatus", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));
// `useAdminData` importa VENDOR_MAP de lib/vendors, que arrastra el cliente de
// Supabase del SERVIDOR y revienta al cargarse sin las env vars. Acá se prueba
// el join del hook, no el mapa de vendedores.
vi.mock("@/lib/vendors", () => ({ VENDOR_MAP: {} }));

import ContactPanel from "@/app/cxc/components/ContactPanel";
import PanelCxcMobile from "@/app/cxc/components/PanelCxcMobile";

const EMPRESAS: Company[] = [
  { key: "fashion_wear", name: "Fashion Wear" },
  { key: "fashion_shoes", name: "Fashion Shoes" },
] as Company[];

const vacio = { d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0 };

/** El cliente REAL del reporte de Daniel: CITY MALL PASO CANOA (D-25).
 *  fashion_wear tiene pago y compra; fashion_shoes no tiene ninguno de los dos. */
const CLIENTE: ConsolidatedClient = {
  nombre_normalized: "CITY MALL PASO CANOA",
  companies: {
    fashion_wear: {
      nombre: "City Mall Paso Canoa", codigo: "D-25", ...vacio,
      d0_30: 100000, total: 100000,
      ultimoPagoFecha: "2026-07-22", ultimoPagoMonto: 187651.51,
      ultimaCompraFecha: "2026-08-11", ultimaCompraMonto: 6968.38,
    },
    fashion_shoes: {
      nombre: "City Mall Paso Canoa", codigo: "D-25", ...vacio,
      d0_30: 500, total: 500,
      ultimoPagoFecha: null, ultimoPagoMonto: null,
      ultimaCompraFecha: null, ultimaCompraMonto: null,
    },
  },
  correo: "", telefono: "", celular: "", contacto: "", resultado_contacto: "",
  total: 100500, current: 100500, watch: 0, overdue: 0,
  d0_30: 100500, d31_60: 0, d61_90: 0, d91_120: 0, d121_plus: 0,
  hasOverride: false,
} as unknown as ConsolidatedClient;

// ─────────────────────────── ESCRITORIO ───────────────────────────

function pintarEscritorio() {
  return render(
    <ContactPanel client={CLIENTE} companyFilter="all" roleCompanies={EMPRESAS} />,
  );
}

describe("ContactPanel (escritorio) — el desglose por empresa", () => {
  it("🔴 tiene la columna Última compra al lado de Último pago", () => {
    pintarEscritorio();
    const encabezados = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(encabezados).toContain("Último pago");
    expect(encabezados).toContain("Última compra");
    // Al lado, no en cualquier lugar: es la lectura que pidió Daniel.
    expect(encabezados.indexOf("Última compra")).toBe(encabezados.indexOf("Último pago") + 1);
  });

  it("muestra el monto de la última FACTURA de esa empresa", () => {
    pintarEscritorio();
    const fila = screen.getByText("Fashion Wear").closest("tr")!;
    expect(within(fila).getByText(/6,968\.38/)).toBeTruthy();
    // Y el pago bueno sigue ahí: los dos conviven en la misma fila.
    expect(within(fila).getByText(/187,651\.51/)).toBeTruthy();
  });

  it("🔴 sin compras registradas dice '—', no $0.00 ni una fecha vacía", () => {
    pintarEscritorio();
    const fila = screen.getByText("Fashion Shoes").closest("tr")!;
    // Las dos últimas celdas (último pago y última compra) van en guion.
    const celdas = within(fila).getAllByRole("cell");
    expect(celdas[celdas.length - 1].textContent).toBe("—");
    expect(celdas[celdas.length - 2].textContent).toBe("—");
    expect(fila.textContent).not.toContain("$0.00");
  });

  it("el título de la columna explica que las notas de crédito no son compras", () => {
    pintarEscritorio();
    const th = screen.getAllByRole("columnheader").find((e) => e.textContent === "Última compra")!;
    expect(th.getAttribute("title")).toMatch(/notas de crédito no son compras/i);
  });
});

// ───────────────────────────── CELULAR ─────────────────────────────

function pintarCelular() {
  const noop = () => {};
  render(
    <PanelCxcMobile
      onCobrar={noop}
      sinPagar={null}
      sinPagarActivo={false}
      onToggleSinPagar={noop}
      avisoSinPagarDe={() => null}
      marcaEnvioDe={() => null}
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
  // El desglose por empresa vive dentro de la tarjeta desplegada.
  fireEvent.click(screen.getByText("CITY MALL PASO CANOA"));
}

describe("🔄 PanelCxcMobile (celular) — el desglose se acortó (5-sep-2026)", () => {
  // Cada empresa llevaba DOS renglones de prosa más («Último pago $X · hace N
  // días» y «Última compra …»): con seis empresas eran 12 líneas de texto en
  // una tarjeta de 390 px, y encima los últimos pagos vivían en OTRO botón con
  // 18 líneas más. Con el rediseño, esa información se dice en el bloque
  // «Últimos pagos» agrupado POR FECHA —3 líneas para lo que ocupaba 42— y el
  // desglose por empresa quedó en nombre + total + los tres tramos.
  //
  // ⚠️ La columna «Última compra» del ESCRITORIO no se tocó: sigue arriba, con
  // su tooltip, y sus tests siguen verdes. Lo que se acortó es el celular.
  it("la tarjeta abierta ya no repite dos renglones de texto por empresa", () => {
    pintarCelular();
    expect(screen.queryByText(/Último pago \$187,651\.51/)).toBeNull();
    expect(screen.queryByText(/Última compra \$6,968\.38/)).toBeNull();
  });

  it("🔴 y nunca dice $0.00 — ni antes ni ahora", () => {
    pintarCelular();
    expect(document.body.textContent).not.toContain("Última compra $0.00");
    expect(document.body.textContent).not.toContain("Último pago $0.00");
  });

  it("🔴 el dato NO se perdió: lo dice el bloque «Últimos pagos», por fecha", () => {
    const movil = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "src/app/cxc/components/PanelCxcMobile.tsx"), "utf8");
    expect(movil).toContain("<UltimosPagosPorFecha");
    expect(movil).toContain("useUltimosPagosGrupo");
  });

  it("el desglose por empresa conserva el nombre, el total y los tres tramos", () => {
    pintarCelular();
    expect(screen.getAllByText("Fashion Wear").length).toBeGreaterThan(0);
    expect(screen.getByText(/Desglose por empresa/)).toBeTruthy();
  });
});

describe("useAdminData — el join de la última compra con la cartera", () => {
  const AGING = {
    rows: [{
      company_key: "fashion_wear", codigo: "D-25", nombre: "City Mall Paso Canoa",
      nombre_normalized: "CITY MALL PASO CANOA",
      d0_30: 100000, d31_60: 0, d61_90: 0, d91_120: 0,
      d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0, total: 100000,
      correo: "", telefono: "", celular: "", contacto: "",
    }],
  };
  const PAGOS = [{ empresa_key: "fashion_wear", cliente_codigo: "D-25", ultimo_pago_fecha: "2026-07-22", ultimo_pago_monto: 187651.51 }];
  const COMPRAS = [{ empresa_key: "fashion_wear", cliente_codigo: "D-25", ultima_compra_fecha: "2026-08-11", ultima_compra_monto: 6968.38 }];

  const pedidas: string[] = [];
  let compras: unknown = COMPRAS;

  beforeEach(() => {
    pedidas.length = 0;
    compras = COMPRAS;
    vi.stubGlobal("fetch", (url: string) => {
      pedidas.push(url);
      const cuerpo = url.startsWith("/api/cxc/aging") ? AGING
        : url.startsWith("/api/cxc/ultimo-pago") ? PAGOS
        : url.startsWith("/api/cxc/ultima-compra") ? compras
        : [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) } as Response);
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  async function clienteDelHook() {
    const { default: useAdminData } = await import("@/app/cxc/hooks/useAdminData");
    // `provider` nuevo: sin él la caché de SWR se comparte entre tests.
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children);
    const { result } = renderHook(() => useAdminData(true), { wrapper });
    await waitFor(() => expect(result.current.clients.length).toBe(1));
    return result.current.clients[0].companies.fashion_wear;
  }

  it("🔴 pide /api/cxc/ultima-compra", async () => {
    await clienteDelHook();
    expect(pedidas.some((u) => u.startsWith("/api/cxc/ultima-compra"))).toBe(true);
  });

  it("🔴 pega la última compra al cliente por empresa+código", async () => {
    const fw = await clienteDelHook();
    expect(fw.ultimaCompraFecha).toBe("2026-08-11");
    expect(fw.ultimaCompraMonto).toBe(6968.38);
    // Y no se pisa con el último pago: son dos datos distintos.
    expect(fw.ultimoPagoFecha).toBe("2026-07-22");
    expect(fw.ultimoPagoMonto).toBe(187651.51);
  });

  it("sin la DDL corrida (respuesta []) el CXC sigue entero, solo sin la columna", async () => {
    compras = [];
    const fw = await clienteDelHook();
    expect(fw.ultimaCompraFecha).toBeNull();
    expect(fw.total).toBe(100000);
    expect(fw.ultimoPagoMonto).toBe(187651.51);
  });
});
