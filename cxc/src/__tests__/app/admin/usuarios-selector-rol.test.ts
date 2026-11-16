import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { SYSTEM_ROLES } from "@/lib/modules";

// Candado: el selector «Rol» de Usuarios ofrece TODOS los roles del sistema.
// Sin uno, el <select> cae a la primera opción y el gerente se ve «Administrador».
const src = readFileSync(join(process.cwd(), "src/app/admin/usuarios/page.tsx"), "utf8");

describe("Usuarios › selector «Rol»", () => {
  it("arma sus opciones desde SYSTEM_ROLES, sin opciones escritas a mano", () => {
    expect(src).toMatch(/SYSTEM_ROLES\.map\(r => \(\s*<option key=\{r\.key\} value=\{r\.key\}>/);
    expect(src).not.toMatch(/<option value="(admin|secretaria|vendedor|contabilidad|bodega|marcacion)">/);
  });

  it("incluye a los dos gerentes con su nombre", () => {
    const keys = SYSTEM_ROLES.map(r => r.key);
    expect(keys).toEqual(expect.arrayContaining(["gerente_acs", "gerente_boston"]));
    expect(SYSTEM_ROLES.find(r => r.key === "gerente_acs")?.label).toBe("Gerente Multifashion");
    expect(SYSTEM_ROLES.find(r => r.key === "gerente_boston")?.label).toBe("Gerente Boston");
  });
});
