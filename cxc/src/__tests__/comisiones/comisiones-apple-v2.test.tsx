// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — COMISIONES «COMO LO HARÍA APPLE», v2 (6-oct-2026). APAGADO.
//
// La MISMA pantalla con las reglas de docs/diseno.md y las piezas aprobadas
// (número grande con línea gris, dos renglones con ›, `LineaDeFrescura`, un
// solo «Descargar»). Ver `lib/comisiones/apple-v2.ts`.
//
// Lo que sostiene:
//   1. Nace APAGADO y `false` = la pantalla de hoy (rollback por código).
//   2. 🔴 NINGÚN CÁLCULO CAMBIA: el número grande dice el MISMO total del pie
//      (`sumarPagable`), y el módulo puro no suma nada.
//   3. DEFAULT y Daniel Levy siguen detrás de «Mostrar no pagables».
//   4. El detalle se abre DEBAJO también en una empresa.
//   5. UN «Descargar» en la computadora, en el celular y en el detalle.
//   6. Sin pestañas: un selector de empresa y el ⚙.
//   7. El total va arriba sin barra negra al pie (lo que cuidaba la «1b» y
//      `iphone-comisiones-encabezado`), y la portada del celular no suma filas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act, within, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import {
  COMISIONES_APPLE_V2_2026_10,
  empresasDeLaFila,
  lineaBajoElTotal,
  segundaLineaEmpresa,
  segundaLineaMatriz,
  type ResumenDelTotal,
} from "@/lib/comisiones/apple-v2";
import { ComisionesView } from "@/components/comisiones/ComisionesView";
import { ComisionesConsolidadoView } from "@/components/comisiones/ComisionesConsolidadoView";
import { ComisionesPorEmpresaView } from "@/components/comisiones/ComisionesPorEmpresaView";
import { ComisionesConfiguracionView } from "@/components/comisiones/ComisionesConfiguracionView";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const almacen = (): Storage => {
  const d = new Map<string, string>();
  return {
    getItem: (k: string) => (d.has(k) ? d.get(k)! : null),
    setItem: (k: string, v: string) => { d.set(k, String(v)); },
    removeItem: (k: string) => { d.delete(k); },
    clear: () => d.clear(),
    key: (i: number) => [...d.keys()][i] ?? null,
    get length() { return d.size; },
  } as unknown as Storage;
};

const fila = (vendedor: string, total: number, se_paga: boolean, extra: Record<string, number> = {}) => ({
  vendedor, base: total * 100, tasa: 0.005, comision: total / 2,
  base_cobro: total * 50, tasa_cobro: 0.005, comision_cobro: total / 2,
  comision_total: total, descuento: 0, se_paga, ...extra,
});

