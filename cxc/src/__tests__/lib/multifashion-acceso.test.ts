// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — hasta DÓNDE llega `gerente_acs` (Jennifer).
//
// El 13-ago-2026 Daniel levantó la ventana de datos que ese rol tenía dentro de
// Multifashion. Textual: ***"abrile Multifashion completo"***. Con eso
// desapareció `src/lib/multifashion/ventana-gerente.ts` y sus 6 clamps, y con
// ellos su archivo de candados (`multifashion-ventana-gerente.test.ts`).
//
// De aquel archivo sobrevive lo que NO era la ventana, y que este archivo
// conserva porque sigue siendo verdad:
//
//   (a) EL INVENTARIO DE RUTAS de /api/multifashion/** está CONGELADO. Ya no se
//       les exige clamp a las rutas —no hay ventana que imponer—, pero una ruta
//       nueva en ese árbol sigue siendo una superficie nueva del único módulo
//       de un rol acotado: que alguien la mire antes de que exista.
//
//   (b) 🔴 LO QUE MÁS IMPORTA, Y LO QUE NO CAMBIÓ: abrirle el HISTÓRICO no le
//       abrió NADA MÁS. Multifashion sigue siendo su ÚNICO módulo, sigue
//       auto-redirigiendo desde /home, y las rutas de los demás módulos le
//       siguen contestando 403. Eso se prueba acá ROL POR ROL y con CONDUCTA:
//       se llama a los handlers REALES con una cookie firmada de `gerente_acs`.
//
// ⚠️ El snapshot literal de módulos por rol vive en `catalogo-roles.test.ts` y
// NO se movió: sigue congelando `gerente_acs: ["multifashion"]` junto a bodega,
// contabilidad y vendedor. Acá se agrega lo que ese archivo no mira: el barrido
// del catálogo entero y la conducta de las rutas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/session-cookie";
import {
  ALL_MODULES,
  SYSTEM_ROLE_KEYS,
  getDefaultModulesForRole,
  getVisibleModules,
} from "@/lib/modules";

const ROL = "gerente_acs";

// ── Arnés: nada toca la base ni Switch ───────────────────────────────────────
// Los handlers de otros módulos tienen que rebotar ANTES de leer nada; los de
// Multifashion sí leen, y el doble les contesta vacío. Si algún día un handler
// ajeno lee la base ANTES de mirar el rol, este arnés no lo tapa: el test mira
// el status, y un 200 con datos vacíos falla igual que un 200 con datos.

function chain(result: { data: unknown; error: unknown; count?: number }) {
  const self: Record<string, unknown> = {};
  const paso = () => () => self;
  Object.assign(self, {
    select: paso(), eq: paso(), neq: paso(), not: paso(), in: paso(),
    gte: paso(), lt: paso(), lte: paso(), gt: paso(), or: paso(), is: paso(),
    range: paso(), order: paso(), limit: paso(),
    maybeSingle: async () => result,
    single: async () => result,
    upsert: async () => ({ error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  });
  return self;
}

/** La tabla de caché de Caja "no existe" → la ruta va en modo directo. */
const TABLA_AUSENTE = { code: "PGRST205", message: "could not find the table" };

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    rpc: async (name: string) => {
      if (name === "multifashion_articulo_diario_agrupado_v1") return { data: { n: 0, f: [] }, error: null };
      if (name === "multifashion_articulo_marca_v1") return { data: [], error: null };
      return name.startsWith("proyeccion_")
        ? { data: [], error: null }
        : { data: { totales: {}, dias: [] }, error: null };
    },
    from: (tabla: string) =>
      chain(
        tabla === "multifashion_caja_diaria"
          ? { data: null, error: TABLA_AUSENTE }
          : { data: [], error: null, count: 0 },
      ),
  },
  HAS_SERVICE_ROLE: true,
}));

vi.mock("@/lib/ventas/queries", () => ({
  fetchMultifashion: async () => ({ tienda: "ACS", retail: { meses: [] } }),
  fetchVentasResumen: async () => ({}),
}));

vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({
    getDiarioVentas: async () => ({ diarioDeVentas: { granTotal: 0 } }),
    logout: async () => {},
  }),
}));

// ── Handlers REALES ──────────────────────────────────────────────────────────
// Multifashion (los que el rol SÍ puede abrir).
import { GET as mfOverview } from "@/app/api/multifashion/overview/route";
import { GET as mfDetalle } from "@/app/api/multifashion/detalle-mensual/route";
import { GET as mfBonos } from "@/app/api/multifashion/bonos/route";
import { GET as mfVendedoras } from "@/app/api/multifashion/vendedoras/route";
import { GET as mfWholesale } from "@/app/api/multifashion/clientes-wholesale/route";
import { GET as mfRetail } from "@/app/api/multifashion/retail-recurrentes/route";
import { GET as mfCaja } from "@/app/api/multifashion/caja/route";
import { GET as mfProductos } from "@/app/api/multifashion/productos/route";
import { GET as mfVentaHoy } from "@/app/api/multifashion/venta-hoy/route";

