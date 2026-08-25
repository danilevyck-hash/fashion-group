// ─────────────────────────────────────────────────────────────────────────────
// CONDUCTA — «PEDIDOS» EN LA TARJETA DE CADA MARCA (25-ago-2026)
//
// Daniel, textual: *"En el card donde están las marcas. Hay catálogo,
// administrar, debe de estar también pedidos para acceso directo."*
//
// Se MONTA el hub real (`/catalogos/marcas`) con la sesión de cada rol y se lee
// el DOM. Nada de barridos de texto sobre el .tsx: un barrido se cumple con su
// propio comentario, y este repo ya pagó ese defecto varias veces.
//
// Lo que fija, y las cuatro cosas se pueden romper sin darse cuenta:
//   1. El botón EXISTE en las 4 marcas y apunta a `/catalogo/<marca>/pedidos`
//      —la lista única del #611—, nunca a la ruta vieja del panel de admin.
//   2. 🔴 NADIE GANA UN PERMISO: lo ven admin, secretaria y vendedor; **bodega
//      no**, porque el feed de la lista le responde 403.
//   3. «Administrar» sigue siendo de admin + secretaria, exactamente como antes.
//   4. Las tres capas que nombran ese trío —la constante, el `VIEW_ROLES` del
//      servidor y el gate del botón «Pedidos» del catálogo— dicen LO MISMO.
//
// El punto 2 se prueba dos veces: en el DOM (lo que el rol ve) y en el SERVIDOR
// con cookies firmadas (lo que el rol puede). Un botón escondido no es un
// candado; el candado es el 403.
//
// MEDIDO el 25-ago-2026 contra el handler real de `orders`, con cookies
// firmadas y en las 4 marcas: admin/secretaria/vendedor → 200 con filas
// (12/12), bodega → 403 «Sin permiso» (4/4). Y en el build de producción, los
// 4 anchos: sin arrastre horizontal, los 3 botones a 44 px y 14 px de texto, y
// la tarjeta CRECIENDO HACIA ABAJO en el iPhone (187 → 241 px) en vez de
// desbordarse.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import CatalogosMarcasPage from "@/app/catalogos/marcas/page";
import {
  CATALOGO_ROLES,
  CATALOGO_ADMIN_ROLES,
  COMPROBANTES_ROLES,
  comprobantesRoles,
} from "@/lib/catalogo/roles";
import { MARCAS_UI, getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { signSession } from "@/lib/session-cookie";
import { requireRole } from "@/lib/requireRole";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/catalogos/marcas",
  useSearchParams: () => new URLSearchParams(""),
}));

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-hub-pedidos"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

/** Los 4 nombres tal cual salen en la tarjeta, en el orden del hub. */
const NOMBRE: Record<MarcaUiKey, string> = {
  reebok: "REEBOK",
  joybees: "JOYBEES",
  tommy: "TOMMY HILFIGER",
  calvin: "CALVIN KLEIN",
};

/** Monta el hub como lo vería `rol`, con el módulo `catalogos` puesto (que es
 *  lo que `hasModuleAccess` mira de verdad). Los contadores no importan acá:
 *  `fetch` devuelve una lista vacía y nada sale a la red. */
async function montarComo(rol: string) {
  sessionStorage.setItem("cxc_role", rol);
  sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
  render(<CatalogosMarcasPage />);
  // El gate de useAuth corre en un efecto: hay que esperar a que la grilla salga.
  await screen.findByRole("heading", { name: NOMBRE.reebok });
}

