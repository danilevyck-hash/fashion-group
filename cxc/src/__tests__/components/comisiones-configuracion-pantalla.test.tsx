// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — la pestaña «Configuración» de Comisiones (3-sep-2026).
//
// 🩸 Daniel, textual:
//   · «crea configuración en comisiones para desactivar cálculos de clientes»
//   · «lo de las exclusiones, no lo llames así y ponlo en Configuración»
//   · «¿por qué en card y no como tab en toda la pantalla normal?»
//   · «en comisiones me gusta que lo separes, pero cuando lo configures tú,
//      pon a Reinaldo 1 y 1»
//
// Lo que se vigila, montando las vistas REALES:
//   1. El chip «Configuración» solo lo ve el admin, y solo en el MÓDULO
//      /comisiones (conConfiguracion): en la pestaña Comisiones de Ventas no
//      existe ni para el admin.
//   2. La pantalla NUNCA dice «exclusión»/«excluir»: se llama «Clientes que
//      no comisionan».
//   3. Tasas por vendedor: Venta y Cobro por separado (Reinaldo 1.00 / 1.00);
//      DANIEL LEVY en gris, «no se paga» y SIN cajas.
//   4. La lista: Empresa · Cliente (nombre + código) · Vendedor · Desde · ×;
//      sin columna Motivo. Quitar pide confirmación y manda DELETE ?id=.
//   5. «+ Agregar» abre la fila inline con Empresa → Cliente (ClienteSwitchPicker
//      contra /api/ventas/comisiones/exclusiones/<empresa>/clientes-switch) →
//      Vendedor → Guardar (apagado hasta elegir cliente y vendedor).
//   6. La marca «N clientes sin comisión» pegada al vendedor en la tabla.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor, act } from "@testing-library/react";
import { ComisionesConfiguracionView } from "@/components/ventas/ComisionesConfiguracionView";
import { ComisionesView } from "@/components/ventas/ComisionesView";
import { ComisionesPorEmpresaView } from "@/components/ventas/ComisionesPorEmpresaView";
import { fmtDate } from "@/lib/format";

// 🩸 El jsdom de este repo expone localStorage/sessionStorage sin métodos (ver
// comisiones-en-ventas.test.tsx): se reemplazan por un almacén real en memoria.
const almacenReal = (): Storage => {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k: string, v: string) => { datos.set(k, String(v)); },
    removeItem: (k: string) => { datos.delete(k); },
    clear: () => datos.clear(),
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size; },
  } as unknown as Storage;
};

const CONFIG = {
  vendedores: [
    { vendedor_nombre: "EDWIN", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true, origen: ["Vistana"] },
    { vendedor_nombre: "REINALDO ESPINOSA", tasa_venta: 0.01, tasa_cobro: 0.01, activo: true, origen: ["Active Shoes", "Fashion Wear"] },
    { vendedor_nombre: "DANIEL LEVY", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true, origen: ["Vistana"] },
  ],
};
const EXCLUSIONES = {
  exclusiones: [
    { id: 1, empresa_key: "active_shoes", cliente_codigo: "D-84", cliente_nombre: "Kheriddine", vendedor: "REINALDO ESPINOSA", creado_por: "daniel", creado_en: "2026-09-03T17:00:00Z" },
    { id: 2, empresa_key: "active_wear", cliente_codigo: "D-50", cliente_nombre: "El Remate", vendedor: "REYNALDO ESPINOSA", creado_por: "daniel", creado_en: "2026-09-03T17:00:00Z" },
  ],
  vendedores: { active_shoes: ["DEFAULT", "REINALDO ESPINOSA"], active_wear: ["DEFAULT", "REINALDO ESPINOSA", "REYNALDO ESPINOSA"], vistana: ["EDWIN"], fashion_wear: [], fashion_shoes: [], joystep: [] },
};
const POR_EMPRESA = {
  empresa_key: "active_shoes", year: 2026, mes: 8, version: "v7", regla_cobro: "quien_registro", exclusiones_aplicadas: true,
  vendedores: [
    { vendedor: "REINALDO ESPINOSA", base: 1000, tasa: 0.01, comision: 10, base_cobro: 500, tasa_cobro: 0.01, comision_cobro: 5, comision_total: 15, descuento: 0, se_paga: true,
      // Ya ordenados por código, como los manda el servidor.
      clientes_sin_comision: [{ codigo: "D-103", nombre: "Metro Shoes" }, { codigo: "D-84", nombre: "Kheriddine" }] },
    { vendedor: "DEFAULT", base: 0, tasa: 0.005, comision: 0, base_cobro: 200, tasa_cobro: 0.005, comision_cobro: 1, comision_total: 1, descuento: 0, se_paga: false },
  ],
};
const CONSOLIDADO = { empresas: [{ empresa_key: "active_shoes", regla_cobro: "quien_registro", vendedores: POR_EMPRESA.vendedores }] };

const llamadas: { url: string; method: string; body?: unknown }[] = [];

