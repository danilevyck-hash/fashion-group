// Candado de la barra de pestañas (`TAB_BAR_2026_10`) y del vidrio v2
// (`VIDRIO_V2_2026_10`): las dos propuestas nacen APAGADAS, la barra nunca
// ofrece un módulo que el menú no ofrece, y quien tiene un solo módulo no la ve.
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { PESTANAS_DE_MODULO, TAB_BAR_2026_10, pestanasDelRol } from "@/lib/navegacion/tab-bar";
import { gruposDelCajon } from "@/lib/navegacion/cajon-por-grupos";
import { VIDRIO_V2_2026_10 } from "@/lib/ui/vidrio";

const ROLES = ["admin", "secretaria", "bodega", "vendedor", "contabilidad", "gerente_boston", "gerente_acs", "marcacion"];
const delMenu = (rol: string) => gruposDelCajon(rol).flatMap((g) => g.modulos.map((m) => m.key));

describe("barra de pestañas", () => {
  it("nace apagada (Daniel decide)", () => {
    expect(TAB_BAR_2026_10).toBe(false);
  });

  it.each(ROLES)("%s: solo módulos del menú, como mucho 4", (rol) => {
    const tabs = pestanasDelRol(rol).map((m) => m.key);
    expect(tabs.length).toBeLessThanOrEqual(PESTANAS_DE_MODULO);
    for (const k of tabs) expect(delMenu(rol)).toContain(k);
  });

  it("sin barra para quien tiene un solo módulo", () => {
    expect(pestanasDelRol("marcacion")).toEqual([]);
    expect(pestanasDelRol("gerente_acs")).toEqual([]);
    expect(pestanasDelRol("")).toEqual([]);
  });

  it("el orden sale del uso medido", () => {
    expect(pestanasDelRol("admin").map((m) => m.key)).toEqual(["asistencia", "catalogos", "multifashion", "ventas"]);
    expect(pestanasDelRol("bodega").map((m) => m.key)[0]).toBe("guias");
  });

  it("se esconde con una acción fija abajo (CSS)", () => {
    const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
    expect(css).toMatch(/body:has\(\[data-barra-fija-abajo\]:not\(\[data-aviso-instalar\]\)\) \[data-tab-bar\]\s*\{\s*display: none;/);
  });
});

describe("vidrio v2", () => {
  it("nace apagado y solo cambia la receta de .vidrio", () => {
    expect(VIDRIO_V2_2026_10).toBe(false);
    const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
    expect(css).toContain('html[data-vidrio="v2"] .vidrio {');
  });
});
