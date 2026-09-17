/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PANTALLA «PRÉSTAMOS › MOVIMIENTOS» (17-sep-2026).
 *
 * Daniel, textual: *«quisiera que en préstamo tener como que un botón para ver
 * el historial de las quincenas. Ya que para ver movimiento tengo que meterme a
 * cada perfil. Pero para ver los movimientos de x quincena?»*
 *
 * Lo que este archivo sostiene, sobre la pantalla de verdad:
 *   1. La pestaña abre en «Quiénes deben» — lo de siempre no se movió.
 *   2. Tocando «Movimientos» se ven los DOS bloques con su conteo y su total.
 *   3. 🔴 La columna «Origen» dice «del cierre» o «a mano».
 *   4. 🔴 El pie dice cuánto se prestó, cuánto se descontó y cuánto creció la
 *      deuda del grupo — la línea que no existía en ninguna pantalla.
 *   5. 🔴 Cambiar de quincena vuelve a preguntar, con la ventana que INCLUYE
 *      el 31.
 *   6. 🔴 No se escribe nada: ni un `fetch` con método.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

const RUTAS: string[] = [];
let URL_ACTUAL = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (u: string) => { RUTAS.push(u); URL_ACTUAL = u.split("?")[1] ?? ""; },
    replace: (u: string) => { RUTAS.push(u); URL_ACTUAL = u.split("?")[1] ?? ""; },
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

// El «hoy» de Panamá se fija: sin esto la lista de quincenas cambia con el reloj.
vi.mock("@/lib/fecha-panama", async (real) => ({
  ...(await real<Record<string, unknown>>()),
  hoyPanama: () => "2026-09-17",
}));

import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import PrestamosTab from "@/app/asistencia/PrestamosTab";
import type { FilaMovimiento } from "@/lib/asistencia/movimientos-quincena";

/** Los 19 movimientos reales del 16 al 30 de agosto de 2026 (medidos el 17-sep). */
let id = 0;
const f = (p: Partial<FilaMovimiento> & { monto: number; fecha: string }): FilaMovimiento => {
  id += 1;
  const cierre = p.origen !== "mano";
  return {
    id: `m${id}`,
    nombre: p.nombre ?? "MARIA V. BETHANCOURTH G.",
    codigo: "7",
    empresa: p.empresa ?? "fashion_wear",
    concepto: cierre ? "Pago" : "Préstamo",
    etiqueta: cierre ? "Pago" : "Préstamo",
    monto: p.monto,
    fecha: p.fecha,
    dia: Number(p.fecha.slice(8, 10)),
    origen: cierre ? "cierre" : "mano",
    origenEtiqueta: cierre ? "del cierre" : "a mano",
    bloque: cierre ? "descuento" : "deuda",
  };
};

const AGOSTO: FilaMovimiento[] = [
  ...[282.72, 60, 50, 50, 50, 50, 50, 45, 30, 25, 25, 25, 10].map((monto) =>
    f({ monto, fecha: "2026-08-30" })),
  f({ monto: 400, fecha: "2026-08-18", origen: "mano" }),
  f({ monto: 300, fecha: "2026-08-17", origen: "mano" }),
  f({ monto: 300, fecha: "2026-08-24", origen: "mano" }),
  f({ monto: 180, fecha: "2026-08-18", origen: "mano", nombre: "GABRIELA JARAMILLO", empresa: "vistana_international" }),
  f({ monto: 180, fecha: "2026-08-19", origen: "mano", nombre: "GABRIELA JARAMILLO", empresa: "vistana_international" }),
  f({ monto: 50, fecha: "2026-08-20", origen: "mano", nombre: "LUZ BOSQUEZ", empresa: "vistana_international" }),
];

const pedidos: string[] = [];
const metodos: (string | undefined)[] = [];

function servir(porVentana: Record<string, FilaMovimiento[]>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    pedidos.push(u);
    metodos.push(init?.method);
    if (u.includes("/api/asistencia/prestamos-movimientos")) {
      const q = new URLSearchParams(u.split("?")[1] ?? "");
      const llave = `${q.get("desde")}→${q.get("hasta")}`;
      return { ok: true, status: 200, json: async () => ({ filas: porVentana[llave] ?? [] }) } as Response;
    }
    // «Quiénes deben» pide su propia lista; acá no interesa.
    return { ok: true, status: 200, json: async () => ({ fichas: [], puedeAnotar: true }) } as Response;
  }));
}

const montar = () => render(<ToastProvider><PrestamosTab /></ToastProvider>);
const irAMovimientos = () => fireEvent.click(screen.getByRole("button", { name: "Movimientos" }));

