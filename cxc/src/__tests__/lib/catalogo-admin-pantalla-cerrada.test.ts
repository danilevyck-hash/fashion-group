// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA PANTALLA DE ADMINISTRAR CATÁLOGOS COMPRUEBA EL ROL EN EL SERVIDOR
//    (6-sep-2026)
//
// 🩸 QUÉ PASABA. `/catalogos/admin/[marca]/page.tsx` resolvía la marca y montaba
// el componente, y punto: NO comprobaba ningún rol. El único guardia era del
// navegador, y el middleware solo valida que la sesión EXISTA — así que
// cualquiera con sesión (un vendedor, bodega, David de Boston) abría esa
// dirección y la pantalla de administrar se le armaba antes de rebotarlo.
//
// ⚠️ NO había fuga de datos: las rutas que traen la información sí contestan 403
// (`products` PUT/POST, `upload`, `variantes`, el manifiesto del ZIP). Lo que se
// cierra es la PUERTA — el mismo hueco que se cerró en Multifashion el mismo
// día, con el mismo patrón: guard en el SERVIDOR, antes de dibujar nada, y la
// lista de roles DERIVADA de `CATALOGO_ADMIN_ROLES`, nunca escrita a mano.
//
// 🔴 Administrar es de admin y secretaria. Vendedor, bodega y `gerente_boston`
// solo VEN el catálogo: a ellos la pantalla de administrar les toca rebotar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

let sesion: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (k === "cxc_session" && sesion ? { value: sesion } : undefined) }),
}));

class Redirigido extends Error {
  constructor(public destino: string) {
    super(`redirect:${destino}`);
  }
}
class NoEncontrado extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redirigido(destino);
  },
  notFound: () => {
    throw new NoEncontrado("notFound");
  },
}));

// El componente de cliente no se ejercita acá: lo que se prueba es la PUERTA.
vi.mock("@/app/catalogos/admin/[marca]/AdminCatalogoClient", () => ({
  default: () => null,
}));

import AdminCatalogoPage from "@/app/catalogos/admin/[marca]/page";
import { CATALOGO_ROLES, CATALOGO_ADMIN_ROLES } from "@/lib/catalogo/roles";
import { ALL_MODULES } from "@/lib/modules";

const MARCAS = ["reebok", "joybees", "tommy", "calvin"] as const;

/** Abre la pantalla con ese rol. Devuelve `"ok"` si la dibujó, o a dónde mandó. */
async function abrir(role: string | null, marca: string): Promise<string> {
  sesion = role ? `sesion-de-${role}` : undefined;
  try {
    await AdminCatalogoPage({ params: { marca }, searchParams: {} });
    return "ok";
  } catch (e) {
    if (e instanceof Redirigido) return e.destino;
    if (e instanceof NoEncontrado) return "404";
    throw e;
  }
}

// La cookie simulada dice el rol en su propio texto; `verifySession` se sustituye
// por eso mismo para no tener que firmar una cookie de verdad en cada caso.
vi.mock("@/lib/session-cookie", () => ({
  verifySession: (raw: string | undefined | null) =>
    raw && raw.startsWith("sesion-de-") ? { role: raw.slice("sesion-de-".length) } : null,
}));

beforeEach(() => {
  sesion = undefined;
});

describe("quién abre /catalogos/admin/<marca>", () => {
  for (const marca of MARCAS) {
    it(`${marca}: admin y secretaria entran`, async () => {
      for (const role of CATALOGO_ADMIN_ROLES) {
        expect(await abrir(role, marca), `${role}/${marca}`).toBe("ok");
      }
    });

    it(`${marca}: 🔴 quien solo VE el catálogo rebota a su casa`, async () => {
      const soloVen = CATALOGO_ROLES.filter((r) => !(CATALOGO_ADMIN_ROLES as readonly string[]).includes(r));
      expect(soloVen.length).toBeGreaterThan(0); // vendedor, bodega, gerente_boston
      for (const role of soloVen) {
        expect(await abrir(role, marca), `${role}/${marca}`).toBe("/home");
      }
    });

    it(`${marca}: un rol ajeno al módulo también rebota`, async () => {
      for (const role of ["contabilidad", "gerente_acs"]) {
        expect(await abrir(role, marca), `${role}/${marca}`).toBe("/home");
      }
    });

    it(`${marca}: sin sesión va al login`, async () => {
      expect(await abrir(null, marca)).toBe("/");
    });
  }

  it("una marca inventada no abre para nadie", async () => {
    expect(await abrir("admin", "bonobo")).toBe("404");
    expect(await abrir("vendedor", "bonobo")).toBe("/home");
  });
});

describe("el guard corre ANTES de dibujar, y la lista no se escribe a mano", () => {
  const page = readFileSync(path.join(process.cwd(), "src/app/catalogos/admin/[marca]/page.tsx"), "utf8");

  it("la comprobación del rol va antes de resolver la marca y de montar el cliente", () => {
    // Solo el CUERPO de la función: los `import` de arriba nombran las mismas
    // cosas y compararlos contra ellos no diría nada.
    const cuerpo = page.slice(page.indexOf("export default async function"));
    expect(cuerpo.indexOf('redirect("/home")')).toBeLessThan(cuerpo.indexOf("getMarcaTheme("));
    expect(cuerpo.indexOf('redirect("/home")')).toBeLessThan(cuerpo.indexOf("<AdminCatalogoClient"));
    expect(cuerpo.indexOf('redirect("/home")')).toBeGreaterThan(0);
  });

  it("🔴 la lista se DERIVA de lib/catalogo/roles.ts — ningún rol escrito a mano", () => {
    expect(page).toContain('from "@/lib/catalogo/roles"');
    expect(page).toContain("puedeAdministrarCatalogo(role)");
    for (const rol of ["admin", "secretaria", "vendedor", "bodega", "gerente_boston"]) {
      expect(page, rol).not.toContain(`"${rol}"`);
    }
  });

  it("`puedeAdministrarCatalogo` no tiene su propia lista: lee CATALOGO_ADMIN_ROLES", () => {
    const roles = readFileSync(path.join(process.cwd(), "src/lib/catalogo/roles.ts"), "utf8");
    const cuerpo = roles.slice(roles.indexOf("export function puedeAdministrarCatalogo"));
    expect(cuerpo.slice(0, 220)).toContain("CATALOGO_ADMIN_ROLES");
  });

  it("CONTROL: administrar sigue siendo un subconjunto de quien VE el catálogo, y el módulo los declara", () => {
    const delModulo = ALL_MODULES.find((m) => m.key === "catalogos")?.roles ?? [];
    for (const rol of CATALOGO_ADMIN_ROLES) {
      expect(CATALOGO_ROLES as readonly string[], rol).toContain(rol);
      expect(delModulo, rol).toContain(rol);
    }
  });
});
