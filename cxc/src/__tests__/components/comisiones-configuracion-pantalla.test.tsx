// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — la pestaña «Configuración» de Comisiones (3-sep-2026).
//
// 🩸 Daniel, textual:
//   · «crea configuración en comisiones para desactivar cálculos de clientes»
//   · «lo de las exclusiones, no lo llames así y ponlo en Configuración»
//   · «¿por qué en card y no como tab en toda la pantalla normal?»
//   · «en comisiones me gusta que lo separes, pero cuando lo configures tú,
//      pon a Reinaldo 1 y 1»
//   Y esa misma noche, sobre la pestaña ya en producción:
//   · «¿por qué hay 4 Reinaldo?» → una persona, una fila (alias en la base)
//   · «llámalo Reynaldo y no Reinaldo» → con Y, y capitalizado en pantalla
//   · Daniel Levy en la lista de tasas: «quítalo»
//   · «poder quitar comisiones en ventas o comisiones sin que tengan que ser
//      de los dos» → dos casillas, Venta y Cobro; al agregar «arranca con las
//      dos marcadas pero yo deselecciono»
//   · agrupado por empresa, y el botón «Configurar» de Por empresa se va:
//     «configuración en dos lados»
//
// Lo que se vigila, montando las vistas REALES:
//   1. El chip «Configuración» solo lo ve el admin, y solo en el MÓDULO
//      /comisiones (conConfiguracion): en la pestaña Comisiones de Ventas no
//      existe ni para el admin. Y es la ÚNICA entrada: Por empresa ya no tiene
//      botón «Configurar».
//   2. La pantalla NUNCA dice «exclusión»/«excluir»: se llama «Clientes que
//      no comisionan».
//   3. Tasas por vendedor: Venta y Cobro por separado; «Reynaldo Espinosa»
//      (con Y, capitalizado, sin nota de «N nombres») 1.00 / 1.00; DANIEL
//      LEVY NO está.
//   4. La lista, agrupada POR EMPRESA (encabezado + contador) y sin columna
//      Empresa adentro: Cliente (nombre + código) · Vendedor · Venta · Cobro ·
//      Desde · ×; sin Motivo. Las casillas se cambian al momento (PATCH) y
//      dejar las dos apagadas no manda nada y avisa. Quitar pide confirmación
//      y manda DELETE ?id=.
//   5. «+ Agregar» abre la fila inline con Empresa → Cliente (ClienteSwitchPicker
//      contra /api/ventas/comisiones/exclusiones/<empresa>/clientes-switch) →
//      Vendedor → Venta ☑ Cobro ☑ → Guardar (apagado hasta elegir cliente y
//      vendedor, y apagado con aviso si se desmarcan las dos). Las 4
//      combinaciones viajan al POST tal cual.
//   6. La marca «N clientes sin comisión» pegada al vendedor en la tabla.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor, act } from "@testing-library/react";
import { ComisionesConfiguracionView } from "@/components/ventas/ComisionesConfiguracionView";
import { ComisionesView } from "@/components/ventas/ComisionesView";
import { ComisionesPorEmpresaView } from "@/components/ventas/ComisionesPorEmpresaView";
import { fmtDate } from "@/lib/format";
import { AVISO_NINGUNA_CASILLA } from "@/lib/comisiones/exclusiones";

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

