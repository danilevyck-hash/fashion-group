/**
 * EL PRIMER PINTADO YA SABE QUIÉN MIRA — Y NADIE VE LO QUE NO LE TOCA (19-sep-2026)
 *
 * 🩸 `useAuth` arrancaba con `authChecked = false` y solo lo ponía en `true`
 * dentro de un efecto del navegador. Treinta pantallas hacen
 * `if (!authChecked) return null`, así que el HTML que mandaba el servidor
 * salía VACÍO: blanco, bajar JavaScript, confirmar la sesión y recién ahí
 * dibujar. Ocho pantallas que ya traían sus datos listos del servidor
 * (`/reclamos`, `/recordatorios`, `/prestamos`, `/comisiones`…) los tiraban a
 * la basura igual. Daniel, sobre marcación: *«se siente lagged»*.
 *
 * Lo que este candado exige:
 *
 *  A. LA REGLA ES UNA. «¿Este rol entra a este módulo?» se contesta con
 *     `tieneAccesoAlModulo` en el servidor (semilla) y en el navegador
 *     (`sessionStorage`). Dos reglas = un parpadeo, o un agujero.
 *  B. LA SEMILLA LLEVA SOLO LO QUE LA PANTALLA NECESITA: rol, módulos,
 *     `isOwner` y nombre. NUNCA el `sessionToken`: viaja serializada con la
 *     página.
 *  C. EL SERVIDOR SOLO CREE EN LA FIRMA: la semilla sale de `verifySession`
 *     (HMAC, fail-closed). Una cookie forjada no da semilla. Y si `cookies()`
 *     no está, FALLA ABIERTA hacia la conducta de antes (`null`).
 *  D. EL PRIMER PINTADO TRAE CONTENIDO: con semilla y acceso, el HTML del
 *     servidor ya lleva la pantalla — y en las servidas, con sus DATOS.
 *  E. 🔴 NADIE VE LO QUE NO LE TOCA, NI UN INSTANTE: una pantalla de admin
 *     manda HTML VACÍO a bodega, vendedor, gerente_boston, secretaria y
 *     contabilidad. Y después de hidratar, `sessionStorage` sigue mandando: si
 *     dice que no (o está vacío), lo que el servidor dibujó se retira en ese
 *     mismo instante y se redirige como siempre.
 *  F. EL CABLEADO: el layout raíz lee la semilla y la provee; `useAuth` y
 *     `GroupPage` la consumen.
 *  G. LAS PANTALLAS ALCANZADAS, POR NOMBRE: cada archivo con
 *     `if (!authChecked) return null` pasa por `useAuth`, así el arreglo del
 *     gancho les llega a todas. `/home` NO está: tiene su propio chequeo y
 *     elige sus colores con el modo oscuro, que vive en el `localStorage` del
 *     navegador — pintarlo en el servidor sería un destello de tema claro.
 *     ⚠️ Lo que SÍ se mudó al servidor el 19-sep-2026 es el REBOTE de quien no
 *     tiene Inicio (`src/app/home/layout.tsx`): decide a dónde va la petición
 *     sin pintar nada. Candado: `home-rebote-en-el-servidor.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import React from "react";

const PUSH = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/prueba",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: PUSH, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/components/AppHeader", () => ({ default: ({ module }: { module?: string }) => <div data-testid="encabezado">{module ?? "encabezado"}</div> }));
vi.mock("@/lib/OnlineContext", () => ({
  useOnline: () => true,
  useOnlineContext: () => ({ online: true }),
  OnlineProvider: ({ children }: { children: React.ReactNode }) => children,
}));
// La vista de Comisiones es pesada (SWR, fetch); acá importa que los AÑOS que
// el servidor calculó lleguen al primer cuadro, no cómo se dibujan.
vi.mock("@/components/comisiones/ComisionesView", () => ({
  ComisionesView: ({ availableYears }: { availableYears: number[] }) => <div>Años: {availableYears.join(", ")}</div>,
}));

// `next/headers` solo existe adentro de Next: acá se simula la cookie que trae
// la petición, y un modo en que `cookies()` revienta.
let COOKIE_DE_LA_PETICION: string | undefined;
let COOKIES_REVIENTA = false;
vi.mock("next/headers", () => ({
  cookies: () => {
    if (COOKIES_REVIENTA) throw new Error("cookies() fuera de una petición");
    return { get: (n: string) => (n === "cxc_session" && COOKIE_DE_LA_PETICION ? { value: COOKIE_DE_LA_PETICION } : undefined) };
  },
}));

process.env.SESSION_SECRET = "secreto-de-prueba-19-sep-2026";

import { tieneAccesoAlModulo, hasModuleAccess } from "@/lib/auth-check";
import { semillaDeSesion, accesoConSemilla, camposDeLaSemilla, type SemillaSesion } from "@/lib/sesion-semilla";
import { SemillaSesionProvider } from "@/lib/sesion-semilla-provider";
import { leerSemillaDeSesion } from "@/lib/sesion-semilla-servidor";
import { signSession } from "@/lib/session-cookie";
import { useAuth } from "@/lib/hooks/useAuth";
import GroupPage from "@/components/GroupPage";
import UsuariosPage from "@/app/admin/usuarios/page";
import VistaGeneralPage from "@/app/vista-general/page";
import { ComisionesPageClient } from "@/app/comisiones/ComisionesPageClient";
import RecordatoriosClient, { type Cheque } from "@/app/recordatorios/RecordatoriosClient";
import { ContextMenuProvider } from "@/components/ui";
import { SYSTEM_ROLES } from "@/lib/modules";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");

/** Los roles que NO son admin, sacados de la lista viva del sistema. */
const ROLES_QUE_NO_SON_ADMIN = SYSTEM_ROLES.map((r) => r.key).filter((r) => r !== "admin");
const ROLES_QUE_DANIEL_NOMBRO = ["bodega", "vendedor", "gerente_boston"];