// Los demás módulos (los que tiene que seguir sin poder abrir).
import { GET as ventasResumen } from "@/app/api/ventas/resumen/route";
import { GET as proveedores } from "@/app/api/proveedores/route";
import { GET as saldosBanco } from "@/app/api/saldos-banco/route";
import { GET as gastosEgresos } from "@/app/api/gastos-contabilidad/egresos/route";
import { GET as marketingProyectos } from "@/app/api/marketing/proyectos/route";
import { GET as cajaPeriodos } from "@/app/api/caja/periodos/route";
import { GET as packingLists } from "@/app/api/packing-lists/route";
import { GET as directorio } from "@/app/api/directorio/route";
import { GET as asistenciaReporte } from "@/app/api/asistencia/reporte/route";

// 13-ago-2026 18:00 UTC = 13:00 en Panamá.
const AHORA = new Date("2026-08-13T18:00:00.000Z");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-multifashion-acceso"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
});
afterEach(() => { vi.useRealTimers(); });

function req(url: string, role: string): NextRequest {
  const cookie = signSession({ role, userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie: `cxc_session=${cookie}` } });
}

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf-8");

/** El archivo sin comentarios. 🩸 Un barrido que lee comentarios se cumple a sí
 *  mismo con su propia explicación — este repo ya lo pagó tres veces. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

// ═════════════════════════════════════════════════════════════════════════════
// 1. Candado estructural — el inventario de /api/multifashion/** sigue congelado
// ═════════════════════════════════════════════════════════════════════════════

function rutasMultifashion(): { nombre: string; archivo: string }[] {
  const base = path.join(process.cwd(), "src/app/api/multifashion");
  const out: { nombre: string; archivo: string }[] = [];
  const caminar = (dir: string, prefijo: string) => {
    for (const entrada of readdirSync(dir)) {
      const p = path.join(dir, entrada);
      if (statSync(p).isDirectory()) {
        caminar(p, prefijo ? `${prefijo}/${entrada}` : entrada);
      } else if (entrada === "route.ts") {
        out.push({ nombre: prefijo, archivo: p });
      }
    }
  };
  caminar(base, "");
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

describe("candado estructural — /api/multifashion/**", () => {
  const rutas = rutasMultifashion();

  it("el inventario de rutas es el esperado (si aparece una nueva, revisala)", () => {
    expect(rutas.map(r => r.nombre)).toEqual([
      "bonos",
      "caja",
      "clientes-wholesale",
      "detalle-mensual",
      "fidelizacion",
      // `metas` NO acepta fechas del navegador: su período sale de la fila de la
      // base. Nunca necesitó clamp, y con la ventana levantada nadie lo necesita.
      "metas",
      "overview",
      "productos",
      "retail-recurrentes",
      "vendedoras",
      "venta-hoy",
    ]);
  });

  it("la ventana acotada se retiró de VERDAD: nadie importa el módulo borrado", () => {
    for (const { nombre, archivo } of rutas) {
      const src = readFileSync(archivo, "utf-8");
      expect(src, `${nombre} todavía importa el clamp retirado`)
        .not.toContain("@/lib/multifashion/ventana-gerente");
    }
  });

  it("toda ruta del módulo exige sesión y rol (ninguna quedó abierta)", () => {
    for (const { nombre, archivo } of rutas) {
      const src = sinComentarios(readFileSync(archivo, "utf-8"));
      expect(src, `${nombre} no verifica la sesión`).toMatch(/requireRole\s*\(\s*req/);
      expect(src, `${nombre} no corta cuando el guard rechaza`)
        .toMatch(/auth\s+instanceof\s+NextResponse/);
    }
  });

  it("la empresa NUNCA viaja por query: Multifashion ES american_classic", () => {
    // Aceptarla por parámetro le abriría a `gerente_acs` las otras 7 empresas
    // del grupo desde su único módulo. Esto SÍ es un candado de permisos.
    for (const { nombre, archivo } of rutas) {
      const src = sinComentarios(readFileSync(archivo, "utf-8"));
      expect(src, `${nombre} lee la empresa de la URL`).not.toMatch(
        /(searchParams|sp)\.get\(\s*["'](empresa|empresa_key|empresaKey)["']\s*\)/,
      );
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Multifashion sigue siendo su ÚNICO módulo — rol por rol
// ═════════════════════════════════════════════════════════════════════════════

describe("gerente_acs — un solo módulo, y sigue siendo ese", () => {
  it("sus módulos por defecto son exactamente ['multifashion']", () => {
    expect(getDefaultModulesForRole(ROL)).toEqual(["multifashion"]);
  });

  it("ningún OTRO módulo del catálogo lo nombra en su roles[]", () => {
    const conElRol = ALL_MODULES.filter(m => m.roles.includes(ROL)).map(m => m.key);
    expect(conElRol).toEqual(["multifashion"]);
  });

  it("y el módulo que sí es suyo no se le abrió a nadie más de rebote", () => {
    const mf = ALL_MODULES.find(m => m.key === "multifashion");
    expect(mf?.roles).toEqual(["admin", ROL]);
    expect(mf?.href).toBe("/multifashion");
  });

  it("es un rol REAL del sistema (no un valor suelto que nadie reconoce)", () => {
    expect(SYSTEM_ROLE_KEYS).toContain(ROL);
  });

  it("los demás roles no ganaron ni perdieron Multifashion", () => {
    for (const rol of SYSTEM_ROLE_KEYS) {
      if (rol === "admin" || rol === ROL) continue;
      expect(getDefaultModulesForRole(rol), `${rol} no debe ver Multifashion`)
        .not.toContain("multifashion");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. El auto-redirect desde /home se conserva
// ═════════════════════════════════════════════════════════════════════════════

describe("gerente_acs — /home lo manda solo a Multifashion", () => {
  it("con un único módulo visible, el destino es /multifashion", () => {
    // Es exactamente lo que evalúa el efecto de /home: un solo módulo visible →
    // router.push(visible[0].href).
    const visibles = getVisibleModules(ROL, ["multifashion"]);
    expect(visibles).toHaveLength(1);
    expect(visibles[0].href).toBe("/multifashion");
  });

  it("aunque `fg_modules` llegue vacío, el fallback da el mismo único módulo", () => {
    // Un login frío puede no traer la lista de la base; el fallback es roles[].
    for (const fg of [null, undefined, [] as string[]]) {
      const visibles = getVisibleModules(ROL, fg);
      expect(visibles.map(m => m.key)).toEqual(["multifashion"]);
    }
  });

  it("el /home sigue teniendo el auto-redirect de módulo único", () => {
    const src = sinComentarios(leer("src/app/home/page.tsx"));
    expect(src).toMatch(/getVisibleModules\(\s*role\s*,\s*fgModules\s*\)/);
    expect(src).toMatch(/visible\.length\s*===\s*1/);
    expect(src).toMatch(/router\.push\(\s*visible\[0\]\.href\s*\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. 🔴 CONDUCTA — los handlers REALES de otros módulos le contestan 403
// ═════════════════════════════════════════════════════════════════════════════

type Handler = (req: NextRequest) => Promise<Response> | Response;

/** Una ruta de cada módulo que NO es suyo. La lista es por MÓDULO, no por
 *  archivo: lo que se prueba es que la puerta de cada módulo siga cerrada. */
