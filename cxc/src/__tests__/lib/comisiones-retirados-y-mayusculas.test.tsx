// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — Comisiones: quién está RETIRADO y cómo se escribe el nombre.
//
// 🩸 Daniel, 3-sep-2026, textual: «esconder rey stoute. si capitiliza reynaldo.»
// Y al rato, corrigiendo la primera versión del cambio: «te dije que eliminaras
// Rey Stoute Aguas.» No es «esconder la fila»: esa persona DESAPARECE de
// Comisiones entera. Y más tarde ese mismo día: «quita colaborador» —
// «COLABORADOR» no es una persona, es el usuario genérico de Switch en Vistana
// (mostrador, 2023-2025); en 2026 la RPC le arma una fila NEGATIVA (−$5,28),
// así que retirarlo SUBE el total. Medido en
// scripts/_medir-comisiones-colaborador-retirado.mjs.
//
// Lo que pasó: la lista vivía dentro de la matriz consolidada y comparaba
// «AGUAS» a secas (3-ago-2026: «quita el vendedor aguas, no lo quiero ver»).
// Al aplicar el alias de vendedor (v8), el servidor empezó a mandar «REY STOUTE
// AGUAS» y la fila VOLVIÓ a aparecer: $49,83 en 2026, medido con la RPC real
// (scripts/_medir-comisiones-aguas-retirado.mjs). Ahora la lista vive en
// `lib/comisiones/retirados` y compara por el nombre CANÓNICO.
//
// Lo que se vigila, montando las vistas REALES:
//   (a) «REY STOUTE AGUAS», «AGUAS» y «COLABORADOR» están retirados — no existen
//       en la tabla, en las tarjetas, en el Excel, en Configuración NI EN LOS
//       TOTALES (ni sumando ni RESTANDO: la fila de COLABORADOR es negativa).
//       CONTROL: Edwin no está retirado y sí suma. La migración que desactiva
//       su tasa hace UPDATE por el canónico exacto y nunca DELETE. (Que el
//       servidor rechace una tasa o una exclusión a su nombre se prueba en
//       `comision-alias-v8.test.ts`, que ya tiene las rutas montadas.)
//   (b) Cada superficie muestra «Reynaldo Espinosa», nunca «REYNALDO ESPINOSA»:
//       las dos tablas, las tarjetas, el modal de detalle y el Excel. Solo
//       cambia cómo se MUESTRA: la clave de la fila, lo que viaja al detalle y
//       al Excel sigue en mayúsculas, y ningún número se mueve.
//   (c) El Excel lleva el nombre capitalizado en la celda del vendedor (y en
//       el título del detalle) — y nada más cambia.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/comisiones",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

const excelRecibido: {
  resumen?: { vendedores: { vendedor: string; comision_total: number; se_paga?: boolean }[] };
  consolidado?: { vendedores: { vendedor: string; total: number; se_paga?: boolean }[]; sinAsignar?: { vendedor: string } | null };
} = {};
vi.mock("@/lib/ventas/comisionExcel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ventas/comisionExcel")>()),
  exportComisionesResumen: async (r: never) => { excelRecibido.resumen = r; },
  exportComisionesConsolidado: async (c: never) => { excelRecibido.consolidado = c; },
}));

import { ComisionesPorEmpresaView } from "@/components/ventas/ComisionesPorEmpresaView";
import { ComisionesConsolidadoView } from "@/components/ventas/ComisionesConsolidadoView";
import { ComisionesDetalleModal } from "@/components/ventas/ComisionesDetalleModal";
import { ComisionesConfiguracionView } from "@/components/ventas/ComisionesConfiguracionView";
import {
  buildComisionesResumenSheet,
  buildComisionesConsolidadoSheet,
  buildComisionDetalleSheet,
} from "@/lib/ventas/comisionExcel";
import { estaRetirado, sinRetirados, VENDEDORES_RETIRADOS, AVISO_VENDEDOR_RETIRADO } from "@/lib/comisiones/retirados";
import { readFileSync } from "fs";
import path from "path";
import { nombreVendedorEnPantalla, type AliasVendedor } from "@/lib/comisiones/alias";
import { ETIQUETA_DEFAULT } from "@/lib/comisiones/vendedor-default";
import type { ExcelApi } from "@/components/ventas/ComisionesView";