/** Agosto 2026, medido: 5.091,64 + 652,42 + 234,49 = 5.978,55; DEFAULT y Daniel no entran. */
const CONSOLIDADO = {
  empresas: [
    { empresa_key: "fashion_shoes", vendedores: [fila("REYNALDO ESPINOSA", 4000, true), fila("DEFAULT", 327.77, false)] },
    { empresa_key: "active_shoes", vendedores: [fila("REYNALDO ESPINOSA", 1091.64, true)] },
    { empresa_key: "vistana", vendedores: [fila("EDWIN", 652.42, true), fila("RODRIGO", 234.49, true), fila("DANIEL LEVY", 470.23, false)] },
  ],
};
const POR_EMPRESA = {
  empresa_key: "vistana", year: 2026, mes: 8,
  vendedores: [fila("EDWIN", 652.42, true, { descuento: 100 }), fila("RODRIGO", 234.49, true), fila("DANIEL LEVY", 470.23, false)],
};
const DETALLE = {
  vendedor: "EDWIN", tasa_venta: 0.005, tasa_cobro: 0.005, ventas_base: 1000, cobros_base: 500,
  comision_venta: 5, comision_cobro: 2.5, comision_total: 7.5, ventas: [], cobros: [],
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacen(), configurable: true, writable: true });
  vi.stubGlobal("fetch", async (url: string) => {
    const u = String(url);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u.includes("/consolidado")) return json(CONSOLIDADO);
    if (u.includes("/comisiones/detalle")) return json(DETALLE);
    if (u.includes("/comisiones/descuentos?")) return json({ descuentos: [] });
    if (u.includes("/api/ventas/comisiones?")) return json(POR_EMPRESA);
    if (u.includes("/comisiones/config")) return json({ vendedores: [] });
    if (u.includes("/comisiones/exclusiones")) return json({ exclusiones: [], vendedores: {} });
    if (u.includes("/descuentos-fijos")) return json({ descuentos: [], vendedores: [] });
    return json({});
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("1 · el interruptor", () => {
  it("nace APAGADO y es de código", () => {
    expect(COMISIONES_APPLE_V2_2026_10).toBe(false);
    expect(leer("src/lib/comisiones/apple-v2.ts")).not.toContain("process.env");
  });

  it("apagado, la computadora es la de hoy: dos filas, dos botones de papel, el ⓘ arriba", async () => {
    render(<ComisionesView availableYears={[2026]} />);
    await screen.findByLabelText("Empresa");
    expect(document.querySelector("[data-comisiones-v2]")).toBeNull();
    expect(screen.getByRole("button", { name: /Descargar PDF del mes/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Descargar Excel del mes/ })).toBeTruthy();
  });

  it("y el celular de hoy sigue entero detrás del interruptor", () => {
    const portada = leer("src/components/comisiones/celular/PortadaComisionesCelular.tsx");
    expect(portada).toContain("{!v2 && <>{conDescarga && <BotonPuntos");
    expect(portada).toContain('titulo={v2 && enConfig ? "Configuración" : "Comisiones"}');
    expect(portada).toContain("detalle={v2 ? undefined :");
  });
});

describe("2 · 🔴 ningún cálculo cambia", () => {
  it("el módulo puro no suma: solo escribe el texto", () => {
    const fuente = leer("src/lib/comisiones/apple-v2.ts").replace(/\/\/.*$/gm, "");
    expect(fuente).not.toContain("reduce(");
    expect(fuente).not.toContain("sumarPagable");
  });

  it("la línea gris: bases cortas y los descuentos solo si hay", () => {
    const r: ResumenDelTotal = { total: 5978.55, ventas: 412_300, cobros: 388_100, descuentos: 1573.08 };
    expect(lineaBajoElTotal(r)).toBe("Total a pagar · Ventas $412k · Cobros $388k · Descuentos −$2k");
    expect(lineaBajoElTotal({ ...r, descuentos: 0 })).toBe("Total a pagar · Ventas $412k · Cobros $388k");
  });

  it("el número grande de «Todas» es EXACTAMENTE el del pie: $5,978.55", async () => {
    const recibido: (ResumenDelTotal | null)[] = [];
    render(<ComisionesConsolidadoView year={2026} mes={8} onResumen={(r) => recibido.push(r)} v2 />);
    const tabla = await screen.findByRole("table");
    await waitFor(() => expect(recibido.at(-1)).not.toBeNull());
    expect(recibido.at(-1)!.total).toBeCloseTo(5978.55, 2);
    const pie = within(tabla).getByText("Total a pagar").closest("tr")!;
    expect(within(pie).getAllByText("$5,978.55").length).toBeGreaterThan(0);
  });

  it("y el de una empresa, el de su pie (Edwin + Rodrigo, sin Daniel)", async () => {
    const recibido: (ResumenDelTotal | null)[] = [];
    render(<ComisionesPorEmpresaView empresa="vistana" year={2026} mes={8} onResumen={(r) => recibido.push(r)} v2 />);
    await screen.findByRole("table");
    await waitFor(() => expect(recibido.at(-1)).not.toBeNull());
    expect(recibido.at(-1)!.total).toBeCloseTo(886.91, 2);
    expect(recibido.at(-1)!.descuentos).toBe(100);
  });
});

describe("3 · dos renglones con ›, y DEFAULT y Daniel detrás de «Mostrar no pagables»", () => {
  it("en «Todas» cada vendedor dice de qué empresas sale", () => {
    const porEmpresa = { fashion_shoes: 4000, active_shoes: 1091.64, vistana: 0 };
    const con = empresasDeLaFila(porEmpresa, {}, ["vistana", "fashion_shoes", "active_shoes"]);
    expect(con).toEqual(["fashion_shoes", "active_shoes"]);
    expect(segundaLineaMatriz(con, (k) => ({ fashion_shoes: "Fashion Shoes", active_shoes: "Active Shoes" })[k]!)).toBe("Fashion Shoes · Active Shoes");
    // Un descuento sin comisión también es «algo»: la celda no está vacía.
    expect(empresasDeLaFila({ vistana: 0 }, { vistana: 50 }, ["vistana"])).toEqual(["vistana"]);
  });

  it("en una empresa, la comisión de venta y la de cobro", () => {
    expect(segundaLineaEmpresa({ comision: 25.88, comision_cobro: 41.2, descuento: 0 })).toBe("Com. venta $25.88 · Com. cobro $41.20");
    expect(segundaLineaEmpresa({ comision: 1, comision_cobro: 2, descuento: 1573.08 })).toBe("Com. venta $1.00 · Com. cobro $2.00 · Descuento −$1,573.08");
  });

  it("las filas v2 se dibujan, sin barra negra al pie, y los no pagables esperan el enlace", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={8} totalArriba v2 />);
    await screen.findByRole("table");
    const filas = document.querySelector("[data-filas-v2]") as HTMLElement;
    expect(filas).toBeTruthy();
    expect(document.querySelector("[data-comision-total]")).toBeNull();
    expect(within(filas).queryByText("Oficina (sin vendedor)")).toBeNull();
    expect(within(filas).queryByText("Daniel Levy")).toBeNull();
    fireEvent.click(within(filas).getByRole("button", { name: /Mostrar no pagables \(2\)/ }));
    expect(within(filas).getByText("Daniel Levy")).toBeTruthy();
    // Reynaldo vende en dos empresas: su segundo renglón las nombra.
    expect(within(filas).getByText("Fashion Shoes · Active Shoes")).toBeTruthy();
  });
});

