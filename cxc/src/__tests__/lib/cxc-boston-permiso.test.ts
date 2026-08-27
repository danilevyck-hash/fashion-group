/**
 * CANDADO — la pestaña de Confecciones Boston y su endpoint leen EL MISMO permiso.
 *
 * 🩸 POR QUÉ EXISTE. Medido en producción el 14-ago-2026: la pestaña se le
 * dibujaba a TODOS los roles, pero `/api/cxc/boston` solo acepta admin y
 * secretaria. Los 3 vendedores activos (edwin, rey, rodrigo) la veían, la
 * tocaban y recibían **siempre** *"No se pudo cargar la cartera de Confecciones
 * Boston"*. La lista de roles vivía dentro del route y la UI no la miraba.
 *
 * Lo que este archivo vigila NO es que las dos listas coincidan hoy: es que
 * **haya UNA sola lista**. Una copia sincronizada a mano vuelve a separarse en
 * el próximo cambio de roles, que es justo lo que pasó.
 *
 * 🩸 Los barridos borran los COMENTARIOS antes de mirar. Es la lección del
 * #499 (y de otras tres veces en este repo): un candado que se conforma con
 * encontrar el texto se cumple a sí mismo con el comentario que lo explica.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  PESTANAS_CXC,
  ROLES_BOSTON,
  pestanasCxc,
  puedeVerBoston,
  rolesBoston,
  tabCxcPermitida,
} from "@/lib/cxc/boston-roles";
import { CARTERAS } from "@/lib/cxc/cartera";
import { SYSTEM_ROLE_KEYS } from "@/lib/modules";
import { signSession } from "@/lib/session-cookie";
import { requireRole } from "@/lib/requireRole";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-cxc-boston"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

/** Los roles que NO cobran la cartera de Boston. `vendedor` es el del caso real. */
const SIN_BOSTON = ["vendedor", "bodega", "contabilidad", "gerente_acs"] as const;

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf-8");