const CANONICO = "REYNALDO ESPINOSA";
const BONITO = "Reynaldo Espinosa";
const AGUAS = "REY STOUTE AGUAS";
const COLABORADOR = "COLABORADOR";

const fila = (vendedor: string, total: number, se_paga = true) => ({
  vendedor,
  base: total * 200, tasa: 0.005, comision: total,
  base_cobro: 0, tasa_cobro: 0.005, comision_cobro: 0,
  comision_total: total, descuento: 0, se_paga,
});

/** Vistana: Edwin 100 · Rey Stoute Aguas 49.83 (canónico, como lo manda la v8) ·
 *  COLABORADOR −5.28 (negativa, como en producción) · la oficina 40. */
const POR_EMPRESA = {
  empresa_key: "vistana", year: 2026, mes: 8, version: "v8", regla_cobro: "quien_registro", exclusiones_aplicadas: true, alias_aplicado: true,
  vendedores: [fila("EDWIN", 100), fila(AGUAS, 49.83), fila(COLABORADOR, -5.28), fila(CANONICO, 300), fila("DEFAULT", 40, false)],
};
/** Dos empresas: Reynaldo en las dos (una sola fila), Aguas canónico en una y
 *  con la grafía vieja («AGUAS», alias fallando abierto) en la otra. */
const CONSOLIDADO = {
  empresas: [
    { empresa_key: "vistana", regla_cobro: "quien_registro", vendedores: POR_EMPRESA.vendedores },
    { empresa_key: "fashion_wear", regla_cobro: "quien_registro", vendedores: [fila(CANONICO, 200), fila("AGUAS", 10), fila("DEFAULT", 7, false)] },
  ],
};
const DETALLE = {
  empresa_key: "vistana", year: 2026, mes: 8, vendedor: CANONICO, tasa_venta: 0.01, tasa_cobro: 0.01,
  ventas: [{ fecha: "2026-08-03", cliente: "CLIENTE A", secuencial: "F-1", tipo: "Factura", subtotal: 1000, pct_utilidad: 30 }],
  cobros: [{ fecha: "2026-08-10", cliente: "CLIENTE A", monto: 500 }],
  ventas_base: 1000, cobros_base: 500, comision_venta: 10, comision_cobro: 5, comision_total: 15,
};
const CONFIG = {
  vendedores: [
    { vendedor_nombre: "EDWIN", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true, origen: ["Vistana"] },
    { vendedor_nombre: CANONICO, tasa_venta: 0.01, tasa_cobro: 0.01, activo: true, origen: ["Active Shoes"] },
    { vendedor_nombre: AGUAS, tasa_venta: 0.005, tasa_cobro: 0.005, activo: true, origen: ["Vistana"] },
    { vendedor_nombre: COLABORADOR, tasa_venta: 0.005, tasa_cobro: 0.005, activo: true, origen: ["Vistana"] },
  ],
};
const EXCLUSIONES = {
  exclusiones: [],
  vendedores: { vistana: ["EDWIN", AGUAS, COLABORADOR, CANONICO], fashion_wear: [], fashion_shoes: [], active_shoes: [], active_wear: [], joystep: [] },
};

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

