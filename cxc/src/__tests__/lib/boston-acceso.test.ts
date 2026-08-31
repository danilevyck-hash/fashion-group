// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — hasta DÓNDE llega `gerente_boston` (David).
//
// Daniel, textual (27-ago-2026): *"si crea el usuario david, david debe de ver
// cxc boston… el es mi hermano y ve toda la operacion de confecciones boston,
// **no quiero que vea info de fashion group**"*.
//
// 🔴 ES EL ESPEJO DE LA REGLA QUE YA EXISTE. La de siempre —los dos barridos de
// `cxc-boston-fuera-de-toda-superficie.test.ts`— garantiza que **Boston no se
// mezcle con el grupo**. Este archivo garantiza lo contrario: que **quien ve
// Boston no vea el grupo**. Ninguna reemplaza a la otra.
//
// El molde es `multifashion-acceso.test.ts`, que resolvió el mismo problema
// para Jennifer: un rol con UN solo módulo, auto-redirigido ahí desde /home, y
// con 403 en todo lo demás. Se copia el mecanismo probado, no se inventa uno.
//
// 🔴 LO QUE MÁS IMPORTA ACÁ SON LAS DOS FUGAS QUE EL PEDIDO NOMBRA:
//   1. LA BÚSQUEDA GLOBAL cubre 8 módulos. Si David teclea «City Mall» no puede
//      recibir clientes, ventas ni cheques del GRUPO.
//   2. EL INICIO muestra los KPI del grupo. A él lo manda directo a /boston el
//      auto-redirect de módulo único.
//   Si esas dos no están cerradas, todo lo demás no sirve de nada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/session-cookie";
import {
  ALL_MODULES,
  MODULO_HEREDA_PERMISO_DE,
  SYSTEM_ROLE_KEYS,
  fgModulesDaAcceso,
  getDefaultModulesForRole,
  getVisibleModules,
  moduloCasaDeRol,
} from "@/lib/modules";
import {
  CATALOGO_ADMIN_ROLES,
  CATALOGO_ROLES,
  COMPROBANTES_EDITAR_ROLES,
  COMPROBANTES_ROLES,
} from "@/lib/catalogo/roles";
import { MARCAS_CONFIG, getMarcaConfig } from "@/lib/catalogo/marcas";
import {
  EMPRESA_BOSTON,
  MODULO_BOSTON,
  PESTANAS_BOSTON,
  ROL_BOSTON,
  ROLES_MODULO_BOSTON,
  VE_SUELDOS_DE_BOSTON,
  esGerenteBoston,
  planillaSinDinero,
  puedeVerModuloBoston,
  rolesModuloBoston,
  tabBostonValida,
} from "@/lib/boston/rol";
import { CAMPOS_SIN_DINERO, lineaSinDinero } from "@/lib/boston/planilla-sin-dinero";
import { ROLES_BOSTON, puedeVerBoston } from "@/lib/cxc/boston-roles";

const ROL = ROL_BOSTON;

// ── Arnés: nada toca la base ni Switch ───────────────────────────────────────
// Los handlers de otros módulos tienen que rebotar ANTES de leer nada; los de
// Boston sí leen, y el doble les contesta vacío. Un 200 con datos vacíos falla
// igual que un 200 con datos: el test mira el STATUS.

function chain(result: { data: unknown; error: unknown; count?: number }) {
  const self: Record<string, unknown> = {};
  const paso = () => () => self;
  Object.assign(self, {
    select: paso(), eq: paso(), neq: paso(), not: paso(), in: paso(),
    gte: paso(), lt: paso(), lte: paso(), gt: paso(), or: paso(), is: paso(),
    ilike: paso(), range: paso(), order: paso(), limit: paso(),
    maybeSingle: async () => result,
    single: async () => result,
    upsert: async () => ({ error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  });
  return self;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    rpc: async () => ({ data: [], error: null }),
    from: () => chain({ data: [], error: null, count: 0 }),
  },
  HAS_SERVICE_ROLE: true,
}));

vi.mock("@/lib/rechazos-de-switch", () => ({ lineaDeRechazos: async () => null }));

// ── Handlers REALES ──────────────────────────────────────────────────────────
// Los suyos.
import { GET as bostonInicio } from "@/app/api/boston/inicio/route";
import { GET as bostonVentas } from "@/app/api/boston/ventas/route";
import { GET as bostonClientes } from "@/app/api/boston/clientes/route";
import { GET as bostonPrestamos } from "@/app/api/boston/prestamos/route";
import { GET as cxcBoston } from "@/app/api/cxc/boston/route";

