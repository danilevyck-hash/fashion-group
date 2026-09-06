// ─────────────────────────────────────────────────────────────────────────────
// 🔁 CAMBIÓ DE DIRECCIÓN EL 5-sep-2026: COMISIONES **YA NO** ES PESTAÑA DE
// VENTAS. Vuelve a su módulo, completa.
//
// Daniel, textual (5-sep-2026), sobre la pestaña: ***«si quitala»***.
//
// 🔑 POR QUÉ, Y POR QUÉ ESTE ARCHIVO NO SE BORRA. La pestaña montaba
// `ComisionesView` **sin `conConfiguracion`**: era una versión RECORTADA de la
// pantalla que `/comisiones` ya sirve entera (con «Tasas por vendedor» y
// «Clientes que no comisionan»). Dos puertas a lo mismo, y la de adentro de
// Ventas era la que menos mostraba y la que menos gente podía abrir —/ventas es
// admin-only. Es exactamente el caso de Referencia el 12-ago-2026.
//
// Lo que este archivo vigilaba de verdad NO cambió y se conserva ENTERO: la
// `key` del módulo, la ficha del menú, los roles, los códigos de la API y que
// la resta de los descuentos siga viviendo en el servidor. Lo único que se dio
// vuelta es dónde se dibuja la pantalla — y se agregó lo que antes no hacía
// falta pedir: que el enlace viejo `?tab=comisiones` siga llegando.
//
// ─── lo que decía antes, y sigue siendo cierto de `/comisiones` ─────────────
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
import { render, screen, cleanup, waitFor, fireEvent, act, within } from "@testing-library/react";
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

