// ─────────────────────────────────────────────────────────────────────────────
// COMISIONES ES PESTAÑA DE VENTAS — y no se movió un permiso ni un número.
//
// Daniel, textual (25-ago-2026): ***"Comisiones debe de estar en Ventas. Y
// también debe de verse empresa por empresa y todas las empresas."***
//
// 🔑 LA SEGUNDA MITAD DEL PEDIDO YA ESTABA CONSTRUIDA. `ComisionesView` es un
// shell con DOS modos —«Todas las empresas» (matriz vendedor × empresa) y «Por
// empresa»— con memoria en `localStorage.fg_comisiones_mode`. No se rehízo
// nada: lo que estos tests exigen es que las dos sigan alcanzables ADENTRO de
// Ventas, que es lo único que la mudanza podía romper.
//
// 🔴 LO QUE NO CAMBIA, Y ES LA MITAD QUE IMPORTA
//
//   · La `key` del módulo sigue siendo `comisiones` (está en `role_permissions`
//     y en `fg_users.modulos_override`; renombrarla rompe permisos sin comprar
//     nada). Precedente: Cheques→Recordatorios y Asistencia→Planilla.
//   · LA FICHA DEL MENÚ SE QUEDA, y no es indecisión: MEDIDO, `/ventas` es
//     admin-only (`roles: ["admin"]` + redirect SSR a `/home`), así que
//     `/comisiones` es la ÚNICA puerta de la SECRETARIA. Retirar la ficha —o
//     redirigir `/comisiones` a la pestaña, como se hizo con `/saldos-banco`—
//     la dejaría sin comisiones. Allá la mudanza fue segura porque los dos
//     módulos tenían los MISMOS roles; acá no los tienen.
//   · Abrirle `/ventas` a la secretaria tampoco es una opción: el SSR de esa
//     página manda Resumen y Clientes EN EL HTML. Sería un permiso nuevo.
//
// 🩸 EL HALLAZGO PRE-EXISTENTE QUE ESTE ARCHIVO DEJÓ ANOTADO YA SE RESOLVIÓ, y
// lo resolvió Daniel el 25-ago-2026: ***"Q contabilidad vea comisiones"***.
// `contabilidad` recibía **200** de las rutas de lectura desde antes de esta
// rama y no tenía ninguna puerta de UI; hoy tiene la ficha y la página. El
// detalle vive en `comisiones-contabilidad.test.tsx`, que congela el mapa rol →
// acceso ENTERO. Acá se conserva lo que este archivo siempre miró: que la
// mudanza a Ventas no mueva un código de la API sin que el build se ponga rojo.
//
// Los tests son de CONDUCTA donde se puede: se monta la vista REAL y se hace
// clic, y se llama a los handlers REALES con cookies FIRMADAS. El barrido de
// texto que queda borra los comentarios primero — este repo ya pagó varias
// veces el candado que se cumple con su propia explicación.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import {
  ALL_MODULES,
  getDefaultModulesForRole,
  getModulesInGroup,
  getVisibleGroups,
} from "@/lib/modules";

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

/** El archivo SIN comentarios: un comentario que NOMBRA la pestaña no es la
 *  pestaña. */
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const shell = leer("src/app/ventas/VentasShell.tsx");
const shellPlano = plano(shell);
const ventasPage = plano(leer("src/app/ventas/page.tsx"));
const modulosPlano = plano(leer("src/lib/modules.ts"));

// ─────────────────────────────────────────────────────────────────────────────
// 1. La PESTAÑA existe, y monta el MISMO componente (no una copia)
// ─────────────────────────────────────────────────────────────────────────────

