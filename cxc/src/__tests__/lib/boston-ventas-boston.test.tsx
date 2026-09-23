// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — «VENTAS BOSTON»: lo que ve David (`gerente_boston`) desde el 23-sep-2026.
//
// Daniel, textual: *«Llámalo Ventas Boston entonces. Y dale acceso a los otros
// módulos»* y *«Asistencia que pueda ver todo como yo»*.
//
// Lo que se exige, medido por conducta (DOM y rutas con cookie firmada), no
// por barridos de texto salvo donde se dice:
//
//   1. `/boston` para David tiene SOLO Inicio y Ventas; `?tab=cxc|planilla|
//      prestamos|clientes` cae en Inicio; el rótulo dice «Ventas Boston».
//   2. En `/cxc` David recibe SOLO Boston (0 lecturas del grupo) y admin SOLO
//      las 6 (0 lecturas de Boston); «Saldo a favor (N)» y «sin pagar +90 d»
//      salen para Boston.
//   3. En Asistencia David ve las MISMAS pestañas que admin, con 0 filas de otra
//      empresa, y sin «Cerrar».
//   4. Sin el permiso en `role_permissions` no ve Cuentas por Cobrar (y «Por
//      cobrar» sigue adentro de `/boston`).
//   5. Interruptor en `false` = todo como antes.
//
// Medido contra producción el 23-sep-2026 con el MISMO módulo puro que usa la
// pantalla: 410 clientes · $193.347,32 · 289 deben $214.574,35 · 121 a favor
// −$21.227,03 · 53 nunca pagaron $5.930,03 · 199 sin pagar +90 d $129.817,95.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/session-cookie";
import {
  PESTANAS_VENTAS_BOSTON,
  ROTULO_MODULO_BOSTON_ANTES,
  ROTULO_VENTAS_BOSTON,
  VENTAS_BOSTON,
  carteraDelRolEnCxc,
  destinoFueraDeBoston,
  moduloCxcSePintaA,
  pestanasDeBoston,
  puedeQuedarseEnCxc,
  rolesQueSumaVentasBoston,
  rotuloModuloBoston,
  tabDeBoston,
} from "@/lib/boston/ventas-boston";
import { EMPRESA_BOSTON, MODULO_BOSTON, PESTANAS_BOSTON, ROL_BOSTON } from "@/lib/boston/rol";
import { ALL_MODULES, SYSTEM_ROLE_KEYS, getVisibleModules } from "@/lib/modules";
import {
  ASISTENCIA_ROLES,
  MIRAN_PERO_NO_CIERRAN,
  asistenciaRoles,
  cerrarPlanillaRoles,
  diaLibreRoles,
  puedeCerrar,
  vePestana,
} from "@/lib/asistencia/roles";
import { PRESTAMOS_ROLES } from "@/lib/prestamos-roles";
import { vePestanaPrestamos } from "@/lib/prestamos-una-puerta";
import { pestanasDeAsistencia } from "@/lib/asistencia/persona-en-el-centro";
import {
  alcanceDelRol,
  codigosPermitidos,
  empresaEnAlcance,
  empresaForzada,
  soloPermitidos,
} from "@/lib/asistencia/alcance-boston";
import {
  COMPANIA_BOSTON,
  consolidarCarteraBoston,
  totalesDe,
  ultimoPagoBoston,
  type ClienteBostonApi,
} from "@/lib/cxc/boston-como-grupo";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf-8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

// ── Arnés de rutas: la base no se toca, y las FICHAS son un fixture ──────────

/** Tres fichas: dos de Boston y una de Vistana. Lo que el recorte tiene que separar. */
const FICHAS = [
  { empleado_codigo: "44", nombre: "PERSONA BOSTON UNO", salario_mensual: 600, jornada_semanal: 48, empresa: "confecciones_boston", posicion: "Costurera", cedula: "8-1-1" },
  { empleado_codigo: "45", nombre: "PERSONA BOSTON DOS", salario_mensual: 600, jornada_semanal: 48, empresa: "confecciones_boston", posicion: null, cedula: null },
  { empleado_codigo: "11", nombre: "JULIO VISTANA", salario_mensual: 900, jornada_semanal: 48, empresa: "vistana", posicion: "Bodega", cedula: "8-2-2" },
];