const llamadas: string[] = [];
beforeEach(() => {
  llamadas.length = 0;
  delete excelRecibido.resumen;
  delete excelRecibido.consolidado;
  Object.defineProperty(window, "localStorage", { value: almacenReal(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacenReal(), configurable: true, writable: true });
  localStorage.setItem("fg_last_comision_empresa", "vistana");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push(u);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u.includes("/api/ventas/comisiones/config")) return json((init?.method ?? "GET") === "GET" ? CONFIG : { ok: true });
    if (/\/exclusiones\/[a-z_]+\/clientes-switch/.test(u)) return json({ clientes: [{ cliente_switch_id: 1, codigo: "D-1", nombre: "Kheriddine" }], contado: null });
    if (u.includes("/api/ventas/comisiones/exclusiones")) return json(EXCLUSIONES);
    if (u.includes("/comisiones/detalle")) return json(DETALLE);
    if (u.includes("/comisiones/descuentos")) return json({ descuentos: [] });
    if (u.includes("/consolidado")) return json(CONSOLIDADO);
    if (u.includes("/api/ventas/comisiones?")) return json(POR_EMPRESA);
    return json({});
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const celdasDe = (ws: Record<string, unknown>) =>
  Object.entries(ws).filter(([k]) => !k.startsWith("!")).map(([, c]) => (c as { v: unknown }).v);
/** Número de la fila de totales («Total a pagar» si hay alguien que no se paga; si no, «Total»). */
const filaTotalDe = (ws: Record<string, unknown>) =>
  Object.entries(ws).find(([k, c]) => /^A\d+$/.test(k) && /^Total( a pagar)?$/.test(String((c as { v: unknown }).v)))![0].slice(1);
const textoPie = (tabla: HTMLElement) =>
  within(within(tabla).getByText("Total a pagar").closest("tr")!).getAllByRole("cell").map((c) => c.textContent);

// ═══ (a) Los retirados ═══════════════════════════════════════════════════════
describe("🔴 (a) la lista de retirados, en UN solo lugar y por el nombre canónico", () => {
  const ALIAS: AliasVendedor[] = [
    { nombre_switch: "AGUAS", vendedor_canonico: AGUAS },
    { nombre_switch: "REINALDO ESPINOSA", vendedor_canonico: CANONICO },
  ];

  it("REY STOUTE AGUAS, AGUAS y COLABORADOR están en la lista; se compara sin importar mayúsculas ni bordes", () => {
    expect(VENDEDORES_RETIRADOS).toContain(AGUAS);
    expect(VENDEDORES_RETIRADOS).toContain("AGUAS");
    expect(VENDEDORES_RETIRADOS).toContain(COLABORADOR);
    expect(estaRetirado(AGUAS)).toBe(true);
    expect(estaRetirado("AGUAS")).toBe(true);
    expect(estaRetirado("  rey stoute aguas ")).toBe(true);
    expect(estaRetirado(" aguas")).toBe(true);
    expect(estaRetirado(COLABORADOR)).toBe(true);
    expect(estaRetirado(" colaborador ")).toBe(true);
    expect(estaRetirado("Colaborador")).toBe(true);
    // Sin alias que lo conozca (no lo hay en producción): igual está retirado.
    expect(estaRetirado(COLABORADOR, ALIAS)).toBe(true);
  });

  it("con la tabla de alias, la grafía pasa por el alias ANTES de comparar: una grafía que solo el alias conoce también está retirada", () => {
    expect(estaRetirado("AGUAS", ALIAS)).toBe(true);
    expect(estaRetirado("Aguas ", ALIAS)).toBe(true);
    // «R. S. AGUAS» no está en la lista: solo el alias sabe que es la misma persona.
    const conGrafiaNueva: AliasVendedor[] = [...ALIAS, { nombre_switch: "R. S. AGUAS", vendedor_canonico: AGUAS }];
    expect(estaRetirado("R. S. AGUAS", conGrafiaNueva)).toBe(true);
    expect(estaRetirado("R. S. AGUAS")).toBe(false); // sin alias no hay forma de saberlo
  });

  it("el aviso del servidor existe y no dice «exclusión» ni «oculto»", () => {
    expect(AVISO_VENDEDOR_RETIRADO).toMatch(/ya no está en Comisiones/);
    expect(AVISO_VENDEDOR_RETIRADO).not.toMatch(/exclusi|oculto/i);
  });

  it("🔴 la migración desactiva su tasa por el canónico EXACTO (activo = false), nunca DELETE, y no toca el alias", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20260916120000_retirar_rey_stoute_aguas.sql"), "utf8");
    const sinComentarios = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(sinComentarios).toMatch(/UPDATE comision_vendedor_tasa/);
    expect(sinComentarios).toMatch(/SET activo = false/);
    expect(sinComentarios).toMatch(/WHERE vendedor_nombre = 'REY STOUTE AGUAS'/);
    expect(sinComentarios).not.toMatch(/DELETE/i);
    expect(sinComentarios).not.toMatch(/comision_vendedor_alias/);
  });

  it("CONTROL: Edwin, Reynaldo (canónico o no), Rodrigo, DEFAULT y vacío NO están retirados", () => {
    expect(estaRetirado("EDWIN")).toBe(false);
    expect(estaRetirado("EDWIN", ALIAS)).toBe(false);
    expect(estaRetirado(CANONICO)).toBe(false);
    expect(estaRetirado("REINALDO ESPINOSA", ALIAS)).toBe(false);
    expect(estaRetirado("Rodrigo")).toBe(false);
    expect(estaRetirado("DEFAULT")).toBe(false);
    expect(estaRetirado("")).toBe(false);
    expect(estaRetirado(null)).toBe(false);
    expect(estaRetirado(undefined)).toBe(false);
  });

  it("sinRetirados quita solo a los retirados (Aguas y COLABORADOR) y no toca los montos de los demás", () => {
    const out = sinRetirados(POR_EMPRESA.vendedores);
    expect(out.map((v) => v.vendedor)).toEqual(["EDWIN", CANONICO, "DEFAULT"]);
    expect(out.find((v) => v.vendedor === "EDWIN")?.comision_total).toBe(100);
  });
});

describe("🔴 (a) Por empresa: ni Aguas ni COLABORADOR existen en la tabla, ni en las tarjetas, ni en el total", () => {
  it("la tabla no los lista y «Total a pagar» = Edwin 100 + Reynaldo 300 = $400.00, no $449.83 ni $394.72 ni $444.55", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={8} />);
    const tabla = await screen.findByRole("table");
    expect(within(tabla).queryByText(/Aguas/i)).toBeNull();
    expect(within(tabla).queryByText(/Colaborador/i)).toBeNull();
    expect(screen.queryByText(/Rey Stoute Aguas|REY STOUTE AGUAS|COLABORADOR/)).toBeNull();
    // CONTROL: Edwin sí está y sí suma.
    expect(within(tabla).getByText("Edwin")).toBeTruthy();
    const pie = textoPie(tabla);
    expect(pie).toContain("$400.00");
    expect(pie).not.toContain("$449.83");
    // COLABORADOR es negativo: si se colara, el total BAJARÍA a $394.72 (o $444.55 con Aguas).
    expect(pie).not.toContain("$394.72");
    expect(pie).not.toContain("$444.55");
    expect(pie.some((c) => /-\$?5\.28/.test(c ?? ""))).toBe(false);
    // Ni «vendedor sin actividad»: no se colapsa, no existe.
    expect(within(tabla).queryByText(/sin actividad/)).toBeNull();
  });

  // 🔄 6-sep-2026: la oficina (que NO se paga) arranca detrás de «Ver los que no
  // se pagan», así que a la vista quedan 2 tarjetas y con el enlace abierto, 3.
  // Lo que este caso cuida —que Aguas y COLABORADOR no existan en ninguna de las
  // dos— no cambió.
  it("las tarjetas del celular: 2 a la vista (Edwin, Reynaldo) y 3 con la oficina; ninguna de Aguas, total $400.00", async () => {
    const { container } = render(<ComisionesPorEmpresaView year={2026} mes={8} />);
    const tabla = await screen.findByRole("table");
    expect([...container.querySelectorAll("[data-comision-card]")]).toHaveLength(2);
    fireEvent.click(within(tabla).getByRole("button", { name: /Ver los que no se pagan/ }));
    const tarjetas = [...container.querySelectorAll("[data-comision-card]")].map((c) => c.textContent ?? "");
    expect(tarjetas).toHaveLength(3);
    expect(tarjetas.some((t) => /Aguas/i.test(t))).toBe(false);
    expect(tarjetas.some((t) => /Colaborador/i.test(t))).toBe(false);
    expect(container.querySelector("[data-comision-total]")?.textContent).toContain("$400.00");
  });

  it("el Excel de esa vista no recibe a Aguas y su Total tampoco lo suma", async () => {
    let api: ExcelApi | null = null;
    render(<ComisionesPorEmpresaView year={2026} mes={8} onExcel={(a) => { api = a; }} />);
    await screen.findByRole("table");
    api!.run();
    await vi.waitFor(() => expect(excelRecibido.resumen).toBeTruthy());
    expect(excelRecibido.resumen!.vendedores.map((v) => v.vendedor)).not.toContain(AGUAS);
    expect(excelRecibido.resumen!.vendedores.map((v) => v.vendedor)).not.toContain(COLABORADOR);
    const ws = await buildComisionesResumenSheet({
      empresaKey: "vistana", empresaNombre: "Vistana", year: 2026, mes: 8,
      vendedores: excelRecibido.resumen!.vendedores as never,
    });
    const celdas = celdasDe(ws);
    expect(celdas.some((c) => typeof c === "string" && /aguas|colaborador/i.test(c))).toBe(false);
    expect((ws[`F${filaTotalDe(ws)}`] as { v: number }).v).toBe(400);
  });
});

