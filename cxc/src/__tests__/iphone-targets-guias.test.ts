/**
 * Candados de 44×44 para GUÍAS. El módulo NO estaba en ningún candado: ni
 * `iphone-targets-*.test.ts` ni `components/toque-44.test.tsx` lo mencionaban, y
 * las dos vueltas de la auditoría iPhone (#297-304, #318) se lo saltearon por
 * los dos motivos que el propio #318 documentó:
 *
 *  1. **Lo que solo existe después de tocar.** Los ítems del desplegable de
 *     cliente medían 37 px (`px-3 py-2`) — el mismo defecto que el OverflowMenu.
 *     No se ven en una captura estática porque hay que abrir el desplegable.
 *  2. **Lo que se esconde dentro de otra cosa.** `AddNewInline` es un "＋" que
 *     vive dentro de un label: sus tres botones medían ~13×16 y su campo iba en
 *     `text-xs`, o sea que además Safari hacía zoom al enfocarlo.
 *
 * Y el tercero, que es de layout y no de tamaño: el detalle del envío era una
 * tabla con `minWidth={800}` en una pantalla de 390 px. Eso obligaba a ~410 px
 * de scroll horizontal para llegar a "Bultos" — lo que Daniel describió como
 * "se ve trabado".
 *
 * Son assertions sobre el FUENTE a propósito: jsdom no calcula layout, así que
 * no puede medir un `getBoundingClientRect`. Lo que se congela acá es la CAUSA
 * de cada medición, no la medición. La medición real (390×844, emulación CDP)
 * quedó en el PR.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { globSync } from "glob";

const src = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(src, ...p), "utf8");
const guias = (f: string) => read("app", "guias", "components", f);

const form = guias("GuiaForm.tsx");
const picker = guias("ClientePicker.tsx");
const typeahead = guias("ClienteTypeahead.tsx");
const addNew = guias("AddNewInline.tsx");

describe("El cuerpo de la página no puede scrollear de lado en 390px", () => {
  it("la tabla de envíos existe SOLO desde md — en el iPhone es una tarjeta", () => {
    expect(form).toMatch(/\{\/\* ── Escritorio \(md\+\)[^\n]*\n\s*<div className="hidden md:block">/);
    expect(form).toMatch(/\{\/\* ── Móvil \(<md\)[^\n]*\n\s*<div className="md:hidden/);
  });

  it("ya no hay una tabla de 800px de ancho mínimo", () => {
    // (El 800 sigue NOMBRADO en el comentario de cabecera, que cuenta la
    //  historia; lo que no puede volver es en el componente.)
    expect(form).not.toMatch(/<ScrollableTable minWidth=\{800\}/);
    expect(form).toMatch(/<ScrollableTable minWidth=\{720\}/);
  });

  it("el ScrollableTable que queda vive dentro del bloque de escritorio", () => {
    const i = form.indexOf('<div className="hidden md:block">');
    const j = form.indexOf("</ScrollableTable>");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    // Un solo ScrollableTable en todo el formulario, y es el de escritorio.
    expect((form.match(/<ScrollableTable/g) ?? []).length).toBe(1);
  });
});

describe("Los campos del formulario miden 44 en móvil y siguen densos en escritorio", () => {
  it("hay UN solo constructor de clases de campo, no string-replace por campo", () => {
    // El `inputClass()` viejo armaba el tamaño reemplazando "text-sm" y "py-2"
    // dentro de un string: si alguien escribía la clase distinto, el 44 no salía.
    expect(form).not.toMatch(/\.replace\("text-sm"/);
    expect(form).not.toMatch(/\.replace\("py-2"/);
    expect(form).toMatch(/const CTRL_BASE =/);
  });

  it("CTRL_BASE pide 44 en móvil, lo suelta en escritorio y evita el zoom de Safari", () => {
    const base = form.match(/const CTRL_BASE =\s*([\s\S]*?);/)?.[1] ?? "";
    expect(base).toContain("min-h-[44px]");
    expect(base).toContain("md:min-h-0");
    // text-base = 16px: por debajo, Safari hace zoom al enfocar.
    expect(base).toContain("text-base");
    expect(base).toContain("md:text-sm");
  });

  it("todos los campos de una fila pasan por ctrl()", () => {
    for (const campo of ["cliente", "direccion", "empresa", "facturas", "bultos"]) {
      const i = form.indexOf(`function campo${campo[0].toUpperCase()}${campo.slice(1)}(`);
      expect(i, campo).toBeGreaterThan(0);
      expect(form.slice(i, i + 1400), campo).toMatch(/ctrl\(/);
    }
  });

  it("el botón de quitar un envío es 44×44 y tiene nombre accesible", () => {
    const i = form.indexOf("function botonQuitar(");
    expect(i).toBeGreaterThan(0);
    const bloque = form.slice(i, i + 900);
    expect(bloque).toContain("min-w-[44px]");
    expect(bloque).toContain("min-h-[44px]");
    expect(bloque).toMatch(/aria-label=\{`Quitar envío/);
  });
});

describe("Cliente · el desplegable, no solo el campo que lo abre", () => {
  it("cada opción del selector cerrado mide 44 de alto (medían 37)", () => {
    const opcion = picker.match(/className=\{`w-full text-left[^`]*`/)?.[0] ?? "";
    expect(opcion).toContain("min-h-[44px]");
    // Sin `flex items-center` el min-h crece la caja y deja el texto arriba.
    expect(opcion).toContain("flex items-center");
  });

  it("el px-3 py-2 solo ya no alcanza para declarar el alto", () => {
    expect(picker).not.toMatch(/className="w-full text-left px-3 py-2/);
  });

  it("el typeahead libre de Marketing también se arregló (mismo defecto)", () => {
    const items = typeahead.match(/className="w-full text-left px-3[^"]*"/g) ?? [];
    expect(items).toHaveLength(2); // resultados de búsqueda + más usados
    for (const c of items) {
      expect(c).toContain("min-h-[44px]");
      expect(c).toContain("flex items-center");
    }
  });
});

describe("AddNewInline · el ＋ que se escapó de las dos vueltas", () => {
  it('el "＋", el "OK" y el "×" son 44×44', () => {
    const botones = addNew.match(/className="[^"]*inline-flex items-center justify-center[^"]*"/g) ?? [];
    expect(botones.length).toBeGreaterThanOrEqual(3);
    for (const b of botones) {
      expect(b).toContain("min-w-[44px]");
      expect(b).toContain("min-h-[44px]");
    }
  });

  it("su campo de texto llega a 44 y va en text-base (era text-xs → zoom de Safari)", () => {
    const input = addNew.match(/className="border-b border-gray-300[^"]*"/)?.[0] ?? "";
    expect(input).toContain("min-h-[44px]");
    expect(input).toContain("text-base");
    expect(input).not.toMatch(/(^|\s)text-xs(\s|"|$)/);
  });

  it("los tres botones tienen nombre accesible: un ＋ suelto no dice nada", () => {
    for (const etiqueta of ["Guardar", "Cancelar"]) {
      expect(addNew).toContain(`aria-label="${etiqueta}"`);
    }
    expect(addNew).toMatch(/aria-label=\{etiqueta\}/);
  });

  it("los tres botones son type=button: no envían el formulario por accidente", () => {
    expect((addNew.match(/type="button"/g) ?? []).length).toBe(3);
  });

  it("se renderiza UNA vez por lista, no una por fila", () => {
    // El de destinos vivía dentro del <th> de la tabla — que en móvil no existe.
    expect((form.match(/<AddNewInline/g) ?? []).length).toBe(2); // quien despacha + destinos
  });
});

describe("Los botones de solo texto del formulario siguen siendo táctiles", () => {
  for (const etiqueta of ["← Guías", "+ Agregar envío", "Cancelar", "Deshacer"]) {
    it(`"${etiqueta}" mide 44 de alto`, () => {
      // lastIndexOf: varias de estas etiquetas también salen en el comentario
      // de cabecera del archivo.
      const fin = form.lastIndexOf(etiqueta);
      expect(fin, etiqueta).toBeGreaterThan(0);
      const ini = form.lastIndexOf("<button", fin);
      expect(form.slice(ini, fin), etiqueta).toContain("min-h-[44px]");
    });
  }
});

describe("Tamaño de letra · nada por debajo de text-xs (13px) en guías", () => {
  it("ningún archivo de guías usa clases arbitrarias sub-12px", () => {
    const files = globSync(join(src, "app/guias", "**", "*.tsx"));
    expect(files.length).toBeGreaterThan(0);
    const ofensores: string[] = [];
    for (const f of files) {
      const hits = readFileSync(f, "utf8").match(/text-\[(\d+(?:\.\d+)?)px\]/g) ?? [];
      for (const h of hits) {
        if (parseFloat(h.replace(/[^\d.]/g, "")) < 12) ofensores.push(`${f.replace(src, "")} → ${h}`);
      }
    }
    expect(ofensores).toEqual([]);
  });
});
