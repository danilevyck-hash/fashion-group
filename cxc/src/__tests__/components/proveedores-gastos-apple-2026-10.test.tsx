/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — PROVEEDORES, GASTOS Y CAJA MENUDA «COMO LO HARÍA APPLE»
 * (6-oct-2026).
 *
 * PRENDIDOS el 6-oct-2026 (Daniel aprobó el mockup). Aquí cada pantalla se pinta con
 * `apple` forzado para comprobar que la propuesta se dibuja y que los NÚMEROS
 * son los de siempre (salen de los mismos módulos puros). Apagado, las pruebas
 * de siempre de cada pantalla siguen cuidando lo de hoy.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("next/navigation", () => ({
  usePathname: () => "/proveedores",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin", isOwner: false }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));
vi.mock("@/components/ToastSystem", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/hooks/useUrlState", async () => {
  const { useState } = await import("react");
  return { useUrlState: (_k: string, def: string) => useState(def) };
});

import ProveedoresListClient from "@/app/proveedores/ProveedoresListClient";
import ProveedorDetail from "@/app/proveedores/[key]/ProveedorDetail";
import ResumenEgresos from "@/app/gastos-contabilidad/components/ResumenEgresos";
import DetalleEgresos from "@/app/gastos-contabilidad/components/DetalleEgresos";
import SaldosBancarios from "@/app/gastos-contabilidad/components/saldos/SaldosBancarios";
import PeriodoList from "@/app/caja/components/PeriodoList";
import PeriodoDetailHeader from "@/app/caja/components/PeriodoDetailHeader";
import type { EmpresaEgresosResumen } from "@/app/gastos-contabilidad/components/tipos";
import type { ResumenEgresosMes } from "@/lib/egresos/reglas";
import type { CajaPeriodo } from "@/app/caja/components/types";
import { fmt } from "@/lib/format";
import { repartirEnTramos } from "@/lib/proveedores/tramos";
import { PROVEEDORES_APPLE_2026_10, lineaCartera, lineaUltimoPago, nombreProveedorEnPantalla, contactoRepite } from "@/lib/proveedores/apple-2026-10";
import { capitalizarNombre } from "@/lib/cxc/estado-cuenta-switch";
import { tonoApple } from "@/app/proveedores/TramosApple";
import {
  GASTOS_APPLE_2026_10, aniosDeGastos, mesesDeGastos, lineaPeriodoCaja,
} from "@/lib/egresos/apple-2026-10";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const leer = (p: string) => readFileSync(join(__dirname, "../../..", p), "utf8");
const noop = () => {};

describe("los interruptores", () => {
  // 6-oct-2026: Daniel aprobó el mockup. Lo sin decidir quedó como se propuso:
  // 4 tramos en la ficha, «Cerrar período» en el «···», 2025 como el año más
  // viejo del panel, y Gastos sin rango ni frescura por ahora.
  it("están PRENDIDOS desde el 6-oct-2026 (Daniel aprobó el mockup)", () => {
    expect(PROVEEDORES_APPLE_2026_10).toBe(true);
    expect(GASTOS_APPLE_2026_10).toBe(true);
  });
});

describe("las reglas puras", () => {
  it("la línea de la cartera: sin un cero adentro", () => {
    expect(lineaCartera(31, { debes: 10, a_favor: 0, por_pagar: 10 }, fmt)).toBe("31 proveedores con saldo");
    expect(lineaCartera(1, { debes: 10, a_favor: 4, por_pagar: 6 }, fmt)).toBe("1 proveedor con saldo · Saldo a favor $4.00");
  });
  it("el último pago, o nada", () => {
    expect(lineaUltimoPago(null, 3, fmt)).toBeNull();
    expect(lineaUltimoPago(1200, 13, fmt)).toBe("Último pago $1,200.00 · hace 13 d");
  });
  it("el panel de período nunca ofrece un mes futuro", () => {
    expect(aniosDeGastos("2026-10")).toEqual([2025, 2026]);
    expect(mesesDeGastos(2026, "2026-10")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(mesesDeGastos(2025, "2026-10")).toHaveLength(12);
    expect(mesesDeGastos(2027, "2026-10")).toEqual([]);
  });
  it("la línea del período de caja", () => {
    expect(lineaPeriodoCaja("$200.00", "$163.28", 26)).toBe("Fondo $200.00 · Gastado $163.28 · 26 recibos");
    expect(lineaPeriodoCaja("$200.00", "$0.00", 1)).toContain("1 recibo");
  });
});

// ── Proveedores ─────────────────────────────────────────────────────────────

const T = (a: number, b: number, c: number, d: number) => ({ t0_90: a, t91_120: b, t121_365: c, tMas365: d });
const CARTERA = {
  empresas: [
    {
      empresa_key: "fashion_wear", nombre: "Fashion Wear",
      tramos: T(100, 0, 0, 900), saldo: { debes: 1050, a_favor: 50, por_pagar: 1000 },
      proveedores: [{ key: "afw", nombre: "American Fashion Wear", tramos: T(100, 0, 0, 900), saldo: { debes: 1050, a_favor: 50, por_pagar: 1000 }, tambien_en: [], ultimo_pago_fecha: null, ultimo_pago_dias: null }],
      sin_saldo: [],
    },
    {
      empresa_key: "joystep", nombre: "Joystep",
      tramos: T(234.56, 0, 0, 0), saldo: { debes: 234.56, a_favor: 0, por_pagar: 234.56 },
      proveedores: [{ key: "cb", nombre: "Confecciones Boston", tramos: T(234.56, 0, 0, 0), saldo: { debes: 234.56, a_favor: 0, por_pagar: 234.56 }, tambien_en: [], ultimo_pago_fecha: null, ultimo_pago_dias: null }],
      sin_saldo: [],
    },
  ],
  total: { tramos: T(334.56, 0, 0, 900), saldo: { debes: 1284.56, a_favor: 50, por_pagar: 1234.56 } },
  proveedores_con_saldo: 2,
  synced_at: "2026-10-06T09:30:00Z",
};
const json = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));

describe("Proveedores › lista", () => {
  it("prendido: el total grande es la suma de las empresas, con su línea gris", async () => {
    vi.stubGlobal("fetch", json(CARTERA));
    const { container } = render(<ProveedoresListClient apple />);
    await waitFor(() => expect(container.querySelector("[data-cabecera-apple]")?.textContent).toContain("$1,234.56"));
    const cab = container.querySelector("[data-cabecera-apple]")!;
    expect(cab.textContent).toContain("2 proveedores con saldo · Saldo a favor $50.00");
    expect(screen.getAllByText("Descargar Excel").length).toBeGreaterThan(0);
    // 🔴 Nunca rojo en CxP: el dato es edad, no mora.
    expect(container.innerHTML).not.toMatch(/text-red-|text-amber-/);
  });

  it("apagado: la cabecera de siempre, sin número grande", async () => {
    vi.stubGlobal("fetch", json(CARTERA));
    const { container } = render(<ProveedoresListClient apple={false} />);
    await screen.findAllByText("Fashion Wear");
    expect(container.querySelector("[data-cabecera-apple]")).toBeNull();
  });

  it("un solo h1 en la pantalla, prendida o apagada", () => {
    expect(leer("src/app/proveedores/ProveedoresListClient.tsx").match(/<h1\b/g)).toHaveLength(1);
  });
});

describe("Proveedores v2 (Daniel: «veo desorden»)", () => {
  it("nombres en mayúsculas pasan por la función común; siglas intactas; lo escrito con minúsculas no se toca", () => {
    expect(nombreProveedorEnPantalla("THALIA INTERNACIONAL, S.A.", capitalizarNombre)).toBe("Thalia Internacional, S.A.");
    expect(nombreProveedorEnPantalla("MOVADO GROUP, INC.", capitalizarNombre)).toBe("Movado Group, Inc.");
    expect(nombreProveedorEnPantalla("AMERICAN FASHION WEAR SA", capitalizarNombre)).toBe("American Fashion Wear SA");
    expect(nombreProveedorEnPantalla("American Fashion Wear, SA", capitalizarNombre)).toBe("American Fashion Wear, SA");
  });
  it("el contacto que repite el nombre no se dibuja", () => {
    expect(contactoRepite("American Fashion Wear, SA", "AMERICAN FASHION WEAR SA")).toBe(true);
    expect(contactoRepite("Ana Pérez", "AMERICAN FASHION WEAR SA")).toBe(false);
  });
  it("lo a favor en el verde de la paleta, nunca azul ni rojo", () => {
    expect(tonoApple(-5)).toBe("text-emerald-700");
    expect(tonoApple(5)).not.toMatch(/blue|red|amber/);
  });
  it("«también en» se fue de la lista prendida (queda en la ficha)", async () => {
    const c = { ...CARTERA, empresas: CARTERA.empresas.map((e) => ({ ...e, proveedores: e.proveedores.map((p) => ({ ...p, tambien_en: ["joystep"] })) })) };
    vi.stubGlobal("fetch", json(c));
    const { container } = render(<ProveedoresListClient apple />);
    await screen.findAllByText("Fashion Wear");
    fireEvent.click(screen.getAllByText("Fashion Wear")[0]);
    expect(container.textContent).not.toContain("también en");
    expect(container.innerHTML).not.toContain("text-blue-600 tabular");
  });
});

describe("Proveedores › ficha", () => {
  const AGING = [
    { title: "0-30", saldo: 10 }, { title: "31-60", saldo: 20 }, { title: "61-90", saldo: 30 },
    { title: "91-120", saldo: 40 }, { title: "121-180", saldo: 50 }, { title: "181-270", saldo: 60 },
    { title: "271-365", saldo: 70 }, { title: "Mas de 365", saldo: 80 },
  ];
  const FICHA = {
    key: "afw", nombre: "American Fashion Wear", grafias: [], identificacion: "123", dv: "45",
    direccion: null, contacto: null, telefono: null, celular: null, email: null, tipo_proveedor: null,
    empresas: [
      { empresa: "fashion_wear", por_pagar: 300, ultimo_pago_monto: 1200, ultimo_pago_fecha: "2026-09-23", ultimo_pago_dias: 13 },
      { empresa: "fashion_shoes", por_pagar: 60, ultimo_pago_monto: null, ultimo_pago_fecha: null, ultimo_pago_dias: null },
    ],
    total_grupo: { por_pagar: 360, aging: AGING },
    synced_at: null, reclamos: [],
  };

  it("los cuatro tramos de la lista, la MISMA suma, y sin la fila «Total» repetida", async () => {
    vi.stubGlobal("fetch", json(FICHA));
    const { container } = render(<ProveedorDetail fichaKey="afw" apple />);
    await waitFor(() => expect(container.querySelector("[data-ficha-apple]")).not.toBeNull());
    const t = repartirEnTramos(AGING);
    const tramos = container.querySelector("[data-tramos-ficha]")!.textContent!;
    for (const v of [t.t0_90, t.t91_120, t.t121_365, t.tMas365]) expect(tramos).toContain(`$${fmt(v)}`);
    expect(tramos).not.toContain("181-270");
    expect(container.querySelector("[data-numero-apple]")!.textContent).toContain("$360.00");
    const porEmpresa = container.querySelector("[data-por-empresa-apple]")!;
    expect(porEmpresa.textContent).not.toContain("Total");
    expect(porEmpresa.textContent).toContain("Último pago $1,200.00 · hace 13 d");
    expect(container.innerHTML).not.toMatch(/text-red-|text-amber-/);
  });
});

// ── Gastos ──────────────────────────────────────────────────────────────────

function resumen(totalCent: number, gastoCent = totalCent): ResumenEgresosMes {
  return {
    mes: "2026-01", estado: "con_movimientos",
    totalSalidaCent: totalCent, totalGastoCent: gastoCent, totalNoGastoCent: totalCent - gastoCent,
    cuentasGasto: [{ cuenta: "6.02.01.00.00", corta: "6.02.01", visible: "6.02.01", nombre: "SERVICIOS PROFESIONALES", grupo: "6", esGasto: true, totalCent: gastoCent, renglones: 1, ejemplos: ["DANIEL LEVY"] }],
    cuentasNoGasto: totalCent === gastoCent ? [] : [{ cuenta: "1.01.01.00.00", corta: "1.01.01", visible: "1.01.01", nombre: "BANCO", grupo: "1", esGasto: false, totalCent: totalCent - gastoCent, renglones: 1, ejemplos: [] }],
    renglones: 2, documentos: 2,
  } as ResumenEgresosMes;
}
const EMPRESAS: EmpresaEgresosResumen[] = [
  { empresaKey: "vistana", nombre: "Vistana International", resumen: resumen(10_000), ultimoMesConMovimientos: "2026-01", alDia: { estado: "al_dia", mes: "2026-01" }, descargaAutomatica: true },
  { empresaKey: "confecciones_boston", nombre: "Confecciones Boston", resumen: resumen(20_000), ultimoMesConMovimientos: "2026-01", alDia: { estado: "al_dia", mes: "2026-01" }, descargaAutomatica: false },
];

describe("Gastos › lista", () => {
  it("filas de dos renglones, sin píldora y 🔴 SIN sumar empresas ($100 + $200 ≠ $300 en pantalla)", () => {
    const { container } = render(<ResumenEgresos empresas={EMPRESAS} onAbrir={noop} apple />);
    expect(container.querySelector('[data-lista="gastos-empresas-apple"]')).not.toBeNull();
    expect(container.textContent).toContain("$100.00");
    expect(container.textContent).toContain("$200.00");
    expect(container.textContent).not.toContain("$300");
    expect(screen.queryByText("Al día")).toBeNull();
  });

  it("tocar la fila abre la MISMA empresa", () => {
    const abrir = vi.fn();
    render(<ResumenEgresos empresas={EMPRESAS} onAbrir={abrir} apple />);
    fireEvent.click(screen.getByText("Vistana International"));
    expect(abrir).toHaveBeenCalledWith("vistana");
  });
});

describe("Gastos › empresa", () => {
  it("el Total egresos grande con su línea gris, y sin el total repetido al pie", () => {
    const e = { ...EMPRESAS[0], resumen: resumen(15_000, 10_000) };
    const { container } = render(<DetalleEgresos empresa={e} onVolver={noop} apple />);
    const cab = container.querySelector("[data-cabecera-apple]")!;
    expect(cab.textContent).toContain("$150.00");
    expect(cab.textContent).toContain("Gastos $100.00 · Otros egresos $50.00 · 2 pagos");
    expect(screen.getByText("‹ Volver")).toBeTruthy();
    expect(screen.queryAllByText("Total egresos")).toHaveLength(0);
  });
});

describe("Gastos › saldos de banco", () => {
  it("un solo «Guardar saldo» a la vista, y solo en la fila tocada", () => {
    render(
      <SaldosBancarios
        bancos={[{ empresa_key: "vistana", saldo: 1000, fecha_dato: "2026-10-01" }]}
        historial={{}}
        onGuardado={noop}
        titulo={null}
        apple
      />,
    );
    expect(screen.queryAllByText("Guardar saldo")).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    expect(screen.getAllByText("Guardar saldo")).toHaveLength(1);
    expect(screen.getByText(/Banco General ·/)).toBeTruthy();
  });
});

// ── Caja menuda ─────────────────────────────────────────────────────────────

const PERIODOS: CajaPeriodo[] = [
  { id: "p3", numero: 3, fecha_apertura: "2026-09-02", fecha_cierre: null, fondo_inicial: 200, estado: "abierto", total_gastado: 163.28, recibos: 26 },
  { id: "p2", numero: 2, fecha_apertura: "2026-07-01", fecha_cierre: "2026-09-01", fondo_inicial: 200, estado: "cerrado", total_gastado: 200, recibos: 26 },
];
const listaProps = {
  loading: false, error: null, hasOpenPeriod: true, role: "admin",
  onCreatePeriodo: noop, onLoadDetail: noop, onPrintPeriodo: noop, onClosePeriodo: noop, onDeletePeriodo: noop,
};

describe("Caja menuda › períodos", () => {
  it("el saldo del período ABIERTO grande; 🔴 nunca la suma de los períodos", () => {
    const { container } = render(<PeriodoList periodos={PERIODOS} {...listaProps} apple />);
    const lista = container.querySelector("[data-caja-apple-lista]")!;
    expect(lista.textContent).toContain("$36.72");
    expect(lista.textContent).toContain("Fondo $200.00 · Gastado $163.28 · 26 recibos");
    expect(lista.textContent).not.toContain("$363.28");
    expect(container.querySelectorAll('[data-lista="caja-periodos-apple"] > li')).toHaveLength(2);
  });

  it("la letra y la paleta del sistema: el bloque de la piel existe y las páginas lo prenden con el interruptor", () => {
    expect(leer("src/app/caja/skin.css")).toContain(".skin-caja[data-caja-apple]");
    expect(leer("src/app/caja/page.tsx")).toContain("data-caja-apple={GASTOS_APPLE_2026_10");
    expect(leer("src/app/caja/[periodoId]/page.tsx")).toContain('data-caja-apple={apple ? "" : undefined}');
  });
});

describe("Caja menuda › período", () => {
  const periodo = PERIODOS[0];
  it("«Nuevo gasto» es la acción principal; «Cerrar período» deja de ser un botón a la vista", () => {
    const nuevo = vi.fn();
    const { container } = render(
      <PeriodoDetailHeader
        current={periodo} totalGastado={163.28} saldo={36.72} pctUsed={18.36}
        onBack={noop} onClosePeriodo={noop} onPrint={noop} onExportExcel={noop}
        apple onNuevoGasto={nuevo} recibos={26}
      />,
    );
    fireEvent.click(screen.getByText("Nuevo gasto"));
    expect(nuevo).toHaveBeenCalled();
    expect(screen.queryByText("Cerrar período")).toBeNull();
    const cab = container.querySelector("[data-cabecera-apple]")!;
    expect(cab.textContent).toContain("$36.72");
    expect(cab.textContent).toContain("Fondo $200.00 · Gastado $163.28 · 26 recibos");
  });
});