function chain(result: { data: unknown; error: unknown; count?: number }) {
  const self: Record<string, unknown> = {};
  const paso = () => () => self;
  Object.assign(self, {
    select: paso(), eq: paso(), neq: paso(), not: paso(), in: paso(), is: paso(),
    gte: paso(), lt: paso(), lte: paso(), gt: paso(), or: paso(),
    ilike: paso(), range: paso(), order: paso(), limit: paso(),
    maybeSingle: async () => result,
    single: async () => result,
    upsert: async () => ({ error: null }),
    insert: async () => ({ error: null }),
    update: paso(), delete: paso(),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  });
  return self;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    rpc: async () => ({ data: [], error: null }),
    from: () => chain({ data: [], error: null, count: 0 }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
  },
  HAS_SERVICE_ROLE: true,
}));
vi.mock("@/lib/rechazos-de-switch", () => ({ lineaDeRechazos: async () => null }));
vi.mock("@/lib/asistencia/config-server", async (orig) => ({
  ...(await orig<typeof import("@/lib/asistencia/config-server")>()),
  leerPersonas: async (solo?: string) => ({
    filas: solo ? FICHAS.filter((f) => f.empleado_codigo === solo) : FICHAS,
    faltaMigracion: false,
  }),
}));
vi.mock("@/lib/prestamos-lista-server", async (orig) => ({
  ...(await orig<typeof import("@/lib/prestamos-lista-server")>()),
  leerDatosPrestamos: async () => ({
    filas: [
      { id: "f1", nombre: "PERSONA BOSTON UNO", empresa: "Confecciones Boston", empleadoCodigo: "44", saldo: 100 },
      { id: "f2", nombre: "JULIO VISTANA", empresa: "Vistana", empleadoCodigo: "11", saldo: 9512.86 },
      { id: "f3", nombre: "SIN CÓDIGO", empresa: null, empleadoCodigo: null, saldo: 50 },
    ],
    colaboradores: [
      { codigo: "44", nombre: "PERSONA BOSTON UNO", empresa: "confecciones_boston" },
      { codigo: "11", nombre: "JULIO VISTANA", empresa: "vistana" },
    ],
  }),
}));

import { GET as comprobante } from "@/app/api/asistencia/comprobante/route";
import { PUT as horariosPut } from "@/app/api/asistencia/horarios/route";
import { POST as feriadosPost } from "@/app/api/asistencia/feriados/route";
import { PUT as reglasPut } from "@/app/api/asistencia/configuracion/reglas/route";
import { GET as prestamosEmpleados } from "@/app/api/prestamos/empleados/route";
import { POST as aplicarQuincena } from "@/app/api/prestamos/aplicar-quincena/route";
import { GET as cxcAging } from "@/app/api/cxc/aging/route";
import { GET as cxcBoston } from "@/app/api/cxc/boston/route";
import { GET as alcance } from "@/app/api/asistencia/alcance/route";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-ventas-boston"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

