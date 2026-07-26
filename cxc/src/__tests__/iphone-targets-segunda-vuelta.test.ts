/**
 * Candados de la SEGUNDA vuelta de la auditoría iPhone (390×844, dsf 3, isMobile
 * y hasTouch por CDP `Emulation.setDeviceMetricsOverride` — achicar la ventana no
 * reproduce el layout de iOS).
 *
 * La primera vuelta (#297-#304) midió PANTALLAS QUIETAS y arregló lo que se veía
 * ahí. Esta vuelta abrió las cosas, y aparecieron dos familias de defectos que
 * una foto de la pantalla no puede mostrar:
 *
 *  1. **Lo que solo existe después de tocar.** Las opciones del `OverflowMenu`
 *     medían 37 px: el botón "···" ya era 44×44 desde la primera vuelta, pero el
 *     desplegable no se despliega solo. Mismo caso el enlace "Ver facturas
 *     pendientes" de CXC, que vive dentro de la fila expandida.
 *  2. **Lo que no pasa por los componentes compartidos.** `/home` NO usa
 *     `AppHeader`: tiene su propio encabezado, así que los 44×44 que se
 *     arreglaron para las 22 páginas de módulo nunca llegaron ahí. Sus dos
 *     botones ("Modo oscuro" 22×21 y "Salir" 29×21) eran los targets más chicos
 *     de toda la app, en la primera pantalla que ve todo el mundo al entrar.
 *
 * Son assertions sobre el FUENTE a propósito: jsdom no calcula layout, así que
 * no puede medir un `getBoundingClientRect`. Lo que se congela acá es la CAUSA
 * de cada medición, no la medición.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(src, ...p), "utf8");

const overflowMenu = read("components", "ui", "OverflowMenu.tsx");
const panelCxc = read("app", "admin", "components", "PanelCxcMobile.tsx");
const searchBar = read("components", "SearchBar.tsx");
const productCard = read("components", "catalogo", "CatalogoProductCard.tsx");
const groupedCard = read("components", "catalogo", "CatalogoGroupedCard.tsx");
const marcasUi = read("lib", "catalogo", "marcas-ui.tsx");

describe("OverflowMenu · el desplegable, no solo el botón que lo abre", () => {
  it('el botón "···" sigue siendo 44×44', () => {
    expect(overflowMenu).toContain("min-h-[44px] min-w-[44px]");
  });

  it("cada OPCIÓN del menú mide 44 de alto (medían 37)", () => {
    const item = overflowMenu.match(/className=\{`w-full text-left[^`]*`/)?.[0] ?? "";
    expect(item).toContain("min-h-[44px]");
    // Sin `flex items-center` el min-h crece la caja pero deja el texto arriba.
    expect(item).toContain("flex items-center");
  });

  it("el py-2 solo ya no alcanza para declarar el alto", () => {
    expect(overflowMenu).not.toMatch(/className=\{`w-full text-left px-3 py-2 text-sm transition/);
  });
});

describe("CXC · lo que aparece al expandir la fila", () => {
  it('"Ver facturas pendientes" pide 44 de alto (medía 163×18)', () => {
    // lastIndexOf: el nombre también aparece en el comentario de cabecera.
    const i = panelCxc.lastIndexOf("Ver facturas pendientes");
    expect(i).toBeGreaterThan(0);
    const enlace = panelCxc.slice(panelCxc.lastIndexOf("<Link", i), i);
    expect(enlace).toContain("min-h-[44px]");
  });
});

describe("SearchBar · el buscador de pantalla completa (solo móvil)", () => {
  it("el campo de texto pide 44 de alto (medía 32)", () => {
    const input = searchBar.match(/className="flex-1 text-base[^"]*"/)?.[0] ?? "";
    expect(input).toContain("min-h-[44px]");
  });

  it("sigue en text-base: por debajo de 16px Safari hace zoom al enfocar", () => {
    expect(searchBar).toMatch(/className="flex-1 text-base/);
  });

  it("la ✕ de borrar pasó de 40 a 44 y tiene nombre accesible", () => {
    expect(searchBar).toContain('aria-label="Borrar búsqueda"');
    expect(searchBar).toContain("w-11 h-11");
  });
});

describe("Catálogos · los controles de cantidad y el mini-carrito", () => {
  // Las dos cards van SIEMPRE en paridad (regla del repo), así que el arreglo
  // se verifica en las dos.
  it('el "+" no se deja encoger por el flex (w-11 medía 23 px reales)', () => {
    for (const [nombre, code] of [["plana", productCard], ["agrupada", groupedCard]] as const) {
      expect(code.match(/className=\{`w-11 h-9[^`]*`\}/)?.[0] ?? "", nombre).toContain("shrink-0");
    }
  });

  it('el "−"/"Quitar" tampoco se encoge', () => {
    for (const [nombre, code] of [["plana", productCard], ["agrupada", groupedCard]] as const) {
      expect(code, nombre).toMatch(/className=\{`h-9 shrink-0 flex items-center justify-center/);
    }
  });

  it("la altura h-9 se respeta: subirla cambiaría el alto fijo de la card", () => {
    // La card mide 365.5px por diseño (#268-270). El arreglo es de ANCHO.
    expect(productCard).not.toContain("h-11 flex items-center justify-center ${t.qtyBtn}");
  });

  it('"Vaciar" es táctil en las TRES marcas (medía 38×18)', () => {
    const vaciar = marcasUi.match(/vaciarBtn: "[^"]*"/g) ?? [];
    expect(vaciar).toHaveLength(3);
    for (const v of vaciar) {
      expect(v).toContain("min-h-[44px]");
      expect(v).toContain("min-w-[44px]");
    }
  });
});

describe("Catálogos · el campo del nombre, lo último antes de confirmar", () => {
  it("mide 44 de alto en las tres marcas (medía 41)", () => {
    const campos = marcasUi.match(/nameInput:\s*\n\s*"[^"]*"/g) ?? [];
    expect(campos).toHaveLength(3);
    for (const c of campos) expect(c).toContain("min-h-[44px]");
  });

  it("va en text-base en móvil: en text-sm Safari hacía zoom al enfocarlo", () => {
    const campos = marcasUi.match(/nameInput:\s*\n\s*"[^"]*"/g) ?? [];
    for (const c of campos) expect(c).toContain("text-base sm:text-sm");
  });

  it("la variante en ERROR no encoge el campo justo cuando el cliente se equivoca", () => {
    const stickyBar = read("components", "catalogo", "CatalogoStickyCartBar.tsx");
    const error = stickyBar.match(/"w-full rounded-lg border-2 border-red-400[^"]*"/)?.[0] ?? "";
    expect(error).toContain("min-h-[44px]");
    expect(error).toContain("text-base sm:text-sm");
  });
});

describe("TimeGroupHeader · la cabecera que colapsa el grupo (Guías + Cheques)", () => {
  it("pide 44 de alto (medía 358×38)", () => {
    const tgh = read("components", "TimeGroupHeader.tsx");
    expect(tgh).toContain("min-h-[44px]");
    // El py-2 era justamente lo que la dejaba en 38.
    expect(tgh).not.toContain("gap-3 px-4 py-2 text-left");
  });
});

describe("Reclamos · los dos botones que abren el módulo", () => {
  it('"Nuevo Reclamo" mide 44 en los dos lugares que lo pintan (medía 41)', () => {
    for (const f of ["EmpresaList.tsx", "EmpresaSelector.tsx"]) {
      const code = read("app", "reclamos", "components", f);
      const i = code.indexOf("Nuevo Reclamo");
      expect(i, f).toBeGreaterThan(0);
      expect(code.slice(code.lastIndexOf("<button", i), i), f).toContain("min-h-[44px]");
    }
  });
});