beforeEach(() => {
  llamadas.length = 0;
  Object.defineProperty(window, "localStorage", { value: almacenReal(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacenReal(), configurable: true, writable: true });
  localStorage.setItem("fg_last_comision_empresa", "active_shoes");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    llamadas.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (u.includes("/api/ventas/comisiones/config")) return json(method === "GET" ? CONFIG : { ok: true });
    if (/\/exclusiones\/[a-z_]+\/clientes-switch/.test(u)) {
      return json({ clientes: [{ cliente_switch_id: 90, codigo: "D-84", nombre: "Kheriddine" }, { cliente_switch_id: 118, codigo: "D-103", nombre: "Metro Shoes" }], contado: null });
    }
    if (u.includes("/api/ventas/comisiones/exclusiones")) return json(method === "GET" ? EXCLUSIONES : { ok: true, id: 9 }, method === "POST" ? 201 : 200);
    if (u.includes("/consolidado")) return json(CONSOLIDADO);
    if (u.includes("/api/ventas/comisiones?")) return json(POR_EMPRESA);
    if (u.includes("/api/ventas/sync-status") || u.includes("/api/sync")) return json({});
    return json({});
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═══ 1. El chip ══════════════════════════════════════════════════════════════
describe("🔴 el chip «Configuración»: solo admin y solo en el módulo /comisiones", () => {
  it("admin en /comisiones lo ve y lo abre; ahí no hay período ni Excel", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    render(<ComisionesView availableYears={[2026]} conConfiguracion />);
    const chip = await screen.findByRole("button", { name: "Configuración", exact: true });
    await act(async () => { fireEvent.click(chip); });
    expect(chip.getAttribute("aria-current")).toBe("page");
    await screen.findByText("Tasas por vendedor");
    await screen.findByText("Clientes que no comisionan");
    expect(screen.queryByRole("button", { name: /Excel/i })).toBeNull();
    expect(localStorage.getItem("fg_comisiones_mode")).toBe("config");
  });

  it("contabilidad y secretaria NO lo ven aunque estén en /comisiones", async () => {
    for (const rol of ["contabilidad", "secretaria"]) {
      sessionStorage.setItem("cxc_role", rol);
      const { unmount } = render(<ComisionesView availableYears={[2026]} conConfiguracion />);
      await screen.findByRole("button", { name: "Todas las empresas", exact: true });
      expect(screen.queryByRole("button", { name: "Configuración", exact: true }), rol).toBeNull();
      unmount();
    }
  });

  it("el admin en la pestaña Comisiones de VENTAS tampoco lo ve — y un modo «config» guardado cae a «Todas las empresas»", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    localStorage.setItem("fg_comisiones_mode", "config");
    render(<ComisionesView availableYears={[2026]} />);
    const todas = await screen.findByRole("button", { name: "Todas las empresas", exact: true });
    expect(screen.queryByRole("button", { name: "Configuración", exact: true })).toBeNull();
    expect(todas.getAttribute("aria-current")).toBe("page");
  });

  it("«Configurar» de Por empresa ya no abre un modal: lleva a la pestaña", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    localStorage.setItem("fg_comisiones_mode", "empresa");
    render(<ComisionesView availableYears={[2026]} conConfiguracion />);
    const btn = await screen.findByRole("button", { name: /Configurar$/ });
    await act(async () => { fireEvent.click(btn); });
    await screen.findByText("Tasas por vendedor");
    expect(screen.queryByText("Configurar comisiones")).toBeNull();
  });
});

