/**
 * Tercera tanda del barrido iPhone/iPad (26-ago-2026): TOCABLES < 44 px y
 * LETRA < 12 px. Son los dos defectos chatos y repetitivos del barrido —11 y 6
 * pantallas— y por eso van en un lote y no en un PR por pantalla.
 *
 * MEDIDO con `scripts/_barrido-iphone-todo.mjs` (390 / 834, navegador real,
 * cookie firmada, datos de producción). Lo peor de cada pantalla:
 *
 *   CXC › Ficha cliente ......... "← Clientes" 65×16 · el teléfono 63×17
 *   Multifashion (4 pestañas) ... "Caja" 40×44 — le faltaba ANCHO, no alto
 *   Multifashion › Vendedoras ... las píldoras de período, min-h-[40px]
 *   Reclamos › Nuevo ............ 10 campos de 28 a 36 px, SOLO a 834
 *   Marketing › Reportes ........ las 3 pestañas y el export, 33 a 39
 *   Catálogos › Admin ........... 37 y 39
 *   Depurador Facturas y Reglas . 34 a 40
 *   Cheques (sugerencia) ........ "Depositar todos" 129×30 · la "×" 14×14
 *
 * 🩸 DOS TRAMPAS QUE ESTE LOTE DEJA CERRADAS:
 *
 * 1. `sm:` NO ES "ESCRITORIO". Reclamos › Nuevo soltaba el alto denso en
 *    `sm:py-1.5` (640 px) y un iPad de 834 —que se usa con el dedo— caía en
 *    densidad de mouse: 0 defectos a 390 y 10 a 834. La guardia va en `xl`,
 *    igual que ya hizo ReclamoDetail con sus botones.
 * 2. UN CONTROL PUEDE TENER ALTO Y NO ANCHO. El botón "ZIP" de Marketing ya
 *    declaraba `min-h-[44px]` y medía 42×44: le faltaba `min-w-[44px]`. Un
 *    candado que solo mirara el alto lo habría dado por bueno.
 *
 * LO QUE NO SE TOCÓ, A PROPÓSITO: el catálogo del cliente. "Bulto de N" en
 * 10 px y el nombre del producto encogido a 11 son un CONTRATO escrito y con
 * candado propio (`catalogo-cards-paridad.test.ts`, 25-jul-2026). Cambiarlos es
 * deshacer una decisión de Daniel, no arreglar un bug: van al reporte.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const clases = (src: string) => [
  ...(src.match(/className="[^"]*"/g) ?? []),
  ...(src.match(/className=\{`[^`]*`/g) ?? []),
];

describe("Tocables · 44 px de alto Y de ancho", () => {
  it("las pestañas de la casa piden 44 en las dos medidas", () => {
    // "Caja" medía 40×44 en las 4 pestañas de Multifashion: el alto ya estaba.
    const tabs = leer("src/components/ui/tabs.tsx");
    const trigger = tabs.slice(tabs.indexOf("export const TabsTrigger"));
    expect(trigger).toContain("min-h-[44px]");
    expect(trigger).toContain("min-w-[44px]");
  });

  it('el botón "ZIP" de Marketing tenía alto pero no ancho (42×44)', () => {
    const src = leer("src/app/marketing/[marca]/page.tsx");
    const zip = clases(src).find((c) => c.includes("px-2.5 min-h-[44px]"));
    expect(zip).toBeDefined();
    expect(zip).toContain("min-w-[44px]");
  });

  it("las píldoras de período de Vendedoras suben de 40 a 44", () => {
    const src = leer("src/components/multifashion/VendedorasSubtab.tsx");
    expect(src).toContain("inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full");
    expect(src).not.toContain("min-h-[40px]");
  });

  it("los 5 controles de la ficha del cliente llegan a 44", () => {
    const src = leer("src/app/clientes/[codigo]/ClienteDetail.tsx");
    // Los dos botones: alto declarado.
    expect(src).toContain('inline-flex min-h-[44px] items-center text-xs text-gray-500 hover:text-black');
    expect(src).toContain('inline-flex min-h-[44px] items-center justify-center bg-black text-white text-sm');
    expect(src).toContain('inline-flex min-h-[44px] items-center text-xs text-gray-400 hover:text-gray-600');
    // Los enlaces dentro de un párrafo NO pueden crecer sin romper el renglón:
    // el área de toque llega a 44 con un ::after transparente (el patrón que ya
    // usa Reclamos › Por empresa). 17 px + 2×14 = 45.
    expect(src).toContain("after:absolute after:-inset-y-[14px] after:inset-x-0 after:content-['']");
    expect(src).toContain("after:absolute after:-inset-y-[13px] after:inset-x-0 after:content-['']");
    expect(src).not.toContain('className="text-blue-600 hover:underline"');
  });

  it("la tarjeta de sugerencia: el botón y la ✕ de cerrar", () => {
    const src = leer("src/components/SuggestionCard.tsx");
    expect(src).toContain("mt-2 inline-flex min-h-[44px] items-center justify-center text-xs bg-black");
    expect(src).toContain("after:absolute after:-inset-[15px] after:content-['']"); // 14 + 2×15 = 44
  });

  it("Marketing › Reportes: las 3 pestañas, el año y el export", () => {
    expect(leer("src/app/marketing/components/ReportesTabs.tsx"))
      .toContain("inline-flex min-h-[44px] items-center px-4 py-2 text-sm font-medium border-b-2");
    for (const f of ["ReportePorMarcaView", "ReportePorTiendaView", "ReportePorProyectoView"]) {
      const src = leer(`src/app/marketing/components/${f}.tsx`);
      expect(src, f).toContain("min-h-[44px]");
    }
  });

  it("Catálogos › Admin y los dos campos del Depurador", () => {
    expect(leer("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx")).toContain("flex-1 min-h-[44px] py-2 text-sm font-medium");
    expect(leer("src/app/productos/cargar/FacturasTiendaClient.tsx")).toContain("w-full min-h-[44px] rounded-lg border border-stone-300");
    expect(leer("src/app/productos/cargar/ReglasView.tsx")).toContain("w-48 min-h-[44px] rounded-md border border-stone-300");
  });
});

describe("Reclamos › Nuevo · `sm:` no es escritorio", () => {
  const src = leer("src/app/reclamos/components/ReclamoForm.tsx");

  it("el alto denso se suelta en xl, no en sm (a 834 se usa con el dedo)", () => {
    expect(src).toContain("py-3 xl:py-1.5 text-base xl:text-sm");
    expect(src).not.toContain("py-3 sm:py-1.5");
    // (El botón "Guardar Reclamo" conserva `sm:text-sm`: ya declara
    //  `min-h-[44px]`, así que su alto no depende de la densidad del texto.)
    const sinGuardia = clases(src).filter(
      (c) => c.includes("sm:text-sm") && !c.includes("min-h-[44px]"),
    );
    expect(sinGuardia).toEqual([]);
  });

  it("los campos de la tabla de ítems miden 44 hasta xl", () => {
    const campos = (src.match(/min-h-\[44px\] xl:min-h-0 py-1 text-sm/g) ?? []).length;
    expect(campos).toBe(9);
    expect(src).not.toMatch(/border-gray-200 py-1 text-sm outline-none(?! )/);
  });

  it("text-base en móvil: por debajo de 16 px Safari hace zoom al enfocar", () => {
    expect(src).toContain("text-base xl:text-sm");
  });
});

describe("Letra · nada por debajo de 12 px en las pantallas del lote", () => {
  const FUENTES = [
    "src/app/vista-general/page.tsx",
    "src/app/productos/cargar/HistorialView.tsx",
    "src/app/productos/cargar/ReglasView.tsx",
    "src/app/productos/cargar/FacturasTiendaClient.tsx",
    "src/app/productos/cargar/CatalogoDescripcionesAdmin.tsx",
    "src/components/shared/SyncNowButton.tsx",
    "src/components/marketing/PreciosProveedorAyuda.tsx",
  ];

  for (const f of FUENTES) {
    it(`${f.split("/").pop()} no usa clases sub-12px sin guardia de escritorio`, () => {
      const src = leer(f);
      const ofensores = (src.match(/(?<!lg:|xl:)text-\[(\d+(?:\.\d+)?)px\]/g) ?? [])
        .filter((h) => parseFloat(h.replace(/[^\d.]/g, "")) < 12);
      expect(ofensores).toEqual([]);
    });
  }

  it("Caja › el rótulo de sección sube de 11 a 12 px", () => {
    // `caja-mono` no declara tamaño: heredaba los 11 px de este rótulo, así que
    // el monto del período también se leía en 11.
    const css = leer("src/app/caja/skin.css");
    const eyebrow = css.slice(css.indexOf(".skin-caja .caja-eyebrow"), css.indexOf("}", css.indexOf(".skin-caja .caja-eyebrow")));
    expect(eyebrow).toContain("font-size: 12px;");
    expect(css).not.toContain("font-size: 11px;");
  });
});

describe("La segunda pasada · lo que solo se ve midiendo otra vez", () => {
  it("Caja › el monto del chip de filtro iba en 11 px por un estilo EN LÍNEA", () => {
    // El rótulo `.caja-eyebrow` subió a 12 en la hoja de estilos, pero estos
    // montos no lo heredaban: llevaban `fontSize: 11` escrito en el JSX. Un
    // barrido que solo mirara las clases de Tailwind no los habría visto nunca.
    const src = leer("src/app/caja/components/GastoTable.tsx");
    expect(src).toContain("fontSize: 12,");
    expect(src).not.toContain("fontSize: 11,");
  });

  it("Reclamos › el campo de cantidad tenía alto pero medía 42 de ancho", () => {
    const src = leer("src/app/reclamos/components/ReclamoForm.tsx");
    expect((src.match(/w-full min-w-\[44px\] border-b border-gray-200 min-h-\[44px\]/g) ?? []).length).toBe(2);
  });

  it("Cheques › las píldoras del calendario median 40 de alto", () => {
    const src = leer("src/app/cheques/ChequesClient.tsx");
    expect(src).toContain("flex min-h-[44px] w-full flex-col justify-center text-left text-xs");
  });
});

describe("El catálogo del cliente NO se tocó: es un contrato, no un bug", () => {
  it('"Bulto de N" sigue en 10 px, como lo fijó su propio candado', () => {
    for (const f of ["CatalogoProductCard", "CatalogoGroupedCard"]) {
      expect(leer(`src/components/catalogo/${f}.tsx`), f)
        .toContain('className="text-[10px] leading-[14px] text-gray-500">Bulto de ');
    }
  });
});
