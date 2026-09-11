// ─────────────────────────────────────────────────────────────────────────────
// VENTAS › PRODUCTOS BAJO EL SELECTOR ÚNICO DE PERÍODO (11-sep-2026).
//
// Cinco de los trece cambios que Daniel aprobó con el mockup del 11-sep tocan
// esta pestaña, y este archivo los fija de conducta:
//
//   · EL PERÍODO LLEGA POR PROP. La pestaña tenía su propio «Período» (Año en
//     curso · Últimos 6 · Últimos 12 · Año pasado), contado desde HOY y ajeno
//     al año de la barra — con un párrafo explicando que «el año de arriba no
//     se aplica». Se retiró: lo manda el selector único de arriba.
//   · MULTIFASHION SALIÓ DEL SELECTOR DE EMPRESA. Medido el 11-sep-2026:
//     `switch_factura_lineas` no tiene ni una fila suya, así que «Quién lo
//     compra» y el filtro por cliente salían SIEMPRE vacíos; y esa información
//     ya vive completa en `/multifashion` › Productos. BOSTON NO ENTRA — tiene
//     18.186 renglones, pero Daniel dijo «NO».
//   · UN SOLO DESCARGO de «sin las ventas de mostrador»: salía corto arriba y
//     largo en el pie de «Quién lo compra», a la vez.
//   · LOS BOTONES DICEN «Descargar en Excel» (diccionario de la casa) y DEJAN
//     RASTRO en `activity_logs`: de Ventas no había ni una fila en 90 días.
//
// Las listas se DERIVAN (`B2B_EMPRESA_KEYS`), nunca se escriben a mano — es la
// cuarta vez que este repo paga una lista de empresas copiada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { ProductosView } from "@/components/ventas/ProductosView";
import type { ProductosResponse } from "@/lib/ventas/productos";
import { PRODUCTOS_EMPRESAS, PRODUCTOS_EMPRESA_KEYS, DEFAULT_PRODUCTOS_EMPRESA } from "@/lib/ventas/productos";
import { B2B_EMPRESA_KEYS, ALL_EMPRESA_KEYS, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { ROTULO_DESCARGAR_EXCEL, ACCION_DESCARGA_EXCEL, MODULO_ACTIVIDAD_VENTAS } from "@/lib/ventas/descarga";
import { signSession } from "@/lib/session-cookie";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ventas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// El Excel no se escribe en jsdom: se mira que se pidió y que se ANOTÓ.
const { descargas } = vi.hoisted(() => ({ descargas: [] as string[] }));
vi.mock("@/lib/excel-export", () => ({
  MONEY_FMT: "$#,##0.00",
  PCT_FMT: "0.0%",
  buildReportSheet: () => ({}),
  workbookFromSheets: () => ({}),
  downloadWorkbook: (_wb: unknown, nombre: string) => { descargas.push(nombre); },
}));

// La ruta real de productos, con un doble de Supabase que no llega a llamarse
// cuando la empresa es inválida (el 400 sale antes).
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    rpc: async () => ({ data: [], error: null }),
    from: () => {
      const q = {
        select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => q,
        limit: async () => ({ data: [], error: null }),
      };
      return q;
    },
  },
}));

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ANIO_2026 = { tipo: "anio", anio: 2026 } as const;

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false) as never;
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
});

// ── Fixture ─────────────────────────────────────────────────────────────────
const PRODUCTOS = [
  { descripcion: "CAMISA POLO", num_codigos: 3, cantidad: 1000, venta: 9000, costo: 5400, margen: 0.4 },
  { descripcion: "SANDALIA", num_codigos: 2, cantidad: 100, venta: 5000, costo: 3000, margen: 0.4 },
];
const CITY = { id: 12, nombre: "City Mall Paso Canoa" };
const MATRIZ = [
  { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "CAMISA POLO", cantidad: 100, venta: 2000 },
];

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function respuesta(over: Partial<ProductosResponse> = {}): ProductosResponse {
  return {
    empresa: "fashion_wear", year: 2026, mes: null, periodo: "ytd",
    desde: "2026-01-01", hasta: "2026-09-11",
    comparativo: { desde: "2025-01-01", hasta: "2025-09-11" },
    totales: { venta: 14000, costo: 8400, margen: 0.4 },
    productos: PRODUCTOS,
    ...over,
  };
}

