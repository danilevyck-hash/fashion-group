// Candado de la barra de pestañas (`TAB_BAR_2026_10`) y del vidrio v2
// (`VIDRIO_V2_2026_10`): las dos propuestas nacen APAGADAS, la barra nunca
// ofrece un módulo que el menú no ofrece, y quien tiene un solo módulo no la ve.
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { PESTANAS_DE_MODULO, TAB_BAR_2026_10, ordenPorUso, pestanasDelRol, ventanaDeLaSemana } from "@/lib/navegacion/tab-bar";
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

  it("sin datos de la persona, el orden de su rol", () => {
    expect(pestanasDelRol("admin").map((m) => m.key)).toEqual(["asistencia", "catalogos", "multifashion"]);
    expect(pestanasDelRol("bodega").map((m) => m.key)[0]).toBe("guias");
  });

  it("con datos, manda la persona; lo que no está en su menú no entra", () => {
    expect(pestanasDelRol("vendedor", null, ["usuarios", "guias", "catalogos"]).map((m) => m.key)).toEqual(["guias", "catalogos", "referencia"]);
  });

  it("la casa del rol es «Inicio» y no se repite como pestaña", () => {
    expect(pestanasDelRol("admin", null, ["ventas"], "/ventas").map((m) => m.key)).not.toContain("ventas");
  });

  it("primero el celular, después el total", () => {
    expect(ordenPorUso([
      { modulo: "guias", aparato: "computadora", visitas: 40 },
      { modulo: "catalogos", aparato: "celular", visitas: 3 },
      { modulo: "guias", aparato: "celular", visitas: 1 },
      { modulo: "caja", aparato: "computadora", visitas: 2 },
    ])).toEqual(["catalogos", "guias", "caja"]);
  });

  it("la ventana es fija toda la semana (lunes a domingo)", () => {
    const lunes = ventanaDeLaSemana("2026-09-28");
    expect(lunes).toEqual({ desde: "2026-08-31", hasta: "2026-09-28" });
    expect(ventanaDeLaSemana("2026-10-02")).toEqual(lunes);
    expect(ventanaDeLaSemana("2026-10-04")).toEqual(lunes);
    expect(ventanaDeLaSemana("2026-10-05").hasta).toBe("2026-10-05");
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