describe("4 · el detalle se abre DEBAJO, con UNA acción principal y UN «Descargar»", () => {
  it("en una empresa ya no es modal", async () => {
    render(<ComisionesPorEmpresaView empresa="vistana" year={2026} mes={8} v2 />);
    await screen.findByRole("table");
    const filas = document.querySelector("[data-filas-v2]") as HTMLElement;
    await act(async () => { fireEvent.click(within(filas).getAllByRole("button")[0]); });
    await waitFor(() => expect(document.querySelector("[data-comision-detalle]")).toBeTruthy());
    const detalle = document.querySelector("[data-comision-detalle]") as HTMLElement;
    expect(detalle.getAttribute("data-comision-detalle")).toBe("inline");
    await waitFor(() => expect(within(detalle).getByRole("button", { name: /Enviar/ })).toBeTruthy());
    expect(within(detalle).getAllByRole("button", { name: /^Descargar/ })).toHaveLength(1);
    expect(within(detalle).queryByRole("button", { name: /Descargar detalle/ })).toBeNull();
    expect(within(detalle).queryByRole("button", { name: /^PDF$/ })).toBeNull();
  });

  it("«No pagable» es un chip junto al nombre, no una frase ámbar", () => {
    const src = leer("src/components/comisiones/ComisionesDetalleModal.tsx");
    expect(src).toContain("{v2 && !sePagaComision(vendedor) && (");
    expect(src).toContain("{!v2 && !sePagaComision(vendedor) && (");
  });
});

describe("5 · la computadora v2: una fila, el número grande, el ⓘ al pie", () => {
  it("UN «Descargar ▾», sin las pestañas, con el selector y el ⚙", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    render(<ComisionesView availableYears={[2026]} conConfiguracion v2 />);
    await screen.findByLabelText("Empresa");
    expect(document.querySelector("[data-comisiones-v2]")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Descargar PDF del mes/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Descargar Excel del mes/ })).toBeNull();
    expect(document.querySelectorAll("[data-descargar-unico]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Configuración$/ })).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    // El número grande dice el total del pie.
    await waitFor(() => expect(document.querySelector("[data-numero-comisiones]")?.textContent).toContain("$5,978.55"));
    // El ⓘ de criterios bajó al pie: una sola línea, debajo de la tabla.
    const pie = document.querySelector("[data-pie-comisiones]") as HTMLElement;
    expect(pie).toBeTruthy();
    expect(within(pie).getByRole("button", { name: /Cómo se calcula/ })).toBeTruthy();
  });

  it("la frescura es la línea común, junto al número", () => {
    const src = leer("src/components/comisiones/ComisionesComputadoraV2.tsx");
    expect(src).toContain("<LineaDeFrescura");
    expect(src).not.toContain("SyncNowButton ");
    expect(src).not.toContain("rotuloDescargarPdf");
  });
});

describe("6 · Configuración v2", () => {
  it("los botones dicen lo que agregan y no son negros", async () => {
    render(<ComisionesConfiguracionView v2 />);
    const exclusion = await screen.findByRole("button", { name: "+ Agregar exclusión" });
    const descuento = await screen.findByRole("button", { name: "+ Agregar descuento" });
    for (const b of [exclusion, descuento]) {
      expect(b.className).toContain("text-blue-600");
      expect(b.className).not.toContain("bg-black");
    }
  });

  it("el «guardado» va al aviso de la casa, no a una línea verde arriba", () => {
    const src = leer("src/components/comisiones/ComisionesConfiguracionView.tsx");
    expect(src).toContain("{!v2 && msg && <p");
    expect(src).toContain("{v2 && <Toast message={msg} />}");
  });
});

describe("7 · el celular v2: el total arriba, sin filas de controles nuevas", () => {
  const portada = leer("src/components/comisiones/celular/PortadaComisionesCelular.tsx");

  it("el número va DEBAJO de la fila de empresa y mes, y ANTES de la lista", () => {
    const fila = portada.indexOf("data-mes-celular");
    const numero = portada.indexOf("data-numero-comisiones");
    const lista = portada.indexOf("{children}");
    expect(fila).toBeGreaterThan(-1);
    expect(numero).toBeGreaterThan(fila);
    expect(lista).toBeGreaterThan(numero);
    // La clase del total de Ventas y CxC (36 px, peso normal), no una negrita.
    expect(portada).toContain("CLASE_TOTAL_CELULAR");
  });

  it("«Descargar» es el botón del título y abre la MISMA hoja de tres", () => {
    expect(portada).toContain("onClick={() => setDescarga(true)}");
    expect(portada).toContain("{ROTULO_DESCARGAR_V2}");
  });
});
