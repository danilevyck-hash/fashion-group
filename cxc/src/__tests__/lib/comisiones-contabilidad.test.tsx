// ─────────────────────────────────────────────────────────────────────────────
// CONTABILIDAD VE COMISIONES — y la pantalla le funciona ENTERA.
//
// Daniel, textual (25-ago-2026): ***"Q contabilidad vea comisiones"***.
//
// 🔑 ESTO NO ABRIÓ UN PERMISO DE DATOS, Y ESTÁ MEDIDO. Antes de tocar una línea,
// contra `origin/main` (bf12fd05) y con cookies FIRMADAS sobre los handlers
// reales:
//
//     GET  /api/ventas/comisiones              contabilidad = 200
//     GET  /api/ventas/comisiones/consolidado  contabilidad = 200
//     GET  /api/ventas/comisiones/detalle      contabilidad = 200
//     GET  /api/ventas/comisiones/descuentos   contabilidad = 200
//     POST /api/ventas/comisiones/descuentos   contabilidad = 403
//     GET  /api/ventas/comisiones/config       contabilidad = 403
//
// Las cuatro de LECTURA ya le contestaban 200. Lo que se hizo fue dejar de
// esconderlo. Las dos de ESCRITURA siguen cerradas: VE, no edita.
//
// 🩸 EL BRIEF DECÍA QUE HOY LLEGABA ESCRIBIENDO LA DIRECCIÓN A MANO. ES FALSO, y
// se midió montando la pantalla real con `sessionStorage.cxc_role =
// "contabilidad"`: `/comisiones` la rebotaba a `/home` con "No tienes acceso a
// este modulo" (el `useAuth` de `ComisionesPageClient` pedía admin+secretaria).
// Por eso el arreglo son DOS puertas y no una — la ficha del menú Y la página.
//
// 🩸 Y UNA TERCERA, QUE ES LA QUE SE OLVIDA: `getVisibleModules` le da
// PRIORIDAD a `fg_modules` (lo guardado en `role_permissions`) sobre el
// `roles[]` del catálogo. La lista de contabilidad en producción NO trae
// `comisiones`, así que sumar el rol al módulo, solo, no le pinta la ficha
// hasta que Daniel corra la DDL a mano. La herencia `comisiones → ventas` la
// enciende mientras tanto. Los tres caminos se prueban acá.
//
// Los tests son de CONDUCTA: se monta la pantalla REAL con cookie/sesión de
// contabilidad y se lee el DOM; las rutas se llaman con cookies FIRMADAS. El
// barrido de texto que queda borra los comentarios primero — un candado que se
// cumple con su propia explicación no vale.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import {
  ALL_MODULES,
  MODULO_HEREDA_PERMISO_DE,
  SYSTEM_ROLE_KEYS,
  getDefaultModulesForRole,
  getModulesInGroup,
  getVisibleGroups,
  getVisibleModules,
} from "@/lib/modules";

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
/** El archivo SIN comentarios: un comentario que nombra un rol no es el rol. */
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** `role_permissions.contabilidad.modulos` MEDIDO en producción (13-ago-2026,
 *  anotado en `src/lib/modules.ts`). NO trae `comisiones`: es el escenario del
 *  día del deploy, antes de que corra la DDL 20260825120000. */