/** La tarjeta de una marca = el contenedor del `h2` con su nombre. */
function tarjeta(marca: MarcaUiKey): HTMLElement {
  const h2 = screen.getByRole("heading", { name: NOMBRE[marca] });
  return h2.closest("div.relative.overflow-hidden") as HTMLElement;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

// ── 1. El botón está, y lleva a la lista del #611 ────────────────────────────

describe("🔴 «Pedidos» en la tarjeta — las 4 marcas", () => {
  for (const marca of MARCAS_UI) {
    it(`${marca}: el botón existe y va a /catalogo/${marca}/pedidos`, async () => {
      await montarComo("admin");
      const link = within(tarjeta(marca)).getByRole("link", { name: "Pedidos" });
      expect(link.getAttribute("href")).toBe(`/catalogo/${marca}/pedidos`);
    });

    it(`${marca}: 🩸 NO apunta a la ruta vieja del panel de administrar`, async () => {
      await montarComo("admin");
      const link = within(tarjeta(marca)).getByRole("link", { name: "Pedidos" });
      const href = link.getAttribute("href")!;
      // La pestaña vieja (`/catalogos/admin/<marca>?tab=pedidos`) sigue
      // redirigiendo, pero mandar ahí a un vendedor era el bug del #611.
      expect(href).not.toContain("/catalogos/admin/");
      expect(href).not.toContain("tab=pedidos");
    });

    it(`${marca}: el destino sale del tema, no de un href a mano`, async () => {
      await montarComo("admin");
      const link = within(tarjeta(marca)).getByRole("link", { name: "Pedidos" });
      expect(link.getAttribute("href")).toBe(getMarcaTheme(marca)!.pedidosHref);
    });

    it(`${marca}: una sola vez (no se duplicó con «Ver catálogo»)`, async () => {
      await montarComo("admin");
      expect(within(tarjeta(marca)).getAllByRole("link", { name: "Pedidos" })).toHaveLength(1);
    });

    it(`${marca}: 🩸 la fila de acciones PUEDE bajar de línea`, async () => {
      // Con tres botones no entran los 355 px que miden en los 310 útiles de la
      // tarjeta a 390 px. `flex-wrap` deja que «Administrar» caiga a un segundo
      // renglón y la tarjeta crezca HACIA ABAJO; sin él, flexbox los comprime y
      // el blanco tocable se pierde. Se lee del DOM renderizado, no del .tsx.
      await montarComo("admin");
      const fila = within(tarjeta(marca)).getByRole("link", { name: "Pedidos" }).parentElement!;
      expect(fila.className).toContain("flex-wrap");
    });

    it(`${marca}: blanco tocable de 44 px, igual que los otros dos`, async () => {
      await montarComo("admin");
      const link = within(tarjeta(marca)).getByRole("link", { name: "Pedidos" });
      expect(link.className).toContain("min-h-[44px]");
      // Y el texto no baja de 12 px: `text-sm` = 14 px.
      expect(link.className).toContain("text-sm");
    });
  }
});

// ── 2. Rol por rol, en el DOM: quién lo ve y quién NO ────────────────────────

describe("🔴 quién ve qué en la tarjeta — NADIE gana un permiso", () => {
  const ESPERADO: Record<string, string[]> = {
    admin: ["Ver catálogo", "Pedidos", "Administrar"],
    secretaria: ["Ver catálogo", "Pedidos", "Administrar"],
    vendedor: ["Ver catálogo", "Pedidos"],
    bodega: ["Ver catálogo"],
  };

  for (const [rol, botones] of Object.entries(ESPERADO)) {
    it(`${rol}: ve EXACTAMENTE ${botones.join(" · ")} — en las 4 marcas`, async () => {
      await montarComo(rol);
      for (const marca of MARCAS_UI) {
        const links = within(tarjeta(marca)).getAllByRole("link");
        expect(links.map((l) => l.textContent!.trim()), `${rol} / ${marca}`).toEqual(botones);
      }
    });
  }

  it("🩸 BODEGA NO VE «Pedidos» en ninguna de las 4 marcas", async () => {
    await montarComo("bodega");
    expect(screen.queryAllByRole("link", { name: "Pedidos" })).toHaveLength(0);
    // Y sigue viendo el catálogo: no se le quitó nada tampoco.
    expect(screen.getAllByRole("link", { name: /Ver catálogo/ })).toHaveLength(MARCAS_UI.length);
  });

  it("🩸 el VENDEDOR sigue SIN «Administrar» (el botón nuevo no se lo abrió)", async () => {
    await montarComo("vendedor");
    expect(screen.queryAllByRole("link", { name: "Administrar" })).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "Pedidos" })).toHaveLength(MARCAS_UI.length);
  });

  it("«Administrar» sigue siendo de admin + secretaria y de nadie más", async () => {
    for (const rol of CATALOGO_ROLES) {
      cleanup();
      sessionStorage.clear();
      await montarComo(rol);
      const esperados = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(rol)
        ? MARCAS_UI.length
        : 0;
      expect(screen.queryAllByRole("link", { name: "Administrar" }), rol).toHaveLength(esperados);
    }
  });
});