// ═══ 2–5. La pestaña ═════════════════════════════════════════════════════════
describe("🔴 la pestaña Configuración", () => {
  beforeEach(() => { sessionStorage.setItem("cxc_role", "admin"); });

  it("no dice «exclusión» por ningún lado: se llama «Clientes que no comisionan»", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText("Clientes que no comisionan");
    await screen.findByText("Kheriddine");
    fireEvent.click(screen.getByRole("button", { name: "+ Agregar" }));
    await screen.findByTestId("alta-sin-comision");
    expect(document.body.textContent ?? "").not.toMatch(/exclu/i);
  });

  it("Tasas por vendedor: Venta y Cobro por separado, Reinaldo 1.00 / 1.00; Daniel en gris, «no se paga» y sin cajas", async () => {
    render(<ComisionesConfiguracionView />);
    const tabla = (await screen.findByText("Tasas por vendedor")).closest("section")!;
    expect(within(tabla).getByRole("columnheader", { name: "Venta" })).toBeTruthy();
    expect(within(tabla).getByRole("columnheader", { name: "Cobro" })).toBeTruthy();
    expect((within(tabla).getByLabelText("Tasa de venta de REINALDO ESPINOSA") as HTMLInputElement).value).toBe("1.00");
    expect((within(tabla).getByLabelText("Tasa de cobro de REINALDO ESPINOSA") as HTMLInputElement).value).toBe("1.00");
    expect((within(tabla).getByLabelText("Tasa de venta de EDWIN") as HTMLInputElement).value).toBe("0.50");
    const daniel = within(tabla).getByText("DANIEL LEVY").closest("tr")!;
    expect(daniel.getAttribute("data-se-paga")).toBe("no");
    expect(within(daniel).getByText("no se paga")).toBeTruthy();
    expect(within(daniel).queryByRole("spinbutton")).toBeNull();
    // Guardar manda las DOS tasas.
    await act(async () => { fireEvent.click(within(tabla).getByRole("button", { name: "Guardar tasas" })); });
    const put = llamadas.find((c) => c.method === "PUT")!;
    const upd = (put.body as { updates: { vendedor_nombre: string; tasa_venta: number; tasa_cobro: number }[] }).updates;
    expect(upd.find((u) => u.vendedor_nombre === "REINALDO ESPINOSA")).toMatchObject({ tasa_venta: 0.01, tasa_cobro: 0.01 });
  });

  it("la lista: Empresa · Cliente (nombre + código) · Vendedor · Desde · × — sin Motivo", async () => {
    render(<ComisionesConfiguracionView />);
    const seccion = (await screen.findByText("Clientes que no comisionan")).closest("section")!;
    const encabezados = within(seccion).getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(encabezados).toEqual(["Empresa", "Cliente", "Vendedor", "Desde", "Quitar"]);
    expect(encabezados).not.toContain("Motivo");
    const fila = within(seccion).getByText("Kheriddine").closest("tr")!;
    expect(within(fila).getByText("D-84")).toBeTruthy();
    expect(within(fila).getByText("Active Shoes")).toBeTruthy();
    expect(within(fila).getByText("REINALDO ESPINOSA")).toBeTruthy();
    // La fecha en Panamá, con el mismo formato que todo el sistema.
    expect(within(fila).getByText(fmtDate("2026-09-03"))).toBeTruthy();
  });

  it("quitar pide confirmación y manda DELETE ?id= (soft delete en el servidor)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ComisionesConfiguracionView />);
    const seccion = (await screen.findByText("Clientes que no comisionan")).closest("section")!;
    fireEvent.click(within(seccion).getByRole("button", { name: /Quitar a Kheriddine/ }));
    await screen.findByText("¿Quitar de la lista?");
    // Tocar × NO manda nada: sin confirmar no hay DELETE.
    await act(async () => { vi.advanceTimersByTime(50); });
    expect(llamadas.some((c) => c.method === "DELETE")).toBe(false);
    expect(screen.getByText(/vuelve a cobrar comisión por Kheriddine en Active Shoes, en venta y en cobro/)).toBeTruthy();
    // El botón rojo se habilita después de 1 s (ConfirmDeleteModal).
    await act(async () => { vi.advanceTimersByTime(1100); });
    const quitar = screen.getByRole("button", { name: "Quitar", exact: true });
    await waitFor(() => expect((quitar as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(quitar); });
    await waitFor(() => expect(llamadas.some((c) => c.method === "DELETE" && c.url.endsWith("/exclusiones?id=1"))).toBe(true));
    vi.useRealTimers();
  });

  it("«+ Agregar»: Empresa → Cliente (el selector compartido) → Vendedor → Guardar, apagado hasta elegir los dos", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText("Clientes que no comisionan");
    fireEvent.click(screen.getByRole("button", { name: "+ Agregar" }));
    const alta = await screen.findByTestId("alta-sin-comision");
    const guardar = within(alta).getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    expect(within(alta).getByText("Falta elegir el cliente")).toBeTruthy();
    // El selector compartido pide el directorio de la empresa elegida (la primera de las 6).
    await waitFor(() => expect(llamadas.some((c) => /\/exclusiones\/vistana\/clientes-switch\?q=/.test(c.url))).toBe(true));
    const kher = await within(alta).findByRole("button", { name: /Kheriddine/ });
    fireEvent.click(kher);
    expect(within(alta).getByText("Falta elegir el vendedor")).toBeTruthy();
    fireEvent.change(within(alta).getByLabelText("Vendedor"), { target: { value: "EDWIN" } });
    expect(guardar.disabled).toBe(false);
    await act(async () => { fireEvent.click(guardar); });
    const post = llamadas.find((c) => c.method === "POST")!;
    expect(post.url).toContain("/api/ventas/comisiones/exclusiones");
    expect(post.body).toEqual({ empresa_key: "vistana", cliente_codigo: "D-84", vendedor: "EDWIN" });
    await screen.findByText("Listo, guardado");
  });
});

// ═══ 6. La marca en la tabla ═════════════════════════════════════════════════
describe("🔴 «N clientes sin comisión» pegado al vendedor, con los nombres en el tooltip", () => {
  it("Por empresa: Reinaldo lleva «2 clientes sin comisión»; DEFAULT no lleva nada", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={8} />);
    const tabla = await screen.findByRole("table");
    const marca = within(tabla).getByText("2 clientes sin comisión");
    expect(marca.getAttribute("title")).toBe("D-103 Metro Shoes\nD-84 Kheriddine");
    const def = within(tabla).getByText("Oficina (DEFAULT)").closest("tr")!;
    expect(within(def).queryByText(/sin comisión/)).toBeNull();
  });
});
