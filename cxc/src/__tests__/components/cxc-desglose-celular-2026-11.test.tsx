// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — la hoja del celular con el DESGLOSE POR EMPRESA (12-nov-2026,
// `CXC_DESGLOSE_CELULAR_2026_11`; Daniel aprobó la «Variante B»).
//
// Lo que se protege:
//   1. Una fila por empresa con 0-90 · 91-120 · +120 · Total, sin centavos.
//   2. La fila de Total suma, al centavo, el total del cliente.
//   3. «Vistana International» sale «Vistana»; las demás, completas.
//   4. «Enviar estado de cuenta» despliega las MISMAS cuatro salidas.
//   5. Ni una sola vez la palabra «vencido» (es edad, no mora).
//   6. Sin `desglose`, la hoja es la de siempre (la computadora no cambia).
//
// Fixture: D-25 · City Mall Paso Canoa, el cliente más grande (cifras de la
// base, las mismas de `cxc-celular.test.tsx`).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import HojaCobrar from "@/app/cxc/components/HojaCobrar";
import { HISTORIAL_CLIENTE_2026_11 } from "@/lib/cxc/historial-cliente";
import { empresasDelCliente } from "@/lib/cxc/lista-celular";
import {
  CXC_DESGLOSE_CELULAR_2026_11,
  montoDeTabla,
  nombreCortoEmpresa,
  totalDelDesglose,
} from "@/lib/cxc/desglose-celular-2026-11";
import { COMPANIES } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";

type Emp = ConsolidatedClient["companies"][string];

function emp(cur: number, watch: number, over: number, extra: Partial<Emp> = {}): Emp {
  return {
    nombre: "City Mall Paso Canoa",
    codigo: "D-25",
    d0_30: cur, d31_60: 0, d61_90: 0,
    d91_120: watch,
    d121_180: over, d181_270: 0, d271_365: 0, mas_365: 0,
    total: Math.round((cur + watch + over) * 100) / 100,
    ...extra,
  };
}

const EMPRESAS: Record<string, Emp> = {
  fashion_wear: emp(218795.86, 5579.91, 0, {
    ultimoPagoFecha: "2026-08-20", ultimoPagoMonto: 63592.11,
    ultimaCompraFecha: "2026-09-23", ultimaCompraMonto: 20762.28,
  }),
  fashion_shoes: emp(98365.22, 23695.7, 43643.91, { ultimoPagoFecha: "2026-08-20", ultimoPagoMonto: 37561.4 }),
  active_shoes: emp(82167.6, 47692.93, 0, { ultimoPagoFecha: "2026-08-20", ultimoPagoMonto: 47227.35 }),
  vistana: emp(83044.84, 14390.84, 0, { ultimoPagoFecha: "2026-08-20", ultimoPagoMonto: 85808.35 }),
  active_wear: emp(7146.88, 15464.97, 2732.37, { ultimoPagoFecha: "2026-06-29", ultimoPagoMonto: 2732.37 }),
  joystep: emp(7555.15, 0, 0),
};

const PASO_CANOA = {
  nombre_normalized: "CITY MALL PASO CANOA",
  companies: EMPRESAS,
  correo: "", telefono: "", celular: "", contacto: "",
  total: 650276.18, current: 0, watch: 0, overdue: 0,
  d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d121_plus: 0,
  hasOverride: false,
} as unknown as ConsolidatedClient;

const NOMBRES = Object.fromEntries(COMPANIES.map((c) => [c.key, c.name]));
const FILAS = empresasDelCliente(PASO_CANOA, NOMBRES, {});

beforeEach(() => {
  // jsdom no trae `localStorage`, y `ModalOverlay` lo lee.
  if (!("localStorage" in window) || !window.localStorage) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    });
  }
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

function abrir(desglose: typeof FILAS | null) {
  return render(
    <HojaCobrar
      client={PASO_CANOA}
      onClose={() => {}}
      onProgramarCorreo={() => {}}
      onWhatsApp={() => {}}
      onCopiar={() => {}}
      onEscribirloYo={() => {}}
      marcaEnvio={null}
      totalDeLaFila={PASO_CANOA.total}
      hrefDocumentos="/cxc/cliente/D-25"
      desglose={desglose}
    />,
  );
}