describe("🔁 Comisiones YA NO es una pestaña de Ventas (5-sep-2026)", () => {
  it("el shell no monta ningún trigger, contenido ni import de Comisiones", () => {
    // Mismas tres direcciones que el candado de Referencia: si volviera a
    // aparecer una de las tres, sería la firma de que la pantalla está otra vez
    // en dos lugares.
    const tira = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    const triggers = [...tira.matchAll(/<TabsTrigger value="([a-z]+)"/g)].map((m) => m[1]);
    expect(triggers).not.toContain("comisiones");
    expect(shellPlano).not.toContain("ComisionesView");
    expect(shellPlano).not.toContain('value="comisiones"');

    // CONTROL: la tira sigue teniendo las tres que quedan, y cada trigger su
    // contenido. Una pestaña sin panel deja la pantalla en blanco.
    expect(triggers).toEqual(["resumen", "clientes", "productos"]);
    const contenidos = [...shell.matchAll(/<TabsContent value="([a-z]+)"/g)].map((m) => m[1]);
    expect(contenidos).toEqual(triggers);
  });

  it("🔴 `/ventas?tab=comisiones` sigue llegando — a `/comisiones`", () => {
    // Sin esto, un favorito guardado caería en una pestaña que ya no existe y
    // Radix, con un `value` sin trigger, no dibuja NADA: pantalla en blanco sin
    // error. Y para la SECRETARIA y para CONTABILIDAD ese enlace es la única
    // puerta viva, porque /ventas los manda a /home.
    const nextConfig = leer("next.config.js");
    const bloque = nextConfig.slice(nextConfig.indexOf("async redirects()"), nextConfig.indexOf("experimental:"));
    const trozo = bloque.slice(bloque.indexOf('value: "comisiones"'));
    expect(bloque).toContain('has: [{ type: "query", key: "tab", value: "comisiones" }]');
    expect(trozo).toContain('destination: "/comisiones"');
    // Temporal (307) como TODOS los redirects de este archivo: un 308 se quema
    // en el caché del navegador y ya no se puede volver atrás.
    expect(trozo).toContain("permanent: false");
  });

  it("🔴 `/comisiones` sigue montando la pantalla COMPLETA, con Configuración", () => {
    // Ésta es la mitad que importa del cambio: lo que se retiró era la versión
    // RECORTADA. Si /comisiones perdiera `conConfiguracion`, el cambio habría
    // dejado a todo el mundo con la pantalla chica.
    const cliente = plano(leer("src/app/comisiones/ComisionesPageClient.tsx"));
    expect(cliente).toContain('from "@/components/ventas/ComisionesView"');
    expect(cliente).toContain("<ComisionesView");
    expect(cliente).toContain("conConfiguracion");
    expect(existsSync(path.join(raiz, "src/components/ventas/ComisionesView.tsx"))).toBe(true);
  });

  it("el aviso de los COBROS se fue con la pestaña, y el de Ventas se queda", () => {
    // La comisión sobre cobro lee `switch_recibos` (familia `recibo`), que NO
    // está en las 4 familias de Ventas. Sin la pestaña, /ventas dejó de pedir
    // esa consulta — es una consulta MENOS en la pantalla más pesada del
    // sistema, y `/comisiones` ya la pide por su cuenta.
    expect(ventasPage).not.toContain('familias: ["recibo"]');
    expect(ventasPage).not.toContain("avisoRecibos");
    expect(shellPlano).not.toContain("avisoRecibos");
    // CONTROL: el aviso de Ventas sigue arriba de la tira, para las TRES.
    expect(ventasPage).toContain('lineaDeRechazos({ familias: ["factura", "utilidad", "costo_diario", "articulo_diario"] })');
    expect(shellPlano).toContain("<AvisoRechazosSwitch texto={avisoMontos}");
    // Y `/comisiones` lo sigue pidiendo para su pantalla.
    expect(plano(leer("src/app/comisiones/page.tsx"))).toContain('["recibo"]');
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

// Sigue valiendo, y ahora SOLO en `/comisiones`: las dos vistas que Daniel
// pidió el 25-ago-2026 no se perdieron al retirar la pestaña.
//
// 🔄 CANDADO RE-APUNTADO EL 6-sep-2026. Eran dos PESTAÑAS («Todas las empresas»
// y «Por empresa») y hoy son dos opciones del ÚNICO selector de empresa —
// «Fashion Group» y cada una de las 6. Daniel, textual: *«opino eliminar los
// tabs… Todas las empresas solo se agrega en una opción con las empresas»* y
// *«entonces a, pero en todas pon fashion group para no confundir»*.
//
// Lo que se exige no cambió: **las dos vistas siguen existiendo y el shell las
// monta**. Lo que cambió es CÓMO se llega, y que el modo guardado de antes
// (`fg_comisiones_mode`) sigue llevando a la vista equivalente — ningún enlace
// ni ninguna memoria se rompe.
describe("las DOS vistas siguen ahí — «Fashion Group» y una empresa suelta", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { value: almacenReal(), configurable: true, writable: true });
    vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
      const u = String(url);
      const body = u.includes("/consolidado") ? RESPUESTA_CONSOLIDADO : RESPUESTA_EMPRESA;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("el modo viejo «todas» abre la matriz de Fashion Group", async () => {
    localStorage.setItem("fg_comisiones_mode", "todas");
    const { ComisionesView } = await import("@/components/ventas/ComisionesView");
    render(<ComisionesView availableYears={[2026, 2025]} />);
    const tabla = await screen.findByRole("table");
    // La matriz: una columna por empresa, con el nombre CORTO.
    expect(within(tabla).getByText("Vistana")).toBeTruthy();
    expect(within(tabla).getByText("Fashion Wear")).toBeTruthy();
    // Y el selector dice dónde estás parado, con el rótulo que eligió Daniel.
    expect(screen.getByLabelText("Empresa").textContent).toContain("Fashion Group");
  });

  it("el modo viejo «empresa» abre la última empresa usada", async () => {
    localStorage.setItem("fg_comisiones_mode", "empresa");
    localStorage.setItem("fg_last_comision_empresa", "fashion_wear");
    const { ComisionesView } = await import("@/components/ventas/ComisionesView");
    render(<ComisionesView availableYears={[2026, 2025]} />);
    const tabla = await screen.findByRole("table");
    // La vista de UNA empresa: sus cinco columnas de números.
    expect(within(tabla).getByText("Com. venta")).toBeTruthy();
    expect(within(tabla).getByText("Com. total")).toBeTruthy();
    expect(screen.getByLabelText("Empresa").textContent).toContain("Fashion Wear");
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
    // 🔁 El subtítulo «6 empresas · mayoreo B2B» se fue con la pestaña. El de
    // /ventas ahora lo arma `alcanceDeLaPestana`, y Clientes también dice SEIS
    // — pero por otro motivo (sus clientes son los del grupo). Ver
    // `ventas-tres-pestanas.test.tsx`.
    expect(shellPlano).not.toContain("mayoreo B2B");
  });
});
