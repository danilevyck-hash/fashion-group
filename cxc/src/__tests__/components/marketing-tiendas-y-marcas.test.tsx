/**
 * CANDADO — MARKETING › TIENDAS Y MARCAS: la estructura nueva (23-sep-2026).
 *
 * Daniel, textual: el gasto *«se registra cuando llega la factura del
 * proveedor»*; a la marca se le pasa *«cada 6 meses»*; *«no quiero que se
 * enfoque el módulo en [el cobro], sino en registrar bien los gastos para
 * pasárselos a la marca»*; Multifashion *«se queda aparte, nunca se le cobra a
 * una marca»*; lo ven *«contabilidad, admin y secres»*.
 *
 * Lo que este archivo no deja aflojar (DOM, no barridos):
 *   1. LA PORTADA ABRE EN TIENDAS con N filas y CADA UNA ENLAZA a su ficha
 *      (`/marketing/tienda/<código>`); «Reportes» no está en el menú.
 *   2. MULTIFASHION ES UNA TIENDA (está en Tiendas) Y NO APARECE EN NINGUNA
 *      MARCA: ni en el reporte por marca, ni en el agregador (un gasto de
 *      D-108 sin proyecto cae en su bucket), ni en las líneas por tienda de
 *      una marca. Tommy $116.675,66 · Calvin $73.782,95 con los números de
 *      producción del 23-sep-2026, y tiendas = marcas + Multifashion + no
 *      reportado = $200.060,24.
 *   3. LA FICHA ES UNA TABLA con facturas + muebles + impulsadora, y el total
 *      del pie cuadra con las tres puertas (solo lo reportado; lo anulado
 *      plegado y fuera).
 *   4. EDITAR Y ANULAR SE HACEN DESDE LA FICHA («···»), con las rutas de
 *      siempre.
 *   5. `?proyecto=<id>` VIEJO REDIRIGE a la ficha de la tienda del proyecto.
 *   6. CONTABILIDAD ENTRA SOLO LECTURA, con y sin la migración: la ficha del
 *      menú se enciende, las páginas no dibujan botones de escritura, las
 *      rutas GET contestan y las que escriben contestan 403.
 *   7. INTERRUPTOR EN `false` = COMO ANTES: la portada Abiertos | Cerrados
 *      con «Reportes» y la vista de tienda por marca.
 *
 * Mutaciones a mano: ver `docs/postmortems/marketing-rediseno.md` § 12.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextRequest } from "next/server";
import { ToastProvider } from "@/components/ToastSystem";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Perillas: el interruptor, el rol y la URL ────────────────────────────────
const perilla = vi.hoisted(() => ({
  encendido: true,
  role: "admin",
  query: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

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

// Las piezas pesadas que no son de este candado se doblan.
vi.mock("@/app/marketing/components/RegistrarGastoModal", () => ({
  default: (p: { tiendaCodigo?: string | null }) => <div data-testid="stub-puerta" data-tienda={p.tiendaCodigo ?? ""} />,
}));
vi.mock("@/app/marketing/components/ImpulsadorasView", () => ({
  default: () => <div data-testid="stub-impulsadoras" />,
}));
vi.mock("@/app/marketing/components/ReportesTabs", () => ({
  default: () => <div data-testid="stub-reportes-tabs" />,
  ReportesTabs: () => <div data-testid="stub-reportes-tabs" />,
}));
vi.mock("@/app/marketing/components/ProyectoOverlay", () => ({
  default: () => <div data-testid="stub-overlay" />,
}));
vi.mock("@/app/marketing/components/FotosSection", () => ({
  default: () => <div data-testid="stub-fotos" />,
}));
vi.mock("@/app/marketing/components/ZipsBajados", () => ({ default: () => null }));
vi.mock("@/components/marketing/NotaEntregaAcciones", () => ({ default: () => null }));
vi.mock("@/components/marketing/FacturaForm", () => ({
  FacturaForm: (p: { initial?: { id?: string } }) => (
    <div data-testid="stub-factura-form" data-id={p.initial?.id ?? ""} />
  ),
}));
vi.mock("@/components/marketing/EntregaForm", () => ({
  default: () => <div data-testid="stub-entrega-form" />,
}));

import MarketingPage from "@/app/marketing/page";
import VistaTienda from "@/app/marketing/tienda/[codigo]/VistaTienda";
import PaginaMarca from "@/app/marketing/components/PaginaMarca";
import {
  chipsDeLaFicha,
  destinoDelProyectoViejo,
  destinoDeVistaVieja,
  filasDeTiendas,
  pieDeLaFicha,
  sinMultifashion,
  esTiendaMultifashion,
} from "@/lib/marketing/tiendas-y-marcas";
import { reportePorMarcaDe, reportePorTiendaDe, type GastoParaReporte } from "@/lib/marketing/reportes-rediseno";
import { agregarPorBloques } from "@/lib/marketing/resumen-bloques";
import { armarSecciones } from "@/lib/marketing/lista-por-periodo";
import { MULTIFASHION_KEY } from "@/lib/marketing/bloques";
import { getVisibleModules, MODULO_HEREDA_PERMISO_DE } from "@/lib/modules";
import { ROLES_MARKETING, puedeEscribirMarketing } from "@/lib/marketing/roles";
import { signSession } from "@/lib/session-cookie";
import type { FilaDeTienda } from "@/lib/marketing/vista-tienda";
import type { SeccionPeriodo } from "@/lib/marketing/lista-por-periodo";

// ═════════════════════════════════════════════════════════════════════════════
// LOS NÚMEROS DE PRODUCCIÓN (medidos por REST el 23-sep-2026, solo lectura):
// lo reportado por tienda y por marca. El «HUÉRFANA» es la factura de
// $2.307,32 de Impresora Comercial: proyecto «Multifashion Holdings» sin
// código, así que cae en «General» (tienda null) pero ES de Multifashion.
// ═════════════════════════════════════════════════════════════════════════════
const NOMBRES: Record<string, string> = {
  "D-24": "City Mall David", "D-80": "Jerusalem De Panama", "D-84": "Kheriddine",
  "D-170": "Nova Lux, S.A.", "D-25": "City Mall Paso Canoa", "D-14": "Bouti, S.A.",
  "D-117": "Outlet Duty Free N2, S.A.", "D-118": "Outlet Duty Free N3, S.A.",
  "D-71": "Hanna Calzados", "D-108": "Multi Fashion Holding", "D-87": "La Frontera Duty Free",
  "D-68": "Grupo Hanna, S.A.", "D-74": "Boutique I - Fashion", "D-156": "Wolf Mall Center Int",
  "D-88": "La Nueva Reina Chorrera", "D-166": "Zona Sur Dutty Free S.A",
};
const TH: Record<string, number> = {
  "D-24": 29199.12, "D-80": 24578.23, "D-84": 11429.84, "D-170": 8913.22, "D-25": 104.83,
  "D-14": 6061.14, "D-117": 3858.32, "D-118": 5741.51, "D-71": 3151.26, "D-108": 1319.25,
  "D-87": 1902.47, "D-68": 2799.83, "D-74": 2379.3, "D-156": 1980.64, "D-88": 1288.58,
  "D-166": 669.61, General: 12617.76,
};
const CK: Record<string, number> = {
  General: 22853.04, HUERFANA: 2307.32, "D-24": 8261.8, "D-80": 11141.47, "D-84": 1600.99,
  "D-170": 3736.75, "D-25": 10404.92, "D-14": 3059.17, "D-117": 2741.52, "D-118": 731.02,
  "D-71": 2760.26, "D-108": 170.26, "D-87": 891.02, "D-68": 1231.7, "D-74": 1635.77,
  "D-156": 1210.64, "D-88": 861.07, "D-166": 661.81,
};
const OTR: Record<string, number> = { "D-108": 4264.8 };
const J: Record<string, number> = { "D-87": 1540 };
const NOMBRES_MARCA = { TH: "Tommy Hilfiger", CK: "Calvin Klein", KL: "Karl Lagerfeld", RBK: "Reebok", J: "Joybees" };

function gastosDe(marca: string, tabla: Record<string, number>): GastoParaReporte[] {
  return Object.entries(tabla).map(([tienda, monto], i) => {
    const codigo = tienda === "General" || tienda === "HUERFANA" ? null : tienda;
    return {
      id: `${marca}-${tienda}-${i}`,
      tipo: "factura",
      marcaCodigo: marca,
      tiendaCodigo: codigo,
      tiendaNombre: codigo ? NOMBRES[codigo] : null,
      monto,
      seReporta: true,
      fecha: "2026-06-01",
      esTiendaPropia: esTiendaMultifashion(codigo) || tienda === "HUERFANA",
    };
  });
}
const GASTOS = [...gastosDe("TH", TH), ...gastosDe("CK", CK), ...gastosDe("OTR", OTR), ...gastosDe("J", J)];
const REPORTE_TIENDAS = reportePorTiendaDe(GASTOS, NOMBRES_MARCA);
const FILAS_TIENDAS = filasDeTiendas(REPORTE_TIENDAS);

// ── La ficha de Nova Lux: 3 facturas, 2 muebles, 1 pago, 1 anulada, 1 apagada ─
const fila = (x: Partial<FilaDeTienda> & Pick<FilaDeTienda, "id" | "tipo" | "monto">): FilaDeTienda => ({
  marcaCodigo: "TH",
  marcaNombre: "Tommy Hilfiger",
  proveedor: "",
  detalle: "",
  fecha: "2026-08-01",
  seReporta: true,
  estadoPeriodo: "abierto",
  periodoNombre: "Período 2026",
  ...x,
});
const VIVAS: FilaDeTienda[] = [
  fila({ id: "f1", tipo: "factura", monto: 666.62, marcaCodigo: "CK", marcaNombre: "Calvin Klein", proveedor: "Impresora Comercial", concepto: "letrero Calvin Klein", numero: "0000065407", subtotal: 623.01, itbms: 43.61, fecha: "2026-09-14", tienePdf: true }),
  fila({ id: "f2", tipo: "factura", monto: 81.32, proveedor: "Premium Paint Panama", concepto: "pintura", numero: "000008123", subtotal: 76, itbms: 5.32, fecha: "2026-08-25", tienePdf: true }),
  fila({ id: "f3", tipo: "factura", monto: 810, proveedor: "Impresora Comercial", concepto: "no se reporta", numero: "77", subtotal: 810, itbms: 0, fecha: "2026-08-20", seReporta: false }),
  fila({ id: "m1", tipo: "mueble", monto: 5552, nota: "Entrega de muebles", fecha: "2026-07-10" }),
  fila({ id: "m2", tipo: "mueble", monto: 2600, marcaCodigo: "CK", marcaNombre: "Calvin Klein", nota: "Reposición de muebles", fecha: "2026-07-01" }),
  fila({ id: "i1", tipo: "impulsadora", monto: 800, proveedor: "Ana Trejos", mes: "Agosto 2026", fecha: "2026-08-01" }),
];
const ANULADAS: FilaDeTienda[] = [
  fila({ id: "a1", tipo: "factura", monto: 300, proveedor: "Krysthel", concepto: "repetida", numero: "40", fecha: "2026-06-27", anulada: true, anuladoMotivo: "duplicada" }),
];
const DATOS_NOVA = {
  codigo: "D-170",
  nombre: "Nova Lux, S.A.",
  enElDirectorio: true,
  grupos: [],
  totales: { reportado: 9699.94, noReportado: 810, cantidadReportada: 5, cantidadNoReportada: 1 },
  fotos: 6,
  sinMigracion: false,
  filas: VIVAS,
  anuladas: ANULADAS,
};
const INICIO_VACIO = {
  bloques: [], cerrados: [], detalle: [], detalleTiendas: [], periodosMeta: {}, hoy: "2026-09-23",
  marcas: [], mobiliario: { entregas: 0, total: 0 }, impulsadoras: { count: 0, montoMensual: 0 },
  resumen: { total: 0, proyectos: 0, clientes: 0 }, porCliente: [], porMarca: {}, conPeriodos: true,
};

const llamadas = vi.hoisted(() => ({ fetch: [] as Array<{ url: string; method: string; body: unknown }> }));
function stubFetch(extra: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      let body: unknown = null;
      try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = init?.body; }
      llamadas.fetch.push({ url, method, body });
      const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
      if (path in extra) return json(extra[path]);
      if (path === "/api/marketing/marcas") return json([]);
      if (path === "/api/marketing/tiendas") return json({ filas: FILAS_TIENDAS });
      if (path === "/api/marketing/inicio") return json(INICIO_VACIO);
      if (path === "/api/marketing/tienda/D-170") return json(DATOS_NOVA);
      if (path.startsWith("/api/marketing/facturas/") && path.endsWith("/marcas")) return json([]);
      if (path.startsWith("/api/marketing/facturas/") && path.endsWith("/anular")) return json({ ok: true });
      if (path.startsWith("/api/marketing/facturas/")) return json({ id: path.split("/")[4], numero_factura: "0000065407", proyecto_id: null, adjuntos: [] });
      if (path.startsWith("/api/marketing/proyectos/")) return json({ id: "p1", tienda_codigo: "D-170", tienda: "Nova Lux, S.a." });
      return json({ error: `sin doble para ${path}` }, 404);
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
  stubFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const hrefsDeTienda = () =>
  screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "").filter((h) => h.startsWith("/marketing/tienda/"));

// ═════════════════════════════════════════════════════════════════════════════
describe("1 · la portada abre en Tiendas, con N filas que enlazan a su ficha", () => {
  it("abre en Tiendas, con las 16 tiendas + General, cada una con su enlace, y sin «Reportes»", async () => {
    render(<ToastProvider><MarketingPage /></ToastProvider>);
    const pestanas = await screen.findAllByRole("tab");
    expect(pestanas.map((t) => t.textContent)).toEqual(["Tiendas", "Marcas", "Impulsadoras", "Mobiliario"]);
    expect(pestanas[0].getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(screen.getByText("City Mall David")).toBeTruthy());
    const hrefs = hrefsDeTienda();
    expect(hrefs.length).toBe(17); // medido: 16 tiendas con gasto + «General»
    expect(hrefs).toContain("/marketing/tienda/D-24");
    expect(hrefs).toContain("/marketing/tienda/D-108");
    expect(hrefs[hrefs.length - 1]).toBe("/marketing/tienda/general");
    // El nombre del directorio, no el texto del proyecto viejo.
    expect(screen.getByText("City Mall Paso Canoa")).toBeTruthy();
    expect(screen.queryByText("City Mall Pasocanoa")).toBeNull();
    // Lo reportado como único monto y el desglose por marca en gris.
    expect(screen.getByText("$37,460.92")).toBeTruthy();
    expect(screen.getByText("Tommy Hilfiger $29,199.12 · Calvin Klein $8,261.80")).toBeTruthy();
    expect(screen.queryByText("Reportes")).toBeNull();
    expect(screen.getByRole("button", { name: "＋ Gasto" })).toBeTruthy();
  });

  it("el buscador de arriba solo filtra lo que ya está en pantalla", async () => {
    render(<ToastProvider><MarketingPage /></ToastProvider>);
    await waitFor(() => expect(screen.getByText("City Mall David")).toBeTruthy());
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar una tienda" }), { target: { value: "nova" } });
    expect(hrefsDeTienda()).toEqual(["/marketing/tienda/D-170"]);
  });

  it("`?vista=reportes` viejo cae en Tiendas; `?vista=impulsadoras` en su pestaña", async () => {
    expect(destinoDeVistaVieja("reportes")).toBe("/marketing");
    expect(destinoDeVistaVieja("impulsadoras")).toBe("/marketing?tab=impulsadoras");
    perilla.query = "vista=reportes";
    render(<ToastProvider><MarketingPage /></ToastProvider>);
    await waitFor(() => expect(perilla.replace).toHaveBeenCalledWith("/marketing"));
  });

  it("Mobiliario es una página propia: la pestaña lleva ahí", async () => {
    render(<ToastProvider><MarketingPage /></ToastProvider>);
    fireEvent.click(await screen.findByRole("tab", { name: "Mobiliario" }));
    expect(perilla.push).toHaveBeenCalledWith("/marketing/mobiliario");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2 · Multifashion es una tienda, y no aparece en ninguna marca", () => {
  it("está en Tiendas como una más, rotulada «tienda propia»", async () => {
    render(<ToastProvider><MarketingPage /></ToastProvider>);
    await waitFor(() => expect(screen.getByText("Multi Fashion Holding")).toBeTruthy());
    expect(screen.getByText(/tienda propia · 3 gastos · no se le pasa a ninguna marca/)).toBeTruthy();
  });

  it("por marca: Tommy $116.675,66 y Calvin $73.782,95 — sin la tienda propia; tiendas = marcas + Multifashion", () => {
    const porMarca = reportePorMarcaDe(sinMultifashion(GASTOS), NOMBRES_MARCA);
    const de = (c: string) => porMarca.find((f) => f.codigo === c)?.reportado;
    expect(de("TH")).toBe(116675.66);
    expect(de("CK")).toBe(73782.95);
    expect(de("J")).toBe(1540);
    // Con Multifashion adentro (lo que Reportes decía hasta hoy) eran otros dos números.
    const conMf = reportePorMarcaDe(GASTOS, NOMBRES_MARCA);
    expect(conMf.find((f) => f.codigo === "TH")?.reportado).toBe(117994.91);
    expect(conMf.find((f) => f.codigo === "CK")?.reportado).toBe(76260.53);
    // Suma de tiendas = suma de marcas + Multifashion + no reportado.
    const sumaTiendas = Math.round(REPORTE_TIENDAS.reduce((s, f) => s + f.total, 0) * 100) / 100;
    const multifashion = Math.round(GASTOS.filter((g) => g.esTiendaPropia).reduce((s, g) => s + g.monto, 0) * 100) / 100;
    const sumaMarcas = Math.round(porMarca.reduce((s, f) => s + f.reportado, 0) * 100) / 100;
    expect(sumaTiendas).toBe(200060.24);
    expect(multifashion).toBe(8061.63);
    expect(Math.round((sumaMarcas + multifashion) * 100) / 100).toBe(200060.24);
  });

  it("en el agregador, un gasto de D-108 SIN proyecto cae en Multifashion, no en su marca", () => {
    const marcas = [{ id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger", empresa_codigo: null }];
    const base = {
      facturaMarcas: [{ factura_id: "f1", marca_id: "m-th", porcentaje: 100 }, { factura_id: "f2", marca_id: "m-th", porcentaje: 100 }],
      entregas: [{ id: "e1", proyecto_id: null, total: 500, total_por_marca: { "m-th": 500 }, total_por_empresa_interna: {}, tienda_codigo: "D-24" }],
      marcas,
      proyectos: [],
      proyectosMultifashion: new Set<string>(),
      periodos: [{ id: "per-th", proveedor_key: "TH", nombre: "Período 2026", estado: "abierto" }],
      sellos: [],
    };
    const facturas = [
      { id: "f1", proyecto_id: null, total: 100, tienda_codigo: "D-108" },
      { id: "f2", proyecto_id: null, total: 250, tienda_codigo: "D-24" },
    ];
    const conRegla = agregarPorBloques({
      ...base,
      facturas: facturas as never,
      entregas: base.entregas as never,
      tiendasMultifashion: new Set(["D-108"]),
      contarEntregasSinProyecto: true,
    });
    const th = conRegla.bloques.find((b) => b.key === "TH")!;
    const mf = conRegla.bloques.find((b) => b.key === MULTIFASHION_KEY)!;
    expect(th.total).toBe(750); // 250 de la factura + 500 del mueble sin proyecto
    expect(mf.total).toBe(100);
    // Las líneas por tienda suman el total del bloque, por construcción.
    const tiendasTh = conRegla.detalleTiendas.filter((d) => d.bloqueKey === "TH");
    expect(tiendasTh.map((d) => [d.tiendaCodigo, d.monto])).toEqual([["D-24", 750]]);
    // Sin las dos banderas (interruptor apagado): como antes — D-108 sin
    // proyecto iría a Tommy y el mueble sin proyecto no contaría.
    const sinRegla = agregarPorBloques({ ...base, facturas: facturas as never, entregas: base.entregas as never });
    expect(sinRegla.bloques.find((b) => b.key === "TH")!.total).toBe(350);
    expect(sinRegla.bloques.find((b) => b.key === MULTIFASHION_KEY)!.total).toBe(0);
  });

  it("la página de la marca lista UNA línea por tienda, cada una a su ficha, y ninguna es D-108", async () => {
    const secciones = armarSecciones({
      bloqueKey: "TH",
      bloque: { periodoAbierto: { id: "per-th", nombre: "Período 2026" }, total: 1000, facturas: { count: 2, total: 1000 }, muebles: { count: 0, total: 0 } },
      cerrados: [],
      detalle: [],
      detalleTiendas: [
        { bloqueKey: "TH", seccion: "abierto", tiendaCodigo: "D-24", monto: 700, gastos: 1 },
        { bloqueKey: "TH", seccion: "abierto", tiendaCodigo: null, monto: 300, gastos: 1 },
        { bloqueKey: "CK", seccion: "abierto", tiendaCodigo: "D-170", monto: 50, gastos: 1 },
      ],
      nombresDeTienda: new Map([["D-24", "City Mall David"]]),
      generales: new Map(),
      conPeriodos: true,
      ordenProyectos: [],
    });
    expect(secciones[0].tiendas?.map((t) => [t.nombre, t.monto, t.href])).toEqual([
      ["City Mall David", 700, "/marketing/tienda/D-24"],
      ["General", 300, "/marketing/tienda/general"],
    ]);
    render(
      <ToastProvider>
        <PaginaMarca
          role="admin"
          marca={{ key: "TH", nombre: "Tommy Hilfiger", slug: "tommy-hilfiger" }}
          marcaCatalogo={null}
          secciones={secciones as SeccionPeriodo[]}
          bloqueResumen={null}
          onRegistrarGasto={() => {}}
          recargar={() => {}}
        />
      </ToastProvider>,
    );
    expect(hrefsDeTienda()).toEqual(["/marketing/tienda/D-24", "/marketing/tienda/general"]);
    expect(screen.queryByText(/Multi Fashion/)).toBeNull();
    expect(screen.getByText("Multifashion no aparece en ninguna marca: sus gastos no se le pasan a nadie.")).toBeTruthy();
    // Sin lista de proyectos ni su buscador.
    expect(screen.queryByPlaceholderText(/proyecto/i)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3 · la ficha es UNA tabla con facturas + muebles + impulsadora, y el total cuadra", () => {
  it("una sola tabla, seis renglones vivos de los tres tipos, y el pie suma solo lo reportado", async () => {
    render(<ToastProvider><VistaTienda codigo="D-170" /></ToastProvider>);
    await waitFor(() => expect(screen.getByText(/Nova Lux, S.A./)).toBeTruthy());
    const tablas = screen.getAllByRole("table");
    expect(tablas.length).toBe(1);
    const filas = tablas[0].querySelectorAll("tbody tr[data-fg-gasto]");
    expect(filas.length).toBe(6);
    const tipos = [...filas].map((r) => r.getAttribute("data-fg-gasto"));
    expect(new Set(tipos)).toEqual(new Set(["factura", "mueble", "impulsadora"]));
    // El pie: 6 gastos · 3 facturas $747.94 · 2 muebles $8,152.00 · 1 pago $800.00 = $9,699.94
    const pie = pieDeLaFicha(VIVAS);
    expect(pie.total).toBe(9699.94);
    expect(pie.montoFacturas + pie.montoMuebles + pie.montoImpulsadora).toBeCloseTo(9699.94, 2);
    expect(within(tablas[0].querySelector("tfoot")!).getByText("$9,699.94")).toBeTruthy();
    expect(screen.getByText("6 gastos · 3 facturas $747.94 · 2 muebles $8,152.00 · 1 pago de impulsadora $800.00")).toBeTruthy();
    // Lo apagado se ve en gris y no suma; la cabecera lo dice.
    expect(screen.getByText("No se reporta")).toBeTruthy();
    // La línea gris de la factura: N° · subtotal + ITBMS.
    expect(screen.getByText("factura N° 0000065407 · $623.01 + ITBMS $43.61")).toBeTruthy();
    expect(screen.getAllByText("mueble · precio reportado").length).toBe(2);
    // Lo anulado, plegado en su chip y fuera de la tabla.
    expect(screen.queryByText("Krysthel · repetida")).toBeNull();
    const chips = chipsDeLaFicha(VIVAS, ANULADAS);
    expect(chips.map((c) => c.rotulo)).toEqual(["Todos", "Tommy Hilfiger", "Calvin Klein", "Anulados"]);
    fireEvent.click(screen.getByRole("tab", { name: /Anulados/ }));
    expect(screen.getByText("Krysthel · repetida")).toBeTruthy();
    expect(tablas[0].querySelectorAll("tbody tr[data-fg-gasto]").length).toBe(1);
  });

  it("«＋ Gasto» abre la puerta con ESTA tienda puesta", async () => {
    render(<ToastProvider><VistaTienda codigo="D-170" /></ToastProvider>);
    await waitFor(() => expect(screen.getByText(/Nova Lux, S.A./)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "＋ Gasto" }));
    expect(screen.getByTestId("stub-puerta").getAttribute("data-tienda")).toBe("D-170");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4 · editar y anular se hacen desde la ficha", () => {
  it("«···» ofrece Editar y Anular; anular pide motivo y llama a la ruta de siempre", async () => {
    render(<ToastProvider><VistaTienda codigo="D-170" /></ToastProvider>);
    await waitFor(() => expect(screen.getByText(/Nova Lux, S.A./)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Más opciones de Impresora Comercial · letrero Calvin Klein/ }));
    expect(await screen.findByText("Editar")).toBeTruthy();
    fireEvent.click(screen.getByText("Anular"));
    fireEvent.change(await screen.findByLabelText(/Motivo/), { target: { value: "se cargó dos veces" } });
    fireEvent.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() =>
      expect(llamadas.fetch.find((l) => l.url.endsWith("/api/marketing/facturas/f1/anular") && l.method === "POST")).toBeTruthy(),
    );
    const llamada = llamadas.fetch.find((l) => l.url.endsWith("/facturas/f1/anular"))!;
    expect(llamada.body).toEqual({ motivo: "se cargó dos veces" });
  });

  it("Editar abre el formulario de siempre con la factura leída de su ruta", async () => {
    render(<ToastProvider><VistaTienda codigo="D-170" /></ToastProvider>);
    await waitFor(() => expect(screen.getByText(/Nova Lux, S.A./)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Más opciones de Premium Paint Panama/ }));
    fireEvent.click(await screen.findByText("Editar"));
    await waitFor(() => expect(screen.getByTestId("stub-factura-form").getAttribute("data-id")).toBe("f2"));
    expect(llamadas.fetch.some((l) => l.url.endsWith("/api/marketing/facturas/f2"))).toBe(true);
  });

  it("un mueble ofrece Editar y Eliminar (que devuelve el stock)", async () => {
    render(<ToastProvider><VistaTienda codigo="D-170" /></ToastProvider>);
    await waitFor(() => expect(screen.getByText(/Nova Lux, S.A./)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Más opciones de Entrega de muebles/ }));
    expect(await screen.findByText("Eliminar")).toBeTruthy();
    expect(screen.getByText("Editar")).toBeTruthy();
    expect(screen.queryByText("Anular")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5 · un ?proyecto= viejo redirige a la ficha de la tienda de ese proyecto", () => {
  it("la portada lee el proyecto y reemplaza la dirección", async () => {
    perilla.query = "proyecto=p1";
    render(<ToastProvider><MarketingPage /></ToastProvider>);
    await waitFor(() => expect(perilla.replace).toHaveBeenCalledWith("/marketing/tienda/D-170"));
    expect(screen.queryByTestId("stub-overlay")).toBeNull();
  });

  it("sin código va a «General»; Multifashion por su texto va a D-108", () => {
    expect(destinoDelProyectoViejo({ tienda_codigo: "D-25" })).toBe("/marketing/tienda/D-25");
    expect(destinoDelProyectoViejo({ tienda_codigo: null, tienda: "Multifashion Holdings" })).toBe("/marketing/tienda/D-108");
    expect(destinoDelProyectoViejo({ tienda_codigo: null, tienda: "Changalo" })).toBe("/marketing/tienda/general");
    expect(destinoDelProyectoViejo(null)).toBe("/marketing/tienda/general");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("6 · contabilidad entra solo lectura, con y sin la migración", () => {
  const SIN_MIGRACION = ["asistencia", "prestamos", "proveedores", "gastos-contabilidad", "comisiones"];

  it("la ficha del menú se enciende antes y después de la migración, y solo para contabilidad", () => {
    expect(ROLES_MARKETING).toEqual(["admin", "secretaria", "contabilidad"]);
    expect(puedeEscribirMarketing("contabilidad")).toBe(false);
    expect(puedeEscribirMarketing("secretaria")).toBe(true);
    expect(MODULO_HEREDA_PERMISO_DE.marketing).toBe("gastos-contabilidad");
    const antes = getVisibleModules("contabilidad", SIN_MIGRACION).map((m) => m.key);
    const despues = getVisibleModules("contabilidad", [...SIN_MIGRACION, "marketing"]).map((m) => m.key);
    expect(antes).toContain("marketing");
    expect(despues).toContain("marketing");
    // La herencia no le abre Marketing a un rol que no está en la lista.
    expect(getVisibleModules("bodega", ["gastos-contabilidad"]).map((m) => m.key)).not.toContain("marketing");
  });

  it("la portada y la ficha no dibujan botones de escritura", async () => {
    perilla.role = "contabilidad";
    render(<ToastProvider><MarketingPage /></ToastProvider>);
    await waitFor(() => expect(screen.getByText("City Mall David")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "＋ Gasto" })).toBeNull();
    expect(screen.getByText("Solo lectura")).toBeTruthy();
    cleanup();
    render(<ToastProvider><VistaTienda codigo="D-170" /></ToastProvider>);
    await waitFor(() => expect(screen.getByText(/Nova Lux, S.A./)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "＋ Gasto" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Más opciones/ })).toBeNull();
    expect(screen.getAllByRole("table").length).toBe(1);
  });

  it("las rutas: GET contesta, POST anular contesta 403", async () => {
    vi.doMock("@/lib/marketing/reportes", () => ({ reportePorTiendaRediseno: async () => REPORTE_TIENDAS }));
    vi.doMock("@/lib/marketing/mutations", () => ({ anularFactura: vi.fn(async () => {}) }));
    const { GET } = await import("@/app/api/marketing/tiendas/route");
    const { POST } = await import("@/app/api/marketing/facturas/[id]/anular/route");
    const cookie = `cxc_session=${signSession({ role: "contabilidad", userId: "u-c", userName: "Contabilidad", sessionToken: "tok" })}`;
    const get = await GET(new NextRequest("http://localhost/api/marketing/tiendas", { headers: { cookie } }));
    expect(get.status).toBe(200);
    const json = (await get.json()) as { filas: Array<{ href: string }> };
    expect(json.filas.length).toBe(17);
    expect(json.filas[0].href).toBe("/marketing/tienda/D-24");
    const post = await POST(
      new NextRequest("http://localhost/api/marketing/facturas/fa506291-53b4-40af-a0b1-f197c89f4ca3/anular", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ motivo: "x" }),
      }),
      { params: { id: "fa506291-53b4-40af-a0b1-f197c89f4ca3" } },
    );
    expect(post.status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("7 · el interruptor en false = como antes", () => {
  it("la portada de antes (Abiertos | Cerrados con «Reportes») y la vista de tienda por marca", async () => {
    perilla.encendido = false;
    render(<ToastProvider><MarketingPage /></ToastProvider>);
    await waitFor(() => expect(screen.getByText("Reportes")).toBeTruthy());
    expect(screen.queryByRole("tab", { name: "Tiendas" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Abiertos" })).toBeTruthy();
    cleanup();
    render(<ToastProvider><VistaTienda codigo="D-170" /></ToastProvider>);
    await waitFor(() => expect(screen.getByText("Gasto que se reporta")).toBeTruthy());
    expect(screen.queryByRole("tab", { name: /Todos/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Más opciones/ })).toBeNull();
  });
});
