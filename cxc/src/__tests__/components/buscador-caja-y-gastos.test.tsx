/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BUSCADOR EN CAJA MENUDA Y EN GASTOS — Y EL TOTAL QUE LO SIGUE (11-sep-2026).
 *
 * Daniel: *«pon buscador a lo que normalmente llevaría buscador, no es tan
 * complicado»*.
 *
 * Dos listas largas que no tenían cómo llegar a un renglón: los **gastos de un
 * período de Caja Menuda** (se busca el taxi, el recibo 4471, los $12.50) y las
 * **cuentas de una empresa en Gastos** (se busca «servicios profesionales» o la
 * referencia de un pago).
 *
 * 🔴 LO QUE ESTE ARCHIVO SOSTIENE:
 *
 *   1. 🔴 **EL TOTAL SIGUE AL FILTRO.** Es la regla general de
 *      `lib/buscar-en-lista.ts` —o el total sigue al filtro, o no hay
 *      buscador— y acá se prueba en las dos pantallas, número por número.
 *   2. 🔴 Y AL LADO DEL TOTAL SE DICE CONTRA QUÉ SE RECORTÓ («3 de 41 gastos»).
 *      Sin eso, un total recortado se lee como el del período entero: es
 *      exactamente la duda que hizo quitarle el buscador a la Planilla.
 *   3. 🔴 NUNCA POR PARECIDO, la regla de la casa. Y se busca por lo que la
 *      persona recuerda: proveedor, categoría, N° de recibo y MONTO en Caja;
 *      nombre, código y referencias en Gastos.
 *   4. 🔴 EN GASTOS, «en N documentos» DESAPARECE mientras se busca — un
 *      documento toca varias cuentas y ese número no se puede recortar. Dejarlo
 *      al lado de un total recortado sería la mezcla que la regla prohíbe.
 *   5. 🔴 LA REGLA DE LA CASA NO SE TOCA: acá se ve UNA empresa, y los gastos de
 *      las 8 nunca se suman entre sí.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// El doble del router: el texto del buscador vive en la URL.
const RUTAS: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (u: string) => RUTAS.push(u),
    replace: (u: string) => RUTAS.push(u),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/caja/p1",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import GastoTable from "@/app/caja/components/GastoTable";
import type { CajaGasto } from "@/app/caja/components/types";
import DetalleEgresos from "@/app/gastos-contabilidad/components/DetalleEgresos";
import type { EmpresaEgresosResumen } from "@/app/gastos-contabilidad/components/tipos";
import type { CuentaEgreso } from "@/lib/egresos/reglas";
import {
  LIMPIAR_BUSQUEDA, PLACEHOLDER_COLABORADOR, PLACEHOLDER_CUENTA, PLACEHOLDER_DESCARGA,
  PLACEHOLDER_GASTO, VACIO_BUSQUEDA, VACIO_CUENTA, VACIO_DESCARGA, VACIO_GASTO,
} from "@/lib/buscar-en-lista";

afterEach(() => { cleanup(); RUTAS.length = 0; vi.unstubAllGlobals(); });

const teclearEn = (placeholder: string, texto: string) =>
  fireEvent.change(screen.getAllByPlaceholderText(placeholder)[0], { target: { value: texto } });

// ═════════════════════════════════════════════════════════════════════════════
// 1. CAJA MENUDA — los gastos de un período
// ═════════════════════════════════════════════════════════════════════════════

const gasto = (o: Partial<CajaGasto>): CajaGasto => ({
  id: "x", periodo_id: "p1", fecha: "2026-08-20", descripcion: "—", proveedor: "",
  nro_factura: "", categoria: "Varios", subtotal: 0, itbms: 0, total: 0, ...o,
} as CajaGasto);

const GASTOS: CajaGasto[] = [
  gasto({ id: "g1", descripcion: "Taxi a la aduana", proveedor: "Uber", categoria: "Transporte", nro_factura: "4471", subtotal: 10, total: 10 }),
  gasto({ id: "g2", descripcion: "Almuerzo del equipo", proveedor: "Niko's Café", categoria: "Alimentación", nro_factura: "8890", subtotal: 25, total: 25 }),
  gasto({ id: "g3", descripcion: "Tornillos", proveedor: "Do It Center", categoria: "Materiales", nro_factura: "1203", subtotal: 12.5, total: 12.5 }),
];