// Los AJENOS — uno por módulo. Lo que se prueba es que la puerta de cada módulo
// del grupo le siga cerrada.
import { GET as cxcAging } from "@/app/api/cxc/aging/route";
import { GET as busquedaGlobal } from "@/app/api/search/route";
import { GET as ventasResumen } from "@/app/api/ventas/resumen/route";
import { GET as comisiones } from "@/app/api/ventas/comisiones/route";
import { GET as proveedores } from "@/app/api/proveedores/route";
import { GET as saldosBanco } from "@/app/api/saldos-banco/route";
import { GET as gastosEgresos } from "@/app/api/gastos-contabilidad/egresos/route";
import { GET as marketingProyectos } from "@/app/api/marketing/proyectos/route";
import { GET as cajaPeriodos } from "@/app/api/caja/periodos/route";
import { GET as packingLists } from "@/app/api/packing-lists/route";
import { GET as directorio } from "@/app/api/directorio/route";
import { GET as multifashionOverview } from "@/app/api/multifashion/overview/route";
import { GET as prestamosEmpleados } from "@/app/api/prestamos/empleados/route";
import { GET as cxcFavoritos } from "@/app/api/cxc/favorites/route";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-boston-acceso"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

function req(url: string, role: string): NextRequest {
  // `modules`: en producción la cookie siempre los trae. Los de David son los
  // reales (`role_permissions.gerente_boston`), sin `asistencia`.
  const modules = role === ROL_BOSTON ? ["boston", "catalogos"] : ["asistencia"];
  const cookie = signSession({ role, userId: "u1", userName: "david", sessionToken: "t1", modules });
  return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie: `cxc_session=${cookie}` } });
}

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf-8");