/** Fuera comentarios: un ejemplo en la documentación no es código. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── 1. La lista, congelada ───────────────────────────────────────────────────

describe("quién lee la cartera de Boston", () => {
  it("admin, secretaria y el gerente de Boston — nadie más", () => {
    // 🔴 `gerente_boston` (David) entra el 27-ago-2026: la pestaña CXC de su
    // módulo monta el MISMO `<BostonTab />` contra el MISMO `/api/cxc/boston`.
    // Un segundo endpoint habría sido una segunda definición de "la cartera de
    // Boston" — el defecto exacto que costó el bug de la MV.
    expect([...ROLES_BOSTON]).toEqual(["admin", "secretaria", "gerente_boston"]);
  });

  it("todo rol de la lista es un rol REAL del sistema", () => {
    for (const rol of ROLES_BOSTON) expect(SYSTEM_ROLE_KEYS).toContain(rol);
  });

  it("🔴 ningún otro rol del sistema la ve — vendedor incluido", () => {
    for (const rol of SIN_BOSTON) {
      expect(SYSTEM_ROLE_KEYS).toContain(rol); // el rol existe de verdad
      expect(puedeVerBoston(rol)).toBe(false);
    }
    // Barrido exhaustivo sobre TODOS los roles del sistema: si mañana nace uno,
    // este test lo obliga a decidir de qué lado cae.
    for (const rol of SYSTEM_ROLE_KEYS) {
      expect(puedeVerBoston(rol)).toBe((ROLES_BOSTON as readonly string[]).includes(rol));
    }
  });

  it("sin rol (sesión a medias) no la ve", () => {
    for (const v of [undefined, null, "", "  ", "ADMIN", "administrador"]) {
      expect(puedeVerBoston(v)).toBe(false);
    }
  });

  it("la copia mutable no contamina la fuente", () => {
    rolesBoston().push("vendedor");
    expect([...ROLES_BOSTON]).toEqual(["admin", "secretaria", "gerente_boston"]);
  });
});

// ── 2. El endpoint se comporta como dice la lista ────────────────────────────

function reqComoRol(role: string): NextRequest {
  const cookie = signSession({ role, userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest("https://fashiongr.com/api/cxc/boston", {
    headers: { cookie: `cxc_session=${cookie}` },
  });
}

describe("el guard del endpoint, con cookies firmadas de verdad", () => {
  it("admin y secretaria PASAN", () => {
    for (const rol of ROLES_BOSTON) {
      const auth = requireRole(reqComoRol(rol), rolesBoston());
      expect(auth).not.toBeInstanceOf(NextResponse);
    }
  });

  it("🔴 vendedor y los demás reciben 403", () => {
    for (const rol of SIN_BOSTON) {
      const auth = requireRole(reqComoRol(rol), rolesBoston());
      expect(auth).toBeInstanceOf(NextResponse);
      expect((auth as NextResponse).status).toBe(403);
    }
  });

  it("sin cookie: 401", () => {
    const req = new NextRequest("https://fashiongr.com/api/cxc/boston");
    expect((requireRole(req, rolesBoston()) as NextResponse).status).toBe(401);
  });
});

// ── 3. Las pestañas se DERIVAN del permiso ───────────────────────────────────

describe("las pestañas del CXC", () => {
  it("las dos pestañas son las dos carteras, en orden", () => {
    expect(PESTANAS_CXC.map((p) => p.key)).toEqual([...CARTERAS]);
    expect(PESTANAS_CXC.map((p) => p.label)).toEqual(["Grupo · 6 empresas", "Confecciones Boston"]);
  });

  it("admin y secretaria ven las dos", () => {
    for (const rol of ROLES_BOSTON) {
      expect(pestanasCxc(rol).map((p) => p.key)).toEqual(["grupo", "boston"]);
    }
  });

  it("🔴 el vendedor (y los demás) solo ven la del grupo", () => {
    for (const rol of SIN_BOSTON) {
      expect(pestanasCxc(rol).map((p) => p.key)).toEqual(["grupo"]);
    }
  });

  it("🔴 un link con ?tab=boston NO deja al vendedor parado en esa pestaña", () => {
    // Esconder el botón no alcanza: la pestaña vive en la URL.
    for (const rol of SIN_BOSTON) expect(tabCxcPermitida("boston", rol)).toBe("grupo");
    for (const rol of ROLES_BOSTON) expect(tabCxcPermitida("boston", rol)).toBe("boston");
    // Y cualquier basura cae al grupo, para todos.
    for (const v of [undefined, null, "", "bostón", "grupo", "otra"]) {
      expect(tabCxcPermitida(v, "admin")).toBe("grupo");
    }
  });
});

// ── 4. UNA sola lista: los barridos ──────────────────────────────────────────

describe("BARRIDO — el permiso no está escrito dos veces", () => {
  const ROUTE = "src/app/api/cxc/boston/route.ts";
  const TABS = "src/app/admin/components/TabsCartera.tsx";

  it("el endpoint deriva del módulo y no declara su propia lista", () => {
    const src = sinComentarios(leer(ROUTE));
    expect(src).toMatch(/from\s+["']@\/lib\/cxc\/boston-roles["']/);
    expect(src).toMatch(/requireRole\(\s*req\s*,\s*rolesBoston\(\)\s*\)/);
    // Una segunda lista acá es EL bug que este archivo existe para impedir.
    expect(src).not.toMatch(/\[\s*["']admin["']\s*,\s*["']secretaria["']/);
  });

  it("la pestaña deriva del módulo y no declara su propia lista", () => {
    const src = sinComentarios(leer(TABS));
    expect(src).toMatch(/from\s+["']@\/lib\/cxc\/boston-roles["']/);
    expect(src).toMatch(/pestanasCxc\(/);
    expect(src).not.toMatch(/["']admin["']/);
    expect(src).not.toMatch(/["']secretaria["']/);
    // Y NO puede volver a dibujar las dos pestañas a mano.
    expect(src).not.toMatch(/\[\s*\[\s*["']grupo["']/);
  });

  it("el panel resuelve la pestaña activa con el permiso, no con un ===", () => {
    const src = sinComentarios(leer("src/app/admin/page.tsx"));
    expect(src).toMatch(/tabCxcPermitida\(\s*tabRaw\s*,\s*userRole\s*\)/);
    // El `tabRaw === "boston" ? "boston" : "grupo"` de antes ignoraba el rol.
    expect(src).not.toMatch(/tabRaw\s*===\s*["']boston["']/);
  });

  it("nadie más escribe la lista de roles de Boston a mano", () => {
    // El módulo es el único lugar donde puede aparecer el nombre.
    const FUENTE = "src/lib/cxc/boston-roles.ts";
    for (const rel of [ROUTE, TABS, "src/app/admin/page.tsx", "src/components/cxc/BostonTab.tsx"]) {
      expect(sinComentarios(leer(rel)), rel).not.toMatch(/ROLES_BOSTON\s*=/);
    }
    expect(sinComentarios(leer(FUENTE))).toMatch(/export const ROLES_BOSTON\s*=/);
  });
});