describe("Comisiones es una pestaña de Ventas", () => {
  it("la tira de pestañas la incluye, y el contenido existe", () => {
    const tira = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    const triggers = [...tira.matchAll(/<TabsTrigger value="([a-z]+)"/g)].map((m) => m[1]);
    expect(triggers).toContain("comisiones");

    // Un <TabsContent> huérfano es código muerto que nadie puede ver, y una
    // pestaña sin contenido deja la pantalla en blanco (Radix no dibuja nada si
    // el value no tiene panel). Los dos lados tienen que coincidir.
    const contenidos = [...shell.matchAll(/<TabsContent value="([a-z]+)"/g)].map((m) => m[1]);
    expect(contenidos).toEqual(triggers);
  });

  it("la lista TABS (la que valida el ?tab= de la URL) también la trae", () => {
    // Sin esto, `/ventas?tab=comisiones` caería en "resumen" sin decir nada.
    const m = /const TABS = \[([^\]]+)\]/.exec(shellPlano);
    expect(m).not.toBeNull();
    const declarados = [...m![1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
    expect(declarados).toContain("comisiones");

    const tira = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    const triggers = [...tira.matchAll(/<TabsTrigger value="([a-z]+)"/g)].map((m2) => m2[1]);
    expect(declarados).toEqual(triggers);
  });

  it("🔴 REUSA `ComisionesView` — la misma pieza que sirve /comisiones", () => {
    // Dos implementaciones de la misma pantalla son dos totales posibles para el
    // mismo mes. Es exactamente el defecto que se pagó el 24-ago con la resta de
    // los descuentos, que vivía en UNA vista y no en la otra.
    expect(shellPlano).toContain('import("@/components/ventas/ComisionesView")');
    expect(shellPlano).toContain("<ComisionesView");
    const cliente = plano(leer("src/app/comisiones/ComisionesPageClient.tsx"));
    expect(cliente).toContain('from "@/components/ventas/ComisionesView"');
    expect(cliente).toContain("<ComisionesView");
  });

  it("el aviso que recibe la pestaña es el de los COBROS, no el de Ventas", () => {
    // La comisión sobre cobro lee `switch_recibos` (familia `recibo`), que NO
    // está en las 4 familias de Ventas. Pasarle el aviso de Ventas le diría a
    // Daniel que quedó afuera plata que no es la suya.
    expect(ventasPage).toContain('lineaDeRechazos({ familias: ["recibo"] })');
    expect(shellPlano).toContain("avisoMontos={avisoRecibos}");
    // Y el de Ventas sigue yendo arriba de la tira, para las cinco.
    expect(shellPlano).toContain("<AvisoRechazosSwitch texto={avisoMontos}");
  });

  it("la barra de arriba no dibuja SU año ni SU Excel en esa pestaña", () => {
    // Comisiones trae su propio período (mes + año en una caja) y su propio
    // Excel. Dos selectores de año en la misma pantalla, uno inerte, es cómo se
    // lee la comisión de julio creyendo que es la de agosto.
    expect(shellPlano).toContain('tab !== "comisiones"');
    expect(shellPlano).toMatch(/TABS_CON_CONTROLES_PROPIOS[\s\S]{0,200}"comisiones"/);
    expect(shellPlano).toContain("TABS_CON_CONTROLES_PROPIOS.some((t) => t === tab)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONDUCTA: las DOS vistas siguen alcanzables (lo que Daniel pidió explícito)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/components/shared/SyncStatus", () => ({ default: () => <div /> }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => <button type="button">Actualizar ahora</button> }));

const RESPUESTA_CONSOLIDADO = {
  year: 2026,
  mes: 7,
  empresas: [
    { empresa_key: "vistana", vendedores: [{ vendedor: "REINALDO ESPINOSA", comision_total: 100, descuento: 0 }] },
  ],
};
const RESPUESTA_EMPRESA = {
  empresa_key: "vistana",
  year: 2026,
  mes: 7,
  vendedores: [
    {
      vendedor: "REINALDO ESPINOSA",
      base: 10000, tasa: 0.01, comision: 100,
      base_cobro: 0, tasa_cobro: 0.01, comision_cobro: 0,
      comision_total: 100, descuento: 0,
    },
  ],
};

// 🩸 El jsdom de este repo expone un `localStorage` SIN métodos (`getItem` es
// `undefined`), y `ComisionesView` lo lee en un `useEffect` para recordar el
// modo. Sin este polyfill el componente explota al montar y el test "no
// encuentra el botón" — que se leería como "la vista se perdió" cuando lo que
// falta es el navegador. Los otros tests de comisiones lo esquivan montando las
// vistas HIJAS; acá hace falta el shell, que es el que tiene los dos modos.
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

describe("las DOS vistas siguen ahí — «Todas las empresas» y «Por empresa»", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { value: almacenReal(), configurable: true, writable: true });
    localStorage.setItem("fg_comisiones_mode", "todas");
    vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
      const u = String(url);
      const body = u.includes("/consolidado") ? RESPUESTA_CONSOLIDADO : RESPUESTA_EMPRESA;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("se monta con las dos pestañas de modo y se puede cambiar entre ellas", async () => {
    const { ComisionesView } = await import("@/components/ventas/ComisionesView");
    render(<ComisionesView availableYears={[2026, 2025]} />);

    const todas = screen.getByRole("button", { name: "Todas las empresas", exact: true });
    const porEmpresa = screen.getByRole("button", { name: "Por empresa", exact: true });
    // Arranca en la matriz (el default y lo que el localStorage recordó).
    expect(todas.getAttribute("aria-current")).toBe("page");
    expect(porEmpresa.getAttribute("aria-current")).toBeNull();

    await act(async () => { fireEvent.click(porEmpresa); });
    await waitFor(() => expect(porEmpresa.getAttribute("aria-current")).toBe("page"));
    expect(todas.getAttribute("aria-current")).toBeNull();
    // Y lo RECUERDA: es lo que hace que Daniel no tenga que reelegir cada vez.
    expect(localStorage.getItem("fg_comisiones_mode")).toBe("empresa");

    await act(async () => { fireEvent.click(todas); });
    await waitFor(() => expect(todas.getAttribute("aria-current")).toBe("page"));
    expect(localStorage.getItem("fg_comisiones_mode")).toBe("todas");
  });

  it("las dos vistas hijas existen y el shell las monta a las dos", () => {
    expect(existsSync(path.join(raiz, "src/components/ventas/ComisionesConsolidadoView.tsx"))).toBe(true);
    expect(existsSync(path.join(raiz, "src/components/ventas/ComisionesPorEmpresaView.tsx"))).toBe(true);
    const vista = plano(leer("src/components/ventas/ComisionesView.tsx"));
    expect(vista).toContain("<ComisionesConsolidadoView");
    expect(vista).toContain("<ComisionesPorEmpresaView");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. La FICHA y la `key` no se movieron — y /comisiones sigue llegando
// ─────────────────────────────────────────────────────────────────────────────

describe("la ficha del menú se queda, con la misma key y los mismos roles", () => {
  it("🔴 `comisiones` vive en «Ventas y clientes», con href y roles intactos", () => {
    // Daniel, textual: *"comisiones debería de estar en ventas y clientes no?"*
    // — está nombrando el grupo que ya existe. Lo único que se movió es la caja
    // del menú: `key`, `href` y `roles` son los MISMOS, y por eso el cambio no
    // puede tocar un centavo ni un permiso.
    const ficha = ALL_MODULES.find((m) => m.key === "comisiones");
    expect(ficha).toBeDefined();
    expect(ficha!.label).toBe("Comisiones");
    expect(ficha!.href).toBe("/comisiones");
    expect(ficha!.group).toBe("ventas-clientes");
    // `contabilidad` se sumó el 25-ago-2026 (ver comisiones-contabilidad.test.tsx).
    expect([...ficha!.roles]).toEqual(["admin", "contabilidad", "secretaria"]);
  });

  it("🔴 y ya NO está en «Operación» — la ficha se movió, no se duplicó", () => {
    // Dos fichas con el mismo href serían dos puertas a la misma pantalla en
    // dos cajas distintas del menú: la que quede vieja es la que confunde.
    const conEseHref = ALL_MODULES.filter((m) => m.href === "/comisiones");
    expect(conEseHref).toHaveLength(1);
    expect(getModulesInGroup("operacion", "admin").map((m) => m.key)).not.toContain("comisiones");
    expect(getModulesInGroup("ventas-clientes", "admin").map((m) => m.key)).toContain("comisiones");
  });

  it("🩸 la SECRETARIA la sigue viendo en su grupo nuevo", () => {
    // El grupo se dibuja por rol: si «Ventas y clientes» no fuera visible para
    // ella, mover la ficha ahí la habría escondido sin quitarle el permiso —
    // que es exactamente cómo se pierde un módulo sin que nada se ponga rojo.
    expect(getVisibleGroups("secretaria").map((g) => g.key)).toContain("ventas-clientes");
    expect(getModulesInGroup("ventas-clientes", "secretaria").map((m) => m.key)).toContain("comisiones");
  });

  it("🩸 y nadie ganó ni perdió el módulo al mudarlo de caja", () => {
    // El grupo es dónde se dibuja; los roles son quién entra. Mover una cosa no
    // puede mover la otra.
    for (const rol of ["admin", "secretaria", "contabilidad"]) {
      expect(getDefaultModulesForRole(rol), rol).toContain("comisiones");
    }
    for (const rol of ["vendedor", "bodega", "gerente_acs"]) {
      expect(getDefaultModulesForRole(rol), rol).not.toContain("comisiones");
    }
  });

  it("🔴 la SECRETARIA no perdió su única puerta", () => {
    // Si la ficha se retirara, este test se pone rojo — y con razón: /ventas la
    // manda a /home.
    expect(getDefaultModulesForRole("secretaria")).toContain("comisiones");
    expect(getDefaultModulesForRole("secretaria")).not.toContain("ventas");
    expect(existsSync(path.join(raiz, "src/app/comisiones/page.tsx"))).toBe(true);
    const cliente = plano(leer("src/app/comisiones/ComisionesPageClient.tsx"));
    expect(cliente).toContain('moduleKey: "comisiones"');
    expect(cliente).toMatch(/allowedRoles:\s*\["admin",\s*"contabilidad",\s*"secretaria"\]/);
  });

  it("🔴 /comisiones NO se redirige a la pestaña", () => {
    // `/saldos-banco` sí pudo (Gastos tenía los mismos roles). Acá un redirect
    // mandaría a la secretaria a /home: el destino es admin-only.
    const nextConfig = leer("next.config.js");
    const bloque = nextConfig.slice(nextConfig.indexOf("async redirects()"), nextConfig.indexOf("experimental:"));
    expect(bloque).not.toContain('source: "/comisiones"');
  });

  it("🔴 /ventas sigue siendo admin-only: contabilidad NO gana la pestaña", () => {
    const ficha = ALL_MODULES.find((m) => m.key === "ventas")!;
    expect([...ficha.roles]).toEqual(["admin"]);
    expect(ventasPage).toContain('if (role !== "admin") redirect("/home")');
    for (const rol of ["contabilidad", "secretaria", "vendedor", "bodega", "gerente_acs"]) {
      expect(getDefaultModulesForRole(rol)).not.toContain("ventas");
    }
    // 🔴 Y la distinción que importa: contabilidad SÍ tiene `comisiones` desde
    // el 25-ago-2026, y eso NO le da `ventas`. La pestaña sigue siendo de
    // admin; su puerta es `/comisiones`, la página.
    expect(getDefaultModulesForRole("contabilidad")).toContain("comisiones");
    expect(getDefaultModulesForRole("contabilidad")).not.toContain("ventas");
  });

  it("la `key` no se renombró en ningún lado del catálogo", () => {
    expect(modulosPlano).toContain('key: "comisiones"');
    expect(ALL_MODULES.filter((m) => m.href === "/comisiones")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CONDUCTA con cookies FIRMADAS: los códigos de la API son los de SIEMPRE
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (_fn: string, args: Record<string, unknown>) => ({
      data: { empresa_key: args.p_empresa_key, vendedores: [] },
      error: null,
    }),
  },
}));
vi.mock("@/lib/comisiones/descuentos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/comisiones/descuentos")>()),
  leerDescuentosEfectivos: async () => [],
}));

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-comisiones-en-ventas"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

/** Lo MEDIDO el 25-ago-2026 contra `origin/main` (ec1659dc), antes de mover
 *  nada. Esta rama no puede haberlo cambiado en ninguna dirección. */
const ESPERADO: Record<string, number> = {
  admin: 200,
  secretaria: 200,
  // 🩸 PRE-EXISTENTE, no lo estrenó esta rama. Ver la cabecera del archivo.
  contabilidad: 200,
  vendedor: 403,
  bodega: 403,
  gerente_acs: 403,
};

describe("la API de comisiones responde EXACTAMENTE lo que respondía antes", () => {
  it("rol por rol, con cookie firmada, contra los handlers reales", async () => {
    const { signSession } = await import("@/lib/session-cookie");
    const { GET: getComisiones } = await import("@/app/api/ventas/comisiones/route");
    const { GET: getConsolidado } = await import("@/app/api/ventas/comisiones/consolidado/route");

    const req = (role: string | null, url: string) => {
      const r = new NextRequest(new URL(url, "http://localhost"));
      if (role) r.cookies.set("cxc_session", signSession({ role, sessionToken: "t", userName: role }));
      return r;
    };

    for (const [rol, code] of Object.entries(ESPERADO)) {
      const a = await getComisiones(req(rol, "/api/ventas/comisiones?year=2026&mes=7&empresa=vistana"));
      const b = await getConsolidado(req(rol, "/api/ventas/comisiones/consolidado?year=2026&mes=7"));
      expect(a.status, `${rol} → /api/ventas/comisiones`).toBe(code);
      expect(b.status, `${rol} → /consolidado`).toBe(code);
    }
  });

  it("sin cookie es 401, no 403 — y el 200 de admin prueba que el 403 significa algo", async () => {
    const { signSession } = await import("@/lib/session-cookie");
    const { GET } = await import("@/app/api/ventas/comisiones/route");
    const url = "/api/ventas/comisiones?year=2026&mes=7&empresa=vistana";

    const sinCookie = new NextRequest(new URL(url, "http://localhost"));
    expect((await GET(sinCookie)).status).toBe(401);

    const forjada = new NextRequest(new URL(url, "http://localhost"));
    forjada.cookies.set("cxc_session", "admin-sin-firma");
    expect((await GET(forjada)).status).toBe(401);

    const conAdmin = new NextRequest(new URL(url, "http://localhost"));
    conAdmin.cookies.set("cxc_session", signSession({ role: "admin", sessionToken: "t", userName: "d" }));
    expect((await GET(conAdmin)).status).toBe(200);
  });

  it("el literal de roles de las dos rutas es el mismo, y no lo movió la mudanza", () => {
    // Las dos rutas alimentan las DOS vistas de la misma pantalla: si una lista
    // se afloja y la otra no, el mismo mes tendría dos permisos distintos.
    const a = plano(leer("src/app/api/ventas/comisiones/route.ts"));
    const b = plano(leer("src/app/api/ventas/comisiones/consolidado/route.ts"));
    const lista = /requireRole\(req,\s*(\[[^\]]*\])\)/;
    expect(lista.exec(a)![1]).toBe(lista.exec(b)![1]);
    expect(lista.exec(a)![1].replace(/\s+/g, "")).toBe('["admin","contabilidad","secretaria"]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. La plata no se toca — la mudanza es una PUERTA, no un cálculo
// ─────────────────────────────────────────────────────────────────────────────

describe("ni la base ni la resta cambiaron de lugar", () => {
  it("las dos rutas siguen neteando en el SERVIDOR, una sola vez", () => {
    for (const rel of [
      "src/app/api/ventas/comisiones/route.ts",
      "src/app/api/ventas/comisiones/consolidado/route.ts",
    ]) {
      expect(plano(leer(rel))).toContain("netearComisiones");
    }
  });

  it("la pestaña nueva no resta nada por su cuenta", () => {
    // El shell de Ventas solo MONTA la vista: si algún día apareciera una resta
    // acá, serían dos totales posibles para el mismo mes.
    expect(shellPlano).not.toContain("netearComisiones");
    expect(shellPlano).not.toContain("descuento");
    expect(shellPlano).not.toContain("comision_total");
  });

  it("la lista de empresas se sigue DERIVANDO, y son SEIS", async () => {
    const { EMPRESAS_COMISIONAN } = await import("@/lib/comisiones/empresas");
    const { B2B_EMPRESA_KEYS } = await import("@/lib/empresa-mapping");
    expect([...EMPRESAS_COMISIONAN]).toEqual([...B2B_EMPRESA_KEYS]);
    expect(EMPRESAS_COMISIONAN).toHaveLength(6);
    // Y el subtítulo de la pestaña dice SEIS, no las 8 de Ventas.
    expect(shellPlano).toContain("6 empresas");
  });
});
