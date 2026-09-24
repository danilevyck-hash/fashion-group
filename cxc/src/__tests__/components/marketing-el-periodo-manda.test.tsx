/**
 * CANDADO — MARKETING › EL PERÍODO MANDA (23-sep-2026).
 *
 * Daniel, con el mockup aprobado (`marketing-periodos.html`): «arriba eliges
 * el período, abajo ves lo de ese período»; y sobre los anulados: *«se
 * elimina y listo… con seguro de que escriban ELIMINAR»*.
 *
 * Lo que este archivo no deja aflojar (DOM + puro + barridos):
 *   1. LA FICHA Y LA LISTA DE TIENDAS ABREN EN «ABIERTO».
 *   2. LOS CHIPS SALEN DE LOS PERÍODOS REALES DE LOS GASTOS, nunca de una
 *      lista a mano: un cerrado sin gastos no se dibuja; los abiertos de cada
 *      marca se juntan en «Abierto».
 *   3. EN UN PERÍODO SOLO SE VEN SUS GASTOS Y EL KPI CUADRA. Con los números
 *      de producción del 23-sep-2026 de Outlet Duty Free N3 (D-118), medidos
 *      contra los sellos Y contra el ZIP real de «mid 2026» de Tommy (que
 *      trae el letrero de Impreco Y la entrega ME-0014 de $4.630):
 *      Abierto $1.771,27 (2) · mid 2026 · PVH $4.701,26 (2) · Todos $6.472,53.
 *   4. «TODOS» AGRUPA POR PERÍODO, el más nuevo arriba, con subtotales que
 *      SUMAN el total.
 *   5. UN ANULADO NO APARECE EN NINGUNA SUPERFICIE: ni chip, ni fila, ni
 *      conteo, ni en el historial de la impulsadora; el servidor no lo manda.
 *   6. ANULAR EXIGE ESCRIBIR «ELIMINAR» (exacto) y llama a la ruta de siempre.
 *   7. EL CRON `cleanup-marketing-anulados` BORRA SOLO LO DE MÁS DE 90 DÍAS,
 *      con sus archivos y sus sellos, y respeta «una entrada = una ocurrencia».
 *   8. INTERRUPTOR EN `false` = COMO ANTES: la vista por marca, sin barra;
 *      la ruta de Tiendas no existe; el cron no borra nada.
 *
 * Mutaciones a mano: ver `docs/postmortems/marketing-rediseno.md` § 13.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { ToastProvider } from "@/components/ToastSystem";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
  process.env.SESSION_SECRET ||= "test-secret";
  process.env.CRON_SECRET ||= "test-cron";
});

// ── Perillas: el interruptor, el rol y la URL ────────────────────────────────
const perilla = vi.hoisted(() => ({
  encendido: true,
  role: "admin",
  query: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

// ── Un Supabase de mentira para el cron: anota cada llamada ──────────────────
const fake = vi.hoisted(() => {
  const llamadas: Array<{ tabla: string; op: string; args: unknown[] }> = [];
  const datos: Record<string, unknown[]> = {};
  const errores: Record<string, { code: string; message: string }> = {};
  const storageRemove = vi.fn(async (_paths: string[]) => ({ error: null }));
  function consulta(tabla: string) {
    const ops: string[] = [];
    const q: Record<string, unknown> = {};
    const paso = (op: string) => (...args: unknown[]) => {
      ops.push(op);
      llamadas.push({ tabla, op, args });
      return q;
    };
    for (const op of ["select", "not", "lt", "order", "limit", "in", "delete", "eq"]) q[op] = paso(op);
    q.then = (resolve: (v: unknown) => unknown) => {
      if (ops.includes("delete")) return resolve({ data: null, error: null });
      if (errores[tabla]) return resolve({ data: null, error: errores[tabla] });
      return resolve({ data: datos[tabla] ?? [], error: null, count: null });
    };
    return q;
  }
  return {
    llamadas,
    datos,
    errores,
    storageRemove,
    supabaseServer: { from: consulta, storage: { from: () => ({ remove: storageRemove }) } },
  };
});

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: fake.supabaseServer }));
vi.mock("@/lib/marketing/tiendas-y-marcas", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/marketing/tiendas-y-marcas")>();
  return {
    ...real,
    get MARKETING_TIENDAS_Y_MARCAS() {
      return perilla.encendido;
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(perilla.query),
  useRouter: () => ({ push: perilla.push, replace: perilla.replace, back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: perilla.role, isOwner: perilla.role === "admin" }),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <div data-testid="app-header" /> }));
vi.mock("@/app/marketing/components/RegistrarGastoModal", () => ({
  default: (p: { tiendaCodigo?: string | null }) => <div data-testid="stub-puerta" data-tienda={p.tiendaCodigo ?? ""} />,
}));
vi.mock("@/app/marketing/components/FotosSection", () => ({ default: () => <div data-testid="stub-fotos" /> }));
vi.mock("@/components/marketing/NotaEntregaAcciones", () => ({ default: () => null }));
vi.mock("@/components/marketing/FacturaForm", () => ({
  FacturaForm: () => <div data-testid="stub-factura-form" />,
}));
vi.mock("@/components/marketing/EntregaForm", () => ({ default: () => <div data-testid="stub-entrega-form" /> }));
vi.mock("@/lib/cron-telemetry", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/cron-telemetry")>();
  return { ...real, recordCronHeartbeat: vi.fn(async () => {}), logCronError: vi.fn(async () => {}) };
});

import VistaTienda from "@/app/marketing/tienda/[codigo]/VistaTienda";
import PortadaTiendas from "@/app/marketing/components/PortadaTiendas";
import {
  DIAS_PARA_BORRAR_ANULADOS,
  PALABRA_PARA_ANULAR,
  PERIODO_ABIERTO,
  PERIODO_TODOS,
  anuladoCaduco,
  bloquesPorPeriodo,
  cabeceraDelBloque,
  chipsDePeriodos,
  confirmaEliminar,
  corteDeAnulados,
  gastosDelPeriodo,
  periodoElegido,
  tiendasPorPeriodo,
  textoDelPieDelPeriodo,
} from "@/lib/marketing/periodo-manda";
import { pieDeLaFicha, chipsDeLaFicha } from "@/lib/marketing/tiendas-y-marcas";
import { runLimpiezaAnuladosMarketing } from "@/lib/marketing/anulados-caducos";
import { SEED_TOLERANT_CRONS, CRONS_CONOCIDOS } from "@/lib/cron-telemetry";
import type { FilaDeTienda } from "@/lib/marketing/vista-tienda";
import type { GastoParaReporte } from "@/lib/marketing/reportes-rediseno";

// ═════════════════════════════════════════════════════════════════════════════
// LOS NÚMEROS DE PRODUCCIÓN (medidos por REST el 23-sep-2026, solo lectura).
// Outlet Duty Free N3 (D-118): 3 facturas + 1 mueble, todos reportados. El
// letrero de Impreco (18 jun) y la entrega de muebles (22 jun) llevan sello a
// «mid 2026» (pvh, cerrado el 12-ago-2026 01:20 UTC = 11 ago en Panamá) y
// ESTÁN en el ZIP real de ese cierre; las dos facturas del 21 sep van a los
// abiertos de Tommy y de Calvin.
// ═════════════════════════════════════════════════════════════════════════════
const MID_2026 = {
  id: "8e2ee894-2b68-47f2-b342-b6c0bc9f5a0a",
  nombre: "mid 2026",
  proveedorKey: "pvh",
  cerradoEn: "2026-08-12T01:20:45.664098+00:00",
};
const fila = (x: Partial<FilaDeTienda> & Pick<FilaDeTienda, "id" | "tipo" | "monto" | "fecha">): FilaDeTienda => ({
  marcaCodigo: "TH",
  marcaNombre: "Tommy Hilfiger",
  proveedor: "",
  detalle: "",
  seReporta: true,
  estadoPeriodo: "abierto",
  periodoNombre: "Período 2026",
  periodo: null,
  ...x,
});
const FILAS_D118: FilaDeTienda[] = [
  fila({ id: "785165a4", tipo: "factura", monto: 731.02, fecha: "2026-09-21", marcaCodigo: "CK", marcaNombre: "Calvin Klein", proveedor: "Impresora Comercial", concepto: "Letrero, plantilla, lámina ACM", numero: "0000065467", subtotal: 683.2, itbms: 47.82, tienePdf: true }),
  fila({ id: "ffad9c27", tipo: "factura", monto: 1040.25, fecha: "2026-09-21", proveedor: "Impresora Comercial", concepto: "Remodelacion", numero: "0000065466", subtotal: 972.2, itbms: 68.05, tienePdf: true }),
  fila({ id: "18edd242", tipo: "mueble", monto: 4630, fecha: "2026-06-22", nota: "Muebles de la bodega", estadoPeriodo: "cerrado", periodoNombre: "mid 2026", periodo: MID_2026 }),
  fila({ id: "91c5f886", tipo: "factura", monto: 71.26, fecha: "2026-06-18", proveedor: "Impreco", concepto: "Letrero", numero: "0000064553", subtotal: 66.6, itbms: 4.66, estadoPeriodo: "cerrado", periodoNombre: "mid 2026", periodo: MID_2026 }),
];
const DATOS_D118 = {
  codigo: "D-118",
  nombre: "Outlet Duty Free N3, S.A.",
  enElDirectorio: true,
  grupos: [],
  totales: { reportado: 6472.53, noReportado: 0, cantidadReportada: 4, cantidadNoReportada: 0 },
  fotos: 2,
  sinMigracion: false,
  filas: FILAS_D118,
  anuladas: [],
};

// La portada: D-118, Nova Lux (todo abierto, $12.649,97 en 7) y City Mall
// David (todo en mid 2026, $37.460,92 en 9) — medidos el 23-sep-2026.
const NOMBRES_MARCA = { TH: "Tommy Hilfiger", CK: "Calvin Klein" };
const gasto = (x: Partial<GastoParaReporte> & Pick<GastoParaReporte, "id" | "tiendaCodigo" | "monto">): GastoParaReporte => ({
  tipo: "factura",
  marcaCodigo: "TH",
  tiendaNombre: null,
  seReporta: true,
  fecha: "2026-06-01",
  periodo: null,
  ...x,
});
const GASTOS_PORTADA: GastoParaReporte[] = [
  ...FILAS_D118.map((f) => gasto({ id: f.id, tiendaCodigo: "D-118", tiendaNombre: "Outlet Duty Free N3, S.A.", monto: f.monto, marcaCodigo: f.marcaCodigo, periodo: f.periodo })),
  ...[3736.75, 8913.22].map((m, i) => gasto({ id: `nova-${i}`, tiendaCodigo: "D-170", tiendaNombre: "Nova Lux, S.A.", monto: m, marcaCodigo: i === 0 ? "CK" : "TH" })),
  ...[29199.12, 8261.8].map((m, i) => gasto({ id: `cmd-${i}`, tiendaCodigo: "D-24", tiendaNombre: "City Mall David", monto: m, marcaCodigo: i === 0 ? "TH" : "CK", periodo: MID_2026 })),
];
const TIENDAS = tiendasPorPeriodo(GASTOS_PORTADA, NOMBRES_MARCA);

const llamadas = vi.hoisted(() => ({ fetch: [] as Array<{ url: string; method: string; body: unknown }> }));
function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      let body: unknown = null;
      try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = init?.body; }
      llamadas.fetch.push({ url, method, body });
      const p = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
      if (p === "/api/marketing/marcas") return json([]);
      if (p === "/api/marketing/tiendas") return json(TIENDAS);
      if (p === "/api/marketing/tienda/D-118") return json(DATOS_D118);
      if (p.startsWith("/api/marketing/facturas/") && p.endsWith("/anular")) return json({ ok: true });
      if (p.startsWith("/api/marketing/inventario/entregas/") && method === "DELETE") return json({ ok: true });
      return json({ error: `sin doble para ${p}` }, 404);
    }),
  );
}

beforeEach(() => {
  perilla.encendido = true;
  perilla.role = "admin";
  perilla.query = "";
  perilla.push.mockReset();
  perilla.replace.mockReset();
  llamadas.fetch.length = 0;
  fake.llamadas.length = 0;
  fake.storageRemove.mockClear();
  for (const k of Object.keys(fake.datos)) delete fake.datos[k];
  for (const k of Object.keys(fake.errores)) delete fake.errores[k];
  stubFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const leer = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const tabPeriodo = (nombre: RegExp) => within(screen.getByRole("tablist", { name: "Elegir el período" })).getByRole("tab", { name: nombre });
const filasDeGasto = () => screen.getAllByRole("table")[0].querySelectorAll("tbody tr[data-fg-gasto]");
const kpi = () => screen.getByRole("main").querySelector("[data-fg-kpi-total]")!.textContent;

async function abrirFicha() {
  render(<ToastProvider><VistaTienda codigo="D-118" /></ToastProvider>);
  await waitFor(() => expect(screen.getByText(/Outlet Duty Free N3/)).toBeTruthy());
}

// ═════════════════════════════════════════════════════════════════════════════
describe("1 · los chips salen de los períodos reales de los gastos, y se abre en Abierto", () => {
  it("D-118: Abierto · 2, «mid 2026 · PVH» · 2, Todos · 4 — y nada a mano", () => {
    const chips = chipsDePeriodos(FILAS_D118);
    expect(chips.map((c) => [c.clave, c.rotulo, c.cantidad])).toEqual([
      [PERIODO_ABIERTO, "Abierto", 2],
      [MID_2026.id, "mid 2026 · PVH", 2],
      [PERIODO_TODOS, "Todos", 4],
    ]);
    // Sin gastos en un cerrado, el cerrado no existe como chip.
    expect(chipsDePeriodos(FILAS_D118.filter((f) => !f.periodo)).map((c) => c.clave)).toEqual([PERIODO_ABIERTO, PERIODO_TODOS]);
    // Se abre en Abierto, y una clave desconocida cae en Abierto.
    expect(periodoElegido(chips, undefined)).toBe(PERIODO_ABIERTO);
    expect(periodoElegido(chips, "basura")).toBe(PERIODO_ABIERTO);
    expect(periodoElegido(chips, MID_2026.id)).toBe(MID_2026.id);
  });

  it("la ficha abre con «Abierto» elegido y la barra dibuja esos tres chips", async () => {
    await abrirFicha();
    const barra = screen.getByRole("tablist", { name: "Elegir el período" });
    const chips = within(barra).getAllByRole("tab");
    // 🔴 Sin conteo: Daniel (24-sep-2026) «números de facturas no me hace sentido, es mejor nada».
    expect(chips.map((c) => c.textContent)).toEqual(["Abierto", "mid 2026 · PVH", "Todos"]);
    expect(chips[0].getAttribute("aria-selected")).toBe("true");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2 · en un período solo se ven sus gastos y el KPI cuadra (D-118, medido)", () => {
  it("puro: Abierto $1.771,27 (2) · mid 2026 $4.701,26 (2) · Todos $6.472,53 (4)", () => {
    const abierto = gastosDelPeriodo(FILAS_D118, PERIODO_ABIERTO);
    const mid = gastosDelPeriodo(FILAS_D118, MID_2026.id);
    expect(abierto.map((f) => f.id)).toEqual(["785165a4", "ffad9c27"]);
    expect(pieDeLaFicha(abierto).total).toBe(1771.27);
    expect(mid.map((f) => f.id)).toEqual(["18edd242", "91c5f886"]);
    expect(pieDeLaFicha(mid).total).toBe(4701.26);
    expect(pieDeLaFicha(gastosDelPeriodo(FILAS_D118, PERIODO_TODOS)).total).toBe(6472.53);
  });

  it("DOM: Abierto muestra 2 renglones y $1,771.27; el pie dice a qué ZIP van", async () => {
    await abrirFicha();
    expect(kpi()).toBe("$1,771.27");
    expect(filasDeGasto().length).toBe(2);
    expect(screen.queryByText(/Impreco/)).toBeNull();
    expect(screen.getByText("Abierto · aún no pasado a la marca")).toBeTruthy();
    expect(screen.getByText(/2 gastos · irán al próximo ZIP de Calvin Klein y de Tommy Hilfiger/)).toBeTruthy();
    // Los chips de marca cuentan SOLO lo del período: Todas las marcas 2 · Calvin 1 · Tommy 1.
    expect(chipsDeLaFicha(gastosDelPeriodo(FILAS_D118, PERIODO_ABIERTO)).map((c) => [c.rotulo, c.cantidad])).toEqual([
      ["Todas las marcas", 2], ["Calvin Klein", 1], ["Tommy Hilfiger", 1],
    ]);
  });

  it("DOM: «mid 2026 · PVH» muestra sus 2 renglones y $4,701.26, y el pie dice que ya se pasó", async () => {
    await abrirFicha();
    fireEvent.click(tabPeriodo(/mid 2026 · PVH/));
    await waitFor(() => expect(kpi()).toBe("$4,701.26"));
    expect(filasDeGasto().length).toBe(2);
    expect(screen.getByText(/Impreco/)).toBeTruthy();
    expect(screen.queryByText(/Remodelacion/)).toBeNull();
    expect(screen.getByText("mid 2026 · PVH · cerrado el 11 ago 2026")).toBeTruthy();
    expect(screen.getByText(/2 gastos · ya pasados a la marca en «mid 2026 · PVH»/)).toBeTruthy();
    // El Excel baja lo que se mira: el período elegido.
    expect(screen.getByRole("button", { name: "Excel" }).hasAttribute("disabled")).toBe(false);
  });

  it("`?periodo=<id del cerrado>` abre ahí; `?periodo=basura` abre en Abierto", async () => {
    perilla.query = `periodo=${MID_2026.id}`;
    await abrirFicha();
    expect(kpi()).toBe("$4,701.26");
    cleanup();
    perilla.query = "periodo=basura";
    await abrirFicha();
    expect(kpi()).toBe("$1,771.27");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3 · «Todos» agrupa por período, el más nuevo arriba, y los subtotales suman el total", () => {
  it("puro: dos bloques —Abierto y mid 2026— cuyos subtotales dan $6.472,53", () => {
    const bloques = bloquesPorPeriodo(FILAS_D118);
    expect(bloques.map((b) => [b.clave, b.total, b.cantidad, b.cerrado])).toEqual([
      [PERIODO_ABIERTO, 1771.27, 2, false],
      [MID_2026.id, 4701.26, 2, true],
    ]);
    expect(Math.round(bloques.reduce((s, b) => s + b.total, 0) * 100) / 100).toBe(pieDeLaFicha(FILAS_D118).total);
    // Un gasto apagado («no se reporta») se ve en su bloque y NO entra al subtotal.
    const conApagado = bloquesPorPeriodo([...FILAS_D118, fila({ id: "apagado", tipo: "factura", monto: 999, fecha: "2026-09-01", seReporta: false })]);
    expect(conApagado[0].total).toBe(1771.27);
    expect(conApagado[0].noReportado).toBe(999);
    expect(conApagado[0].cantidad).toBe(3);
    expect(cabeceraDelBloque(bloques[0])).toBe("Abierto · aún no pasado a la marca · 2 gastos");
    expect(cabeceraDelBloque(bloques[1])).toBe("mid 2026 · PVH · cerrado el 11 ago 2026 · 2 gastos");
    expect(textoDelPieDelPeriodo({ clave: PERIODO_TODOS, cantidad: 4, marcas: [], periodos: 2, tiendaPropia: false, chips: [] })).toBe("4 gastos en 2 períodos");
  });

  it("DOM: la tabla lleva las dos cabeceras con su subtotal, lo cerrado en gris, y el pie «4 gastos en 2 períodos»", async () => {
    await abrirFicha();
    fireEvent.click(tabPeriodo(/^Todos/));
    await waitFor(() => expect(kpi()).toBe("$6,472.53"));
    const tabla = screen.getAllByRole("table")[0];
    const cabeceras = [...tabla.querySelectorAll("tbody tr[data-fg-bloque-periodo]")];
    expect(cabeceras.map((c) => c.getAttribute("data-fg-bloque-periodo"))).toEqual(["abierto", "cerrado"]);
    expect(cabeceras.map((c) => c.querySelector("[data-fg-subtotal]")!.textContent)).toEqual(["$1,771.27", "$4,701.26"]);
    expect(cabeceras[1].className).toContain("text-gray-500");
    expect(filasDeGasto().length).toBe(4);
    expect(within(tabla.querySelector("tfoot")!).getByText(/4 gastos en 2 períodos/)).toBeTruthy();
    expect(within(tabla.querySelector("tfoot")!).getByText("$6,472.53")).toBeTruthy();
    expect(screen.getByText("Total de la tienda · todos los períodos")).toBeTruthy();
  });

  it("la lista de Tiendas: la misma barra, abre en Abierto y cada chip trae SU lista con su total al pie", async () => {
    // Puro: la misma cuenta de siempre, partida.
    const abierto = TIENDAS.filasPorPeriodo[PERIODO_ABIERTO];
    expect(abierto.map((f) => [f.codigo, f.total])).toEqual([["D-170", 12649.97], ["D-118", 1771.27]]);
    expect(TIENDAS.filasPorPeriodo[MID_2026.id].map((f) => [f.codigo, f.total])).toEqual([["D-24", 37460.92], ["D-118", 4701.26]]);
    expect(TIENDAS.filas.map((f) => [f.codigo, f.total])).toEqual([["D-24", 37460.92], ["D-170", 12649.97], ["D-118", 6472.53]]);

    render(<PortadaTiendas refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("Nova Lux, S.A.")).toBeTruthy());
    expect(tabPeriodo(/^Abierto/).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("City Mall David")).toBeNull();
    expect(screen.getByText("$1,771.27")).toBeTruthy();
    expect(screen.getByText("Abierto · lo que irá al próximo ZIP · 2 tiendas")).toBeTruthy();
    expect(screen.getByText("$14,421.24")).toBeTruthy();
    fireEvent.click(tabPeriodo(/mid 2026 · PVH/));
    await waitFor(() => expect(screen.getByText("City Mall David")).toBeTruthy());
    expect(screen.queryByText("Nova Lux, S.A.")).toBeNull();
    expect(screen.getByText("$4,701.26")).toBeTruthy();
    expect(screen.getByText("mid 2026 · PVH · 2 tiendas")).toBeTruthy();
    fireEvent.click(tabPeriodo(/^Todos/));
    await waitFor(() => expect(screen.getByText("$6,472.53")).toBeTruthy());
    expect(screen.getByText("Todos los períodos · 3 tiendas")).toBeTruthy();
    expect(screen.getByText("$56,583.42")).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4 · un anulado no aparece en ninguna superficie", () => {
  it("el servidor de la ficha solo manda las vivas, y ninguna pantalla dibuja «Anulados» ni «Restaurar»", () => {
    const datos = sinComentarios(leer("src/app/api/marketing/tienda/[codigo]/datos.ts"));
    expect(datos).toMatch(/from\("mk_facturas"\)[\s\S]{0,200}\.is\("anulado_en", null\)/);
    expect(datos).not.toMatch(/facturasAnuladas/);
    expect(datos).toMatch(/anuladas: \[\]/);
    const ficha = sinComentarios(leer("src/app/marketing/tienda/[codigo]/FichaTienda.tsx"));
    expect(ficha).not.toMatch(/Anulados|Restaurar|papelera\/restaurar|FILTRO_ANULADOS\b/);
    const acciones = sinComentarios(leer("src/app/marketing/tienda/[codigo]/FichaTiendaAcciones.tsx"));
    expect(acciones).not.toMatch(/papelera\/restaurar/);
    const puro = sinComentarios(leer("src/lib/marketing/tiendas-y-marcas.ts"));
    expect(puro).not.toMatch(/rotulo: "Anulados"/);
    // El historial de la impulsadora dibuja solo los vigentes.
    const historial = sinComentarios(leer("src/app/marketing/components/HistorialImpulsadoraModal.tsx"));
    expect(historial).toMatch(/\{vigentes\.map\(/);
    expect(historial).not.toMatch(/\(pagos \?\? \[\]\)\.map\(/);
  });

  it("DOM: la ficha no tiene chip «Anulados» y los chips de marca son Todas las marcas · por marca", async () => {
    await abrirFicha();
    expect(screen.queryByRole("tab", { name: /Anulados/ })).toBeNull();
    const marcas = within(screen.getByRole("tablist", { name: "Filtrar por marca" })).getAllByRole("tab");
    expect(marcas.map((t) => t.textContent)).toEqual(["Todas las marcas", "Calvin Klein", "Tommy Hilfiger"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5 · anular exige escribir ELIMINAR, exacto", () => {
  it("puro: solo la palabra exacta, con espacios de más recortados", () => {
    expect(PALABRA_PARA_ANULAR).toBe("ELIMINAR");
    expect(confirmaEliminar("ELIMINAR")).toBe(true);
    expect(confirmaEliminar("  ELIMINAR ")).toBe(true);
    expect(confirmaEliminar("eliminar")).toBe(false);
    expect(confirmaEliminar("ELIMINA")).toBe(false);
    expect(confirmaEliminar("")).toBe(false);
    expect(confirmaEliminar(null)).toBe(false);
  });

  it("DOM: el botón rojo está apagado hasta escribir ELIMINAR; después llama a la ruta de siempre con el motivo", async () => {
    await abrirFicha();
    fireEvent.click(screen.getByRole("button", { name: /Más opciones de Impresora Comercial · Remodelacion/ }));
    fireEvent.click(await screen.findByText("Eliminar"));
    const boton = await screen.findByRole("button", { name: "Eliminar" });
    expect(boton.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/Escribe/), { target: { value: "eliminar" } });
    expect(boton.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/Escribe/), { target: { value: "ELIMINAR" } });
    expect(boton.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(new RegExp(`A los ${DIAS_PARA_BORRAR_ANULADOS} días se borra del todo`))).toBeTruthy();
    fireEvent.click(boton);
    await waitFor(() =>
      expect(llamadas.fetch.find((l) => l.url.endsWith("/api/marketing/facturas/ffad9c27/anular") && l.method === "POST")).toBeTruthy(),
    );
    const llamada = llamadas.fetch.find((l) => l.url.endsWith("/facturas/ffad9c27/anular"))!;
    expect(llamada.body).toEqual({ motivo: "Eliminado desde la ficha de la tienda" });
  });

  it("DOM: eliminar un mueble también pide la palabra, y recién ahí manda el DELETE", async () => {
    await abrirFicha();
    fireEvent.click(tabPeriodo(/^Todos/));
    fireEvent.click(await screen.findByRole("button", { name: /Más opciones de Muebles de la bodega/ }));
    fireEvent.click(await screen.findByText("Eliminar"));
    const boton = await screen.findByRole("button", { name: "Eliminar" });
    expect(boton.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/Escribe/), { target: { value: "ELIMINAR" } });
    fireEvent.click(boton);
    await waitFor(() =>
      expect(llamadas.fetch.find((l) => l.url.endsWith("/api/marketing/inventario/entregas/18edd242") && l.method === "DELETE")).toBeTruthy(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("6 · el cron borra solo lo anulado hace más de 90 días, con archivos y sellos", () => {
  // Las 15 anuladas de producción (anulado_en, medido el 23-sep-2026).
  const ANULADAS = [
    "2026-04-26T17:03:01.023+00:00", "2026-04-26T17:03:19.407+00:00", "2026-04-26T17:04:15.99+00:00",
    "2026-04-26T17:07:23.992+00:00", "2026-04-26T17:12:26.746+00:00", "2026-04-26T18:08:30.773+00:00",
    "2026-04-28T14:07:40.352+00:00", "2026-04-28T14:16:07.65+00:00", "2026-04-30T16:48:23.166+00:00",
    "2026-04-30T18:32:41.971+00:00", "2026-05-06T14:56:51.884+00:00", "2026-06-10T14:08:50.999+00:00",
    "2026-06-21T15:44:37+00:00", "2026-06-21T15:44:37+00:00", "2026-09-23T14:52:48.597+00:00",
  ];

  it("puro: el corte es la medianoche de Panamá de hace 90 días; hoy caducan 14 de las 15", () => {
    expect(DIAS_PARA_BORRAR_ANULADOS).toBe(90);
    const corte = corteDeAnulados("2026-09-23");
    expect(corte).toBe("2026-06-25T05:00:00.000Z");
    expect(ANULADAS.filter((a) => anuladoCaduco(a, corte)).length).toBe(14);
    expect(anuladoCaduco("2026-06-25T04:59:59Z", corte)).toBe(true);
    expect(anuladoCaduco("2026-06-25T05:00:00Z", corte)).toBe(false);
    expect(anuladoCaduco(null, corte)).toBe(false);
  });

  it("servidor: pide `anulado_en < corte`, quita los archivos, los sellos y las filas — y NADA más", async () => {
    fake.datos.mk_facturas = [{ id: "a" }, { id: "b" }];
    fake.datos.mk_adjuntos = [{ id: "x", url: "a/1.pdf" }, { id: "y", url: "https://ya-firmada.example/2.pdf" }];
    fake.errores.mk_entregas_muebles = { code: "42703", message: "column mk_entregas_muebles.anulado_en does not exist" };
    const r = await runLimpiezaAnuladosMarketing(new Date("2026-09-23T08:40:00Z"));
    expect(r.ok).toBe(true);
    expect(r.facturas).toBe(2);
    expect(r.archivos).toBe(1);
    expect(r.entregas).toBe(0);
    expect(r.detail).toContain("sin columna anulado_en");
    const de = (tabla: string, op: string) => fake.llamadas.filter((l) => l.tabla === tabla && l.op === op).map((l) => l.args);
    expect(de("mk_facturas", "lt")).toEqual([["anulado_en", "2026-06-25T05:00:00.000Z"]]);
    expect(de("mk_facturas", "not")).toEqual([["anulado_en", "is", null]]);
    expect(fake.storageRemove).toHaveBeenCalledWith(["a/1.pdf"]);
    expect(de("mk_periodo_documentos", "delete").length).toBe(1);
    expect(de("mk_periodo_documentos", "in")).toEqual([["documento_id", ["a", "b"]]]);
    expect(de("mk_facturas", "delete").length).toBe(1);
    expect(de("mk_facturas", "in")).toEqual([["id", ["a", "b"]]]);
    // Ninguna otra tabla se toca, y ningún DELETE sale sin su lista de ids.
    expect(new Set(fake.llamadas.map((l) => l.tabla))).toEqual(new Set(["mk_facturas", "mk_adjuntos", "mk_periodo_documentos", "mk_entregas_muebles"]));
    for (const l of fake.llamadas.filter((x) => x.op === "delete")) {
      const despues = fake.llamadas.slice(fake.llamadas.indexOf(l) + 1).find((x) => x.tabla === l.tabla);
      expect(despues?.op).toBe(l.tabla === "mk_periodo_documentos" ? "eq" : "in");
    }
  });

  it("sin anulados vencidos no borra nada; con el interruptor apagado ni pregunta", async () => {
    fake.datos.mk_facturas = [];
    fake.errores.mk_entregas_muebles = { code: "42703", message: "no existe" };
    const r = await runLimpiezaAnuladosMarketing(new Date("2026-09-23T08:40:00Z"));
    expect(r.ok).toBe(true);
    expect(fake.llamadas.some((l) => l.op === "delete")).toBe(false);
    expect(fake.storageRemove).not.toHaveBeenCalled();

    fake.llamadas.length = 0;
    perilla.encendido = false;
    const apagado = await runLimpiezaAnuladosMarketing(new Date("2026-09-23T08:40:00Z"));
    expect(apagado.ok).toBe(true);
    expect(apagado.detail).toContain("interruptor apagado");
    expect(fake.llamadas.length).toBe(0);
  });

  it("registro: UNA entrada en vercel.json (una ocurrencia al día), en el registro de crons, y la ruta exige el secreto", async () => {
    const vercel = JSON.parse(leer("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
    const entradas = vercel.crons.filter((c) => c.path === "/api/cron/cleanup-marketing-anulados");
    expect(entradas.length).toBe(1);
    expect(entradas[0].schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/); // ni lista ni rango de horas
    expect(SEED_TOLERANT_CRONS).toContain("cleanup-marketing-anulados");
    expect(CRONS_CONOCIDOS.has("cleanup-marketing-anulados")).toBe(true);
    expect(leer("docs/crons.md")).toContain("/api/cron/cleanup-marketing-anulados");
    const { GET } = await import("@/app/api/cron/cleanup-marketing-anulados/route");
    const sinSecreto = await GET(new NextRequest("http://localhost/api/cron/cleanup-marketing-anulados"));
    expect(sinSecreto.status).toBe(401);
    expect(fake.llamadas.length).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("7 · el interruptor en false = como antes", () => {
  it("la vista de tienda por marca, sin barra de períodos; la ruta de Tiendas no existe", async () => {
    perilla.encendido = false;
    render(<ToastProvider><VistaTienda codigo="D-118" /></ToastProvider>);
    await waitFor(() => expect(screen.getByText("Gasto que se reporta")).toBeTruthy());
    expect(screen.queryByRole("tablist", { name: "Elegir el período" })).toBeNull();
    expect(screen.queryByText(/ELIMINAR/)).toBeNull();
    const { GET } = await import("@/app/api/marketing/tiendas/route");
    const { signSession } = await import("@/lib/session-cookie");
    const cookie = `cxc_session=${signSession({ role: "admin", userId: "u", userName: "Daniel", sessionToken: "tok" })}`;
    const res = await GET(new NextRequest("http://localhost/api/marketing/tiendas", { headers: { cookie } }));
    expect(res.status).toBe(404);
  });
});