describe("🔴 (a) Todas las empresas: ni el canónico ni la grafía vieja entran a la matriz ni a los totales", () => {
  it("la matriz: Edwin, Reynaldo y la oficina; vistana $400.00 · fashion_wear $200.00 · total $600.00", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={8} />);
    const tabla = await screen.findByRole("table");
    expect(within(tabla).queryByText(/Aguas/i)).toBeNull();
    expect(within(tabla).queryByText(/Colaborador/i)).toBeNull();
    // 🔄 6-sep-2026: la oficina arranca escondida (no se paga), así que a la
    // vista hay 2 filas; con «Ver los que no se pagan» abierto, 3.
    expect(within(tabla).getAllByRole("row").filter((r) => r.hasAttribute("data-se-paga"))).toHaveLength(2);
    fireEvent.click(within(tabla).getByRole("button", { name: /Ver los que no se pagan/ }));
    const filas = within(tabla).getAllByRole("row").filter((r) => r.hasAttribute("data-se-paga"));
    expect(filas).toHaveLength(3);
    const pie = textoPie(tabla);
    expect(pie).toContain("$400.00");
    expect(pie).toContain("$200.00");
    expect(pie).toContain("$600.00");
    expect(pie).not.toContain("$449.83");
    expect(pie).not.toContain("$210.00");
    expect(pie).not.toContain("$659.83");
    // Con COLABORADOR (−5.28) colado: vistana $394.72 / total $594.72.
    expect(pie).not.toContain("$394.72");
    expect(pie).not.toContain("$594.72");
  });

  it("el Excel consolidado no lo lleva y su Total tampoco", async () => {
    let api: ExcelApi | null = null;
    render(<ComisionesConsolidadoView year={2026} mes={8} onExcel={(a) => { api = a; }} />);
    await screen.findByRole("table");
    api!.run();
    await vi.waitFor(() => expect(excelRecibido.consolidado).toBeTruthy());
    const c = excelRecibido.consolidado!;
    // Lo que viaja al Excel es la clave en MAYÚSCULAS (la capitalización es
    // solo al escribir la celda), sin Aguas en ninguna de sus dos grafías.
    const nombres = c.vendedores.map((v) => v.vendedor);
    expect(nombres).toEqual(expect.arrayContaining(["EDWIN", CANONICO]));
    expect(nombres).toHaveLength(2);
    expect(nombres).not.toContain(AGUAS);
    expect(nombres).not.toContain("AGUAS");
    expect(nombres).not.toContain(COLABORADOR);
    const ws = await buildComisionesConsolidadoSheet({
      year: 2026, mes: 8,
      empresas: [{ key: "vistana", nombre: "Vistana" }, { key: "fashion_wear", nombre: "Fashion Wear" }],
      vendedores: c.vendedores as never,
      sinAsignar: c.sinAsignar as never,
    });
    expect((ws[`D${filaTotalDe(ws)}`] as { v: number }).v).toBe(600);
  });

  it("el constructor del Excel se defiende solo: si le llega Aguas o COLABORADOR, no lo lista ni lo suma (resumen y consolidado)", async () => {
    const resumen = await buildComisionesResumenSheet({
      empresaKey: "vistana", empresaNombre: "Vistana", year: 2026, mes: 8,
      vendedores: [fila("EDWIN", 100), fila(AGUAS, 49.83), fila("AGUAS", 10), fila(COLABORADOR, -5.28)],
    });
    expect(celdasDe(resumen).some((c) => typeof c === "string" && /aguas|colaborador/i.test(c))).toBe(false);
    expect((resumen[`F${filaTotalDe(resumen)}`] as { v: number }).v).toBe(100);

    const consolidado = await buildComisionesConsolidadoSheet({
      year: 2026, mes: 8,
      empresas: [{ key: "vistana", nombre: "Vistana" }],
      vendedores: [
        { vendedor: "EDWIN", porEmpresa: { vistana: 100 }, total: 100, se_paga: true },
        { vendedor: AGUAS, porEmpresa: { vistana: 49.83 }, total: 49.83, se_paga: true },
        { vendedor: COLABORADOR, porEmpresa: { vistana: -5.28 }, total: -5.28, se_paga: true },
      ],
    });
    expect(celdasDe(consolidado).some((c) => typeof c === "string" && /aguas|colaborador/i.test(c))).toBe(false);
    expect((consolidado[`C${filaTotalDe(consolidado)}`] as { v: number }).v).toBe(100);
  });
});