const FG_MODULES_CONTABILIDAD_HOY = [
  "asistencia", "gastos-empresa", "prestamos", "proveedores",
  "ventas", "saldos-banco", "gastos-contabilidad",
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. LA FICHA — contabilidad la ve, y en la caja correcta del menú
// ─────────────────────────────────────────────────────────────────────────────

describe("contabilidad ve la ficha de Comisiones, en «Ventas y clientes»", () => {
  it("🔴 el módulo la declara, y sigue siendo la MISMA ficha", () => {
    const ficha = ALL_MODULES.find((m) => m.key === "comisiones")!;
    expect(ficha.roles).toContain("contabilidad");
    // Nada más se movió: `key`, `href` y `group` son los de siempre. La key
    // está en `role_permissions` y en `fg_users.modulos_override`.
    expect(ficha.key).toBe("comisiones");
    expect(ficha.href).toBe("/comisiones");
    expect(ficha.group).toBe("ventas-clientes");
    expect(ALL_MODULES.filter((m) => m.href === "/comisiones")).toHaveLength(1);
  });

  it("🔴 le aparece en el GRUPO «Ventas y clientes», no suelta ni en otra caja", () => {
    expect(getVisibleGroups("contabilidad").map((g) => g.key)).toContain("ventas-clientes");
    expect(getModulesInGroup("ventas-clientes", "contabilidad").map((m) => m.key)).toContain("comisiones");
    for (const g of ["operacion", "administracion"] as const) {
      expect(getModulesInGroup(g, "contabilidad").map((m) => m.key)).not.toContain("comisiones");
    }
  });

  it("🩸 y le aparece TAMBIÉN con los `fg_modules` de HOY — antes de la DDL", () => {
    // Este es el test que decide si el día del deploy Daniel ve el cambio o no.
    // `fg_modules` gana sobre `roles[]`: sin la herencia, la ficha no se pinta.
    expect(FG_MODULES_CONTABILIDAD_HOY).not.toContain("comisiones");
    const visibles = getVisibleModules("contabilidad", FG_MODULES_CONTABILIDAD_HOY).map((m) => m.key);
    expect(visibles).toContain("comisiones");
    expect(getModulesInGroup("ventas-clientes", "contabilidad", FG_MODULES_CONTABILIDAD_HOY).map((m) => m.key))
      .toContain("comisiones");
  });

  it("🩸 y le sigue apareciendo DESPUÉS de la DDL (por derecho propio)", () => {
    // El día que corra 20260825120000, `comisiones` entra en la lista guardada.
    // La ficha tiene que seguir ahí — y sin depender ya de la herencia.
    const conDDL = [...FG_MODULES_CONTABILIDAD_HOY, "comisiones"];
    expect(getVisibleModules("contabilidad", conDDL).map((m) => m.key)).toContain("comisiones");
    const sinVentas = conDDL.filter((k) => k !== "ventas");
    expect(getVisibleModules("contabilidad", sinVentas).map((m) => m.key)).toContain("comisiones");
  });

  it("🔴 la herencia `comisiones → ventas` NO se la presta a nadie más", () => {
    // Está acotada por el `roles[]` del módulo (`fgModulesIncluye`). Un rol con
    // `ventas` en su lista que NO esté declarado sigue sin la ficha: una ficha
    // que la página rebota es peor que ninguna.
    expect(MODULO_HEREDA_PERMISO_DE["comisiones"]).toBe("ventas");
    for (const rol of ["vendedor", "bodega", "gerente_acs"]) {
      const visibles = getVisibleModules(rol, ["ventas", "catalogos", "guias"]).map((m) => m.key);
      expect(visibles, rol).not.toContain("comisiones");
    }
  });

  it("🔴 heredar `ventas` NO le abre `/ventas` a contabilidad", () => {
    // La herencia va del padre AL HIJO. `/ventas` manda Resumen y Clientes en
    // el SSR: abrirlo sería un permiso NUEVO, y nadie lo pidió.
    const ventas = ALL_MODULES.find((m) => m.key === "ventas")!;
    expect([...ventas.roles]).toEqual(["admin"]);
    expect(plano(leer("src/app/ventas/page.tsx"))).toContain('if (role !== "admin") redirect("/home")');
    expect(getDefaultModulesForRole("contabilidad")).not.toContain("ventas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. EL MAPA rol → acceso, CONGELADO ENTERO
// ─────────────────────────────────────────────────────────────────────────────

/** Quién ve Comisiones y quién no. Congelado a propósito: si alguien mueve un
 *  permiso en silencio —en cualquiera de las dos direcciones— el build se pone
 *  rojo y hay que venir a explicarlo acá. */
const VE_COMISIONES: Record<string, boolean> = {
  admin: true,
  contabilidad: true, // 25-ago-2026, decisión de Daniel
  secretaria: true,
  vendedor: false,
  bodega: false,
  gerente_acs: false, // 🔴 SOLO Multifashion. No se toca ni de refilón.
};

describe("el mapa rol → Comisiones queda congelado", () => {
  it("la lista cubre TODOS los roles del sistema — ninguno queda sin decidir", () => {
    // Un rol nuevo sin fila acá pasaría sin que nadie lo mire.
    expect(Object.keys(VE_COMISIONES).sort()).toEqual([...SYSTEM_ROLE_KEYS].sort());
  });

  it("rol por rol, en el catálogo y en el menú", () => {
    for (const [rol, debeVer] of Object.entries(VE_COMISIONES)) {
      expect(getDefaultModulesForRole(rol).includes("comisiones"), `${rol} default`).toBe(debeVer);
      const enMenu = getVisibleModules(rol, null).map((m) => m.key).includes("comisiones");
      expect(enMenu, `${rol} menú`).toBe(debeVer);
    }
  });

  it("🔴 gerente_acs sigue con Multifashion y NADA más", () => {
    expect(getDefaultModulesForRole("gerente_acs")).toEqual(["multifashion"]);
    expect(getVisibleModules("gerente_acs", ["multifashion"]).map((m) => m.key)).toEqual(["multifashion"]);
  });

  it("🔴 admin y secretaria no perdieron NADA", () => {
    // La secretaria es el caso delicado: `/comisiones` es su ÚNICA puerta
    // (/ventas es admin-only). Si esta ficha se apagara, se queda sin comisiones.
    expect(getDefaultModulesForRole("secretaria")).toContain("comisiones");
    expect(getVisibleModules("secretaria", ["comisiones", "guias"]).map((m) => m.key)).toContain("comisiones");
    expect(getModulesInGroup("ventas-clientes", "secretaria").map((m) => m.key)).toContain("comisiones");
    expect(getDefaultModulesForRole("admin")).toContain("comisiones");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONDUCTA de las RUTAS, con cookies FIRMADAS sobre los handlers reales
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (_fn: string, args: Record<string, unknown>) => ({
      data: {
        empresa_key: args.p_empresa_key,
        vendedores: [],
        ventas: [], cobros: [], ventas_base: 0, cobros_base: 0,
        comision_venta: 0, comision_cobro: 0, comision_total: 0,
        tasa_venta: 0.01, tasa_cobro: 0.01,
      },
      error: null,
    }),
    // Doble de lectura/escritura: los handlers que SÍ pasan el gate (admin,
    // secretaria) siguen de largo y tocan la base. Un 200 con datos vacíos vale
    // igual que un 200 con datos — lo que este bloque mide es el CÓDIGO.
    from: () => {
      const self: Record<string, unknown> = {};
      const paso = () => () => self;
      Object.assign(self, {
        select: paso(), eq: paso(), in: paso(), gte: paso(), lte: paso(), lt: paso(),
        order: paso(), limit: paso(),
        upsert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(res, rej),
      });
      return self;
    },
  },
}));
vi.mock("@/lib/comisiones/descuentos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/comisiones/descuentos")>()),
  leerDescuentosEfectivos: async () => [],
}));

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-comisiones-contabilidad"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

/** MEDIDO contra `origin/main` (bf12fd05) ANTES de esta rama. Las de LECTURA ya
 *  eran 200 para contabilidad; las de ESCRITURA, 403. Esta rama no movió
 *  ninguna — solo la puerta de UI. */
const CODIGOS: Record<string, Record<string, number>> = {
  "lectura":        { admin: 200, contabilidad: 200, secretaria: 200, vendedor: 403, bodega: 403, gerente_acs: 403 },
  "POST descuentos":{ admin: 200, contabilidad: 403, secretaria: 200, vendedor: 403, bodega: 403, gerente_acs: 403 },
  "GET config":     { admin: 200, contabilidad: 403, secretaria: 403, vendedor: 403, bodega: 403, gerente_acs: 403 },
};

describe("las rutas de Comisiones contestan lo MEDIDO, rol por rol", () => {
  const req = (role: string, url: string, body?: unknown) => {
    const r = new NextRequest(new URL(url, "http://localhost"), body
      ? { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : undefined);
    r.cookies.set("cxc_session", firmar({ role, sessionToken: "t", userName: role }));
    return r;
  };
  const q = "empresa=vistana&year=2026&mes=7";

  /** `signSession` real, cargado una vez (el alias `@/` no resuelve con
   *  `require` en este arnés). */
  let firmar: (p: Record<string, unknown>) => string;
  beforeAll(async () => {
    firmar = (await import("@/lib/session-cookie")).signSession;
  });

  it("🔴 las CUATRO rutas de LECTURA: contabilidad 200, vendedor/bodega/gerente_acs 403", async () => {
    const rutas: [string, (rol: string) => Promise<Response>][] = [
      ["/comisiones",  async (r) => (await import("@/app/api/ventas/comisiones/route")).GET(req(r, `/x?${q}`))],
      ["/consolidado", async (r) => (await import("@/app/api/ventas/comisiones/consolidado/route")).GET(req(r, "/x?year=2026&mes=7"))],
      ["/detalle",     async (r) => (await import("@/app/api/ventas/comisiones/detalle/route")).GET(req(r, `/x?${q}&vendedor=REY`))],
      ["/descuentos",  async (r) => (await import("@/app/api/ventas/comisiones/descuentos/route")).GET(req(r, `/x?${q}`))],
    ];
    for (const [nombre, fn] of rutas) {
      for (const [rol, code] of Object.entries(CODIGOS["lectura"])) {
        expect((await fn(rol)).status, `${rol} → ${nombre}`).toBe(code);
      }
    }
  });

  it("🔴 ESCRIBIR sigue cerrado para contabilidad: 403 en el toggle y en las tasas", async () => {
    const { POST } = await import("@/app/api/ventas/comisiones/descuentos/route");
    const { GET: getConfig } = await import("@/app/api/ventas/comisiones/config/route");
    const cuerpo = { descuento_id: "11111111-1111-1111-1111-111111111111", year: 2026, mes: 7, activo: true };
    for (const [rol, code] of Object.entries(CODIGOS["POST descuentos"])) {
      expect((await POST(req(rol, "/x", cuerpo))).status, `${rol} → POST /descuentos`).toBe(code);
    }
    for (const [rol, code] of Object.entries(CODIGOS["GET config"])) {
      expect((await getConfig(req(rol, "/x?empresa=vistana"))).status, `${rol} → GET /config`).toBe(code);
    }
  });

  it("sin cookie es 401 — el 403 significa algo", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/route");
    expect((await GET(new NextRequest(new URL(`/x?${q}`, "http://localhost")))).status).toBe(401);
  });

  it("el literal de roles de las 4 rutas de lectura es EL MISMO", () => {
    // Cuatro puertas a la misma pantalla: si una se afloja y otra no, el mismo
    // mes tendría dos permisos distintos.
    const lista = /requireRole\(req,\s*(\[[^\]]*\])\)/;
    for (const rel of [
      "src/app/api/ventas/comisiones/route.ts",
      "src/app/api/ventas/comisiones/consolidado/route.ts",
      "src/app/api/ventas/comisiones/detalle/route.ts",
      "src/app/api/ventas/comisiones/descuentos/route.ts",
    ]) {
      expect(lista.exec(plano(leer(rel)))![1].replace(/\s+/g, ""), rel)
        .toBe('["admin","contabilidad","secretaria"]');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CONDUCTA de la PANTALLA — contabilidad entra y ve NÚMEROS
// ─────────────────────────────────────────────────────────────────────────────

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/comisiones",
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <header>Comisiones</header> }));
vi.mock("@/components/shared/SyncStatus", () => ({ default: () => <div /> }));

const CONSOLIDADO = {
  year: 2026, mes: 7,
  empresas: [{
    empresa_key: "vistana",
    vendedores: [{ vendedor: "REINALDO ESPINOSA", base: 100000, base_cobro: 0, comision_total: 1234.56, descuento: 0 }],
  }],
};

/** El jsdom de este repo expone un `localStorage` SIN métodos. `ComisionesView`
 *  lo lee al montar para recordar el modo: sin esto el componente explota y el
 *  test se leería como "la pantalla no carga". */
const almacenReal = () => {
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

describe("contabilidad ENTRA a /comisiones y la pantalla renderiza con datos", () => {
  beforeEach(() => {
    push.mockClear();
    Object.defineProperty(window, "localStorage", { value: almacenReal(), configurable: true, writable: true });
    localStorage.setItem("fg_comisiones_mode", "todas");
    sessionStorage.clear();
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify(CONSOLIDADO), { status: 200, headers: { "content-type": "application/json" } }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  /** Sesión de un rol tal como la deja el login: rol + la lista guardada. */
  function sesion(role: string, fgModules: string[]) {
    sessionStorage.setItem("cxc_role", role);
    sessionStorage.setItem("fg_modules", JSON.stringify(fgModules));
  }

  it("🔴 con los `fg_modules` de HOY, ve la tabla y el NÚMERO — no una pantalla vacía ni un rebote", async () => {
    const { ComisionesPageClient } = await import("@/app/comisiones/ComisionesPageClient");
    sesion("contabilidad", FG_MODULES_CONTABILIDAD_HOY);
    render(<ComisionesPageClient availableYears={[2026, 2025]} />);

    // 1) No la rebotó: los dos modos de vista están en el DOM.
    await screen.findByRole("button", { name: "Todas las empresas", exact: true });
    screen.getByRole("button", { name: "Por empresa", exact: true });
    // 2) Y llegó el DATO, no un esqueleto: el vendedor y su comisión.
    await waitFor(() => expect(screen.getAllByText(/REINALDO ESPINOSA/i).length).toBeGreaterThan(0), { timeout: 5000 });
    expect(screen.getAllByText(/1,234\.56/).length).toBeGreaterThan(0);
    // 3) Nunca la mandó a /home.
    expect(push).not.toHaveBeenCalled();
  }, 20000);

  it("🔴 y le sirve el Excel — el botón está y NO está deshabilitado", async () => {
    const { ComisionesPageClient } = await import("@/app/comisiones/ComisionesPageClient");
    sesion("contabilidad", FG_MODULES_CONTABILIDAD_HOY);
    render(<ComisionesPageClient availableYears={[2026]} />);
    const excel = await screen.findByRole("button", { name: /Excel/i });
    await waitFor(() => expect((excel as HTMLButtonElement).disabled).toBe(false), { timeout: 5000 });
  }, 20000);

  it("🔴 NO le dibuja «Actualizar ahora» — ese POST le contesta 403", async () => {
    // El gate de UI de SyncNowButton es el DEFAULT admin+secretaria, espejo de
    // `rolesSyncNow("recibos") = ["admin","secretaria","vendedor"]`. Es el
    // botón REAL: si alguien le pasara `roles` con contabilidad, esto se rompe.
    const { ComisionesPageClient } = await import("@/app/comisiones/ComisionesPageClient");
    sesion("contabilidad", FG_MODULES_CONTABILIDAD_HOY);
    render(<ComisionesPageClient availableYears={[2026]} />);
    await screen.findByRole("button", { name: "Todas las empresas", exact: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Actualizar ahora/i })).toBeNull());
  }, 20000);

  it("🩸 un rol que NO debe verla sigue rebotando a /home", async () => {
    // El contraste que hace que los tests de arriba signifiquen algo.
    const { ComisionesPageClient } = await import("@/app/comisiones/ComisionesPageClient");
    sesion("bodega", ["catalogos", "guias", "packing-lists", "referencia"]);
    render(<ComisionesPageClient availableYears={[2026]} />);
    expect(screen.queryByRole("button", { name: "Todas las empresas", exact: true })).toBeNull();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/home"), { timeout: 5000 });
  }, 20000);

  it("🔴 la secretaria y el admin siguen entrando igual", async () => {
    const { ComisionesPageClient } = await import("@/app/comisiones/ComisionesPageClient");
    for (const [rol, mods] of [["secretaria", ["comisiones", "guias"]], ["admin", []]] as [string, string[]][]) {
      sesion(rol, mods);
      const { unmount } = render(<ComisionesPageClient availableYears={[2026]} />);
      await screen.findByRole("button", { name: "Todas las empresas", exact: true });
      await waitFor(() => expect(screen.getAllByText(/REINALDO ESPINOSA/i).length).toBeGreaterThan(0), { timeout: 5000 });
      expect(push, rol).not.toHaveBeenCalled();
      unmount();
    }
  }, 30000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. EL TOGGLE DE DESCUENTOS — la única sub-acción que le daba 403 en silencio
// ─────────────────────────────────────────────────────────────────────────────

const DETALLE = {
  empresa_key: "vistana", year: 2026, mes: 7, vendedor: "REINALDO ESPINOSA",
  tasa_venta: 0.01, tasa_cobro: 0.01,
  ventas: [], cobros: [],
  ventas_base: 100000, cobros_base: 0,
  comision_venta: 1000, comision_cobro: 0, comision_total: 1000,
};
const DESCUENTOS = { descuentos: [{ id: "d1", concepto: "Adelanto de julio", monto: 250, activo: true }] };

describe("el toggle del descuento solo lo ve quien puede escribirlo", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
      const body = String(url).includes("/descuentos") ? DESCUENTOS : DETALLE;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  async function abrir(rol: string) {
    sessionStorage.setItem("cxc_role", rol);
    const { ComisionesDetalleModal } = await import("@/components/ventas/ComisionesDetalleModal");
    render(
      <ComisionesDetalleModal
        empresa="vistana" empresaNombre="Vistana" year={2026} mes={7}
        vendedor="REINALDO ESPINOSA" onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getAllByText(/Adelanto de julio/).length).toBeGreaterThan(0), { timeout: 5000 });
  }

  it("🔴 contabilidad VE el descuento y el neto, pero NO el interruptor", async () => {
    // El toggle era optimista: pintaba el cambio y lo revertía sin decir nada.
    // Contabilidad no pierde información — el neto ya viene restado del server.
    await abrir("contabilidad");
    expect(screen.getAllByText(/−\$?250/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  }, 20000);

  it("🔴 admin y secretaria SIGUEN teniéndolo — no se le quitó a nadie", async () => {
    for (const rol of ["admin", "secretaria"]) {
      await abrir(rol);
      expect(document.querySelectorAll('input[type="checkbox"]').length, rol).toBeGreaterThan(0);
      cleanup();
    }
  }, 30000);

  it("🔴 la lista del gate de UI es ESPEJO del `requireRole` del POST", async () => {
    // Si el server se afloja o se cierra y la UI no se entera, vuelve el botón
    // que da 403 (o desaparece uno que sí funcionaba).
    const { ROLES_EDITAR_DESCUENTOS } = await import("@/components/ventas/ComisionesDetalleModal");
    const ruta = plano(leer("src/app/api/ventas/comisiones/descuentos/route.ts"));
    const post = ruta.slice(ruta.indexOf("export async function POST"));
    const lista = /requireRole\(req,\s*\[([^\]]*)\]\)/.exec(post)!;
    const delServer = [...lista[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect([...ROLES_EDITAR_DESCUENTOS].sort()).toEqual([...delServer].sort());
    expect(delServer).not.toContain("contabilidad");
  });

  it("«Configurar» (las tasas) sigue siendo solo de admin", () => {
    // Ya lo era; el candado es para que abrirle el módulo a contabilidad no lo
    // arrastre. `GET /config` le contesta 403 (bloque 3).
    const vista = plano(leer("src/components/ventas/ComisionesPorEmpresaView.tsx"));
    expect(vista).toMatch(/setCanConfig\(r === "admin"\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. LA DDL EXISTE, ES ADITIVA, Y ESTÁ ANOTADA
// ─────────────────────────────────────────────────────────────────────────────

describe("la migración de permisos", () => {
  const sql = leer("supabase/migrations/20260825120000_comisiones_contabilidad.sql");

  it("🔴 AGREGA la key, no pisa la lista — y solo a contabilidad", () => {
    // `SET modulos = ARRAY[...]` es cómo se le borran 5 módulos a un rol de un
    // saque (ver el punto 6 de PENDIENTE-SUPABASE.md, que ya lo hizo).
    expect(sql).toContain("array_append(modulos, 'comisiones')");
    expect(sql).toMatch(/WHERE role = 'contabilidad'/);
    expect(sql).not.toMatch(/SET\s+modulos\s*=\s*ARRAY\[/i);
    // Idempotente: correrla dos veces no duplica la key.
    expect(sql).toContain("NOT ('comisiones' = ANY (COALESCE(modulos, '{}')))");
  });

  it("está anotada en PENDIENTE-SUPABASE.md, con su ruta", () => {
    const pend = leer("PENDIENTE-SUPABASE.md");
    expect(pend).toContain("20260825120000_comisiones_contabilidad.sql");
  });
});
