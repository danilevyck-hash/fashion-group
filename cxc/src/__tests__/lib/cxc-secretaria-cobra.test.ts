/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LA SECRETARIA COBRA, Y EL MÓDULO LE SALE EN EL MENÚ
 *
 * 11-sep-2026. Daniel, textual, al preguntarle si le daba el módulo entero o
 * solo el botón «Cobrar» de la ficha del cliente:
 *
 *     «a) sí, le doy CXC completo»
 *
 * 🩸 EL DEFECTO. La secretaria YA cobraba: `/cxc` la nombraba en sus
 * `allowedRoles`, las 12 rutas de `/api/cxc/*` salen de `ROLES_CXC`
 * (admin · secretaria · vendedor) y desde la ficha del cliente le salía
 * «Cobrar» y le funcionaba. Lo único que faltaba era la PUERTA: el catálogo de
 * módulos tenía la lista escrita a mano (`["admin","vendedor"]`) y
 * `role_permissions.secretaria` tampoco traía la key, así que el módulo no
 * aparecía ni en el Inicio, ni en el sidebar, ni en «Ir a…». Para llegar había
 * que saberse la dirección.
 *
 * Migración `20261117120000_cxc_para_secretaria.sql` (aplicada y verificada el
 * 11-sep-2026): `role_permissions.secretaria` gana `cxc`, con `array_append` y
 * solo si no estaba.
 *
 * 🔴 BOSTON SIGUE AFUERA. Esa cartera es otro módulo (`boston`) con su propia
 * lista, y la secretaria no está en ella: la regla de que Boston no se mezcla
 * con el CXC del grupo no se toca ni por un lado ni por el otro.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { ALL_MODULES, getDefaultModulesForRole } from "@/lib/modules";
import { ROLES_CXC } from "@/lib/cxc/roles";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

const mod = (key: string) => ALL_MODULES.find((m) => m.key === key);

describe("🔴 Cuentas por Cobrar es de admin · secretaria · vendedor", () => {
  it("la lista única trae los tres", () => {
    expect([...ROLES_CXC]).toEqual(["admin", "secretaria", "vendedor"]);
  });

  it("el catálogo de módulos NO escribe su propia copia: la importa", () => {
    const src = sinComentarios(leer("src/lib/modules.ts"));
    expect(src).toContain("ROLES_CXC");
    // La copia vieja, la que dejó a la secretaria afuera.
    expect(src).not.toMatch(/key:\s*"cxc"[^}]*roles:\s*\[\s*"admin",\s*"vendedor"\s*\]/);
  });

  it("la ficha del módulo se la da a la secretaria", () => {
    expect(mod("cxc")?.roles).toEqual([...ROLES_CXC]);
    expect(getDefaultModulesForRole("secretaria")).toContain("cxc");
  });

  it("la pantalla deja entrar exactamente a esos tres", () => {
    const src = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(src).toContain('allowedRoles: ["admin", "secretaria", "vendedor"]');
  });

  it("🔴 CONTROL: Boston NO se le abre a la secretaria", () => {
    expect(mod("boston")?.roles).not.toContain("secretaria");
    expect(getDefaultModulesForRole("secretaria")).not.toContain("boston");
  });

  it("🔴 CONTROL: al vendedor y al admin no se les quitó nada", () => {
    expect(getDefaultModulesForRole("vendedor")).toContain("cxc");
    expect(getDefaultModulesForRole("admin")).toContain("cxc");
  });

  it("la migración es aditiva e idempotente (nada de reescribir el array)", () => {
    const sql = leer("supabase/migrations/20261117120000_cxc_para_secretaria.sql");
    expect(sql).toContain("array_append");
    expect(sql).toContain("role = 'secretaria'");
    expect(sql).toContain("NOT ('cxc' = ANY");
    // Ni un DELETE, ni un reemplazo completo de `modulos`.
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/SET\s+modulos\s*=\s*ARRAY\[/i);
  });
});