beforeEach(() => { RUTAS.length = 0; URL_ACTUAL = ""; pedidos.length = 0; metodos.length = 0; id = 0; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("la pestaña Préstamos abre donde siempre", () => {
  it("«Quiénes deben» es la vista de entrada", async () => {
    servir({});
    montar();
    await waitFor(() => expect(screen.getByText("Nadie debe nada en este momento.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Quiénes deben" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Movimientos" })).toBeTruthy();
  });
});

describe("Movimientos — los números del 16 al 30 de agosto de 2026", () => {
  const VENTANA = { "2026-08-16→2026-08-31": AGOSTO };

  it("pide la quincena con la ventana que INCLUYE el 31", async () => {
    servir(VENTANA);
    montar();
    irAMovimientos();
    // Abre en la quincena en curso (16–30 sep, ventana hasta el 30).
    await waitFor(() => expect(pedidos.some((u) => u.includes("desde=2026-09-16"))).toBe(true));
    fireEvent.change(screen.getByLabelText("Quincena"), { target: { value: "2026-08-2" } });
    await waitFor(() =>
      expect(pedidos.some((u) => u.includes("desde=2026-08-16") && u.includes("hasta=2026-08-31"))).toBe(true));
  });

  it("los dos bloques, con su conteo y su total", async () => {
    servir(VENTANA);
    montar();
    irAMovimientos();
    fireEvent.change(screen.getByLabelText("Quincena"), { target: { value: "2026-08-2" } });
    const descuentos = await screen.findByRole("heading", { name: /Descuentos/ });
    expect(descuentos.textContent).toContain("13");
    const deudas = screen.getByRole("heading", { name: /Deudas nuevas/ });
    expect(deudas.textContent).toContain("6");
    // Los dos totales, con centavos.
    expect(screen.getAllByText("$752.72").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1,410.00").length).toBeGreaterThan(0);
  });

  it("🔴 la columna Origen dice quién lo anotó", async () => {
    servir(VENTANA);
    montar();
    irAMovimientos();
    fireEvent.change(screen.getByLabelText("Quincena"), { target: { value: "2026-08-2" } });
    await screen.findByRole("heading", { name: /Descuentos/ });
    // 13 en la tabla + 13 en las tarjetas del celular (las dos se montan).
    expect(screen.getAllByText("del cierre")).toHaveLength(26);
    expect(screen.getAllByText("a mano")).toHaveLength(12);
  });

  it("🔴 el pie dice cuánto creció la deuda del grupo", async () => {
    servir(VENTANA);
    montar();
    irAMovimientos();
    fireEvent.change(screen.getByLabelText("Quincena"), { target: { value: "2026-08-2" } });
    await screen.findByText("La deuda creció");
    expect(screen.getByText("Se prestó")).toBeTruthy();
    expect(screen.getByText("Se descontó")).toBeTruthy();
    expect(screen.getAllByText("$657.28").length).toBeGreaterThan(0);
  });

  it("🔴 el filtro de empresa recorta las filas Y el pie", async () => {
    servir(VENTANA);
    render(<ToastProvider><PrestamosTab empresa="vistana_international" /></ToastProvider>);
    irAMovimientos();
    fireEvent.change(screen.getByLabelText("Quincena"), { target: { value: "2026-08-2" } });
    const deudas = await screen.findByRole("heading", { name: /Deudas nuevas/ });
    expect(deudas.textContent).toContain("3");
    expect(screen.getByText("No se le descontó nada a nadie en esta quincena.")).toBeTruthy();
    expect(screen.getAllByText("$410.00").length).toBeGreaterThan(0);
  });

  it("una quincena sin nada lo dice con palabras, nunca con un $0.00 grande", async () => {
    servir({});
    montar();
    irAMovimientos();
    await screen.findByText("En esta quincena no se descontó ni se prestó nada.");
    expect(screen.queryByText("La deuda creció")).toBeNull();
  });

  it("🔴 no escribe nada: ningún pedido lleva método", async () => {
    servir(VENTANA);
    montar();
    irAMovimientos();
    fireEvent.change(screen.getByLabelText("Quincena"), { target: { value: "2026-08-2" } });
    await screen.findByRole("heading", { name: /Descuentos/ });
    expect(metodos.filter(Boolean)).toEqual([]);
  });

  it("la vista elegida viaja en la URL", async () => {
    servir(VENTANA);
    montar();
    irAMovimientos();
    await waitFor(() => expect(RUTAS.some((u) => u.includes("sub=movimientos"))).toBe(true));
  });
});
