/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — NO SE PUEDE REGALAR UN MÓDULO QUE LA PANTALLA REBOTA
 *
 * 11-sep-2026. Daniel, textual: *«a Andrea quita Multifashion, porque ahora lo
 * verá en Comisiones»*.
 *
 * 🩸 EL DEFECTO, medido en producción. El editor de «permisos personalizados»
 * de `/admin/usuarios` ofrecía las 20 keys del catálogo para CUALQUIER rol,
 * pero el `modulos_override` no decide solo: cada módulo tiene su guard y ese
 * guard mira el ROL. **andrea (secretaria) tenía `multifashion`**: la ficha se
 * le pintaba en el Inicio y en el sidebar, la tocaba, y `/multifashion` la
 * devolvía a `/home` sin decirle nada. Un permiso que se puede dar y no se
 * puede usar.
 *
 * 🔑 LA REGLA, en `src/lib/modulos-ofrecibles.ts`: un módulo se le ofrece a un
 * rol **solo si el catálogo (`ALL_MODULES`) se lo da a ese rol**. No es una
 * lista nueva: es la misma que dibuja el Inicio y el sidebar, y es de la que
 * salen los `allowedRoles` de las pantallas — lo comprueba el último bloque de
 * acá abajo, uno por uno.
 *
 * Migración `20261118120000_andrea_sin_multifashion.sql` (aplicada y verificada
 * el 11-sep-2026): `array_remove` sobre el override de andrea, por `name`
 * exacto. Los otros 10 módulos le quedan intactos y Angela no se toca.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { ALL_MODULES, SYSTEM_ROLE_KEYS } from "@/lib/modules";
import { modulosOfrecibles, moduloOfrecible } from "@/lib/modulos-ofrecibles";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

describe("🔴 la lista de módulos ofrecibles sale del catálogo, por rol", () => {
  it("cada rol solo recibe los módulos que su rol abre", () => {
    for (const rol of SYSTEM_ROLE_KEYS) {
      for (const m of modulosOfrecibles(rol)) {
        expect(m.roles, `${rol} no debería poder recibir «${m.key}»`).toContain(rol);
      }
    }
  });

  it("🔴 el caso que lo destapó: Multifashion NO se le puede dar a una secretaria", () => {
    expect(moduloOfrecible("secretaria", "multifashion")).toBe(false);
    expect(modulosOfrecibles("secretaria").map((m) => m.key)).not.toContain("multifashion");
    // Ni Boston, que es el otro módulo con guard por rol.
    expect(moduloOfrecible("secretaria", "boston")).toBe(false);
  });

  it("CONTROL: a quien SÍ le toca, se le sigue pudiendo dar", () => {
    expect(moduloOfrecible("gerente_acs", "multifashion")).toBe(true);
    expect(moduloOfrecible("gerente_boston", "boston")).toBe(true);
    expect(moduloOfrecible("admin", "multifashion")).toBe(true);
  });

  it("🔴 CONTROL: los 10 módulos que las dos secretarias vivas usan HOY se siguen ofreciendo", () => {
    // Medido en producción el 11-sep-2026 (`fg_users.modulos_override`): con la
    // regla puesta, de los overrides de Angela y andrea el ÚNICO que deja de
    // ofrecerse es `multifashion`. Ninguna pierde nada que hoy le funcione.
    const hoy = ["directorio", "marketing", "cheques", "caja", "comisiones", "guias", "reclamos", "catalogos", "cargar", "cxc"];
    for (const key of hoy) {
      expect(moduloOfrecible("secretaria", key), `la secretaria perdió «${key}»`).toBe(true);
    }
  });

  it("un rol vacío o desconocido no recibe nada", () => {
    expect(modulosOfrecibles("")).toEqual([]);
    expect(modulosOfrecibles(null)).toEqual([]);
    expect(modulosOfrecibles("inventado")).toEqual([]);
  });
});

describe("🔴 la pantalla y el servidor usan esa misma regla", () => {
  it("el editor dibuja las casillas con `modulosOfrecibles(uRole)`", () => {
    const src = sinComentarios(leer("src/app/admin/usuarios/page.tsx"));
    expect(src).toContain("modulosOfrecibles(uRole).map");
    // La lista fija de las 20 keys se fue.
    expect(src).not.toMatch(/const MODULES = ALL_MODULES\.map/);
  });

  it("y lo que se guarda se filtra por lo mismo", () => {
    const src = sinComentarios(leer("src/app/admin/usuarios/page.tsx"));
    expect(src).toContain("uModules.filter((k) => moduloOfrecible(uRole, k))");
  });

  it("🔴 el servidor lo rechaza aunque la casilla vuelva", () => {
    const src = sinComentarios(leer("src/app/api/admin/users/route.ts"));
    expect(src).toContain("moduloOfrecible");
    expect(src).toContain("no puede abrir");
  });
});

describe("🔴 los guards de cada pantalla no se salen de su lista del catálogo", () => {
  // Es lo que sostiene la regla: si una pantalla admitiera un rol que el
  // catálogo no le da, ofrecer por catálogo estaría dejando gente afuera.
  it("todo `allowedRoles` de un `useAuth` con `moduleKey` es subconjunto de los roles del módulo", () => {
    const culpables: string[] = [];
    const anda = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...anda(p));
        else if (/\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const archivos = anda(path.join(RAIZ, "src", "app")).filter((p) => !p.includes("__tests__"));
    let vistos = 0;
    for (const abs of archivos) {
      const src = leer(path.relative(RAIZ, abs));
      const re = /moduleKey:\s*"([^"]+)"[\s\S]{0,220}?allowedRoles:\s*\[([^\]]*)\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const key = m[1];
        const roles = [...m[2].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
        if (roles.length === 0) continue; // lista derivada (p. ej. `rolesClientes()`)
        vistos++;
        const mod = ALL_MODULES.find((x) => x.key === key);
        if (!mod) {
          // ⚠️ UNA excepción documentada: `/admin/usuarios` usa
          // `moduleKey: "admin"`, que NO es una key del catálogo — a propósito,
          // porque así `hasModuleAccess` solo lo satisface con `role === "admin"`
          // y nadie puede ganárselo con un override. Se exige justamente eso:
          // una key de fuera del catálogo solo vale si además es solo-admin.
          if (roles.length === 1 && roles[0] === "admin") continue;
          culpables.push(`${path.relative(RAIZ, abs)}: módulo «${key}» no existe y no es solo-admin`);
          continue;
        }
        for (const r of roles) {
          if (!mod.roles.includes(r)) {
            culpables.push(`${path.relative(RAIZ, abs)}: «${key}» deja entrar a «${r}», que el catálogo no le da`);
          }
        }
      }
    }
    expect(vistos, "el barrido no encontró un solo guard: se quedó mudo").toBeGreaterThan(3);
    expect(culpables, `\n\n${culpables.join("\n")}\n`).toEqual([]);
  });
});

describe("🔴 la migración de andrea es acotada y aditiva", () => {
  const sql = leer("supabase/migrations/20261118120000_andrea_sin_multifashion.sql");

  it("toca a UNA persona, por nombre exacto, y solo le quita esa key", () => {
    expect(sql).toContain("array_remove(modulos_override, 'multifashion')");
    expect(sql).toContain("name = 'andrea'");
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/ilike/i);
  });

  it("no toca `role_permissions` (solo la nombra el comentario, para decir que no la toca)", () => {
    expect(sql).not.toMatch(/UPDATE\s+role_permissions/i);
  });
});
