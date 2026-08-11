// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de permisos — Catálogos.
//
// El 27-jul-2026 `secretaria` pasó a administrar catálogos igual que admin
// (pedido de Daniel). Este archivo congela DÓNDE quedó la línea, en las tres
// capas, y falla si:
//   (a) la secretaria PIERDE alguna de las capacidades que se le acaban de dar;
//   (b) CUALQUIER otro rol GANA acceso al admin de catálogos sin decidirlo;
//   (c) algún otro MÓDULO se le abre a la secretaria de rebote.
//
// (b) y (c) son el punto del ejercicio: esto abre permisos, y lo que hay que
// poder demostrar es que abre EXACTAMENTE lo pedido y nada más.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  CATALOGO_ROLES,
  CATALOGO_ADMIN_ROLES,
  catalogoRoles,
  catalogoAdminRoles,
} from "@/lib/catalogo/roles";
import { getDefaultModulesForRole, SYSTEM_ROLE_KEYS } from "@/lib/modules";
import { signSession } from "@/lib/session-cookie";
import { requireRole } from "@/lib/requireRole";
import { requireAdmin } from "@/lib/api-auth";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-catalogo-roles"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

const OTROS_ROLES = ["bodega", "contabilidad", "vendedor", "gerente_acs"] as const;

function reqComoRol(role: string): NextRequest {
  const cookie = signSession({ role, userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest("https://fashiongr.com/api/catalogo/reebok/products", {
    headers: { cookie: `cxc_session=${cookie}` },
  });
}

function leer(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf-8");
}

// ── 1. Las dos listas, congeladas ────────────────────────────────────────────

describe("catálogos — listas de roles congeladas", () => {
  it("ver el catálogo: admin, secretaria, vendedor, bodega", () => {
    expect([...CATALOGO_ROLES]).toEqual(["admin", "secretaria", "vendedor", "bodega"]);
  });

  it("ADMINISTRAR el catálogo: admin y secretaria — nadie más", () => {
    expect([...CATALOGO_ADMIN_ROLES]).toEqual(["admin", "secretaria"]);
  });

  it("ningún otro rol del sistema administra catálogos", () => {
    for (const rol of OTROS_ROLES) {
      expect(CATALOGO_ADMIN_ROLES as readonly string[]).not.toContain(rol);
    }
    // Y todo rol que administre tiene que ser un rol REAL del sistema.
    for (const rol of CATALOGO_ADMIN_ROLES) {
      expect(SYSTEM_ROLE_KEYS).toContain(rol);
    }
  });

  it("los helpers devuelven copias (mutarlas no contamina la fuente)", () => {
    const a = catalogoAdminRoles();
    a.push("bodega");
    expect([...CATALOGO_ADMIN_ROLES]).toEqual(["admin", "secretaria"]);
    expect(catalogoRoles()).not.toContain("gerente_acs");
  });
});

// ── 2. El guard de API se comporta como dice la lista ────────────────────────

describe("catálogos — guards de API, comportamiento real", () => {
  it("secretaria PASA requireRole(CATALOGO_ADMIN_ROLES)", () => {
    const out = requireRole(reqComoRol("secretaria"), catalogoAdminRoles());
    expect(out).not.toBeInstanceOf(NextResponse);
    expect((out as { role: string }).role).toBe("secretaria");
  });

  it("secretaria PASA requireAdmin (products, variantes, ZIP del banco B2B)", () => {
    expect(requireAdmin(reqComoRol("secretaria"))).toBeNull();
  });

  it("bodega, contabilidad, vendedor y gerente_acs NO pasan (403)", () => {
    for (const rol of OTROS_ROLES) {
      const out = requireRole(reqComoRol(rol), catalogoAdminRoles());
      expect(out, `${rol} no debe administrar catálogos`).toBeInstanceOf(NextResponse);
      expect((out as NextResponse).status).toBe(403);
      expect(requireAdmin(reqComoRol(rol)), `${rol} no debe pasar requireAdmin`).not.toBeNull();
    }
  });

  it("sin cookie → 401 (no 403): el guard sigue exigiendo sesión", () => {
    const req = new NextRequest("https://fashiongr.com/api/catalogo/reebok/products");
    const out = requireRole(req, catalogoAdminRoles());
    expect((out as NextResponse).status).toBe(401);
  });

  it("vendedor y bodega SÍ pasan el guard de VER catálogo (no cambió)", () => {
    for (const rol of ["vendedor", "bodega"]) {
      const out = requireRole(reqComoRol(rol), catalogoRoles());
      expect(out, `${rol} debe seguir viendo el catálogo`).not.toBeInstanceOf(NextResponse);
    }
  });
});

// ── 3. Subir fotos: las 3 marcas, mismos roles ───────────────────────────────
// Era el hueco real: Joybees y Tommy tenían upload.roles = ["admin"], así que
// la secretaria no podía subir una foto en 2 de las 3 marcas.

describe("catálogos — upload de fotos por marca", () => {
  const marcas = Object.keys(MARCAS_CONFIG);

  it("las 3 marcas están configuradas", () => {
    expect(marcas.sort()).toEqual(["joybees", "reebok", "tommy"]);
  });

  for (const marca of ["reebok", "joybees", "tommy"]) {
    it(`${marca}: upload.roles = admin + secretaria`, () => {
      expect(MARCAS_CONFIG[marca].upload.roles).toEqual(["admin", "secretaria"]);
    });

    it(`${marca}: ningún otro rol puede subir fotos`, () => {
      for (const rol of OTROS_ROLES) {
        expect(MARCAS_CONFIG[marca].upload.roles).not.toContain(rol);
      }
    });
  }

  it("el Storage SIGUE siendo distinto por marca (no se unificó de rebote)", () => {
    expect(MARCAS_CONFIG.reebok.upload.storage).toBe("marca");
    expect(MARCAS_CONFIG.joybees.upload.storage).toBe("main");
    expect(MARCAS_CONFIG.tommy.upload.storage).toBe("main");
  });

  it("crear pedidos NO se tocó (createRoles intactos, incluido el 'cliente' legacy de Reebok)", () => {
    expect(MARCAS_CONFIG.reebok.createRoles).toEqual(["admin", "secretaria", "vendedor", "cliente"]);
    expect(MARCAS_CONFIG.joybees.createRoles).toEqual(["admin", "secretaria", "vendedor"]);
    expect(MARCAS_CONFIG.tommy.createRoles).toEqual(["admin", "secretaria", "vendedor"]);
  });
});

// ── 4. La UI no vuelve a esconder el botón por `role === "admin"` ────────────

describe("catálogos — gate de UI", () => {
  it("el hub NO gatea 'Administrar' con role === 'admin'", () => {
    const src = leer("src/app/catalogos/marcas/page.tsx");
    expect(src).not.toMatch(/role\s*===\s*["']admin["']/);
    expect(src).toContain("CATALOGO_ADMIN_ROLES");
  });

  it("el admin por marca pide CATALOGO_ADMIN_ROLES, no ['admin'] a mano", () => {
    const src = leer("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx");
    expect(src).toContain("catalogoAdminRoles()");
    expect(src).not.toMatch(/allowedRoles:\s*\[\s*["']admin["']\s*\]/);
  });

  it("borrar/editar un pedido del link ya no es solo-admin", () => {
    const src = leer("src/app/api/catalogo/[marca]/pedidos-publicos/[short_id]/route.ts");
    expect(src).not.toMatch(/requireRole\(req,\s*\[\s*["']admin["']\s*\]\)/);
    expect(src.match(/catalogoAdminRoles\(\)/g) ?? []).toHaveLength(2); // DELETE + PUT
  });
});

// ── 4b. TRAMPA: `allowedRoles` NO es el gate del admin de catálogos ─────────
// `hasModuleAccess` cae de vuelta a `fg_modules` (los módulos de
// role_permissions que el login guarda en sessionStorage). Como vendedor y
// bodega TAMBIÉN tienen el módulo `catalogos`, la página /catalogos/admin/
// [marca] ya les abría por URL ANTES de este cambio — medido con Playwright
// contra un build de origin/main: los 3 admins cargaban igual. Sus mutaciones
// mueren en el server con 403 (bloque 2), que es el gate de verdad.
//
// Este test existe para que nadie "cierre" el admin tocando solo allowedRoles
// y se quede tranquilo: no cierra nada. Si algún día se decide restringir la
// PÁGINA, hay que tocar hasModuleAccess/useAuth, y este test es el aviso.

describe("catálogos — el gate de UI real es fg_modules, no allowedRoles", () => {
  function conSesion(role: string, modulos: string[]) {
    sessionStorage.setItem("cxc_role", role);
    sessionStorage.setItem("fg_modules", JSON.stringify(modulos));
  }

  it("vendedor/bodega pasan hasModuleAccess con CUALQUIERA de las dos listas (antes y después)", async () => {
    const { hasModuleAccess } = await import("@/lib/auth-check");
    for (const rol of ["vendedor", "bodega"]) {
      conSesion(rol, ["catalogos", "guias"]);
      // lista vieja (["admin"]) y lista nueva: mismo resultado → no es regresión
      expect(hasModuleAccess("catalogos", ["admin"])).toBe(true);
      expect(hasModuleAccess("catalogos", catalogoAdminRoles())).toBe(true);
    }
  });

  it("un rol SIN el módulo catalogos no entra ni por URL", async () => {
    const { hasModuleAccess } = await import("@/lib/auth-check");
    conSesion("contabilidad", ["prestamos", "proveedores", "ventas", "gastos-empresa"]);
    expect(hasModuleAccess("catalogos", catalogoAdminRoles())).toBe(false);
    conSesion("gerente_acs", ["multifashion"]);
    expect(hasModuleAccess("catalogos", catalogoAdminRoles())).toBe(false);
  });
});

// ── 5. NADA más se movió: los otros roles, módulo por módulo ─────────────────
// Snapshot literal de los módulos por rol derivados de modules.ts. Si alguien
// agrega un rol al `roles[]` de CUALQUIER módulo, esto se pone rojo — que es
// exactamente el accidente que hay que evitar al abrir permisos.

const MODULOS_POR_ROL_ESPERADOS: Record<string, string[]> = {
  secretaria: [
    "directorio",
    "catalogos",
    "guias",
    "packing-lists",
    "reclamos",
    "cargar",
    "comisiones",
    "marketing",
    "caja",
    "cheques",
    // Nuevo el 3-ago-2026: sube el Excel de marcaciones del reloj mientras no
    // se tiene la contraseña de red. Es quien hace ese trabajo, así que el
    // módulo es suyo. Se agrega acá A PROPÓSITO — este inventario existe para
    // que un módulo NO se le abra de rebote, y funcionó: el test se puso rojo.
    "asistencia",
  ],
  bodega: ["catalogos", "guias", "packing-lists"],
  // `asistencia` se le abrió el 6-ago-2026 por pedido de Daniel: la planilla
  // quincenal la arma la contable a mano, y los minutos de tardanza, las horas
  // extra y las ausencias que necesita para llenarla salen de ese módulo.
  // Cambio DELIBERADO — este candado hizo lo suyo y frenó el build hasta acá.
  // `gastos-contabilidad` (el gasto leído del mayor de Switch) se suma el
  // 10-ago-2026, y `saldos-banco` el 11-ago: los saldos de banco salieron de
  // "Gastos de Empresa" a su propio módulo, y el de gastos se retira cuando el
  // nuevo, automático, esté publicado. Es la misma gente en los tres — la
  // contable es quien cierra los meses que el módulo del mayor muestra, y las
  // 52 filas de `bancos_saldos` están firmadas "Contabilidad".
  // Cambio DELIBERADO: el candado hizo lo suyo y frenó el build hasta acá.
  contabilidad: [
    "proveedores",
    "gastos-empresa",
    "gastos-contabilidad",
    "saldos-banco",
    "prestamos",
    "asistencia",
  ],
  vendedor: ["cxc", "directorio", "catalogos", "guias"],
  gerente_acs: ["multifashion"],
};

describe("catálogos — los otros roles quedaron EXACTAMENTE igual", () => {
  for (const [rol, esperados] of Object.entries(MODULOS_POR_ROL_ESPERADOS)) {
    it(`${rol}: módulos sin cambios`, () => {
      expect(getDefaultModulesForRole(rol).sort()).toEqual([...esperados].sort());
    });
  }

  it("admin sigue viendo todo", () => {
    expect(getDefaultModulesForRole("admin")).toContain("catalogos");
    expect(getDefaultModulesForRole("admin")).toContain("usuarios");
  });

  it("a la secretaria NO se le abrió ningún módulo nuevo", () => {
    const prohibidos = ["cxc", "ventas", "vista-general", "multifashion", "proveedores",
      "gastos-empresa", "saldos-banco", "prestamos", "usuarios", "data-health"];
    const suyos = getDefaultModulesForRole("secretaria");
    for (const m of prohibidos) {
      expect(suyos, `secretaria no debe tener ${m}`).not.toContain(m);
    }
  });
});