// Lo que manda el servidor DESPUÉS del alias: una fila por persona, con el
// nombre canónico (REYNALDO con Y). Daniel ya no viene (el servidor lo filtra),
// pero se manda igual para probar que la pantalla tampoco lo dibuja.
const CONFIG = {
  vendedores: [
    { vendedor_nombre: "EDWIN", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true, origen: ["Vistana"] },
    { vendedor_nombre: "REYNALDO ESPINOSA", tasa_venta: 0.01, tasa_cobro: 0.01, activo: true, origen: ["Active Shoes", "Active Wear", "Fashion Shoes", "Fashion Wear"] },
    { vendedor_nombre: "REY STOUTE AGUAS", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true, origen: ["Vistana"] },
    { vendedor_nombre: "DANIEL LEVY", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true, origen: ["Vistana"] },
  ],
};
const EXCLUSIONES = {
  exclusiones: [
    { id: 1, empresa_key: "active_shoes", cliente_codigo: "D-84", cliente_nombre: "Kheriddine", vendedor: "REYNALDO ESPINOSA", excluye_venta: true, excluye_cobro: true, creado_por: "daniel", creado_en: "2026-09-03T17:00:00Z" },
    { id: 2, empresa_key: "active_shoes", cliente_codigo: "D-103", cliente_nombre: "Metro Shoes", vendedor: "REYNALDO ESPINOSA", excluye_venta: true, excluye_cobro: false, creado_por: "daniel", creado_en: "2026-09-03T17:00:00Z" },
    { id: 3, empresa_key: "active_wear", cliente_codigo: "D-50", cliente_nombre: "El Remate", vendedor: "REYNALDO ESPINOSA", excluye_venta: true, excluye_cobro: true, creado_por: "daniel", creado_en: "2026-09-03T17:00:00Z" },
  ],
  vendedores: { active_shoes: ["DEFAULT", "REYNALDO ESPINOSA"], active_wear: ["DEFAULT", "REYNALDO ESPINOSA"], vistana: ["EDWIN"], fashion_wear: [], fashion_shoes: [], joystep: [] },
};
const POR_EMPRESA = {
  empresa_key: "active_shoes", year: 2026, mes: 8, version: "v8", regla_cobro: "quien_registro", exclusiones_aplicadas: true, alias_aplicado: true,
  vendedores: [
    { vendedor: "REYNALDO ESPINOSA", base: 1000, tasa: 0.01, comision: 10, base_cobro: 500, tasa_cobro: 0.01, comision_cobro: 5, comision_total: 15, descuento: 0, se_paga: true,
      // Ya ordenados por código, como los manda el servidor.
      clientes_sin_comision: [{ codigo: "D-103", nombre: "Metro Shoes", excluye_venta: true, excluye_cobro: false }, { codigo: "D-84", nombre: "Kheriddine" }] },
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
describe("🔴 el chip «Configuración»: solo admin, solo en el módulo /comisiones, y la ÚNICA entrada", () => {
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

  // CAMBIÓ DE DIRECCIÓN el 3-sep-2026 (noche): el botón «Configurar» de Por
  // empresa llevaba a la pestaña; Daniel: «configuración en dos lados». Ya no
  // existe — ni para el admin — y el chip de arriba es la única entrada.
  it("🔴 Por empresa NO tiene botón «Configurar» (ni para el admin): el chip es la única entrada", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    localStorage.setItem("fg_comisiones_mode", "empresa");
    render(<ComisionesView availableYears={[2026]} conConfiguracion />);
    await screen.findByRole("button", { name: "Por empresa", exact: true });
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: /Configurar/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Configuración", exact: true })).toBeTruthy();
    // Y la vista sola tampoco lo dibuja, reciba lo que reciba.
    cleanup();
    render(<ComisionesPorEmpresaView year={2026} mes={8} />);
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: /Configurar/ })).toBeNull();
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

  it("🔴 Tasas por vendedor: «Reynaldo Espinosa» con Y y capitalizado, UNA fila, 1.00 / 1.00, sin nota de «N nombres»; Daniel Levy NO está", async () => {
    render(<ComisionesConfiguracionView />);
    const tabla = (await screen.findByText("Tasas por vendedor")).closest("section")!;
    expect(within(tabla).getByRole("columnheader", { name: "Venta" })).toBeTruthy();
    expect(within(tabla).getByRole("columnheader", { name: "Cobro" })).toBeTruthy();
    // Con Y, capitalizado, una sola vez.
    expect(within(tabla).getAllByText("Reynaldo Espinosa")).toHaveLength(1);
    expect(within(tabla).queryByText(/REINALDO|Reinaldo|REYNALDO ESPINOSA/)).toBeNull();
    expect(within(tabla).queryByText(/nombres en Switch/)).toBeNull();
    expect((within(tabla).getByLabelText("Tasa de venta de Reynaldo Espinosa") as HTMLInputElement).value).toBe("1.00");
    expect((within(tabla).getByLabelText("Tasa de cobro de Reynaldo Espinosa") as HTMLInputElement).value).toBe("1.00");
    expect((within(tabla).getByLabelText("Tasa de venta de Edwin") as HTMLInputElement).value).toBe("0.50");
    // Daniel, 3-sep-2026: «esconder rey stoute» — aunque el servidor lo mande
    // (respuesta vieja), la tabla no lo dibuja (`lib/comisiones/retirados`).
    expect(within(tabla).queryByText(/Rey Stoute Aguas|REY STOUTE AGUAS|Aguas/)).toBeNull();
    // Daniel: «quítalo».
    expect(within(tabla).queryByText(/DANIEL LEVY|Daniel Levy/)).toBeNull();
    expect(within(tabla).queryByText("no se paga")).toBeNull();
    // Guardar manda las DOS tasas con el nombre CANÓNICO (el que agrupa la RPC).
    await act(async () => { fireEvent.click(within(tabla).getByRole("button", { name: "Guardar tasas" })); });
    const put = llamadas.find((c) => c.method === "PUT")!;
    const upd = (put.body as { updates: { vendedor_nombre: string; tasa_venta: number; tasa_cobro: number }[] }).updates;
    expect(upd.find((u) => u.vendedor_nombre === "REYNALDO ESPINOSA")).toMatchObject({ tasa_venta: 0.01, tasa_cobro: 0.01 });
    expect(upd.some((u) => u.vendedor_nombre === "DANIEL LEVY")).toBe(false);
  });

  it("🔴 la lista va AGRUPADA POR EMPRESA (encabezado + contador) y cada tabla es Cliente · Vendedor · Venta · Cobro · Desde · × — sin Empresa ni Motivo", async () => {
    render(<ComisionesConfiguracionView />);
    const seccion = (await screen.findByText("Clientes que no comisionan")).closest("section")!;
    const grupos = [...seccion.querySelectorAll("[data-grupo-empresa]")].map((g) => g.getAttribute("data-grupo-empresa"));
    expect(grupos).toEqual(["active_shoes", "active_wear"]);
    const activeShoes = seccion.querySelector('[data-grupo-empresa="active_shoes"]') as HTMLElement;
    expect(within(activeShoes).getByRole("heading", { name: "Active Shoes" })).toBeTruthy();
    expect(within(activeShoes).getByLabelText("2 en Active Shoes").textContent).toBe("2");
    const activeWear = seccion.querySelector('[data-grupo-empresa="active_wear"]') as HTMLElement;
    expect(within(activeWear).getByLabelText("1 en Active Wear").textContent).toBe("1");
    // Encabezados de la tabla del grupo: sin columna Empresa, sin Motivo.
    const encabezados = within(activeShoes).getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(encabezados).toEqual(["Cliente", "Vendedor", "Venta", "Cobro", "Desde", "Quitar"]);
    expect(encabezados).not.toContain("Empresa");
    expect(encabezados).not.toContain("Motivo");
    const fila = within(activeShoes).getByText("Kheriddine").closest("tr")!;
    expect(within(fila).getByText("D-84")).toBeTruthy();
    expect(within(fila).getByText("Reynaldo Espinosa")).toBeTruthy();
    expect(within(fila).queryByText("Active Shoes")).toBeNull();
    // La fecha en Panamá, con el mismo formato que todo el sistema.
    expect(within(fila).getByText(fmtDate("2026-09-03"))).toBeTruthy();
    // Las casillas dicen lo que trae cada fila: Kheriddine las dos; Metro Shoes solo venta.
    expect((within(fila).getByLabelText("Venta de Kheriddine para Reynaldo Espinosa") as HTMLInputElement).checked).toBe(true);
    expect((within(fila).getByLabelText("Cobro de Kheriddine para Reynaldo Espinosa") as HTMLInputElement).checked).toBe(true);
    const metro = within(activeShoes).getByText("Metro Shoes").closest("tr")!;
    expect((within(metro).getByLabelText("Venta de Metro Shoes para Reynaldo Espinosa") as HTMLInputElement).checked).toBe(true);
    expect((within(metro).getByLabelText("Cobro de Metro Shoes para Reynaldo Espinosa") as HTMLInputElement).checked).toBe(false);
  });

  it("🔴 cambiar una casilla manda PATCH ?id= al momento; dejar las dos apagadas NO manda nada y avisa", async () => {
    render(<ComisionesConfiguracionView />);
    const seccion = (await screen.findByText("Clientes que no comisionan")).closest("section")!;
    // Kheriddine: apagar Cobro → PATCH con venta=true, cobro=false.
    const cobroKher = within(seccion).getByLabelText("Cobro de Kheriddine para Reynaldo Espinosa");
    await act(async () => { fireEvent.click(cobroKher); });
    await waitFor(() => expect(llamadas.some((c) => c.method === "PATCH")).toBe(true));
    const patch = llamadas.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("/api/ventas/comisiones/exclusiones?id=1");
    expect(patch.body).toEqual({ excluye_venta: true, excluye_cobro: false });
    // Metro Shoes ya tiene Cobro apagado: apagar Venta dejaría las dos apagadas → nada viaja, se avisa.
    llamadas.length = 0;
    const ventaMetro = within(seccion).getByLabelText("Venta de Metro Shoes para Reynaldo Espinosa");
    await act(async () => { fireEvent.click(ventaMetro); });
    expect((await screen.findByRole("alert")).textContent).toBe(AVISO_NINGUNA_CASILLA);
    expect(llamadas.some((c) => c.method === "PATCH")).toBe(false);
    expect((ventaMetro as HTMLInputElement).checked).toBe(true);
  });

  it("quitar pide confirmación (diciendo qué vuelve) y manda DELETE ?id= (soft delete en el servidor)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ComisionesConfiguracionView />);
    const seccion = (await screen.findByText("Clientes que no comisionan")).closest("section")!;
    fireEvent.click(within(seccion).getByRole("button", { name: /Quitar a Kheriddine/ }));
    await screen.findByText("¿Quitar de la lista?");
    // Tocar × NO manda nada: sin confirmar no hay DELETE.
    await act(async () => { vi.advanceTimersByTime(50); });
    expect(llamadas.some((c) => c.method === "DELETE")).toBe(false);
    expect(screen.getByText(/Reynaldo Espinosa vuelve a cobrar comisión por Kheriddine en Active Shoes, en venta y en cobro/)).toBeTruthy();
    // El botón rojo se habilita después de 1 s (ConfirmDeleteModal).
    await act(async () => { vi.advanceTimersByTime(1100); });
    const quitar = screen.getByRole("button", { name: "Quitar", exact: true });
    await waitFor(() => expect((quitar as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(quitar); });
    await waitFor(() => expect(llamadas.some((c) => c.method === "DELETE" && c.url.endsWith("/exclusiones?id=1"))).toBe(true));
    vi.useRealTimers();
  });

  it("🔴 «+ Agregar»: Empresa → Cliente (el selector compartido) → Vendedor → Venta ☑ Cobro ☑ → Guardar; arranca con las DOS marcadas", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText("Clientes que no comisionan");
    fireEvent.click(screen.getByRole("button", { name: "+ Agregar" }));
    const alta = await screen.findByTestId("alta-sin-comision");
    const guardar = within(alta).getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    expect(within(alta).getByText("Falta elegir el cliente")).toBeTruthy();
    // «arranca con las dos marcadas pero yo deselecciono».
    const venta = within(alta).getByLabelText("Venta") as HTMLInputElement;
    const cobro = within(alta).getByLabelText("Cobro") as HTMLInputElement;
    expect(venta.checked).toBe(true);
    expect(cobro.checked).toBe(true);
    // El selector compartido pide el directorio de la empresa elegida (la primera de las 6).
    await waitFor(() => expect(llamadas.some((c) => /\/exclusiones\/vistana\/clientes-switch\?q=/.test(c.url))).toBe(true));
    const kher = await within(alta).findByRole("button", { name: /Kheriddine/ });
    fireEvent.click(kher);
    expect(within(alta).getByText("Falta elegir el vendedor")).toBeTruthy();
    // El desplegable muestra el nombre bonito y manda el canónico.
    const select = within(alta).getByLabelText("Vendedor") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toContain("Edwin");
    fireEvent.change(select, { target: { value: "EDWIN" } });
    expect(guardar.disabled).toBe(false);
    await act(async () => { fireEvent.click(guardar); });
    const post = llamadas.find((c) => c.method === "POST")!;
    expect(post.url).toContain("/api/ventas/comisiones/exclusiones");
    expect(post.body).toEqual({ empresa_key: "vistana", cliente_codigo: "D-84", vendedor: "EDWIN", excluye_venta: true, excluye_cobro: true });
    await screen.findByText("Listo, guardado");
  });

  it("🔴 las 4 combinaciones: solo Venta y solo Cobro viajan al POST; las dos apagadas no se guardan y se avisa", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText("Clientes que no comisionan");
    fireEvent.click(screen.getByRole("button", { name: "+ Agregar" }));
    const alta = await screen.findByTestId("alta-sin-comision");
    const guardar = within(alta).getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    fireEvent.click(await within(alta).findByRole("button", { name: /Kheriddine/ }));
    fireEvent.change(within(alta).getByLabelText("Vendedor"), { target: { value: "EDWIN" } });
    const venta = within(alta).getByLabelText("Venta") as HTMLInputElement;
    const cobro = within(alta).getByLabelText("Cobro") as HTMLInputElement;

    // Solo Venta.
    fireEvent.click(cobro);
    expect(guardar.disabled).toBe(false);
    await act(async () => { fireEvent.click(guardar); });
    let post = llamadas.filter((c) => c.method === "POST").at(-1)!;
    expect(post.body).toMatchObject({ excluye_venta: true, excluye_cobro: false });
    await screen.findByText("Listo, guardado");

    // La fila se cierra al guardar: se vuelve a abrir, y arranca de nuevo con las dos marcadas.
    fireEvent.click(screen.getByRole("button", { name: "+ Agregar" }));
    const alta2 = await screen.findByTestId("alta-sin-comision");
    const guardar2 = within(alta2).getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    const venta2 = within(alta2).getByLabelText("Venta") as HTMLInputElement;
    const cobro2 = within(alta2).getByLabelText("Cobro") as HTMLInputElement;
    expect(venta2.checked && cobro2.checked).toBe(true);
    fireEvent.click(await within(alta2).findByRole("button", { name: /Metro Shoes/ }));
    fireEvent.change(within(alta2).getByLabelText("Vendedor"), { target: { value: "EDWIN" } });

    // Solo Cobro.
    fireEvent.click(venta2);
    expect(guardar2.disabled).toBe(false);
    // Las dos apagadas: Guardar se apaga y se dice por qué; nada viaja.
    const antes = llamadas.filter((c) => c.method === "POST").length;
    fireEvent.click(cobro2);
    expect(guardar2.disabled).toBe(true);
    expect(within(alta2).getByText(AVISO_NINGUNA_CASILLA)).toBeTruthy();
    await act(async () => { fireEvent.click(guardar2); });
    expect(llamadas.filter((c) => c.method === "POST").length).toBe(antes);
    // Se vuelve a marcar Cobro → solo Cobro viaja.
    fireEvent.click(cobro2);
    expect(guardar2.disabled).toBe(false);
    await act(async () => { fireEvent.click(guardar2); });
    post = llamadas.filter((c) => c.method === "POST").at(-1)!;
    expect(post.body).toMatchObject({ cliente_codigo: "D-103", excluye_venta: false, excluye_cobro: true });
  });
});