// ── 3. El servidor, con cookies firmadas: el candado de verdad ───────────────

describe("🔴 el 403 es el candado, no el botón escondido", () => {
  function reqComoRol(role: string): NextRequest {
    const cookie = signSession({ role, userId: "u1", userName: "test", sessionToken: "t1" });
    return new NextRequest("https://fashiongr.com/api/catalogo/reebok/orders", {
      headers: { cookie: `cxc_session=${cookie}` },
    });
  }

  for (const rol of COMPROBANTES_ROLES) {
    it(`${rol}: PASA el guard de ver la lista`, () => {
      const out = requireRole(reqComoRol(rol), comprobantesRoles());
      expect(out).not.toBeInstanceOf(NextResponse);
      expect((out as { role: string }).role).toBe(rol);
    });
  }

  it("bodega NO pasa (403) — por eso no tiene botón", () => {
    const out = requireRole(reqComoRol("bodega"), comprobantesRoles());
    expect(out).toBeInstanceOf(NextResponse);
    expect((out as NextResponse).status).toBe(403);
  });

  it("contabilidad y gerente_acs tampoco (403)", () => {
    for (const rol of ["contabilidad", "gerente_acs"]) {
      const out = requireRole(reqComoRol(rol), comprobantesRoles());
      expect((out as NextResponse).status, rol).toBe(403);
    }
  });

  it("sin cookie → 401: el guard sigue exigiendo sesión", () => {
    const req = new NextRequest("https://fashiongr.com/api/catalogo/reebok/orders");
    expect((requireRole(req, comprobantesRoles()) as NextResponse).status).toBe(401);
  });
});

// ── 4. Las tres capas dicen lo mismo, y las dos listas viejas no se movieron ─

describe("🔴 la lista nueva no inventó un permiso", () => {
  it("COMPROBANTES_ROLES = admin, secretaria, vendedor — congelada", () => {
    expect([...COMPROBANTES_ROLES]).toEqual(["admin", "secretaria", "vendedor"]);
  });

  it("es EXACTAMENTE el `VIEW_ROLES` que ya tenía el GET de orders", () => {
    const src = leer("src/app/api/catalogo/[marca]/orders/route.ts");
    const m = src.match(/const VIEW_ROLES = (\[[^\]]*\])/);
    expect(m, "no se encontró VIEW_ROLES en orders/route.ts").not.toBeNull();
    expect(JSON.parse(m![1])).toEqual([...COMPROBANTES_ROLES]);
  });

  it("y el mismo trío que ya gateaba «Pedidos» dentro del catálogo", () => {
    const src = leer("src/components/catalogo/CatalogoVendedorPage.tsx");
    for (const rol of COMPROBANTES_ROLES) {
      expect(src, rol).toContain(`role === "${rol}"`);
    }
    expect(src).not.toContain('role === "bodega"');
  });

  it("🩸 bodega está en CATALOGO_ROLES pero NO en COMPROBANTES_ROLES", () => {
    expect(CATALOGO_ROLES as readonly string[]).toContain("bodega");
    expect(COMPROBANTES_ROLES as readonly string[]).not.toContain("bodega");
  });

  it("las dos listas de siempre quedaron intactas", () => {
    expect([...CATALOGO_ROLES]).toEqual(["admin", "secretaria", "vendedor", "bodega"]);
    expect([...CATALOGO_ADMIN_ROLES]).toEqual(["admin", "secretaria"]);
  });

  it("el hub gatea por las CONSTANTES, no por role === 'admin' a mano", () => {
    const src = leer("src/app/catalogos/marcas/page.tsx");
    expect(src).not.toMatch(/role\s*===\s*["']admin["']/);
    expect(src).toContain("COMPROBANTES_ROLES");
    expect(src).toContain("CATALOGO_ADMIN_ROLES");
  });
});