/** El archivo sin comentarios. 🩸 Un barrido que lee comentarios se cumple a sí
 *  mismo con su propia explicación — este repo ya lo pagó cuatro veces, y estos
 *  archivos CITAN lo que prohíben. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

// ═════════════════════════════════════════════════════════════════════════════
// 1. Candado estructural — el árbol de /api/boston/**
// ═════════════════════════════════════════════════════════════════════════════

function rutasBoston(): { nombre: string; archivo: string }[] {
  const base = path.join(process.cwd(), "src/app/api/boston");
  const out: { nombre: string; archivo: string }[] = [];
  const caminar = (dir: string, prefijo: string) => {
    for (const entrada of readdirSync(dir)) {
      const p = path.join(dir, entrada);
      if (statSync(p).isDirectory()) caminar(p, prefijo ? `${prefijo}/${entrada}` : entrada);
      else if (entrada === "route.ts") out.push({ nombre: prefijo, archivo: p });
    }
  };
  caminar(base, "");
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

describe("candado estructural — /api/boston/**", () => {
  const rutas = rutasBoston();

  it("encuentra rutas (un parser roto devolvería 0 y todo pasaría en verde)", () => {
    expect(rutas.length).toBeGreaterThan(0);
  });

  it("el inventario de rutas es el esperado (si aparece una nueva, revisala)", () => {
    expect(rutas.map(r => r.nombre)).toEqual(["clientes", "inicio", "prestamos", "ventas"]);
  });

  it("toda ruta del módulo exige sesión y rol (ninguna quedó abierta)", () => {
    for (const { nombre, archivo } of rutas) {
      const src = sinComentarios(readFileSync(archivo, "utf-8"));
      expect(src, `${nombre} no verifica la sesión`).toMatch(/requireRole\s*\(\s*req/);
      expect(src, `${nombre} no corta cuando el guard rechaza`)
        .toMatch(/auth\s+instanceof\s+NextResponse/);
    }
  });

  it("🔴 la empresa NUNCA viaja por query: el módulo ES confecciones_boston", () => {
    // Aceptarla por parámetro le abriría a David las otras 7 empresas del grupo
    // desde su único módulo. Es el MISMO candado que protege a Multifashion.
    for (const { nombre, archivo } of rutas) {
      const src = sinComentarios(readFileSync(archivo, "utf-8"));
      expect(src, `${nombre} lee la empresa de la URL`).not.toMatch(
        /(searchParams|sp)\.get\(\s*["'](empresa|empresa_key|empresaKey)["']\s*\)/,
      );
    }
  });

  it("las rutas de Boston derivan su lista de roles, no la escriben a mano", () => {
    for (const { nombre, archivo } of rutas) {
      const src = sinComentarios(readFileSync(archivo, "utf-8"));
      expect(src, `${nombre} escribe su propia lista de roles`)
        .toMatch(/requireRole\(\s*req\s*,\s*rolesModuloBoston\(\)\s*\)/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Boston es su ÚNICO módulo — rol por rol
// ═════════════════════════════════════════════════════════════════════════════

describe("gerente_boston — Boston y Catálogos, y NADA más", () => {
  // 🔴 ESTE BLOQUE CAMBIÓ DE DIRECCIÓN el 27-ago-2026. Exigía UN solo módulo, y
  // era correcto el día que se escribió. Daniel decidió después: «catalogo para
  // david si, solo eso». Lo que NO se aflojó es el invariante: la lista sigue
  // siendo EXACTA y cerrada, y un tercer módulo pone el build rojo. El candado
  // hizo su trabajo — frenó hasta que la decisión quedó escrita.
  const SUS_MODULOS = [MODULO_BOSTON, "catalogos"];

  it("sus módulos por defecto son exactamente ['boston', 'catalogos']", () => {
    expect(getDefaultModulesForRole(ROL).sort()).toEqual([...SUS_MODULOS].sort());
  });

  it("ningún OTRO módulo del catálogo lo nombra en su roles[]", () => {
    const conElRol = ALL_MODULES.filter(m => m.roles.includes(ROL)).map(m => m.key).sort();
    expect(conElRol).toEqual([...SUS_MODULOS].sort());
  });

  it("y el módulo que sí es suyo no se le abrió a nadie más de rebote", () => {
    const b = ALL_MODULES.find(m => m.key === MODULO_BOSTON);
    expect(b?.roles).toEqual(["admin", ROL]);
    expect(b?.href).toBe("/boston");
  });

  it("es un rol REAL del sistema (no un valor suelto que nadie reconoce)", () => {
    expect(SYSTEM_ROLE_KEYS).toContain(ROL);
  });

  it("los demás roles no ganaron el módulo Boston", () => {
    for (const rol of SYSTEM_ROLE_KEYS) {
      if (rol === "admin" || rol === ROL) continue;
      expect(getDefaultModulesForRole(rol), `${rol} no debe ver Boston`).not.toContain(MODULO_BOSTON);
    }
  });

  it("`esGerenteBoston` y `puedeVerModuloBoston` barren TODOS los roles", () => {
    for (const rol of SYSTEM_ROLE_KEYS) {
      expect(esGerenteBoston(rol)).toBe(rol === ROL);
      expect(puedeVerModuloBoston(rol)).toBe(
        (ROLES_MODULO_BOSTON as readonly string[]).includes(rol),
      );
    }
    for (const v of [undefined, null, "", "  ", "GERENTE_BOSTON"]) {
      expect(esGerenteBoston(v)).toBe(false);
      expect(puedeVerModuloBoston(v)).toBe(false);
    }
  });

  it("la copia mutable no contamina la fuente", () => {
    rolesModuloBoston().push("vendedor");
    expect([...ROLES_MODULO_BOSTON]).toEqual(["admin", ROL]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. 🔴 FUGA Nº 2 — el auto-redirect desde /home
// ═════════════════════════════════════════════════════════════════════════════

describe("gerente_boston — /home lo manda solo a Boston", () => {
  // 🔴 CON DOS MÓDULOS EL REDIRECT DE «MÓDULO ÚNICO» YA NO LO ALCANZA, y sin
  // reemplazo caería en el Inicio del GRUPO — la fuga nº 2, de vuelta. Lo que
  // lo aterriza es su CASA (`moduloCasaDeRol`), que sigue siendo Boston.
  it("su casa es Boston, y ningún otro rol tiene casa fijada", () => {
    expect(moduloCasaDeRol(ROL)).toBe(MODULO_BOSTON);
    for (const rol of SYSTEM_ROLE_KEYS) {
      if (rol === ROL) continue;
      expect(moduloCasaDeRol(rol), `${rol} ganó una casa`).toBeNull();
    }
  });

  it("con sus DOS módulos visibles, el destino sigue siendo /boston", () => {
    const visibles = getVisibleModules(ROL, [MODULO_BOSTON, "catalogos"]);
    expect(visibles.map(m => m.key).sort()).toEqual([MODULO_BOSTON, "catalogos"].sort());
    const casa = visibles.find(m => m.key === moduloCasaDeRol(ROL));
    expect(casa?.href).toBe("/boston");
  });

  it("y ANTES de que corra la DDL también: `catalogos` se hereda de `boston`", () => {
    // En producción su fila dice ["boston"]. Sin la herencia, la ficha no se
    // pinta el día del deploy y Daniel ve que «no se hizo».
    expect(MODULO_HEREDA_PERMISO_DE["catalogos"]).toBe(MODULO_BOSTON);
    const visibles = getVisibleModules(ROL, [MODULO_BOSTON]);
    expect(visibles.map(m => m.key).sort()).toEqual([MODULO_BOSTON, "catalogos"].sort());
    expect(visibles.find(m => m.key === moduloCasaDeRol(ROL))?.href).toBe("/boston");
  });

  it("🔴 la herencia NO le abre `boston` ni `referencia` a nadie más", () => {
    // La herencia va del padre AL HIJO y se acota por el `roles[]` del hijo.
    for (const rol of SYSTEM_ROLE_KEYS) {
      if (rol === "admin") continue;
      // nadie hereda Boston por tener catálogos
      expect(fgModulesDaAcceso(["catalogos"], MODULO_BOSTON, rol), `${rol} heredó Boston`)
        .toBe(rol === ROL ? fgModulesDaAcceso(["catalogos"], MODULO_BOSTON, rol) : false);
    }
    // `referencia` hereda de `catalogos`, pero no nombra a gerente_boston:
    // la herencia mira UN solo nivel y además recorta por roles[].
    expect(fgModulesDaAcceso([MODULO_BOSTON], "referencia", ROL)).toBe(false);
    expect(fgModulesDaAcceso(["catalogos"], "referencia", ROL)).toBe(false);
  });

  it("aunque `fg_modules` llegue vacío, el fallback da sus dos módulos", () => {
    for (const fg of [null, undefined, [] as string[]]) {
      expect(getVisibleModules(ROL, fg).map(m => m.key).sort())
        .toEqual([MODULO_BOSTON, "catalogos"].sort());
    }
  });

  it("el /home sigue teniendo el auto-redirect de módulo único", () => {
    const src = sinComentarios(leer("src/app/home/page.tsx"));
    expect(src).toMatch(/getVisibleModules\(\s*role\s*,\s*fgModules\s*\)/);
    expect(src).toMatch(/visible\.length\s*===\s*1/);
    expect(src).toMatch(/router\.push\(\s*visible\[0\]\.href\s*\)/);
  });

  it("🔴 y el /home aterriza al rol con CASA aunque tenga varios módulos", () => {
    const src = sinComentarios(leer("src/app/home/page.tsx"));
    expect(src).toMatch(/moduloCasaDeRol\(\s*role\s*\)/);
    expect(src).toMatch(/router\.push\(\s*casa\.href\s*\)/);
  });

  it("🔴 y el /home NO le dibuja la búsqueda global (fuga nº 1, lado pantalla)", () => {
    // La barra se pinta solo para admin y secretaria. Si mañana alguien la
    // abriera a todos, David vería un buscador que cubre 8 módulos del grupo.
    const src = sinComentarios(leer("src/app/home/page.tsx"));
    expect(src).toMatch(/\["admin",\s*"secretaria"\]\.includes\(role\)/);
    expect(src).not.toMatch(new RegExp(`["']${ROL}["']`));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. 🔴 CONDUCTA — los handlers REALES del grupo le contestan 403
// ═════════════════════════════════════════════════════════════════════════════

type Handler = (req: NextRequest) => Promise<Response> | Response;

/** Una ruta por módulo ajeno. Lo que se prueba es que la puerta siga cerrada. */
const RUTAS_AJENAS: Array<[modulo: string, url: string, handler: Handler]> = [
  // 🔴 LA FUGA Nº 1: la búsqueda global cubre 8 módulos del grupo.
  ["búsqueda global",     "/api/search?q=city%20mall",                    busquedaGlobal as Handler],
  // 🔴 EL CXC DEL GRUPO: la cartera que David no puede ver.
  ["cxc del grupo",       "/api/cxc/aging",                               cxcAging as Handler],
  ["ventas",              "/api/ventas/resumen?year=2026",                ventasResumen as Handler],
  ["comisiones",          "/api/ventas/comisiones?year=2026&mes=8",       comisiones as Handler],
  ["proveedores",         "/api/proveedores",                             proveedores as Handler],
  ["gastos (saldos)",     "/api/saldos-banco",                            saldosBanco as Handler],
  ["gastos (egresos)",    "/api/gastos-contabilidad/egresos?mes=2026-08", gastosEgresos as Handler],
  ["marketing",           "/api/marketing/proyectos",                     marketingProyectos as Handler],
  ["caja menuda",         "/api/caja/periodos",                           cajaPeriodos as Handler],
  ["packing lists",       "/api/packing-lists",                           packingLists as Handler],
  ["directorio/clientes", "/api/directorio",                              directorio as Handler],
  ["multifashion",        "/api/multifashion/overview?year=2026&mes=8",   multifashionOverview as Handler],
  // 🔴 PRÉSTAMOS: VE la lista por `/api/boston/prestamos`, pero el módulo de
  // Contabilidad —donde se ESCRIBE— le sigue cerrado. Ver, no editar.
  ["préstamos (escritura)", "/api/prestamos/empleados",                   prestamosEmpleados as Handler],
];