describe("🔴 (a) Configuración: ni Aguas ni COLABORADOR existen en «Tasas por vendedor» ni en el desplegable de vendedores", () => {
  it("la tabla de tasas los omite aunque el servidor los mande; CONTROL: Edwin y Reynaldo sí", async () => {
    render(<ComisionesConfiguracionView />);
    const tasas = (await screen.findByText("Tasas por vendedor")).closest("section")!;
    await within(tasas).findByText("Edwin");
    expect(within(tasas).getByText(BONITO)).toBeTruthy();
    expect(within(tasas).queryByText(/Aguas/i)).toBeNull();
    expect(within(tasas).queryByText(/Colaborador/i)).toBeNull();
  });

  it("al agregar un cliente que no comisiona, el desplegable no ofrece a Aguas", async () => {
    render(<ComisionesConfiguracionView />);
    await screen.findByText("Clientes que no comisionan");
    // Desde el 6-sep-2026 hay DOS «+ Agregar» en la pestaña (Clientes que no
    // comisionan y Descuentos): se acota a la sección que este caso mira.
    const seccion = document.querySelector('[aria-labelledby="sin-comision-titulo"]') as HTMLElement;
    fireEvent.click(within(seccion).getByRole("button", { name: "+ Agregar" }));
    const alta = await screen.findByTestId("alta-sin-comision");
    const select = within(alta).getByLabelText("Vendedor") as HTMLSelectElement;
    const opciones = [...select.options].map((o) => o.textContent ?? "");
    expect(opciones).toContain("Edwin");
    expect(opciones).toContain(BONITO);
    expect(opciones.some((o) => /aguas|colaborador/i.test(o))).toBe(false);
    expect([...select.options].map((o) => o.value)).not.toContain(AGUAS);
    expect([...select.options].map((o) => o.value)).not.toContain(COLABORADOR);
  });
});

