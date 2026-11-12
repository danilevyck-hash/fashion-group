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
    fireEvent.click(screen.getByText("Enviar estado de cuenta"));
    for (const t of ["Correo", "WhatsApp", "Copiar mensaje", "Descargar PDF", "Editar mensaje ›"]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
  });

  it("🔴 nunca dice «vencido»", () => {
    abrir(FILAS);
    fireEvent.click(screen.getByText("Enviar estado de cuenta"));
    expect(document.body.textContent?.toLowerCase()).not.toContain("vencid");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/cxc/desglose-celular-2026-11.ts"), "utf8");
    expect(src.toLowerCase()).not.toContain("vencid");
  });

  it("sin desglose la hoja es la de siempre (la computadora no cambia)", () => {
    abrir(null);
    expect(screen.getByRole("heading").textContent).toBe("Enviar estado de cuenta");
    expect(screen.getByText("Correo")).toBeTruthy();
    expect(screen.queryByText(/Desglose por empresa/)).toBeNull();
  });
});
