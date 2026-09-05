/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — NINGÚN GUARD QUE SE LLAME «requireAdmin» PUEDE DEJAR PASAR A OTRO
 *
 * 5-sep-2026. `src/lib/api-auth.ts` exportaba `requireAdmin(req)` y su lista
 * era `['admin', 'secretaria']`. La usaban **10 rutas** (Reclamos y Catálogos).
 *
 * El permiso estaba BIEN: administrar catálogos es trabajo de la secretaria
 * (`CATALOGO_ADMIN_ROLES` = admin + secretaria) y es quien carga los reclamos.
 * Lo que estaba mal era el NOMBRE. La prueba de que hacía daño ya estaba en el
 * repo antes de este candado: dos rutas de Marketing llevaban pegado a mano el
 * cartel «⚠️ NO usar `requireAdmin` de api-auth.ts: ese incluye a la
 * secretaria», y dos tests barrían que nadie la llamara ahí. Cuando una
 * función necesita carteles alrededor para no usarse mal, se renombra.
 *
 * Se renombró a `requireAdminOSecretaria`. **Cero cambios de conducta**: los
 * mismos dos roles entran hoy que ayer, en las mismas 10 rutas.
 *
 * Qué protege este archivo, y por qué en ese orden:
 *
 *   1. LA CONDUCTA primero. Si mañana alguien "limpia" la lista y saca a la
 *      secretaria, se le apagan Catálogos y Reclamos en silencio: la ruta
 *      contesta 403 y la pantalla parece rota. Los 7 roles del sistema están
 *      congelados uno por uno.
 *   2. EL NOMBRE después. No se prohíbe la palabra `requireAdmin` —se prohíbe
 *      que exista un guard llamado así que deje entrar a algo que no sea
 *      `admin`—. Si algún día hace falta un `requireAdmin` de verdad, este
 *      candado lo deja nacer, siempre que su lista sea SOLO admin.
 *   3. QUE NO QUEDEN LLAMADORES DEL NOMBRE VIEJO.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { requireAdminOSecretaria, getRole } from "@/lib/api-auth";
import { signSession } from "@/lib/session-cookie";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-require-admin"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

const RAIZ = path.join(process.cwd(), "src");
const ESTE = "src/__tests__/lib/require-admin-no-miente.test.ts";
const API_AUTH = "src/lib/api-auth.ts";

/** Los 7 roles reales del sistema (`SYSTEM_ROLES` de src/lib/modules.ts). */
const PASAN = ["admin", "secretaria"];
const NO_PASAN = ["bodega", "contabilidad", "vendedor", "gerente_acs", "gerente_boston"];

function reqComoRol(role: string): NextRequest {
  const cookie = signSession({ role, userId: "u1", userName: "Prueba", sessionToken: "t1" });
  return new NextRequest("https://fashiongr.com/api/catalogo/reebok/products", {
    headers: { cookie: `cxc_session=${cookie}` },
  });
}
const reqSinSesion = () =>
  new NextRequest("https://fashiongr.com/api/catalogo/reebok/products");

/**
 * Quita comentarios antes de barrer. Es imprescindible aquí: el encabezado de
 * `api-auth.ts` y varias rutas CUENTAN la historia del nombre viejo, y contar
 * esa prosa como una llamada daría rojo falso para siempre.
 */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function archivos(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe("🔴 la conducta del guard de Catálogos y Reclamos no se mueve", () => {
  it.each(PASAN)("%s SÍ pasa", (rol) => {
    expect(requireAdminOSecretaria(reqComoRol(rol))).toBeNull();
  });

  it.each(NO_PASAN)("%s NO pasa (403)", (rol) => {
    const r = requireAdminOSecretaria(reqComoRol(rol));
    expect(r, `${rol} no debería entrar`).not.toBeNull();
    expect(r!.status).toBe(403);
  });

  it("sin sesión, 403", () => {
    const r = requireAdminOSecretaria(reqSinSesion());
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
    expect(getRole(reqSinSesion())).toBeNull();
  });

  it("la lista son exactamente esos dos roles, escritos, no derivados", () => {
    const src = fs.readFileSync(path.join(process.cwd(), API_AUTH), "utf-8");
    const m = src.match(/ROLES_ADMIN_Y_SECRETARIA\s*=\s*\[([^\]]*)\]/);
    expect(m, "no se encontró la lista de roles en api-auth.ts").not.toBeNull();
    const roles = m![1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
    expect(roles.sort()).toEqual(["admin", "secretaria"]);
  });
});

describe("🔴 el nombre no puede volver a mentir", () => {
  const todos = archivos(RAIZ)
    .map((abs) => ({ rel: path.relative(process.cwd(), abs), src: soloCodigo(fs.readFileSync(abs, "utf-8")) }))
    .filter((f) => f.rel !== ESTE);

  it("no existe un guard llamado `requireAdmin` (a secas) en todo src", () => {
    // Si algún día hace falta uno DE VERDAD solo-admin, este test se cambia de
    // dirección con nota fechada y se le exige la lista `["admin"]` y nada más.
    const culpables = todos.filter((f) =>
      /\b(export\s+)?(async\s+)?function\s+requireAdmin\s*\(/.test(f.src) ||
      /\brequireAdmin\s*[:=]\s*(async\s*)?\(/.test(f.src),
    );
    expect(
      culpables.map((f) => f.rel),
      "un guard llamado `requireAdmin` tiene que dejar pasar SOLO a admin.\n" +
        "Si incluye a la secretaria, se llama `requireAdminOSecretaria`.",
    ).toEqual([]);
  });

  it("ninguna ruta llama al nombre viejo `requireAdmin(`", () => {
    const culpables = todos
      .filter((f) => /\brequireAdmin\s*\(/.test(f.src))
      .map((f) => f.rel);
    expect(culpables, "quedó una llamada al nombre viejo").toEqual([]);
  });

  it("las 10 rutas que lo usan siguen usándolo (no se apagó un permiso)", () => {
    const rutas = todos.filter(
      (f) => f.rel.startsWith("src/app/api/") && /requireAdminOSecretaria\s*\(/.test(f.src),
    );
    // 4 de Reclamos + 6 de Catálogos. Si el número baja, alguien dejó una ruta
    // sin guard o le cambió el permiso sin decirlo.
    expect(rutas.length, `rutas encontradas: ${rutas.map((r) => r.rel).join(", ")}`).toBe(10);
    expect(rutas.every((r) => /\/reclamos\/|\/catalogo\//.test(r.rel))).toBe(true);
  });

  it("CONTROL: `requireRole(req, [\"admin\"])` sigue siendo el camino solo-admin", () => {
    // Marketing › Mobiliario (costos del proveedor) no debe migrar aquí.
    const marketing = todos.filter((f) =>
      f.rel.startsWith("src/app/api/marketing/mobiliario/notas-proveedor"),
    );
    expect(marketing.length).toBeGreaterThan(0);
    for (const f of marketing) {
      expect(f.src, f.rel).toMatch(/requireRole\(req,\s*\["admin"\]\)/);
    }
  });
});