// ═══ (b) «Reynaldo Espinosa», capitalizado en todas partes ═══════════════════
describe("🔴 (b) cada superficie muestra «Reynaldo Espinosa», nunca «REYNALDO ESPINOSA»", () => {
  it("Por empresa: la tabla y las tarjetas; la clave de la fila sigue siendo el canónico en mayúsculas", async () => {
    const { container } = render(<ComisionesPorEmpresaView year={2026} mes={8} />);
    const tabla = await screen.findByRole("table");
    expect(within(tabla).getByText(BONITO)).toBeTruthy();
    expect(within(tabla).queryByText(CANONICO)).toBeNull();
    expect(within(tabla).getByText("Edwin")).toBeTruthy();
    expect(within(tabla).queryByText("EDWIN")).toBeNull();
    // La oficina sigue diciendo «Oficina (DEFAULT)», no «Oficina (default)»
    // — detrás de «Ver los que no se pagan» desde el 6-sep-2026.
    fireEvent.click(within(tabla).getByRole("button", { name: /Ver los que no se pagan/ }));
    expect(within(tabla).getByText(ETIQUETA_DEFAULT)).toBeTruthy();
    // Tarjetas del celular: mismo nombre bonito.
    const tarjetas = [...container.querySelectorAll("[data-comision-card]")].map((c) => c.textContent ?? "");
    expect(tarjetas.some((t) => t.includes(BONITO))).toBe(true);
    expect(tarjetas.some((t) => t.includes(CANONICO))).toBe(false);
    // Tocar la fila abre el detalle con el nombre TAL CUAL (el que agrupa la RPC).
    fireEvent.click(within(tabla).getByText(BONITO).closest("tr")!);
    await waitFor(() => expect(llamadas.some((u) => u.includes(`/comisiones/detalle?`) && u.includes(encodeURIComponent(CANONICO)))).toBe(true));
  });

  it("Todas las empresas: la matriz junta las dos empresas de Reynaldo en UNA fila, la muestra capitalizada y los números no cambian", async () => {
    const { container } = render(<ComisionesConsolidadoView year={2026} mes={8} />);
    const tabla = await screen.findByRole("table");
    expect(within(tabla).getAllByText(BONITO)).toHaveLength(1);
    expect(within(tabla).queryByText(CANONICO)).toBeNull();
    fireEvent.click(within(tabla).getByRole("button", { name: /Ver los que no se pagan/ }));
    expect(within(tabla).getByText(ETIQUETA_DEFAULT)).toBeTruthy();
    const filaRey = within(tabla).getByText(BONITO).closest("tr")!;
    const celdas = within(filaRey).getAllByRole("cell").map((c) => c.textContent);
    expect(celdas).toContain("$300.00");
    expect(celdas).toContain("$200.00");
    expect(celdas).toContain("$500.00");
    const tarjetas = [...container.querySelectorAll("[data-comision-card]")].map((c) => c.textContent ?? "");
    expect(tarjetas.some((t) => t.includes(BONITO))).toBe(true);
    expect(tarjetas.some((t) => t.includes(CANONICO))).toBe(false);
    expect(tarjetas.some((t) => t.includes(ETIQUETA_DEFAULT))).toBe(true);
    expect(tarjetas.some((t) => /Oficina \(default\)/.test(t))).toBe(false);
  });

  it("el modal de detalle: el título en pantalla y el encabezado del papel", async () => {
    render(
      <ComisionesDetalleModal
        empresa="vistana" empresaNombre="Vistana International" year={2026} mes={8}
        vendedor={CANONICO} onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getAllByText("TOTAL VENTAS").length).toBeGreaterThan(0));
    expect(screen.getByRole("heading", { name: `Comisión — ${BONITO}` })).toBeTruthy();
    expect(screen.queryByText(new RegExp(`Comisión — ${CANONICO}`))).toBeNull();
    // El encabezado que se repite en cada hoja impresa.
    expect(screen.getAllByText(new RegExp(`^Comisión — ${BONITO} · Vistana International`)).length).toBeGreaterThan(0);
    // Y el detalle se pidió con el nombre canónico tal cual.
    expect(llamadas.some((u) => u.includes("/comisiones/detalle?") && u.includes(encodeURIComponent(CANONICO)))).toBe(true);
  });

  it("aplica a todos, no solo a Reynaldo: Edwin, Rodrigo, Daniel Levy; y DEFAULT sigue siendo la oficina", () => {
    expect(nombreVendedorEnPantalla("EDWIN")).toBe("Edwin");
    expect(nombreVendedorEnPantalla("Rodrigo")).toBe("Rodrigo");
    expect(nombreVendedorEnPantalla("DANIEL LEVY")).toBe("Daniel Levy");
    expect(nombreVendedorEnPantalla("DEFAULT")).toBe(ETIQUETA_DEFAULT);
    expect(nombreVendedorEnPantalla(ETIQUETA_DEFAULT)).toBe(ETIQUETA_DEFAULT);
  });
});