const RUTAS_AJENAS: Array<[modulo: string, url: string, handler: Handler]> = [
  ["ventas",              "/api/ventas/resumen?year=2026",                ventasResumen as Handler],
  ["proveedores",         "/api/proveedores",                             proveedores as Handler],
  ["gastos (saldos)",     "/api/saldos-banco",                            saldosBanco as Handler],
  ["gastos (egresos)",    "/api/gastos-contabilidad/egresos?mes=2026-08", gastosEgresos as Handler],
  ["marketing",           "/api/marketing/proyectos",                     marketingProyectos as Handler],
  ["caja menuda",         "/api/caja/periodos",                           cajaPeriodos as Handler],
  ["packing lists",       "/api/packing-lists",                           packingLists as Handler],
  ["directorio/clientes", "/api/directorio",                              directorio as Handler],
  ["asistencia",          "/api/asistencia/reporte?desde=2026-08-01&hasta=2026-08-13", asistenciaReporte as Handler],
];

describe("gerente_acs — 403 en todo lo que no es Multifashion", () => {
  for (const [modulo, url, handler] of RUTAS_AJENAS) {
    it(`${modulo}: 403 con cookie válida de gerente_acs`, async () => {
      const res = await handler(req(url, ROL));
      expect(res.status, `${modulo} dejó entrar a ${ROL}`).toBe(403);
    });
  }

  it("y no es que la ruta rechace a TODO el mundo: admin sí entra", async () => {
    for (const [modulo, url, handler] of RUTAS_AJENAS) {
      const res = await handler(req(url, "admin"));
      expect(res.status, `${modulo} rechaza hasta a admin — el 403 de arriba no prueba nada`)
        .not.toBe(403);
    }
  });

  it("sin cookie es 401, no 403: el guard sigue exigiendo sesión", async () => {
    const [, url, handler] = RUTAS_AJENAS[0];
    const res = await handler(new NextRequest(`https://fashiongr.com${url}`));
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Lo que SÍ ganó: el módulo entero, sin recortes de período
// ═════════════════════════════════════════════════════════════════════════════

const RUTAS_PROPIAS: Array<[nombre: string, url: string, handler: Handler]> = [
  ["overview año viejo",    "/api/multifashion/overview?year=2024&mes=3",                          mfOverview as Handler],
  ["detalle mes viejo",     "/api/multifashion/detalle-mensual?year=2024&mes=3",                   mfDetalle as Handler],
  ["bonos año viejo",       "/api/multifashion/bonos?year=2024&mes=3",                             mfBonos as Handler],
  ["vendedoras YTD",        "/api/multifashion/vendedoras?year=2024&periodo=ytd",                  mfVendedoras as Handler],
  ["vendedoras 12 meses",   "/api/multifashion/vendedoras?year=2024&periodo=ultimos&n=12&mes=6",   mfVendedoras as Handler],
  ["wholesale 3 años",      "/api/multifashion/clientes-wholesale?fecha_inicio=2023-01-01&fecha_fin=2026-08-13", mfWholesale as Handler],
  ["retail 3 años",         "/api/multifashion/retail-recurrentes?fecha_inicio=2023-01-01&fecha_fin=2026-08-13", mfRetail as Handler],
  ["caja de un día viejo",  "/api/multifashion/caja?fecha=2024-03-15",                             mfCaja as Handler],
  ["productos 12 meses",    "/api/multifashion/productos?periodo=12m",                             mfProductos as Handler],
  ["venta de hoy",          "/api/multifashion/venta-hoy",                                         mfVentaHoy as Handler],
];

describe("gerente_acs — Multifashion COMPLETO (13-ago-2026)", () => {
  for (const [nombre, url, handler] of RUTAS_PROPIAS) {
    it(`${nombre}: responde 200, sin recortar por rol`, async () => {
      const res = await handler(req(url, ROL));
      expect(res.status, `${nombre} rebotó a ${ROL}`).toBe(200);
    });
  }

  it("pide lo MISMO que un admin — el rol ya no cambia ningún parámetro", async () => {
    for (const [nombre, url, handler] of RUTAS_PROPIAS) {
      // `venta-hoy` y `caja` traen la hora del reloj en el payload; el resto es
      // determinista con el tiempo congelado.
      const comoRol = await (await handler(req(url, ROL))).text();
      const comoAdmin = await (await handler(req(url, "admin"))).text();
      expect(comoRol, `${nombre} devuelve algo distinto según el rol`).toBe(comoAdmin);
    }
  });

  it("los parámetros absurdos SIGUEN rechazándose (eso no era la ventana)", async () => {
    // La validación de rango protege a la base y no tiene nada que ver con
    // Jennifer: se queda, y se queda igual para los dos roles.
    for (const rol of [ROL, "admin"]) {
      expect((await mfOverview(req("/api/multifashion/overview?year=99999", rol))).status).toBe(400);
      expect((await mfOverview(req("/api/multifashion/overview?year=2026&mes=13", rol))).status).toBe(400);
      expect((await mfVendedoras(req("/api/multifashion/vendedoras?year=2026&periodo=quincena", rol))).status).toBe(400);
      expect((await mfVendedoras(req("/api/multifashion/vendedoras?year=2026&periodo=ultimos&n=7&mes=6", rol))).status).toBe(400);
      expect((await mfProductos(req("/api/multifashion/productos?periodo=siempre", rol))).status).toBe(400);
      expect((await mfCaja(req("/api/multifashion/caja?fecha=2026-13-40", rol))).status).toBe(400);
      expect((await mfCaja(req("/api/multifashion/caja?fecha=2099-01-01", rol))).status).toBe(400);
      expect((await mfWholesale(req("/api/multifashion/clientes-wholesale?fecha_inicio=2026-08-10&fecha_fin=2026-08-01", rol))).status).toBe(400);
      expect((await mfRetail(req("/api/multifashion/retail-recurrentes?fecha_inicio=2026-01-01&fecha_fin=2026-08-01&limit=9999", rol))).status).toBe(400);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICADO POR MUTACIÓN (13-ago-2026):
//   · agregarle `gerente_acs` al roles[] de otro módulo        → rompe 3
//   · agregar una ruta nueva a /api/multifashion/**            → rompe 1
//   · aceptar `?empresa=` en una ruta del módulo               → rompe 1
//   · sacarle el requireRole a una ruta del módulo             → rompe 1
//   · abrirle una ruta ajena (sumarlo a su lista de roles)     → rompe 1
//   · quitar el auto-redirect de módulo único en /home         → rompe 1
//   · volver a recortar el período según el rol                → rompe 2
//   · aflojar una validación de parámetro (year/mes/limit/n)   → rompe 1
// ─────────────────────────────────────────────────────────────────────────────