function semilla(over: Partial<SemillaSesion> = {}): SemillaSesion {
  return { role: "admin", modules: [], isOwner: false, userName: "daniel", ...over };
}

function conSemilla(s: SemillaSesion | null, hijo: React.ReactNode) {
  return <SemillaSesionProvider semilla={s}>{hijo}</SemillaSesionProvider>;
}

/** Lo que el SERVIDOR manda: `renderToString` no corre ningún efecto. Se le
 *  quitan las marcas de React (`<!-- -->`, `<!--$-->`) para leer solo lo que
 *  un ojo vería. */
function sinMarcasDeReact(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}
function htmlDelServidor(s: SemillaSesion | null, hijo: React.ReactNode): string {
  return sinMarcasDeReact(renderToString(conSemilla(s, hijo)));
}

/** Una pantalla mínima con el `return null` de la casa. */
function PantallaDePrueba({ moduleKey, allowedRoles }: { moduleKey: string; allowedRoles: string[] }) {
  const { authChecked, role, isOwner } = useAuth({ moduleKey, allowedRoles });
  if (!authChecked) return null;
  return <div data-testid="pantalla">rol={role} owner={isOwner ? "si" : "no"}</div>;
}

function almacenFalso(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

beforeEach(() => {
  PUSH.mockReset();
  COOKIE_DE_LA_PETICION = undefined;
  COOKIES_REVIENTA = false;
  vi.stubGlobal("sessionStorage", almacenFalso());
  vi.stubGlobal("localStorage", almacenFalso());
  // Un `fetch` que NUNCA contesta: lo que se ve es solo el primer pintado.
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("A · la regla es UNA para el servidor y el navegador", () => {
  const CASOS: Array<[string, string[], string, string[], boolean]> = [
    // rol, módulos, moduleKey, allowedRoles, ¿entra?
    ["admin", [], "admin", ["admin"], true],
    ["admin", [], "lo-que-sea", [], true],
    ["secretaria", [], "cxc", ["admin", "secretaria", "vendedor"], true],
    ["bodega", [], "cxc", ["admin", "secretaria", "vendedor"], false],
    ["bodega", ["guias"], "guias", [], true],
    ["bodega", ["guias"], "cxc", [], false],
    ["", ["cxc"], "cxc", ["admin"], false],
    ["vendedor", [], "admin", ["admin"], false],
    ["gerente_boston", ["boston"], "admin", ["admin"], false],
  ];

  it.each(CASOS)("rol %s con módulos %j en %s (%j) → %s", (rol, mods, key, roles, esperado) => {
    expect(tieneAccesoAlModulo(rol, mods, key, roles)).toBe(esperado);
    expect(accesoConSemilla(semilla({ role: rol, modules: mods }), key, roles)).toBe(esperado);
    sessionStorage.setItem("cxc_role", rol);
    sessionStorage.setItem("fg_modules", JSON.stringify(mods));
    expect(hasModuleAccess(key, roles)).toBe(esperado);
  });

  it("sin semilla no se sabe, y no se dibuja", () => {
    expect(accesoConSemilla(null, "cxc", ["admin"])).toBe(false);
  });

  it("`hasModuleAccess` y `accesoConSemilla` pasan por `tieneAccesoAlModulo`, no por una copia", () => {
    const authCheck = leer("src/lib/auth-check.ts");
    const semillaFuente = leer("src/lib/sesion-semilla.ts");
    expect(authCheck).toMatch(/export function hasModuleAccess[\s\S]*return tieneAccesoAlModulo\(/);
    expect(semillaFuente).toMatch(/export function accesoConSemilla[\s\S]*return tieneAccesoAlModulo\(/);
    // La regla vive UNA vez: `role === "admin"` solo dentro de tieneAccesoAlModulo.
    expect(authCheck.match(/role === "admin"/g)?.length).toBe(1);
    expect(semillaFuente).not.toContain('=== "admin"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B · la semilla lleva SOLO lo que la pantalla necesita", () => {
  it("son cuatro campos, enumerados: rol, módulos, isOwner y nombre", () => {
    expect([...camposDeLaSemilla()].sort()).toEqual(["isOwner", "modules", "role", "userName"]);
  });

  it("de la cookie entera sale una semilla SIN el token ni nada más", () => {
    const s = semillaDeSesion({
      role: "secretaria",
      userId: "u-7",
      userName: "angela",
      modules: ["cxc", "guias"],
      isOwner: false,
      sessionToken: "TOKEN-QUE-NO-PUEDE-VIAJAR",
      empresaFilter: "fashion_wear",
      guiasReadonly: true,
    } as never);
    expect(s).toEqual({ role: "secretaria", modules: ["cxc", "guias"], isOwner: false, userName: "angela" });
    expect(Object.keys(s as object).sort()).toEqual([...camposDeLaSemilla()].sort());
    expect(JSON.stringify(s)).not.toContain("TOKEN");
    expect(JSON.stringify(s)).not.toContain("u-7");
  });

  it("sin rol no hay semilla; módulos raros se descartan; isOwner solo con `true`", () => {
    expect(semillaDeSesion(null)).toBeNull();
    expect(semillaDeSesion({})).toBeNull();
    expect(semillaDeSesion({ role: "" })).toBeNull();
    expect(semillaDeSesion({ role: "bodega", modules: "guias" })).toEqual({ role: "bodega", modules: [], isOwner: false, userName: "" });
    expect(semillaDeSesion({ role: "bodega", modules: ["guias", 3, null] })).toMatchObject({ modules: ["guias"] });
    expect(semillaDeSesion({ role: "admin", isOwner: "1" })).toMatchObject({ isOwner: false });
    expect(semillaDeSesion({ role: "admin", isOwner: true })).toMatchObject({ isOwner: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C · el servidor solo cree en la FIRMA, y falla abierta", () => {
  const PAYLOAD = { role: "vendedor", userId: "u-3", userName: "rey", modules: ["cxc"], isOwner: false, sessionToken: "tok-3" };

  it("con la cookie firmada llega la semilla, sin el token", () => {
    COOKIE_DE_LA_PETICION = signSession(PAYLOAD);
    expect(leerSemillaDeSesion()).toEqual({ role: "vendedor", modules: ["cxc"], isOwner: false, userName: "rey" });
  });

  it("una cookie FORJADA (mismo cuerpo, firma de otro) no da semilla", () => {
    const [cuerpo] = signSession(PAYLOAD).split(".");
    COOKIE_DE_LA_PETICION = `${cuerpo}.firma-inventada`;
    expect(leerSemillaDeSesion()).toBeNull();
  });

  it("un cuerpo cambiado después de firmar (rol ascendido a admin) no da semilla", () => {
    const [, firma] = signSession(PAYLOAD).split(".");
    const cuerpoAdmin = Buffer.from(JSON.stringify({ ...PAYLOAD, role: "admin" })).toString("base64url");
    COOKIE_DE_LA_PETICION = `${cuerpoAdmin}.${firma}`;
    expect(leerSemillaDeSesion()).toBeNull();
  });

  it("sin cookie, sin firma, o con `cookies()` roto → null (la pantalla espera al efecto, como antes)", () => {
    COOKIE_DE_LA_PETICION = undefined;
    expect(leerSemillaDeSesion()).toBeNull();
    COOKIE_DE_LA_PETICION = Buffer.from(JSON.stringify(PAYLOAD)).toString("base64url"); // sin firma
    expect(leerSemillaDeSesion()).toBeNull();
    COOKIES_REVIENTA = true;
    expect(() => leerSemillaDeSesion()).not.toThrow();
    expect(leerSemillaDeSesion()).toBeNull();
  });

  it("el lector no decodifica la cookie por su cuenta: pasa por `verifySession`", () => {
    const f = leer("src/lib/sesion-semilla-servidor.ts");
    expect(f).toContain("verifySession(");
    expect(f).not.toMatch(/JSON\.parse|atob\(|Buffer\.from/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D · el primer pintado trae contenido", () => {
  it("con semilla y acceso, el HTML del servidor ya lleva la pantalla con el rol de la cookie", () => {
    const html = htmlDelServidor(semilla({ role: "secretaria", isOwner: true, userName: "angela" }), <PantallaDePrueba moduleKey="cxc" allowedRoles={["admin", "secretaria"]} />);
    expect(html).toContain("rol=secretaria");
    expect(html).toContain("owner=si");
  });

  it("y por módulo también: bodega en Guías, gerente_boston en Boston", () => {
    expect(htmlDelServidor(semilla({ role: "bodega", modules: ["guias"] }), <PantallaDePrueba moduleKey="guias" allowedRoles={[]} />)).toContain("rol=bodega");
    expect(htmlDelServidor(semilla({ role: "gerente_boston", modules: ["boston", "catalogos"] }), <PantallaDePrueba moduleKey="boston" allowedRoles={[]} />)).toContain("rol=gerente_boston");
  });

  it("sin semilla (sin proveedor, o proveedor vacío) el HTML sale vacío, como siempre", () => {
    expect(sinMarcasDeReact(renderToString(<PantallaDePrueba moduleKey="cxc" allowedRoles={["admin"]} />))).toBe("");
    expect(htmlDelServidor(null, <PantallaDePrueba moduleKey="cxc" allowedRoles={["admin"]} />)).toBe("");
  });

  it("la página de grupo dibuja sus fichas en el servidor (real, con `modules.ts`)", () => {
    const html = htmlDelServidor(semilla({ role: "secretaria" }), <GroupPage group="operacion" />);
    expect(html).toContain("Guías de Despacho");
    expect(html).toContain("Caja Menuda");
    // Y solo las de ese rol: Gastos es de admin y contabilidad.
    expect(html).not.toContain("Gastos");
    expect(htmlDelServidor(null, <GroupPage group="operacion" />)).toBe("");
  });

  it("Comisiones: los años que el servidor calculó viajan en el primer cuadro", () => {
    const html = htmlDelServidor(semilla({ role: "contabilidad" }), <ComisionesPageClient availableYears={[2024, 2025, 2026]} />);
    expect(html).toContain("Comisiones");
    expect(html).toContain("Años: 2024, 2025, 2026");
  });

  it("Recordatorios: el cheque que el servidor leyó está en el HTML, sin un solo fetch", () => {
    const cheque: Cheque = {
      id: "c1", cliente: "JERUSALEM DE PANAMA", empresa: "vistana", banco: "", numero_cheque: "246001",
      monto: 1000, fecha_deposito: "2026-09-21", notas: "", vendedor: "Rey", estado: "pendiente",
      fecha_depositado: null, created_at: "2026-08-01T00:00:00.000Z",
    };
    const html = htmlDelServidor(
      semilla({ role: "secretaria" }),
      <ContextMenuProvider>
        <RecordatoriosClient initialData={{ cheques: [cheque], recordatorios: [], faltaMigracionRecordatorios: false, hoy: "2026-09-19", puedeElegirDestino: false }} />
      </ContextMenuProvider>,
    );
    expect(html).toContain("JERUSALEM DE PANAMA");
    expect(html).toContain("246001");
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("E · 🔴 nadie ve lo que no le toca, ni un instante", () => {
  const PANTALLAS_DE_ADMIN: Array<[string, React.ReactNode, string]> = [
    ["Usuarios", <UsuariosPage key="u" />, "Usuarios"],
    ["Vista General", <VistaGeneralPage key="v" />, "Vista General"],
  ];

  describe.each(PANTALLAS_DE_ADMIN)("%s", (_nombre, pantalla, texto) => {
    it("al admin le llega dibujada", () => {
      expect(htmlDelServidor(semilla({ role: "admin" }), pantalla)).toContain(texto);
    });

    it.each(ROLES_QUE_NO_SON_ADMIN)("a %s le llega VACÍA aunque tenga módulos", (rol) => {
      const html = htmlDelServidor(semilla({ role: rol, modules: ["cxc", "guias", "boston", "catalogos", "prestamos"] }), pantalla);
      expect(html).toBe("");
    });
  });

  it("los tres que Daniel nombró están en la lista de roles del sistema", () => {
    for (const r of ROLES_QUE_DANIEL_NOMBRO) expect(ROLES_QUE_NO_SON_ADMIN).toContain(r);
  });

  it("después de hidratar manda `sessionStorage`: la pestaña vieja de bodega no ve la pantalla de admin", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sessionStorage.setItem("cxc_role", "bodega");
    sessionStorage.setItem("fg_modules", JSON.stringify(["guias"]));
    let vista: ReturnType<typeof render> | undefined;
    // La semilla dice admin (la cookie es de otro login), el navegador dice bodega.
    await act(async () => { vista = render(conSemilla(semilla({ role: "admin" }), <PantallaDePrueba moduleKey="admin" allowedRoles={["admin"]} />)); });
    expect(vista!.container.innerHTML).toBe("");
    expect(document.body.textContent).toContain("No tienes acceso");
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(PUSH).toHaveBeenCalledWith("/home");
  });

  it("y sin sesión en el navegador (pestaña nueva) se retira y se va al login, como antes", async () => {
    let vista: ReturnType<typeof render> | undefined;
    await act(async () => { vista = render(conSemilla(semilla({ role: "admin" }), <PantallaDePrueba moduleKey="admin" allowedRoles={["admin"]} />)); });
    expect(vista!.container.innerHTML).toBe("");
    expect(PUSH).toHaveBeenCalledWith("/");
  });

  it("con las dos de acuerdo, la pantalla se queda y el rol es el del navegador", async () => {
    sessionStorage.setItem("cxc_role", "secretaria");
    sessionStorage.setItem("fg_is_owner", "1");
    let vista: ReturnType<typeof render> | undefined;
    await act(async () => { vista = render(conSemilla(semilla({ role: "secretaria" }), <PantallaDePrueba moduleKey="cxc" allowedRoles={["secretaria"]} />)); });
    expect(vista!.container.textContent).toBe("rol=secretaria owner=si");
    expect(PUSH).not.toHaveBeenCalled();
  });

  it("la página de grupo también se retira si el navegador no tiene sesión", async () => {
    let vista: ReturnType<typeof render> | undefined;
    await act(async () => { vista = render(conSemilla(semilla({ role: "admin" }), <GroupPage group="operacion" />)); });
    expect(vista!.container.innerHTML).toBe("");
    expect(PUSH).toHaveBeenCalledWith("/");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("F · el cableado", () => {
  it("el layout raíz lee la semilla del servidor y la provee a toda la app", () => {
    const layout = leer("src/app/layout.tsx");
    expect(layout).toContain("leerSemillaDeSesion()");
    expect(layout).toMatch(/<SemillaSesionProvider semilla=\{semilla\}>[\s\S]*\{children\}[\s\S]*<\/SemillaSesionProvider>/);
  });

  it("`useAuth` arranca con la semilla y con la misma regla", () => {
    const hook = leer("src/lib/hooks/useAuth.ts");
    expect(hook).toContain("useSemillaSesion()");
    expect(hook).toContain("accesoConSemilla(semilla, moduleKey, allowedRoles)");
    expect(hook).toMatch(/useState\(segunElServidor\)/);
    // Y el efecto sigue leyendo sessionStorage por `hasModuleAccess`.
    expect(hook).toContain("if (!hasModuleAccess(moduleKey, allowedRoles))");
  });

  it("`GroupPage` arranca con la semilla", () => {
    const g = leer("src/components/GroupPage.tsx");
    expect(g).toContain("useSemillaSesion()");
    expect(g).toContain("useState(semilla !== null)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("G · las pantallas alcanzadas, por nombre", () => {
  function archivosTsx(dir: string): string[] {
    const out: string[] = [];
    for (const n of readdirSync(dir)) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) out.push(...archivosTsx(p));
      else if (p.endsWith(".tsx")) out.push(p);
    }
    return out;
  }

  const ALCANZADAS_POR_EL_GANCHO = [
    "src/app/admin/usuarios/page.tsx",
    "src/app/boston/BostonShell.tsx",
    "src/app/caja/[periodoId]/imprimir/page.tsx",
    "src/app/caja/[periodoId]/page.tsx",
    "src/app/caja/page.tsx",
    "src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx",
    "src/app/catalogos/marcas/page.tsx",
    "src/app/clientes/ClientesListClient.tsx",
    "src/app/clientes/[codigo]/ClienteDetail.tsx",
    "src/app/comisiones/ComisionesPageClient.tsx",
    "src/app/cxc/page.tsx",
    // La página de un cliente dentro de Cuentas por Cobrar (24-sep-2026, el
    // celular: «Ver los documentos ›» de la hoja «Cobrar» lleva acá).
    "src/app/cxc/cliente/[codigo]/ClienteCxc.tsx",
    "src/app/gastos-contabilidad/GastosContabilidadClient.tsx",
    "src/app/guias/[id]/imprimir/page.tsx",
    "src/app/guias/[id]/page.tsx",
    "src/app/guias/nueva/NuevaGuiaClient.tsx",
    "src/app/guias/page.tsx",
    "src/app/marketing/[marca]/[periodo]/page.tsx",
    "src/app/marketing/[marca]/page.tsx",
    "src/app/marketing/mobiliario/page.tsx",
    "src/app/marketing/page.tsx",
    // La vista de una tienda (22-sep-2026, el rediseño de Marketing).
    "src/app/marketing/tienda/[codigo]/VistaTienda.tsx",
    "src/app/multifashion/MultifashionShell.tsx",
    "src/app/prestamos/PrestamosClient.tsx",
    "src/app/prestamos/[id]/page.tsx",
    "src/app/productos/cargar/page.tsx",
    "src/app/proveedores/ProveedoresListClient.tsx",
    "src/app/proveedores/[key]/ProveedorDetail.tsx",
    "src/app/reclamos/ReclamosClient.tsx",
    "src/app/recordatorios/RecordatoriosClient.tsx",
    "src/app/vista-general/page.tsx",
  ];
  const CON_CHEQUEO_PROPIO_Y_SEMILLA = ["src/components/GroupPage.tsx"];
  // `/home` pinta en el navegador por el modo oscuro; su REBOTE ya es del
  // servidor (`src/app/home/layout.tsx`, 19-sep-2026).
  const PINTA_EN_EL_NAVEGADOR = ["src/app/home/page.tsx"];

  it("cada archivo con `if (!authChecked…) return null` está en una de las tres listas", () => {
    const encontrados = [...archivosTsx(path.join(RAIZ, "src/app")), ...archivosTsx(path.join(RAIZ, "src/components"))]
      .filter((p) => /if \(!authChecked[^\n]*\) return null;/.test(readFileSync(p, "utf8")))
      .map((p) => path.relative(RAIZ, p))
      .sort();
    expect(encontrados).toEqual([...ALCANZADAS_POR_EL_GANCHO, ...CON_CHEQUEO_PROPIO_Y_SEMILLA, ...PINTA_EN_EL_NAVEGADOR].sort());
  });

  it("las 31 pasan por `useAuth`, así que el arreglo del gancho les llega", () => {
    for (const p of ALCANZADAS_POR_EL_GANCHO) {
      expect(leer(p), p).toContain('from "@/lib/hooks/useAuth"');
    }
    expect(ALCANZADAS_POR_EL_GANCHO).toHaveLength(31);
  });
});
