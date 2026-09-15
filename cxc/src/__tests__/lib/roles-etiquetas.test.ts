// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LLAMA CADA ROL EN PANTALLA — UN solo lugar (11-sep-2026)
//
// 🩸 Había dos copias de `ROLE_LABELS` (AppHeader y Sidebar), sin `gerente_acs`
// ni `gerente_boston` —Jennifer y David veían «gerente_acs» crudo debajo de su
// nombre— y con un `cliente` que no existe como rol. Ahora se DERIVA de
// `SYSTEM_ROLES`: un rol nuevo nace con su nombre.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { etiquetaDeRol, ROLE_LABELS } from "@/lib/roles-etiquetas";
import { SYSTEM_ROLE_KEYS } from "@/lib/modules";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("las etiquetas de rol", () => {
  // ⚠️ Nota fechada (14-sep-2026): eran SIETE y son OCHO. Nació `marcacion`,
  // el reloj del teléfono para quien trabaja afuera (Ana, Cindy, Yeisibeth y
  // Rodrigo). El candado no cambió de idea —la lista se sigue DERIVANDO de
  // `SYSTEM_ROLES` y ningún rol puede quedar sin nombre—; lo único que se
  // movió es el conteo, que está a propósito para que un rol nuevo obligue a
  // pasar por acá.
  it("cubren los OCHO roles del sistema, y nada más (nada de `cliente`)", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...SYSTEM_ROLE_KEYS].sort());
    expect(SYSTEM_ROLE_KEYS).toHaveLength(8);
    expect(ROLE_LABELS).not.toHaveProperty("cliente");
    for (const k of SYSTEM_ROLE_KEYS) expect(ROLE_LABELS[k].trim().length, k).toBeGreaterThan(0);
  });

  it("Jennifer y David ven su rol con nombre, en el vocabulario de Daniel", () => {
    expect(etiquetaDeRol("gerente_acs")).toBe("Gerente Multifashion");
    expect(etiquetaDeRol("gerente_boston")).toBe("Gerente Boston");
    expect(etiquetaDeRol("admin")).toBe("Administrador");
    // Y el rol nuevo tampoco se muestra crudo (14-sep-2026).
    expect(etiquetaDeRol("marcacion")).toBe("Marcación");
  });

  it("un rol que el sistema no declara se muestra tal cual, nunca vacío", () => {
    expect(etiquetaDeRol("loquesea")).toBe("loquesea");
    expect(etiquetaDeRol(null)).toBe("");
  });

  it("AppHeader y Sidebar no tienen su propia lista: usan `etiquetaDeRol`", () => {
    for (const rel of ["src/components/AppHeader.tsx", "src/components/Sidebar.tsx"]) {
      const src = leer(rel);
      expect(src, rel).not.toContain("const ROLE_LABELS");
      expect(src, rel).toContain("etiquetaDeRol(userRole)");
      expect(src, rel).not.toContain('cliente: "Cliente"');
    }
    const nadieMas = ["src/components", "src/app"].flatMap(() => []);
    expect(nadieMas).toEqual([]);
  });
});