/** Lo que se le mandó a `/api/activity` (método + cuerpo ya parseado). */
let anotaciones: { method?: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  descargas.length = 0;
  anotaciones = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/activity")) {
      anotaciones.push({ method: init?.method, body: JSON.parse(String(init?.body ?? "{}")) });
      return json({ ok: true });
    }
    if (u.includes("/productos/por-cliente")) {
      const sp = new URL(u, "http://x").searchParams;
      return json({ filas: sp.get("ventana") === "previa" ? [] : MATRIZ, sinDescripcion: 0 });
    }
    if (u.includes("/productos/codigos")) {
      return json({
        codigos: [{ codigo: "A-1", descripcion: "CAMISA POLO", cantidad: 800, venta: 8000, costo: 4800, margen: 0.4 }],
        clientes: [{ cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, cantidad: 100, venta: 2000 }],
      });
    }
    if (u.includes("previo=1")) return json(respuesta({ productos: PRODUCTOS.map(p => ({ ...p, venta: p.venta * 0.8 })) }));
    return json(respuesta());
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function pintada() {
  await waitFor(() => expect(document.querySelectorAll("tr[data-fila-producto]").length).toBe(PRODUCTOS.length));
}
async function elegirCliente(nombre: string) {
  fireEvent.keyDown(document.querySelector("[data-filtro-cliente]") as HTMLElement, { key: "ArrowDown" });
  await screen.findByRole("option", { name: "Cliente: todos" });
  fireEvent.click(await screen.findByRole("option", { name: nombre }));
  await waitFor(() => expect(document.querySelector("[data-sin-mostrador]")).toBeTruthy());
}

// ─────────────────────────────────────────────────────────────────────────────

describe("a · el selector de empresa son las SEIS de Fashion Group, derivadas", () => {
  it("🔴 PRODUCTOS_EMPRESAS es exactamente B2B_EMPRESA_KEYS, en ese orden", () => {
    expect(PRODUCTOS_EMPRESAS.map(e => e.key)).toEqual([...B2B_EMPRESA_KEYS]);
    expect(PRODUCTOS_EMPRESA_KEYS).toEqual([...B2B_EMPRESA_KEYS]);
    expect((B2B_EMPRESA_KEYS as readonly string[]).includes(DEFAULT_PRODUCTOS_EMPRESA)).toBe(true);
  });

  it("🔴 ni Multifashion ni Boston: no son del grupo, y Boston fue decisión («NO»)", () => {
    expect(PRODUCTOS_EMPRESA_KEYS).not.toContain("american_classic");
    expect(PRODUCTOS_EMPRESA_KEYS).not.toContain("confecciones_boston");
    // Y son EXACTAMENTE las que ALL tiene menos esas dos: si alguna entrara al
    // grupo, tendría que entrar acá sola, sin tocar esta lista.
    const fueraDelGrupo = ALL_EMPRESA_KEYS.filter(k => !(B2B_EMPRESA_KEYS as readonly string[]).includes(k));
    expect(fueraDelGrupo.sort()).toEqual(["american_classic", "confecciones_boston"]);
  });

  it("el nombre es el CORTO del diccionario, no uno escrito acá", () => {
    for (const e of PRODUCTOS_EMPRESAS) expect(e.nombre).toBe(nombreCortoEmpresa(e.key));
  });

  it("🔴 en `productos.ts` no hay ningún nombre ni clave de empresa escrito a mano", () => {
    // El DEFAULT (Fashion Wear) es la única clave que la pantalla necesita
    // nombrar: es con la que abre. Todo lo demás se deriva.
    const src = plano(leer("src/lib/ventas/productos.ts"))
      .replace(`export const DEFAULT_PRODUCTOS_EMPRESA = "${DEFAULT_PRODUCTOS_EMPRESA}";`, "");
    for (const k of ALL_EMPRESA_KEYS) {
      expect(src, `"${k}" está escrito a mano en productos.ts`).not.toContain(`"${k}"`);
    }
    expect(src).not.toMatch(/"(Multifashion|Vistana International|Fashion Wear|Boston)"/);
    expect(src).toContain("B2B_EMPRESA_KEYS.map(");
  });

  it("y la pantalla ofrece esas seis y nada más", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    const trigger = screen.getByText(nombreCortoEmpresa(DEFAULT_PRODUCTOS_EMPRESA)).closest("button")!;
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("option", { name: nombreCortoEmpresa("joystep") });
    const opciones = screen.getAllByRole("option").map(o => (o.textContent ?? "").trim());
    expect(opciones).toEqual(B2B_EMPRESA_KEYS.map(k => nombreCortoEmpresa(k)));
    expect(opciones).not.toContain("Multifashion");
    expect(opciones).not.toContain("Boston");
  });
});

describe("b · la ruta rechaza a Multifashion, igual que la pantalla", () => {
  const SECRET_PREV = process.env.SESSION_SECRET;
  beforeAll(() => { process.env.SESSION_SECRET = "test-secret-selector-unico"; });
  afterEach(() => { process.env.SESSION_SECRET = SECRET_PREV; });

  function req(url: string) {
    const cookie = signSession({ role: "admin", userId: "u1", userName: "test", sessionToken: "t1" });
    return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie: `cxc_session=${cookie}` } });
  }

  it("🔴 `empresa=american_classic` → 400 «empresa inválida»", async () => {
    process.env.SESSION_SECRET = "test-secret-selector-unico";
    const { GET } = await import("@/app/api/ventas/productos/route");
    const res = await GET(req("/api/ventas/productos?empresa=american_classic&year=2026"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("empresa inválida");
  });

  it("y `confecciones_boston` también", async () => {
    process.env.SESSION_SECRET = "test-secret-selector-unico";
    const { GET } = await import("@/app/api/ventas/productos/route");
    const res = await GET(req("/api/ventas/productos?empresa=confecciones_boston&year=2026"));
    expect(res.status).toBe(400);
  });

  it("CONTROL: una de las seis pasa la puerta", async () => {
    process.env.SESSION_SECRET = "test-secret-selector-unico";
    const { GET } = await import("@/app/api/ventas/productos/route");
    const res = await GET(req(`/api/ventas/productos?empresa=${DEFAULT_PRODUCTOS_EMPRESA}&year=2026`));
    expect(res.status).toBe(200);
  });
});