/** La cookie de producción: David trae `asistencia` en sus módulos desde el 31-ago-2026. */
function req(url: string, role: string, init?: { method?: string; body?: unknown }): NextRequest {
  const modules = role === ROL_BOSTON ? ["boston", "catalogos", "asistencia"] : ["asistencia", "cxc"];
  const cookie = signSession({ role, userId: "u1", userName: role === ROL_BOSTON ? "david" : "daniel", sessionToken: "t1", modules });
  return new NextRequest(`https://fashiongr.com${url}`, {
    method: init?.method ?? "GET",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 0. El interruptor existe, está prendido, y en `false` todo es lo de antes
// ═════════════════════════════════════════════════════════════════════════════

describe("el interruptor VENTAS_BOSTON", () => {
  it("está prendido y vive en lib/boston", () => {
    expect(VENTAS_BOSTON).toBe(true);
    expect(rotuloModuloBoston()).toBe(ROTULO_VENTAS_BOSTON);
  });

  it("🔴 en `false` es EXACTAMENTE lo de antes: seis pestañas, rótulo viejo, sin cxc, sin Asistencia completa", () => {
    expect(pestanasDeBoston({ tieneCxc: true, interruptor: false }).map((p) => p.key)).toEqual(PESTANAS_BOSTON.map((p) => p.key));
    expect(rotuloModuloBoston(false)).toBe(ROTULO_MODULO_BOSTON_ANTES);
    expect(rolesQueSumaVentasBoston(false)).toEqual([]);
    expect(moduloCxcSePintaA(ROL_BOSTON, false)).toBe(false);
    expect(puedeQuedarseEnCxc(ROL_BOSTON, false)).toBe(false);
    expect(alcanceDelRol(ROL_BOSTON, false)).toBeNull();
    // Y a los demás no les cambia nada, ni prendido ni apagado.
    for (const rol of SYSTEM_ROLE_KEYS.filter((r) => r !== ROL_BOSTON)) {
      expect(moduloCxcSePintaA(rol, false)).toBe(true);
      expect(puedeQuedarseEnCxc(rol, false)).toBe(true);
      expect(alcanceDelRol(rol)).toBeNull();
    }
  });

  it("prendido: suma solo a gerente_boston, y solo Boston en su alcance", () => {
    expect(rolesQueSumaVentasBoston(true)).toEqual([ROL_BOSTON]);
    expect(alcanceDelRol(ROL_BOSTON, true)).toEqual([EMPRESA_BOSTON]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. /boston = «Ventas Boston»: Inicio y Ventas
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1 · /boston para David tiene solo Inicio y Ventas", () => {
  it("con el permiso de cxc, las pestañas son exactamente Inicio y Ventas", () => {
    expect(pestanasDeBoston({ tieneCxc: true }).map((p) => p.key)).toEqual([...PESTANAS_VENTAS_BOSTON]);
    expect(pestanasDeBoston({ tieneCxc: true }).map((p) => p.label)).toEqual(["Inicio", "Ventas"]);
  });

  it("🔴 ?tab=cxc|planilla|prestamos|clientes cae en Inicio", () => {
    const pestanas = pestanasDeBoston({ tieneCxc: true });
    for (const v of ["cxc", "planilla", "prestamos", "clientes", "guias", "", null, undefined]) {
      expect(tabDeBoston(v, pestanas), String(v)).toBe("inicio");
    }
    expect(tabDeBoston("ventas", pestanas)).toBe("ventas");
  });

  it("las tarjetas del Inicio cuya pestaña se fue llevan a donde vive eso ahora", () => {
    const pestanas = pestanasDeBoston({ tieneCxc: true });
    expect(destinoFueraDeBoston("cxc", pestanas)).toBe("/cxc");
    expect(destinoFueraDeBoston("planilla", pestanas)).toBe(`/asistencia?tab=planilla&empresa=${EMPRESA_BOSTON}`);
    expect(destinoFueraDeBoston("prestamos", pestanas)).toBe(`/asistencia?tab=prestamos&empresa=${EMPRESA_BOSTON}`);
    // Las que siguen acá, se cambian de pestaña como siempre.
    expect(destinoFueraDeBoston("ventas", pestanas)).toBeNull();
    expect(destinoFueraDeBoston("inicio", pestanas)).toBeNull();
  });

  it("el módulo se llama «Ventas Boston» en el catálogo, con la MISMA key y ruta", () => {
    const m = ALL_MODULES.find((x) => x.key === MODULO_BOSTON);
    expect(m?.label).toBe("Ventas Boston");
    expect(m?.href).toBe("/boston");
  });

  it("🔴 sin el permiso en la base, «Por cobrar» sigue adentro (falla abierta)", () => {
    expect(pestanasDeBoston({ tieneCxc: false }).map((p) => p.key)).toEqual(["inicio", "cxc", "ventas"]);
    expect(tabDeBoston("cxc", pestanasDeBoston({ tieneCxc: false }))).toBe("cxc");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1b. El DOM de /boston
// ═════════════════════════════════════════════════════════════════════════════

vi.mock("next/navigation", () => ({
  usePathname: () => "/boston",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/hooks/useUrlState", async () => {
  const { useState } = await import("react");
  return { useUrlState: (_k: string, def: string) => useState(def) };
});
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "gerente_boston", isOwner: false }),
}));
const accesoCxc = { valor: true };
vi.mock("@/lib/auth-check", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth-check")>()),
  hasModuleAccess: (key: string) => (key === "cxc" ? accesoCxc.valor : true),
}));
vi.mock("@/components/AppHeader", () => ({ default: ({ module }: { module: string }) => <div data-testid="encabezado">{module}</div> }));
vi.mock("@/app/boston/tabs/InicioBoston", () => ({ default: () => <div>inicio-boston</div> }));
vi.mock("@/app/boston/tabs/VentasBoston", () => ({ default: () => <div>ventas-boston</div> }));
vi.mock("@/app/boston/tabs/ClientesBoston", () => ({ default: () => <div>clientes-boston</div> }));
vi.mock("@/app/boston/tabs/PlanillaBoston", () => ({ default: () => <div>planilla-boston</div> }));
vi.mock("@/app/boston/tabs/PrestamosBoston", () => ({ default: () => <div>prestamos-boston</div> }));
vi.mock("@/components/cxc/BostonTab", () => ({ default: () => <div>por-cobrar-viejo</div> }));

describe("🔴 1b · la pantalla /boston dibuja dos pestañas y el rótulo nuevo", () => {
  afterEach(() => { cleanup(); accesoCxc.valor = true; });

  it("con cxc en sus módulos: «Inicio · Ventas», encabezado «Ventas Boston»", async () => {
    const { BostonShell } = await import("@/app/boston/BostonShell");
    render(<BostonShell />);
    await waitFor(() => {
      const barra = document.querySelector('[data-pestanas="boston"]');
      expect(barra).not.toBeNull();
      expect([...barra!.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Inicio", "Ventas"]);
    });
    expect(screen.getByTestId("encabezado").textContent).toBe("Ventas Boston");
    expect(document.body.textContent).toContain("inicio-boston");
  });

  it("🔴 sin cxc en sus módulos (migración sin correr): «Por cobrar» sigue acá", async () => {
    accesoCxc.valor = false;
    const { BostonShell } = await import("@/app/boston/BostonShell");
    render(<BostonShell />);
    await waitFor(() => {
      const barra = document.querySelector('[data-pestanas="boston"]');
      expect([...barra!.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Inicio", "Por cobrar", "Ventas"]);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. /cxc: David recibe SOLO Boston; admin SOLO las 6
// ═════════════════════════════════════════════════════════════════════════════

/** Una cartera de Boston de prueba: una deuda vieja, una a favor, uno que nunca pagó. */
function clienteBoston(p: Partial<ClienteBostonApi> & { codigo: string; nombre: string; total: number }): ClienteBostonApi {
  return {
    cliente_switch_id: 1, nombre_normalized: p.nombre.toUpperCase(), d0_90: 0, d91_120: 0, d121_plus: 0,
    finos: null, telefono: "", celular: "", correo: "", ultimo_pago_fecha: null, ultimo_pago_monto: null,
    tambien_en_grupo: false, ...p,
  };
}
const CARTERA_BOSTON: ClienteBostonApi[] = [
  clienteBoston({ codigo: "320", nombre: "Aladdin", total: 11176.58, d121_plus: 11176.58, ultimo_pago_fecha: "2024-07-01", ultimo_pago_monto: 1000, cliente_switch_id: 320 }),
  clienteBoston({ codigo: "111", nombre: "Panda Store", total: 4778, d0_90: 4778, ultimo_pago_fecha: null, cliente_switch_id: 111 }),
  clienteBoston({ codigo: "222", nombre: "Cliente Al Dia", total: 500, d0_90: 500, ultimo_pago_fecha: "2026-09-20", ultimo_pago_monto: 200, cliente_switch_id: 222 }),
  clienteBoston({ codigo: "333", nombre: "Cliente A Favor", total: -120.5, d0_90: -120.5, ultimo_pago_fecha: "2026-09-01", ultimo_pago_monto: 50, cliente_switch_id: 333 }),
];
const RESPUESTA_BOSTON = {
  clientes: CARTERA_BOSTON,
  totales: { total: 16334.08, d0_90: 5157.5, d91_120: 0, d121_plus: 11176.58, clientes: 4 },
  avisoMontos: null,
};

describe("🔴 2 · la cartera de Boston con la forma del grupo (módulo puro)", () => {
  it("un cliente por fila, UNA sola empresa adentro: confecciones_boston", () => {
    const lista = consolidarCarteraBoston(CARTERA_BOSTON);
    expect(lista).toHaveLength(4);
    for (const c of lista) expect(Object.keys(c.companies)).toEqual([EMPRESA_BOSTON]);
    expect(COMPANIA_BOSTON.key).toBe(EMPRESA_BOSTON);
  });

  it("🔴 ningún número se recalcula: los tramos y el total son los de la vista", () => {
    const t = totalesDe(consolidarCarteraBoston(CARTERA_BOSTON));
    expect(t.total).toBe(16334.08);
    expect(t.d0_90).toBe(5157.5);
    expect(t.d121_plus).toBe(11176.58);
    expect(t.deben).toBe(3);
    expect(t.aFavor).toBe(1);
    expect(t.montoAFavor).toBe(-120.5);
  });

  it("el último pago se cruza por CÓDIGO, y el que nunca pagó no tiene fecha", () => {
    const u = ultimoPagoBoston(CARTERA_BOSTON);
    expect(u["320"]).toBe("2024-07-01");
    expect(u["111"]).toBeUndefined();
  });

  it("la cartera se decide por ROL: gerente_boston → Boston, el resto → grupo", () => {
    expect(carteraDelRolEnCxc(ROL_BOSTON)).toBe("boston");
    for (const rol of SYSTEM_ROLE_KEYS.filter((r) => r !== ROL_BOSTON)) expect(carteraDelRolEnCxc(rol)).toBe("grupo");
  });
});

describe("🔴 2b · las rutas: David lee la de Boston y NO la del grupo; admin al revés no aplica", () => {
  it("gerente_boston: /api/cxc/aging → 403 y /api/cxc/boston → 200", async () => {
    expect((await cxcAging(req("/api/cxc/aging", ROL_BOSTON))).status).toBe(403);
    expect((await cxcBoston(req("/api/cxc/boston", ROL_BOSTON))).status).toBe(200);
  });

  it("admin: las dos le contestan 200 (el 403 de arriba es del rol, no de la ruta)", async () => {
    expect((await cxcAging(req("/api/cxc/aging", "admin"))).status).toBe(200);
    expect((await cxcBoston(req("/api/cxc/boston", "admin"))).status).toBe(200);
  });

  it("🔴 la pantalla de Boston no pide una sola ruta del grupo, y la del grupo no pide Boston", () => {
    const boston = sinComentarios(leer("src/app/cxc/components/CarteraBoston.tsx"));
    for (const ruta of ["/api/cxc/aging", "/api/cxc/estado-cuenta", "/api/cxc/enviar-email\"", "/api/cxc/cobrar-lote", "/api/cxc/ultimos-pagos", "/api/cxc/envios", "/api/cxc/ultimo-pago"]) {
      expect(boston, ruta).not.toContain(ruta);
    }
    const grupo = sinComentarios(leer("src/app/cxc/hooks/useAdminData.ts"));
    expect(grupo).not.toContain("/api/cxc/boston");
    expect(grupo).toContain("/api/cxc/aging");
  });

  it("🔴 en /cxc la cartera de David se decide con `carteraDelRolEnCxc`, y el grupo no dispara para él", () => {
    const pagina = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(pagina).toMatch(/carteraDelRolEnCxc\(\s*userRole\s*\)/);
    expect(pagina).toMatch(/useAdminData\(\s*authChecked\s*&&\s*!esCarteraBoston\s*\)/);
    expect(pagina).toContain("<CarteraBoston />");
    // El `allowedRoles` de la pantalla NO nombra a David: entra por la key.
    expect(pagina).toContain('allowedRoles: ["admin", "secretaria", "vendedor"]');
  });
});

describe("🔴 2c · el DOM de la cartera de Boston: saldo a favor y sin pagar +90 d", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-23T17:00:00.000Z"));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); cleanup(); });

  it("pinta «Saldo a favor (1)», el aviso de +90 d, y jamás llama a la ruta del grupo", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      const cuerpo = u.startsWith("/api/cxc/boston/ultimos-pagos")
        ? { pagos: [] }
        : u.startsWith("/api/sync-status")
          ? { ok: true, tabla: "estadocuenta", last_global: "2026-09-23T08:10:00Z", por_empresa: {}, stale: [] }
          : u === "/api/cxc/boston"
            ? RESPUESTA_BOSTON
            : null;
      return { ok: cuerpo !== null, status: cuerpo ? 200 : 403, json: async () => cuerpo ?? { error: "ajeno" } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { default: CarteraBoston } = await import("@/app/cxc/components/CarteraBoston");
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <CarteraBoston />
      </SWRConfig>,
    );
    await waitFor(() => expect(document.body.textContent).toContain("Saldo a favor"));
    const texto = document.body.textContent ?? "";
    expect(texto).toContain("Saldo a favor");
    expect(texto).toContain("(1)");
    expect(texto).toContain("Cliente A Favor");
    // 2 sin pagar hace +90 d: Aladdin (2024) y Panda Store (nunca pagó).
    expect(texto).toContain("2 sin pagar hace +90 d");
    expect(texto).toContain("nunca ha pagado");
    expect(texto).toMatch(/no paga hace \d+ d/);
    // Cero lecturas del grupo.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith("/api/cxc/boston"))).toBe(true);
    expect(urls.filter((u) => u.startsWith("/api/cxc/aging") || u.startsWith("/api/cxc/ultimo-pago") || u.startsWith("/api/cxc/envios"))).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Asistencia: las mismas pestañas que admin, 0 filas ajenas, sin «Cerrar»
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 3 · Asistencia para David", () => {
  it("ve las MISMAS pestañas que admin (las de hoy y las del acomodo nuevo)", () => {
    for (const opts of [{ personaEnElCentro: true, planillaUnida: true }, { personaEnElCentro: false, planillaUnida: true }]) {
      const claves = pestanasDeAsistencia(opts).map(([k]) => k);
      const david = claves.filter((k) => vePestana(ROL_BOSTON, k));
      const admin = claves.filter((k) => vePestana("admin", k));
      expect(david).toEqual(admin);
      expect(david).toContain("prestamos");
    }
    expect(vePestanaPrestamos(ROL_BOSTON)).toBe(true);
    expect(PRESTAMOS_ROLES).toContain(ROL_BOSTON);
    expect(asistenciaRoles()).toContain(ROL_BOSTON);
  });

  it("🔴 y NO cierra la quincena: no está entre los que firman pagos", () => {
    expect(puedeCerrar(ROL_BOSTON)).toBe(false);
    expect(cerrarPlanillaRoles()).not.toContain(ROL_BOSTON);
    expect(cerrarPlanillaRoles()).toEqual(["admin", "contabilidad"]);
    expect(diaLibreRoles()).not.toContain(ROL_BOSTON);
    expect(MIRAN_PERO_NO_CIERRAN).toContain(ROL_BOSTON);
    // Y la Planilla dibuja el botón solo para quien puede cerrar.
    const tab = sinComentarios(leer("src/app/asistencia/PlanillaTab.tsx"));
    expect(tab).toMatch(/const puedeCerrarla = puedeCerrar\(rol\)/);
    expect(tab).toMatch(/puedeCerrarla && [^\n]*\n[\s\S]{0,400}Cerrar quincena/);
  });

  it("el alcance, puro: solo Boston; sin ficha no entra; la empresa se fuerza", () => {
    const a = alcanceDelRol(ROL_BOSTON);
    expect(a).toEqual([EMPRESA_BOSTON]);
    expect(empresaEnAlcance(a, "vistana")).toBe(false);
    expect(empresaEnAlcance(a, null)).toBe(false);
    expect(empresaEnAlcance(null, "vistana")).toBe(true);
    const permitidos = codigosPermitidos(FICHAS, a);
    expect([...(permitidos ?? [])].sort()).toEqual(["44", "45"]);
    expect(codigosPermitidos(FICHAS, null)).toBeNull();
    expect(soloPermitidos(FICHAS, (f) => f.empleado_codigo, permitidos).map((f) => f.empleado_codigo)).toEqual(["44", "45"]);
    expect(empresaForzada(a, "vistana")).toBe(EMPRESA_BOSTON);
    expect(empresaForzada(a, null)).toBe(EMPRESA_BOSTON);
    expect(empresaForzada(null, "vistana")).toBe("vistana");
  });

  it("🔴 RUTAS: David recibe 0 filas de otra empresa; admin recibe todas", async () => {
    const david = await (await comprobante(req("/api/asistencia/comprobante", ROL_BOSTON))).json();
    expect(david.personas.map((p: { codigo: string }) => p.codigo).sort()).toEqual(["44", "45"]);
    const admin = await (await comprobante(req("/api/asistencia/comprobante", "admin"))).json();
    expect(admin.personas.map((p: { codigo: string }) => p.codigo).sort()).toEqual(["11", "44", "45"]);
    // Préstamos: sus fichas y sus colaboradores; la ficha sin código no entra.
    const prestamos = await (await prestamosEmpleados(req("/api/prestamos/empleados", ROL_BOSTON))).json();
    expect(prestamos.filas.map((f: { id: string }) => f.id)).toEqual(["f1"]);
    expect(prestamos.colaboradores.map((c: { codigo: string }) => c.codigo)).toEqual(["44"]);
    const todos = await (await prestamosEmpleados(req("/api/prestamos/empleados", "admin"))).json();
    expect(todos.filas.map((f: { id: string }) => f.id)).toEqual(["f1", "f2", "f3"]);
    // Y el alcance que le dice el servidor a la pantalla es solo Boston.
    expect((await (await alcance(req("/api/asistencia/alcance", ROL_BOSTON))).json()).empresas).toEqual([EMPRESA_BOSTON]);
  });

  it("🔴 RUTAS: escribirle a alguien de otra empresa es 403; a los suyos pasa el recorte", async () => {
    const ajeno = await horariosPut(req("/api/asistencia/horarios", ROL_BOSTON, { method: "PUT", body: { codigo: "11", salida: "17:00" } }));
    expect(ajeno.status).toBe(403);
    expect((await ajeno.json()).fuera).toEqual(["11"]);
    const suyo = await horariosPut(req("/api/asistencia/horarios", ROL_BOSTON, { method: "PUT", body: { codigo: "44", salida: "17:00" } }));
    expect(suyo.status).not.toBe(403);
    // CONTROL: admin no está recortado.
    const admin = await horariosPut(req("/api/asistencia/horarios", "admin", { method: "PUT", body: { codigo: "11", salida: "17:00" } }));
    expect(admin.status).not.toBe(403);
  });

  it("🔴 RUTAS: lo que es de TODAS las empresas (feriados, reglas, aplicar quincena) le contesta 403", async () => {
    expect((await feriadosPost(req("/api/asistencia/feriados", ROL_BOSTON, { method: "POST", body: { fecha: "2026-12-25", nombre: "Navidad" } }))).status).toBe(403);
    expect((await reglasPut(req("/api/asistencia/configuracion/reglas", ROL_BOSTON, { method: "PUT", body: {} }))).status).toBe(403);
    expect((await aplicarQuincena(req("/api/prestamos/aplicar-quincena", ROL_BOSTON, { method: "POST", body: {} }))).status).toBe(403);
    // CONTROL: a admin ninguna de las tres le contesta 403.
    expect((await feriadosPost(req("/api/asistencia/feriados", "admin", { method: "POST", body: { fecha: "2026-12-25", nombre: "Navidad" } }))).status).not.toBe(403);
    expect((await reglasPut(req("/api/asistencia/configuracion/reglas", "admin", { method: "PUT", body: {} }))).status).not.toBe(403);
  });

  it("🔴 BARRIDO: toda ruta de Asistencia que escribe por persona pasa por el recorte", () => {
    const rutas = [
      "src/app/api/asistencia/horarios/route.ts",
      "src/app/api/asistencia/justificaciones/route.ts",
      "src/app/api/asistencia/vacaciones/route.ts",
      "src/app/api/asistencia/correcciones/route.ts",
      "src/app/api/asistencia/correcciones/dia/route.ts",
      "src/app/api/asistencia/otros-servicios/route.ts",
      "src/app/api/asistencia/planilla/route.ts",
      "src/app/api/asistencia/configuracion/route.ts",
      "src/app/api/asistencia/configuracion/persona/route.ts",
      "src/app/api/asistencia/cedula-foto/route.ts",
      "src/app/api/asistencia/marcacion-foto/route.ts",
      "src/app/api/prestamos/empleados/route.ts",
      "src/app/api/prestamos/empleados/[id]/route.ts",
      "src/app/api/prestamos/movimientos/route.ts",
      "src/app/api/prestamos/movimientos/[id]/route.ts",
    ];
    for (const rel of rutas) {
      expect(sinComentarios(leer(rel)), rel).toMatch(/rechazar(FueraDeAlcance|EmpresaFueraDeAlcance|FichaPrestamoFueraDeAlcance)\(/);
    }
    const listas = [
      "src/app/api/asistencia/reporte/route.ts",
      "src/app/api/asistencia/comprobante/route.ts",
      "src/app/api/asistencia/prestamos-deuda/route.ts",
      "src/app/api/asistencia/prestamos-movimientos/route.ts",
      "src/app/api/asistencia/dia-libre/route.ts",
      "src/app/api/prestamos/export-excel/route.ts",
    ];
    for (const rel of listas) {
      expect(sinComentarios(leer(rel)), rel).toMatch(/alcanceDelRol\(|codigosDelAlcance\(/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Sin el permiso en la base, no ve Cuentas por Cobrar
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 4 · el módulo cxc solo aparece cuando role_permissions lo diga", () => {
  const HOY_EN_LA_BASE = ["boston", "catalogos", "asistencia"];

  it("con su fila de hoy: sin cxc en el menú, y su casa sigue siendo /boston", () => {
    const keys = getVisibleModules(ROL_BOSTON, HOY_EN_LA_BASE).map((m) => m.key);
    expect(keys).not.toContain("cxc");
    expect(keys).toContain(MODULO_BOSTON);
  });

  it("con la migración corrida: cxc en el menú, sin hardcodear el rol en el catálogo", () => {
    const keys = getVisibleModules(ROL_BOSTON, [...HOY_EN_LA_BASE, "cxc"]).map((m) => m.key);
    expect(keys).toContain("cxc");
    const cxc = ALL_MODULES.find((m) => m.key === "cxc");
    expect(cxc?.roles).not.toContain(ROL_BOSTON);
  });

  it("la migración es aditiva, idempotente y solo toca a gerente_boston", () => {
    const sql = leer("supabase/migrations/20261217130000_cxc_para_gerente_boston.sql");
    expect(sql).toContain("array_append(modulos, 'cxc')");
    expect(sql).toContain("WHERE role = 'gerente_boston'");
    expect(sql).toContain("AND NOT ('cxc' = ANY (modulos))");
    expect(sql).not.toMatch(/DELETE|DROP|TRUNCATE/);
    expect((sql.match(/role = '([a-z_]+)'/g) ?? []).every((m) => m.includes("gerente_boston"))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Nada de esto le abre el grupo a David ni cambia a los demás
// ═════════════════════════════════════════════════════════════════════════════

describe("los demás roles no cambiaron", () => {
  it("las tres listas de siempre siguen ahí, con David sumado al final", () => {
    expect([...ASISTENCIA_ROLES]).toEqual(["admin", "secretaria", "contabilidad", ROL_BOSTON]);
    expect([...PRESTAMOS_ROLES]).toEqual(["admin", "contabilidad", ROL_BOSTON]);
    expect([...MIRAN_PERO_NO_CIERRAN]).toEqual(["secretaria", ROL_BOSTON]);
  });

  it("el CXC del grupo sigue siendo de admin · secretaria · vendedor", () => {
    expect(ALL_MODULES.find((m) => m.key === "cxc")?.roles).toEqual(["admin", "secretaria", "vendedor"]);
    expect(pestanasDeBoston({ tieneCxc: true, interruptor: false })).toHaveLength(6);
  });
});
