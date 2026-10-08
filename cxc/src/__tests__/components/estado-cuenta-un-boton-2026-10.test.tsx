// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — UN SOLO BOTÓN «ESTADO DE CUENTA» (7-oct-2026, propuesta).
//
// Hoy hay DOS botones para el mismo trabajo en tres pantallas: la tarjeta del
// CXC (`ContactPanel`), la tarjeta del celular (`PanelCxcMobile`) y la ficha
// del cliente (`ClienteDetail` + `CobrarEnFicha`). Con el interruptor
// `ESTADO_CUENTA_UN_BOTON_2026_10` PRENDIDO queda uno solo, que abre
// `HojaCobrar`; el cajón de solo lectura (`EstadoCuentaDrawer`) deja de
// abrirse desde ahí.
//
// Este candado prende el interruptor con un mock del módulo —Daniel todavía
// no dijo que sí— para medir el resultado sin tocar el valor real.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import type { ConsolidatedClient } from "@/lib/types";
import type { Company } from "@/lib/companies";

vi.mock("@/lib/cxc/estado-cuenta-un-boton-2026-10", () => ({ ESTADO_CUENTA_UN_BOTON_2026_10: true }));
vi.mock("@/components/shared/SyncStatus", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

import ContactPanel from "@/app/cxc/components/ContactPanel";
import PanelCxcMobile from "@/app/cxc/components/PanelCxcMobile";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const EMPRESAS: Company[] = [{ key: "fashion_wear", name: "Fashion Wear" }] as Company[];
const vacio = { d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0 };

const CLIENTE: ConsolidatedClient = {
  nombre_normalized: "CITY MALL PASO CANOA",
  companies: {
    fashion_wear: {
      nombre: "City Mall Paso Canoa", codigo: "D-25", ...vacio,
      d0_30: 1000, total: 1000,
      ultimoPagoFecha: null, ultimoPagoMonto: null,
      ultimaCompraFecha: null, ultimaCompraMonto: null,
    },
  },
  correo: "", telefono: "", celular: "", contacto: "", resultado_contacto: "",
  total: 1000, current: 1000, watch: 0, overdue: 0,
  d0_30: 1000, d31_60: 0, d61_90: 0, d91_120: 0, d121_plus: 0,
  hasOverride: false,
} as unknown as ConsolidatedClient;

const noop = () => {};

describe("🔴 ContactPanel (tarjeta del CXC, computadora)", () => {
  it("prendido: UN solo botón «Estado de cuenta», sin el outline de solo lectura", () => {
    render(
      <ContactPanel
        client={CLIENTE}
        companyFilter="all"
        roleCompanies={EMPRESAS}
        onCobrar={noop}
        onOpenEstado={noop}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Estado de cuenta" })).toHaveLength(1);
    // «Ver ficha completa ›» se queda: no es el mismo trabajo, lleva a OTRA pantalla.
    expect(screen.getByText("Ver ficha completa ›")).toBeTruthy();
  });
});

describe("🔴 PanelCxcMobile (tarjeta del celular)", () => {
  function pintar() {
    return render(
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
        onCobrar={noop}
        onOpenEstado={noop}
        sinPagar={null}
        sinPagarActivo={false}
        onToggleSinPagar={noop}
        avisoSinPagarDe={() => null}
        marcaEnvioDe={() => null}
        canExport={false}
        onDescargar={noop}
        empresaRestriction={null}
      />,
    );
  }

  it("prendido: la tarjeta cerrada dice «Estado de cuenta» (no «Enviar estado de cuenta»)", () => {
    pintar();
    expect(screen.getAllByRole("button", { name: "Estado de cuenta" }).length).toBeGreaterThan(0);
  });

  it("prendido: al expandir, el outline de solo lectura no está (solo quedan los DOS «Estado de cuenta»: el de la tarjeta cerrada y el del detalle)", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    expect(screen.getAllByRole("button", { name: "Estado de cuenta" })).toHaveLength(2);
  });
});

describe("🔴 la ficha del cliente: el enlace al cajón de solo lectura se retira", () => {
  it("ClienteDetail guarda el enlace detrás del interruptor", () => {
    const src = leer("src/app/clientes/[codigo]/ClienteDetail.tsx");
    expect(src).toMatch(/!ESTADO_CUENTA_UN_BOTON_2026_10[\s\S]{0,40}veCxc[\s\S]{0,40}documentos_con_saldo/);
  });

  it("CobrarEnFicha no abre EstadoCuentaDrawer con el interruptor prendido", () => {
    const src = leer("src/app/clientes/[codigo]/CobrarEnFicha.tsx");
    expect(src).toMatch(/!ESTADO_CUENTA_UN_BOTON_2026_10[\s\S]{0,40}<EstadoCuentaDrawer/);
  });
});