// ═══ 6. La marca en la tabla ═════════════════════════════════════════════════
// ⚠️ CAMBIÓ DE DIRECCIÓN el 4-sep-2026. Este bloque exigía que el chip
// «N clientes sin comisión» saliera pegado al nombre del vendedor. Daniel:
// *«quita el cuadro sin comisión»*. Nació el 3-sep cuando Configuración no era
// pestaña propia y el chip era la única puerta; hoy la pestaña está arriba y el
// chip solo agregaba ruido. Ahora el candado exige lo CONTRARIO: que no salga.
// La lista sigue viajando del servidor y se ve en Configuración — lo que se
// quitó es la marca en las tablas, no el dato.
describe("🔴 el chip «N clientes sin comisión» NO va en las tablas", () => {
  it("Por empresa: Reynaldo NO lleva la marca, aunque el servidor mande sus 2 clientes", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={8} />);
    const tabla = await screen.findByRole("table");
    expect(within(tabla).queryByText(/sin comisión/)).toBeNull();
    expect(tabla.querySelector("[data-clientes-sin-comision]")).toBeNull();
    // CONTROL: la tabla sí se pintó y Reynaldo está en ella.
    expect(within(tabla).getByText("Reynaldo Espinosa")).toBeTruthy();
    const def = within(tabla).getByText("Oficina (DEFAULT)").closest("tr")!;
    expect(within(def).queryByText(/sin comisión/)).toBeNull();
  });
});
