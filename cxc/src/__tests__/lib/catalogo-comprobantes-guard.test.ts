// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DE COMPROBANTES TIENE GUARD EN EL SERVIDOR (11-sep-2026)
//
// 🩸 `/catalogo/<marca>/pedidos` no comprobaba ningún rol: montaba la lista, el
// navegador pedía `GET /orders`, recibía 403 y la pantalla decía «No hay
// comprobantes aún» — un permiso negado se veía igual que una marca sin ventas.
// Mismo patrón que `/catalogos/admin/[marca]`: el guard va ANTES de dibujar y la
// lista se DERIVA de `COMPROBANTES_ROLES`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

let sesion: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (k === "cxc_session" && sesion ? { value: sesion } : undefined) }),
}));
class Redirigido extends Error { constructor(public destino: string) { super(`redirect:${destino}`); } }
class NoEncontrado extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Redirigido(destino); },
  notFound: () => { throw new NoEncontrado("notFound"); },
}));
vi.mock("@/components/catalogo/PedidosListClient", () => ({ default: () => null }));
vi.mock("@/lib/session-cookie", () => ({
  verifySession: (raw: string | undefined | null) =>
    raw && raw.startsWith("sesion-de-") ? { role: raw.slice("sesion-de-".length) } : null,
}));

import PedidosPage from "@/app/catalogo/[marca]/pedidos/page";
import { COMPROBANTES_ROLES } from "@/lib/catalogo/roles";
import { SYSTEM_ROLE_KEYS } from "@/lib/modules";

async function abrir(role: string | null, marca: string): Promise<string> {
  sesion = role ? `sesion-de-${role}` : undefined;
  try {
    await PedidosPage({ params: { marca } });
    return "ok";
  } catch (e) {
    if (e instanceof Redirigido) return e.destino;
    if (e instanceof NoEncontrado) return "404";
    throw e;
  }
}

beforeEach(() => { sesion = undefined; });

describe("quién abre /catalogo/<marca>/pedidos", () => {
  for (const marca of ["reebok", "joybees", "tommy", "calvin"]) {
    it(`${marca}: entran exactamente los de COMPROBANTES_ROLES`, async () => {
      for (const role of COMPROBANTES_ROLES) expect(await abrir(role, marca), role).toBe("ok");
      const ajenos = SYSTEM_ROLE_KEYS.filter((r) => !(COMPROBANTES_ROLES as readonly string[]).includes(r));
      expect(ajenos).toContain("gerente_boston");
      expect(ajenos).toContain("contabilidad");
      for (const role of ajenos) expect(await abrir(role, marca), role).toBe("/home");
    });
  }
  it("sin sesión va al login; una marca inventada es 404", async () => {
    expect(await abrir(null, "reebok")).toBe("/");
    expect(await abrir("admin", "bonobo")).toBe("404");
  });
  it("la lista no se escribe a mano en la página", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/catalogo/[marca]/pedidos/page.tsx"), "utf8");
    expect(page).toContain("puedeVerComprobantes(role)");
    for (const rol of SYSTEM_ROLE_KEYS) expect(page, rol).not.toContain(`"${rol}"`);
    const cuerpo = page.slice(page.indexOf("export default async function"));
    expect(cuerpo.indexOf('redirect("/home")')).toBeLessThan(cuerpo.indexOf("<PedidosListClient"));
  });
});