// ═══ (c) El Excel ════════════════════════════════════════════════════════════
describe("🔴 (c) el Excel lleva el nombre capitalizado y nada más cambia", () => {
  it("resumen por empresa: la celda del vendedor dice «Reynaldo Espinosa»; los números y la fila 1 quedan igual", async () => {
    const ws = await buildComisionesResumenSheet({
      empresaKey: "vistana", empresaNombre: "Vistana", year: 2026, mes: 8,
      vendedores: [fila(CANONICO, 300), fila("EDWIN", 100), fila("DANIEL LEVY", 25, false)],
    });
    const celdas = celdasDe(ws);
    expect(celdas).toContain(BONITO);
    expect(celdas).toContain("Edwin");
    expect(celdas).toContain("Daniel Levy (no se paga)");
    expect(celdas).not.toContain(CANONICO);
    expect(celdas).not.toContain("EDWIN");
    // Fila 1 = encabezados, como todo Excel del sistema.
    expect((ws.A1 as { v: unknown }).v).toBe("Vendedor");
    // Los montos no se tocan: 300 + 100 = 400 (Daniel no se paga).
    expect((ws[`F${filaTotalDe(ws)}`] as { v: number }).v).toBe(400);
    expect(celdas).toContain(300);
  });

  it("consolidado: «Reynaldo Espinosa» y «Oficina (DEFAULT)», nunca en mayúsculas ni «Oficina (default)»", async () => {
    const ws = await buildComisionesConsolidadoSheet({
      year: 2026, mes: 8,
      empresas: [{ key: "vistana", nombre: "Vistana" }],
      vendedores: [{ vendedor: CANONICO, porEmpresa: { vistana: 300 }, total: 300, se_paga: true }],
      sinAsignar: { vendedor: "DEFAULT", porEmpresa: { vistana: 40 }, total: 40, se_paga: false },
    });
    const celdas = celdasDe(ws);
    expect(celdas).toContain(BONITO);
    expect(celdas).toContain(`${ETIQUETA_DEFAULT} (no se paga)`);
    expect(celdas).not.toContain(CANONICO);
    expect(celdas.some((c) => typeof c === "string" && /Oficina \(default\)/.test(c))).toBe(false);
    expect((ws[`C${filaTotalDe(ws)}`] as { v: number }).v).toBe(300);
  });

  it("detalle del vendedor: el título de la hoja va capitalizado", async () => {
    // 🔄 6-sep-2026: título, empresa y período caben en la FILA 1 (los
    // encabezados de la tabla pasaron a la 3, con filtro). El nombre sigue
    // capitalizado, que es lo que este caso cuida.
    const ws = await buildComisionDetalleSheet(DETALLE, "Vistana");
    expect((ws.A1 as { v: string }).v).toContain(`Comisión — ${BONITO}`);
    expect((ws.A1 as { v: string }).v).not.toContain(CANONICO);
  });
});