describe("c · el período llega por prop: no hay selector propio ni aviso viejo", () => {
  const vista = plano(leer("src/components/ventas/ProductosView.tsx"));

  it("🔴 el fuente no tiene el desplegable «Período» ni el aviso «el año de arriba no se aplica»", () => {
    expect(vista).not.toContain("data-selector-periodo");
    expect(vista).not.toContain("data-anio-no-aplica");
    expect(vista).not.toContain("PERIODOS_FIJOS");
    expect(vista).not.toContain("Año pasado");
    expect(vista).not.toContain("anio_pasado");
    expect(vista).not.toContain("se cuenta desde hoy");
  });

  it("🔴 y deriva lo que pide de `periodoParaProductos`, con el año en curso por prop", () => {
    expect(vista).toContain("periodoParaProductos(periodoElegido, anioEnCurso)");
    expect(vista).not.toMatch(/useState<ProductosPeriodo>/);
  });

  it("en pantalla: ni selector de período ni aviso, con el año o con una ventana", async () => {
    const { rerender } = render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(document.querySelector("[data-selector-periodo]")).toBeNull();
    expect(document.querySelector("[data-anio-no-aplica]")).toBeNull();
    rerender(<ProductosView periodo={{ tipo: "ultimos", n: 12 }} anioEnCurso={2026} />);
    await pintada();
    expect(document.querySelector("[data-selector-periodo]")).toBeNull();
    expect(document.querySelector("[data-anio-no-aplica]")).toBeNull();
    expect(screen.queryByText("Año en curso")).toBeNull();
  });
});

describe("d · UN solo descargo de «sin las ventas de mostrador»", () => {
  it("🔴 con un cliente puesto se dice UNA vez, arriba, y el pie no lo repite", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    // El pie de «Quién lo compra» abierto…
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    await waitFor(() => expect(document.querySelector("[data-pie-clientes]")).toBeTruthy());
    // …y en todo el DOM (tabla y tarjetas están las dos montadas en jsdom) el
    // descargo existe exactamente una vez: la línea de arriba.
    expect(document.querySelectorAll("[data-sin-mostrador]")).toHaveLength(1);
    expect(document.querySelector("[data-resumen-productos] [data-sin-mostrador]")).toBeTruthy();
    expect(document.querySelector("[data-pie-clientes]")!.textContent).not.toContain("mostrador");
    // Y el largo de antes no volvió con otras palabras.
    expect(document.body.textContent).not.toContain("no traen detalle");
  });

  it("sin cliente puesto lo dice el pie de «Quién lo compra», una vez y corto", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(document.querySelector("[data-resumen-productos] [data-sin-mostrador]")).toBeNull();
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    const pie = await waitFor(() => {
      const el = document.querySelector('[data-vista="tabla"] [data-pie-clientes]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(pie.querySelectorAll("[data-sin-mostrador]")).toHaveLength(1);
    expect(pie.querySelector("[data-sin-mostrador]")!.textContent).toBe("sin las ventas de mostrador");
  });
});

describe("e · «Descargar en Excel», y deja rastro", () => {
  it("🔴 el botón dice el rótulo del diccionario, no «Excel» a secas", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(ROTULO_DESCARGAR_EXCEL).toBe("Descargar en Excel");
    const boton = screen.getByRole("button", { name: /Descargar en Excel/ });
    expect(boton).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Excel$/ })).toBeNull();
  });

  it("🔴 al tocarlo se baja el archivo Y se anota en activity_logs como pestaña «productos»", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    fireEvent.click(screen.getByRole("button", { name: /Descargar en Excel/ }));
    await waitFor(() => expect(descargas.length).toBe(1));
    await waitFor(() => expect(anotaciones.length).toBe(1));
    const a = anotaciones[0];
    expect(a.method).toBe("POST");
    expect(a.body.action).toBe(ACCION_DESCARGA_EXCEL);
    expect(a.body.module).toBe(MODULO_ACTIVIDAD_VENTAS);
    const det = a.body.details as Record<string, unknown>;
    expect(det.pestana).toBe("productos");
    expect(det.empresa).toBe(DEFAULT_PRODUCTOS_EMPRESA);
    expect(det.periodo).toBe("ytd");
    expect(det.anio).toBe(2026);
  });

  it("⚠️ la anotación va DESPUÉS de descargar: sin archivo no se anota nada", async () => {
    render(<ProductosView periodo={ANIO_2026} anioEnCurso={2026} />);
    await pintada();
    expect(anotaciones).toHaveLength(0);
    expect(descargas).toHaveLength(0);
  });
});