describe("gerente_boston — 403 en todo lo que no es Boston", () => {
  for (const [modulo, url, handler] of RUTAS_AJENAS) {
    it(`${modulo}: 403 con cookie válida de gerente_boston`, async () => {
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
    const res = await busquedaGlobal(new NextRequest("https://fashiongr.com/api/search?q=city"));
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Lo que SÍ es suyo — y admin también entra
// ═════════════════════════════════════════════════════════════════════════════

const RUTAS_PROPIAS: Array<[nombre: string, url: string, handler: Handler]> = [
  ["inicio",    "/api/boston/inicio",    bostonInicio as Handler],
  ["ventas",    "/api/boston/ventas",    bostonVentas as Handler],
  ["clientes",  "/api/boston/clientes",  bostonClientes as Handler],
  ["préstamos", "/api/boston/prestamos", bostonPrestamos as Handler],
  ["cartera CXC de Boston", "/api/cxc/boston", cxcBoston as Handler],
];

describe("gerente_boston — su módulo SÍ le abre", () => {
  for (const [nombre, url, handler] of RUTAS_PROPIAS) {
    it(`${nombre}: responde 200`, async () => {
      const res = await handler(req(url, ROL));
      expect(res.status, `${nombre} rebotó a ${ROL}`).toBe(200);
    });
  }

  it("y a admin también (el módulo no es exclusivo de David)", async () => {
    for (const [nombre, url, handler] of RUTAS_PROPIAS) {
      const res = await handler(req(url, "admin"));
      expect(res.status, `${nombre} rebotó a admin`).toBe(200);
    }
  });

  it("los demás roles NO entran a /api/boston/**", async () => {
    for (const rol of SYSTEM_ROLE_KEYS) {
      if (rol === "admin" || rol === ROL) continue;
      for (const [nombre, url, handler] of RUTAS_PROPIAS.slice(0, 4)) {
        const res = await handler(req(url, rol));
        expect(res.status, `${nombre} dejó entrar a ${rol}`).toBe(403);
      }
    }
  });

  it("la cartera de Boston: los mismos tres roles y nadie más", () => {
    for (const rol of SYSTEM_ROLE_KEYS) {
      expect(puedeVerBoston(rol)).toBe((ROLES_BOSTON as readonly string[]).includes(rol));
    }
    expect(puedeVerBoston(ROL)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. 🔴 Las anotaciones del CXC: David solo escribe en SU cartera
// ═════════════════════════════════════════════════════════════════════════════

describe("gerente_boston — favoritos solo de la cartera de Boston", () => {
  it("cartera=boston: entra", async () => {
    const res = await cxcFavoritos(req("/api/cxc/favorites?cartera=boston", ROL));
    expect(res.status).not.toBe(403);
  });

  it("🔴 cartera=grupo: 403", async () => {
    const res = await cxcFavoritos(req("/api/cxc/favorites?cartera=grupo", ROL));
    expect(res.status).toBe(403);
  });

  it("y admin sí puede en las dos (el 403 de arriba es del rol, no de la ruta)", async () => {
    for (const cartera of ["boston", "grupo"]) {
      const res = await cxcFavoritos(req(`/api/cxc/favorites?cartera=${cartera}`, "admin"));
      expect(res.status, `admin rebotado en ${cartera}`).not.toBe(403);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. 🔴 LA PLANILLA — empresa forzada y sin la plata
// ═════════════════════════════════════════════════════════════════════════════

describe("la planilla de Boston", () => {
  it("por defecto David NO ve los sueldos (la pregunta que Daniel no contestó)", () => {
    expect(VE_SUELDOS_DE_BOSTON).toBe(false);
    expect(planillaSinDinero(ROL)).toBe(true);
  });

  it("el recorte es SOLO para él: nadie más pierde el dinero", () => {
    for (const rol of SYSTEM_ROLE_KEYS) {
      if (rol === ROL) continue;
      expect(planillaSinDinero(rol), `${rol} perdió el bloque de dinero`).toBe(false);
    }
  });

  it("🔴 la línea recortada NO lleva un solo campo de plata", () => {
    const linea = {
      codigo: "11", etiqueta: "JULIO GARAY", nombre: "JULIO", empresa: EMPRESA_BOSTON,
      empresaEtiqueta: "Confecciones Boston", salarioMensual: 1000, jornadaSemanal: 48,
      horas: { extraDiurnoMin: 60, tardanzaMin: 0, ausenciaMin: 0 },
      faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true, baseSeguros: 500,
      noMarcaReloj: false, decidirAMano: null, quincenalReferencia: 500,
      extraMedido: { minutos: 60, diurnoMin: 60, nocturnoMin: 0, monto: 43.45 },
      extraAprobada: true,
      dinero: { netoPagar: 480, rataHora: 6.32, seguroSocial: 48.75 },
      manuales: { isr: 10, prestamo: 20 },
    };
    const recortada = lineaSinDinero(linea) as unknown as Record<string, unknown>;

    // Lista EXACTA de claves, no un "no contiene": lo que no se nombra, no viaja.
    expect(Object.keys(recortada).sort()).toEqual(
      [...CAMPOS_SIN_DINERO, "extraMedido"].sort(),
    );

    for (const prohibida of [
      "dinero", "manuales", "salarioMensual", "baseSeguros", "quincenalReferencia", "pagaSeguros",
    ]) {
      expect(recortada[prohibida], `«${prohibida}» viajó en el JSON`).toBeUndefined();
    }

    // 🔴 Y tampoco el MONTO de las extras: es una división que devuelve la rata,
    // y de la rata sale el mensual.
    const em = recortada.extraMedido as Record<string, unknown>;
    expect(em.monto).toBeUndefined();
    expect(em.minutos).toBe(60);

    // Lo que SÍ recibe: las horas enteras.
    expect(recortada.horas).toEqual(linea.horas);
    expect(recortada.etiqueta).toBe("JULIO GARAY");
  });

  it("`extraMedido` en null no revienta", () => {
    const r = lineaSinDinero({ extraMedido: null, faltaConfigurar: [] }) as unknown as Record<string, unknown>;
    expect(r.extraMedido).toBeNull();
  });

  it("🔴 la RUTA le fuerza la empresa a Boston y no la lee de la URL", () => {
    const src = sinComentarios(leer("src/app/api/asistencia/planilla/route.ts"));
    // La empresa sale del ROL, no del query, para ese rol.
    expect(src).toMatch(/esGerenteBoston\(\s*auth\.role\s*\)\s*\n?\s*\?\s*EMPRESA_BOSTON/);
    // Y el recorte se decide con el módulo, no con un `if` suelto.
    expect(src).toMatch(/planillaSinDinero\(\s*auth\.role\s*\)/);
    // El rol tiene que estar en la lista del guard, o la ruta le contestaría 403.
    // 🔴 CAMBIÓ DE DIRECCIÓN (31-ago-2026): el gate pasó de `requireRole` —que
    // solo mira el ROL— a `requireAsistencia`, que además exige el MÓDULO. Y
    // por eso la planilla le pasa `MODULOS_PLANILLA`: David NO tiene
    // `asistencia`, su acceso lo habilita `boston`. Sin ese segundo argumento
    // esta pantalla suya se caería con 403.
    expect(src).toMatch(/requireAsistencia\(\s*req\s*,\s*\[[^\]]*ROL_BOSTON[^\]]*\]\s*,\s*MODULOS_PLANILLA\s*\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Las pestañas del módulo
// ═════════════════════════════════════════════════════════════════════════════

describe("las pestañas de /boston", () => {
  it("son las seis aprobadas, en su orden", () => {
    expect(PESTANAS_BOSTON.map(p => p.key)).toEqual([
      "inicio", "cxc", "ventas", "clientes", "planilla", "prestamos",
    ]);
  });

  it("🩸 los rótulos son CORTOS: las 6 tienen que entrar en el iPhone", () => {
    // Medido: con «Cuentas por Cobrar» la tira desbordaba 164 px a 390 y
    // «Préstamos» quedaba FUERA de la pantalla — el mismo defecto que
    // Multifashion pagó al pasar de 5 a 6 sub-tabs. Un rótulo más largo obliga
    // a volver a medir la tira, no a agrandarla en silencio.
    const total = PESTANAS_BOSTON.reduce((n, p) => n + p.label.length, 0);
    expect(total).toBeLessThanOrEqual(48);
    for (const p of PESTANAS_BOSTON) expect(p.label.length).toBeLessThanOrEqual(10);
  });

  it("la pestaña de la cartera se llama igual que la tarjeta que lleva a ella", () => {
    // La puerta (el KPI «Por cobrar» del Inicio) y el destino dicen lo mismo.
    expect(PESTANAS_BOSTON.find(p => p.key === "cxc")?.label).toBe("Por cobrar");
    const inicio = sinComentarios(leer("src/app/boston/tabs/InicioBoston.tsx"));
    expect(inicio).toContain('titulo="Por cobrar"');
  });

  it("⛔ Catálogos NO es una pestaña (las 4 marcas son de Fashion Group)", () => {
    expect(PESTANAS_BOSTON.map(p => p.key)).not.toContain("catalogos");
  });

  it("⛔ Guías tampoco (Daniel lo dijo explícito: «Sin guías»)", () => {
    expect(PESTANAS_BOSTON.map(p => p.key)).not.toContain("guias");
  });

  it("una pestaña inventada en la URL cae a Inicio, no rompe la pantalla", () => {
    for (const v of [undefined, null, "", "  ", "guias", "catalogos", "GRUPO", "../admin"]) {
      expect(tabBostonValida(v)).toBe("inicio");
    }
    for (const p of PESTANAS_BOSTON) expect(tabBostonValida(p.key)).toBe(p.key);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. BARRIDO — la empresa no se escribe a mano en el módulo
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 🔴 LA ÚNICA RUTA DEL MÓDULO QUE NO SE ACOTA A BOSTON, con el motivo escrito.
 *
 * Daniel lo pidió con esas palabras: **«Préstamos (TODOS, no solo los de
 * Boston)»**. Que la excepción esté acá —y no simplemente ausente del barrido—
 * es lo que impide que mañana alguien la "arregle" filtrando por Boston y le
 * rompa la pantalla sin entender por qué estaba así.
 */
const SIN_ACOTAR_A_BOSTON: Record<string, string> = {
  prestamos: "Daniel pidió TODOS los préstamos, no solo los de Boston (27-ago-2026)",
};

describe("BARRIDO — `confecciones_boston` se dice UNA vez", () => {
  it("las rutas de /api/boston/** derivan la empresa del módulo", () => {
    for (const { nombre, archivo } of rutasBoston()) {
      const src = sinComentarios(readFileSync(archivo, "utf-8"));
      expect(src, `${nombre} escribe la empresa a mano`).not.toMatch(/["']confecciones_boston["']/);
      if (SIN_ACOTAR_A_BOSTON[nombre]) continue;
      expect(src, `${nombre} no importa la constante del módulo`).toMatch(/EMPRESA_BOSTON/);
    }
  });

  it("no queda una excepción ZOMBI (la ruta eximida sigue existiendo)", () => {
    const nombres = new Set(rutasBoston().map((r) => r.nombre));
    for (const nombre of Object.keys(SIN_ACOTAR_A_BOSTON)) {
      expect(nombres, `la excepción «${nombre}» ya no corresponde a ninguna ruta`).toContain(nombre);
    }
  });

  it("🔴 y la excepción es UNA sola: Préstamos", () => {
    // Si mañana aparece una segunda, que sea una decisión escrita y no un
    // descuido — el punto entero del módulo es que todo lo demás sea de Boston.
    expect(Object.keys(SIN_ACOTAR_A_BOSTON)).toEqual(["prestamos"]);
  });

  it("y la constante es la que el resto del sistema ya usa", () => {
    expect(EMPRESA_BOSTON).toBe("confecciones_boston");
  });
});