function montarCaja(gastos: CajaGasto[] = GASTOS) {
  render(
    <GastoTable
      gastos={gastos}
      isOpen
      categorias={["Transporte", "Alimentación", "Materiales"]}
      editingGastoId={null}
      editGasto={{}}
      setEditingGastoId={vi.fn()}
      setEditGasto={vi.fn()}
      onSaveEdit={vi.fn()}
      onDeleteGasto={vi.fn()}
    />,
  );
}

describe("🔴 Caja Menuda: el buscador de los gastos del período", () => {
  it("sin búsqueda están los tres y el total es el del período: $47.50", () => {
    montarCaja();
    expect(screen.getAllByText(/Taxi a la aduana/).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("3 registros");
    expect(document.body.textContent).toContain("47.50");
    // Sin búsqueda no se dibuja ningún conteo: un contador permanente es una
    // palabra de más.
    expect(screen.queryByTestId("conteo-busqueda")).toBeNull();
  });

  it("🔴 EL TOTAL SIGUE AL FILTRO: con «uber» queda $10.00, no $47.50", () => {
    montarCaja();
    teclearEn(PLACEHOLDER_GASTO, "uber");
    expect(document.body.textContent).toContain("1 registro");
    expect(document.body.textContent).toContain("10.00");
    expect(document.body.textContent).not.toContain("47.50");
  });

  it("🔴 y DICE contra qué se recortó — sin eso, $10.00 se lee como el período", () => {
    montarCaja();
    teclearEn(PLACEHOLDER_GASTO, "uber");
    expect(screen.getByTestId("conteo-busqueda").textContent).toBe("1 de 3 gastos");
  });

  it("busca por PROVEEDOR, CATEGORÍA, N° de recibo y MONTO", () => {
    for (const [q, quien] of [["do it", /Tornillos/], ["alimenta", /Almuerzo/], ["4471", /Taxi/], ["12.5", /Tornillos/]] as const) {
      montarCaja();
      teclearEn(PLACEHOLDER_GASTO, q);
      expect(screen.getAllByText(quien).length).toBeGreaterThan(0);
      expect(screen.getByTestId("conteo-busqueda").textContent).toBe("1 de 3 gastos");
      cleanup();
    }
  });

  it("🔴 NUNCA POR PARECIDO: un typo no encuentra a nadie", () => {
    montarCaja();
    teclearEn(PLACEHOLDER_GASTO, "ubre");
    expect(screen.getByText(new RegExp(VACIO_GASTO))).toBeTruthy();
  });

  it("🔴 los CHIPS de categoría describen lo que la búsqueda dejó", () => {
    montarCaja();
    expect(screen.getAllByText(/Transporte/).length).toBeGreaterThan(0);
    teclearEn(PLACEHOLDER_GASTO, "alimenta");
    // Solo queda la categoría del gasto que sobrevivió.
    expect(screen.queryAllByText(/Transporte/).length).toBe(0);
    expect(screen.getAllByText(/Alimentación/).length).toBeGreaterThan(0);
  });

  it("sin resultados lo dice UNA vez y ofrece la salida", () => {
    montarCaja();
    teclearEn(PLACEHOLDER_GASTO, "zzzz");
    expect(screen.getAllByText(new RegExp(VACIO_GASTO))).toHaveLength(1);
    // 🔴 Y no se repite encima el vacío de siempre, que diría otra cosa.
    expect(screen.queryByText(/Sin gastos registrados/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: LIMPIAR_BUSQUEDA }));
    expect(screen.getAllByText(/Taxi a la aduana/).length).toBeGreaterThan(0);
  });

  it("🔴 el texto viaja en la URL con `buscar=`", () => {
    montarCaja();
    teclearEn(PLACEHOLDER_GASTO, "uber");
    expect(RUTAS.some((r) => r.includes("buscar=uber"))).toBe(true);
  });

  it("con el período vacío no se dibuja el buscador: no hay nada que buscar", () => {
    montarCaja([]);
    expect(screen.queryAllByPlaceholderText(PLACEHOLDER_GASTO)).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. GASTOS (Egresos Varios) — las cuentas de UNA empresa
// ═════════════════════════════════════════════════════════════════════════════

const cuenta = (o: Partial<CuentaEgreso>): CuentaEgreso => ({
  cuenta: "6.00.00.00.00", corta: "6.00.00", visible: "6.00", nombre: null,
  grupo: "6", esGasto: true, totalCent: 0, renglones: 1, ejemplos: [], ...o,
});

const CUENTAS_GASTO: CuentaEgreso[] = [
  cuenta({ cuenta: "6.02.01.00.00", corta: "6.02.01", visible: "6.02.01", nombre: "SERVICIOS PROFESIONALES", totalCent: 500_00, renglones: 3, ejemplos: ["DANIEL LEVY"] }),
  cuenta({ cuenta: "6.03.98.00.00", corta: "6.03.98", visible: "6.03.98", nombre: "GASTO DE TARJETA DE CREDITO", totalCent: 300_00, renglones: 2, ejemplos: ["MUNICIOIO DE PANAMA"] }),
];
const CUENTAS_NO_GASTO: CuentaEgreso[] = [
  cuenta({ cuenta: "2.01.04.02.00", corta: "2.01.04", visible: "2.01.04.02", nombre: "PLANILLA POR PAGAR", grupo: "2", esGasto: false, totalCent: 200_00, renglones: 1, ejemplos: ["TRANSFERENCIA"] }),
];

const EMPRESA: EmpresaEgresosResumen = {
  empresaKey: "vistana",
  nombre: "Vistana",
  ultimoMesConMovimientos: "2026-08",
  alDia: { estado: "al_dia", mes: "2026-08" },
  descargaAutomatica: true,
  resumen: {
    mes: "2026-08",
    estado: "con_movimientos",
    totalSalidaCent: 1000_00,
    totalGastoCent: 800_00,
    totalNoGastoCent: 200_00,
    cuentasGasto: CUENTAS_GASTO,
    cuentasNoGasto: CUENTAS_NO_GASTO,
    renglones: 6,
    documentos: 5,
  },
};

const montarGastos = () => render(<DetalleEgresos empresa={EMPRESA} />);

describe("🔴 Gastos: el buscador de las cuentas de una empresa", () => {
  it("sin búsqueda, los totales del mes tal como los mandó el servidor", () => {
    montarGastos();
    expect(document.body.textContent).toContain("1,000.00");
    expect(document.body.textContent).toContain("800.00");
    expect(document.body.textContent).toContain("200.00");
    expect(document.body.textContent).toContain("6 pagos");
    expect(document.body.textContent).toContain("en 5 documentos");
  });

  it("🔴 EL TOTAL SIGUE AL FILTRO: con «profesionales» todo baja a $500.00", () => {
    montarGastos();
    teclearEn(PLACEHOLDER_CUENTA, "profesionales");
    expect(document.body.textContent).toContain("500.00");
    expect(document.body.textContent).not.toContain("1,000.00");
    expect(document.body.textContent).not.toContain("800.00");
    // 3 de los 6 pagos son de esa cuenta.
    expect(document.body.textContent).toContain("3 pagos");
  });

  it("🔴 y DICE contra qué se recortó", () => {
    montarGastos();
    teclearEn(PLACEHOLDER_CUENTA, "profesionales");
    expect(screen.getByTestId("conteo-busqueda").textContent).toBe("1 de 3 cuentas");
  });

  it("🔴 «en N documentos» DESAPARECE mientras se busca: no se puede recortar", () => {
    montarGastos();
    teclearEn(PLACEHOLDER_CUENTA, "profesionales");
    expect(document.body.textContent).not.toContain("documentos");
  });

  it("«Salió» sigue siendo gasto + no gasto también cuando se busca", () => {
    montarGastos();
    // «PAGAR» está en la cuenta que NO es gasto; «TARJETA» en una de gasto.
    teclearEn(PLACEHOLDER_CUENTA, "pagar");
    expect(document.body.textContent).toContain("200.00");
    // 🔴 Sin cuentas de gasto a la vista, «De eso, gastos» vale cero y el total
    // que salió es el de la única cuenta que quedó.
    expect(document.body.textContent).not.toContain("800.00");
  });

  it("busca por NOMBRE, por CÓDIGO y por la REFERENCIA del pago", () => {
    for (const [q, esperado] of [
      ["tarjeta", /GASTO DE TARJETA DE CREDITO/],
      ["6.02.01", /SERVICIOS PROFESIONALES/],
      ["municioio", /GASTO DE TARJETA DE CREDITO/],
    ] as const) {
      montarGastos();
      teclearEn(PLACEHOLDER_CUENTA, q);
      expect(screen.getAllByText(esperado).length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("sin resultados lo dice, y no queda ningún total suelto en pantalla", () => {
    montarGastos();
    teclearEn(PLACEHOLDER_CUENTA, "zzzz");
    expect(screen.getByText(new RegExp(VACIO_CUENTA))).toBeTruthy();
    expect(screen.queryByText(/Total que salió/)).toBeNull();
    // 🔴 Y no se dice «nada de eso fue un gasto», que sería falso del mes.
    expect(screen.queryByText(/nada de eso fue un gasto/)).toBeNull();
  });

  it("🔴 la regla de la casa no se toca: acá no aparece ninguna otra empresa", () => {
    montarGastos();
    expect(screen.getAllByText("Vistana").length).toBeGreaterThan(0);
    for (const otra of ["Fashion Wear", "Active Shoes", "Joystep", "Multifashion"]) {
      expect(screen.queryByText(otra)).toBeNull();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. BOSTON › PRÉSTAMOS — 31 fichas de tres empresas, y ningún filtro
// ═════════════════════════════════════════════════════════════════════════════

const FICHAS_BOSTON = {
  empleados: [
    { id: "a", nombre: "ALEJANDRA CAMAÑO", empresa: "Confecciones Boston", deduccionQuincenal: 25, prestado: 200, pagado: 100, saldo: 100, pct: 50, ultimoMovimiento: "2026-08-20" },
    { id: "b", nombre: "ANDREA PEREZ", empresa: "Vistana", deduccionQuincenal: 50, prestado: 400, pagado: 200, saldo: 200, pct: 50, ultimoMovimiento: "2026-08-21" },
    { id: "c", nombre: "JULIO MONTERO", empresa: "Fashion Wear", deduccionQuincenal: 0, prestado: 300, pagado: 300, saldo: 0, pct: 100, ultimoMovimiento: "2026-07-02" },
  ],
  totales: { saldo: 300, conSaldo: 2, personas: 3 },
};

async function montarBoston() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => FICHAS_BOSTON }) as unknown as Response));
  const { default: PrestamosBoston } = await import("@/app/boston/tabs/PrestamosBoston");
  render(<PrestamosBoston />);
  await screen.findByText(/ANDREA PEREZ/);
}

describe("🔴 Boston › Préstamos: el buscador y las tres tarjetas", () => {
  it("sin búsqueda están los tres y las tarjetas son las del servidor", async () => {
    await montarBoston();
    expect(document.body.textContent).toContain("$300.00");
    expect(screen.getAllByText(/JULIO MONTERO/).length).toBeGreaterThan(0);
  });

  it("🔴 LAS TARJETAS SIGUEN AL FILTRO: con «andrea» el por cobrar es $200.00", async () => {
    await montarBoston();
    teclearEn(PLACEHOLDER_COLABORADOR, "andrea");
    expect(screen.queryAllByText(/JULIO MONTERO/).length).toBe(0);
    expect(document.body.textContent).toContain("$200.00");
    expect(document.body.textContent).not.toContain("$300.00");
    expect(screen.getByTestId("conteo-busqueda").textContent).toBe("1 de 3 colaboradores");
  });

  it("🔴 «Con saldo» usa el MISMO criterio del servidor: saldo distinto de cero", async () => {
    await montarBoston();
    // Julio ya pagó todo: se ve, pero no cuenta como «con saldo».
    teclearEn(PLACEHOLDER_COLABORADOR, "julio");
    const tarjetas = screen.getByText("Con saldo").parentElement!;
    expect(tarjetas.textContent).toContain("0");
  });

  it("también busca por EMPRESA: son las tres empresas juntas, a propósito", async () => {
    await montarBoston();
    teclearEn(PLACEHOLDER_COLABORADOR, "vistana");
    expect(screen.getAllByText(/ANDREA PEREZ/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/ALEJANDRA CAMAÑO/).length).toBe(0);
  });

  it("sin resultados lo dice y no repite «No hay préstamos activos»", async () => {
    await montarBoston();
    teclearEn(PLACEHOLDER_COLABORADOR, "zzzz");
    expect(screen.getByText(new RegExp(VACIO_BUSQUEDA))).toBeTruthy();
    expect(screen.queryByText(/No hay préstamos activos/)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. PLANTILLA SWITCH › HISTORIAL — 140 descargas y un solo desplegable
// ═════════════════════════════════════════════════════════════════════════════

const DESCARGAS = {
  rows: [
    { id: "1", usuario: "Angela", empresa: "Vistana", marca: "CALVIN KLEIN", cantidad_estilos: 12, total_unidades: 340, total_costo: 100, created_at: "2026-08-20T15:00:00Z", tiene_archivo: true, archivo_nombre: "a.xlsx" },
    { id: "2", usuario: "andrea", empresa: "Fashion Wear", marca: "TOMMY HILFIGER", cantidad_estilos: 30, total_unidades: 900, total_costo: 200, created_at: "2026-08-21T15:00:00Z", tiene_archivo: true, archivo_nombre: "b.xlsx" },
    { id: "3", usuario: "Angela", empresa: "Facturas Tienda", marca: "VARIOS", cantidad_estilos: 5, total_unidades: 40, total_costo: 30, created_at: "2026-07-02T15:00:00Z", tiene_archivo: false, archivo_nombre: null },
  ],
};

async function montarHistorial() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => DESCARGAS }) as unknown as Response));
  const { default: HistorialView } = await import("@/app/productos/cargar/HistorialView");
  render(<HistorialView />);
  await screen.findAllByText(/TOMMY HILFIGER/);
}

describe("🔴 Plantilla Switch › Historial: buscar entre 140 descargas", () => {
  it("busca por MARCA", async () => {
    await montarHistorial();
    teclearEn(PLACEHOLDER_DESCARGA, "tommy");
    expect(screen.queryAllByText(/CALVIN KLEIN/).length).toBe(0);
    expect(screen.getAllByText(/TOMMY HILFIGER/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("conteo-busqueda").textContent).toBe("1 de 3 descargas");
  });

  it("y por QUIÉN la hizo", async () => {
    await montarHistorial();
    teclearEn(PLACEHOLDER_DESCARGA, "andrea");
    expect(screen.getAllByText(/TOMMY HILFIGER/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/CALVIN KLEIN/).length).toBe(0);
  });

  it("🔴 y por COMPAÑÍA con el nombre que se VE: «Facturas Tienda» es Multifashion", async () => {
    await montarHistorial();
    teclearEn(PLACEHOLDER_DESCARGA, "multifashion");
    expect(screen.getAllByText(/VARIOS/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/TOMMY HILFIGER/).length).toBe(0);
  });

  it("⚠️ acá no hay ningún total que seguir: la pantalla no suma nada", async () => {
    await montarHistorial();
    teclearEn(PLACEHOLDER_DESCARGA, "tommy");
    expect(document.body.textContent).not.toMatch(/Total/i);
  });

  it("sin resultados lo dice y ofrece la salida", async () => {
    await montarHistorial();
    teclearEn(PLACEHOLDER_DESCARGA, "zzzz");
    expect(screen.getByText(new RegExp(VACIO_DESCARGA))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: LIMPIAR_BUSQUEDA }));
    expect(screen.getAllByText(/TOMMY HILFIGER/).length).toBeGreaterThan(0);
  });
});