describe("🔴 el desglose del celular", () => {
  it("el interruptor está prendido", () => {
    expect(CXC_DESGLOSE_CELULAR_2026_11).toBe(true);
  });

  it("una fila por empresa, ordenadas por saldo, con los tramos de la computadora", () => {
    expect(FILAS.map((f) => f.key)).toEqual([
      "fashion_wear", "fashion_shoes", "active_shoes", "vistana", "active_wear", "joystep",
    ]);
    const fs_ = FILAS.find((f) => f.key === "fashion_shoes")!;
    expect([fs_.current, fs_.watch, fs_.overdue, fs_.total]).toEqual([98365.22, 23695.7, 43643.91, 165704.83]);
    expect(FILAS[0].ultimaCompra).toEqual({ fecha: "2026-09-23", monto: 20762.28 });
    expect(FILAS.find((f) => f.key === "joystep")!.ultimoPago).toBeNull();
  });

  it("🔴 el Total suma, al centavo, lo que debe el cliente", () => {
    const t = totalDelDesglose(FILAS);
    expect(Math.round(t.total * 100)).toBe(Math.round(PASO_CANOA.total * 100));
    expect(Math.round((t.current + t.watch + t.overdue) * 100)).toBe(Math.round(t.total * 100));
  });

  it("montos sin centavos y el cero se ve", () => {
    expect(montoDeTabla(218795.86)).toBe("218,796");
    expect(montoDeTabla(0)).toBe("0");
    expect(montoDeTabla(-1208.4)).toBe("-1,208");
  });

  it("solo Vistana se acorta", () => {
    expect(nombreCortoEmpresa("vistana", "Vistana International")).toBe("Vistana");
    expect(nombreCortoEmpresa("fashion_shoes", "Fashion Shoes")).toBe("Fashion Shoes");
  });

  it("la hoja: nombre de título, total con centavos, tabla y Total", () => {
    abrir(FILAS);
    expect(screen.getByRole("heading").textContent).toBe("City Mall Paso Canoa");
    expect(screen.getByText("$650,276.18")).toBeTruthy();
    expect(screen.getByText("Desglose por empresa (6)")).toBeTruthy();
    const filas = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    expect(filas.some((t) => t.startsWith("Vistana83,04514,391097,436"))).toBe(true);
    expect(filas.at(-1)).toBe("Total497,076106,82446,376650,276");
    expect(document.body.textContent).toContain("Últ. pago $63,592");
    expect(document.body.textContent).toContain("Últ. compra $20,762");
    expect(screen.queryByText(/Último pago/)).toBeNull();
    expect(screen.getByText("Ver ficha completa ›").getAttribute("href")).toBe("/cxc/cliente/D-25");
  });

  it("«Enviar estado de cuenta» despliega las cuatro salidas y «Editar mensaje»", () => {
    abrir(FILAS);
    expect(screen.queryByText("Correo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Estado de cuenta" }));
    for (const t of ["Correo", "WhatsApp", "Copiar mensaje", "Descargar PDF", "Editar mensaje ›"]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
  });

  it("🔴 nunca dice «vencido»", () => {
    abrir(FILAS);
    fireEvent.click(screen.getByRole("button", { name: "Estado de cuenta" }));
    expect(document.body.textContent?.toLowerCase()).not.toContain("vencid");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/cxc/desglose-celular-2026-11.ts"), "utf8");
    expect(src.toLowerCase()).not.toContain("vencid");
  });

  it("sin desglose la hoja es la de siempre (la computadora no cambia)", () => {
    abrir(null);
    // Revisión 110 (n.º 21): un solo nombre.
    expect(screen.getByRole("heading").textContent).toBe("Estado de cuenta");
    expect(screen.getByText("Correo")).toBeTruthy();
    expect(screen.queryByText(/Desglose por empresa/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO (18-nov-2026) — «Últ. compra» dice SOLO el monto y los días.
// Daniel: «solamente tienes que poner el monto de la última compra, sin más
// datos. Para ver cada compra es solamente al seleccionar el monto». El #830
// le había pegado «N facturas · rango · NC» y la hoja se deslizaba a la derecha.
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 «Últ. compra» = monto · N d (18-nov-2026)", () => {
  const DOCS = [
    { secuencial: "11-000003153", tipo: "Factura", total: 7128, dia: "2026-10-23" },
    { secuencial: "11-000003154", tipo: "Factura", total: 1471.5, dia: "2026-10-23" },
    { secuencial: "13-000000151", tipo: "Nota de Crédito", total: 0, dia: "2026-10-23" },
  ];
  const CON_DOCS = {
    ...PASO_CANOA,
    companies: {
      ...EMPRESAS,
      fashion_wear: { ...EMPRESAS.fashion_wear, ultimaCompraMonto: 8599.5, ultimaCompraDocumentos: DOCS },
    },
  } as unknown as ConsolidatedClient;

  it("la línea no lleva «facturas», fechas ni «NC»; «Últ. compra» se toca (historial, 19-nov-2026)", () => {
    render(
      <HojaCobrar
        client={CON_DOCS}
        onClose={() => {}}
        onProgramarCorreo={() => {}}
        onWhatsApp={() => {}}
        onCopiar={() => {}}
        onEscribirloYo={() => {}}
        marcaEnvio={null}
        totalDeLaFila={CON_DOCS.total}
        hrefDocumentos="/cxc/cliente/D-25"
        desglose={empresasDelCliente(CON_DOCS, NOMBRES, {})}
      />,
    );
    const lineas = [...document.querySelectorAll("td")].filter((td) => td.textContent?.includes("Últ. compra"));
    expect(lineas.length).toBeGreaterThan(0);
    for (const td of lineas) {
      // Con `HISTORIAL_CLIENTE_2026_11` la línea entera es un enlace y termina en «›».
      expect(td.textContent).toMatch(/Últ\. compra (\$[\d,]+ · \d+ d ?›?|—)$/);
      expect(td.textContent).not.toMatch(/factura|\bNC\b|\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/i);
      // Nunca vuelve a forzar una sola línea: eso deslizaba la hoja.
      expect(td.className).not.toContain("whitespace-nowrap");
    }
    expect(screen.queryByText("Total de la compra")).toBeNull();
    if (HISTORIAL_CLIENTE_2026_11) {
      // Tocar abre el historial de compras de ESA empresa (la hoja trae sus datos al abrir).
      const boton = document.querySelector('button[data-historial="compras"]');
      expect(boton?.textContent).toContain("Últ. compra $8,600");
    } else {
      fireEvent.click(screen.getByRole("button", { name: "$8,600" }));
      expect(screen.getByText("Total de la compra")).toBeTruthy();
    }
  });
});
