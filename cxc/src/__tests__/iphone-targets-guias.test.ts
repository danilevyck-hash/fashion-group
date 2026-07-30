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
// Compartido desde jul-2026: Cheques usa el MISMO selector, así que vive en
// src/components/ y ya no bajo app/guias/.
const picker = read("components", "ClientePicker.tsx");
const typeahead = guias("ClienteTypeahead.tsx");
const addNew = guias("AddNewInline.tsx");
const sidebar = read("components", "Sidebar.tsx");
const flotante = read("components", "ui", "DesplegableFlotante.tsx");

describe("El cuerpo de la página no puede scrollear de lado en 390px", () => {
  it("la tabla de envíos existe SOLO desde lg — en el iPhone es una tarjeta", () => {
    expect(form).toMatch(/<div data-layout="tabla" className="hidden lg:block">/);
    expect(form).toMatch(/<div data-layout="tarjetas" className="lg:hidden/);
  });

  it("ya no hay una tabla de 800px de ancho mínimo", () => {
    // (El 800 sigue NOMBRADO en el comentario de cabecera, que cuenta la
    //  historia; lo que no puede volver es en el componente.)
    expect(form).not.toMatch(/<ScrollableTable minWidth=\{800\}/);
    expect(form).toMatch(/<ScrollableTable minWidth=\{720\}/);
  });

  it("el ScrollableTable que queda vive dentro del bloque de escritorio", () => {
    const i = form.indexOf('<div data-layout="tabla" className="hidden lg:block">');
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
    expect(base).toContain("md:[@media(pointer:fine)]:min-h-0");
    // text-base = 16px: por debajo, Safari hace zoom al enfocar.
    expect(base).toContain("text-base");
    expect(base).toContain("md:text-sm");
  });

  it("el alto denso NO se suelta por ancho a secas: eso dejaba el iPad en 34px", () => {
    const base = form.match(/const CTRL_BASE =\s*([\s\S]*?);/)?.[1] ?? "";
    // `md:min-h-0` / `md:py-1.5` sin guardia de puntero es exactamente lo que
    // hacía que un iPad —768 a 1366 px, todo con el dedo— cayera en densidad de
    // escritorio. La guardia (pointer:fine) = hay mouse.
    expect(base).not.toMatch(/(^|\s)md:min-h-0(\s|"|$)/);
    expect(base).not.toMatch(/(^|\s)md:py-1\.5(\s|"|$)/);
    expect(base).toContain("md:[@media(pointer:fine)]:py-1.5");
  });

  it("las clases van escritas completas: Tailwind no ve una interpolación", () => {
    // Un `${VARIANTE}py-1.5` compila en TS pero Tailwind escanea TEXTO: la clase
    // no se generaría nunca y el campo quedaría en 44 también con mouse.
    const base = form.match(/const CTRL_BASE =\s*([\s\S]*?);/)?.[1] ?? "";
    expect(base).not.toContain("${");
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

/**
 * iPad (jul-2026). El corte tarjeta/tabla vivía en `md:` = 768 px, que es
 * EXACTAMENTE el ancho de un iPad vertical: el iPad caía del lado de la tabla, y
 * encima la barra lateral (fija desde `md:`) le comía 224 px.
 *
 * Medido en producción con emulación CDP, ANTES del arreglo:
 *   768×1024 → tabla · 224 px de arrastre horizontal dentro de la tabla · 16-22
 *              controles del formulario por debajo de 44 px
 *   834×1194 → tabla · 158 px de arrastre · 16-22 controles chicos
 *   1024/1194/1366 → tabla sin arrastre, pero 17-22 controles chicos
 * DESPUÉS: los 6 tamaños dan **0** controles del formulario por debajo de 44 y
 * **0** px de arrastre, con el cuerpo de la página sin scroll lateral en ninguno.
 * iPhone 390 y escritorio 1440 quedaron idénticos al píxel (0,00 % de diferencia).
 *
 * Acá se congela la ARITMÉTICA que produce ese resultado: jsdom no hace layout,
 * pero los cuatro números que deciden todo sí se pueden leer del fuente.
 */
describe("iPad · el corte tarjeta/tabla y el ancho que queda", () => {
  const LG = 1024; // breakpoint `lg` de Tailwind — corte tarjetas/tabla
  const BARRA_LATERAL = 224; // Sidebar `w-56`, fija desde `md:`
  const PADDING = 48; // contenedor del form: `px-6` (24 por lado) desde `sm:`
  const MIN_TABLA = 720; // ScrollableTable minWidth

  const IPADS = [
    { nombre: "iPad mini/10.2 vertical", w: 768, esperado: "tarjetas" },
    { nombre: "iPad mini/10.2 horizontal", w: 1024, esperado: "tabla" },
    { nombre: "iPad Air/Pro 11 vertical", w: 834, esperado: "tarjetas" },
    { nombre: "iPad Air/Pro 11 horizontal", w: 1194, esperado: "tabla" },
    { nombre: "iPad Pro 12.9 vertical", w: 1024, esperado: "tabla" },
    { nombre: "iPad Pro 12.9 horizontal", w: 1366, esperado: "tabla" },
  ] as const;

  it("los cuatro números salen del fuente, no de la memoria de nadie", () => {
    expect(form).toMatch(/<ScrollableTable minWidth=\{720\}/); // MIN_TABLA
    expect(form).toContain('className="max-w-6xl mx-auto px-4 sm:px-6 py-6"'); // PADDING
    expect(sidebar).toMatch(/const width = collapsed \? "w-16" : "w-56"/); // BARRA_LATERAL
    expect(sidebar).toContain("hidden md:flex fixed left-0"); // la barra existe desde md
  });

  for (const d of IPADS) {
    it(`${d.nombre} (${d.w}px) → ${d.esperado}`, () => {
      const layout = d.w >= LG ? "tabla" : "tarjetas";
      expect(layout).toBe(d.esperado);
      if (layout === "tabla") {
        // Con tabla, lo que queda tiene que dar para los 720 px: si no, vuelve
        // el arrastre horizontal que el #326 sacó del iPhone.
        expect(d.w - BARRA_LATERAL - PADDING).toBeGreaterThanOrEqual(MIN_TABLA);
      }
    });
  }

  it("en 768 y 834 la tabla NO cabría — por eso van a tarjetas", () => {
    for (const w of [768, 834]) {
      expect(w - BARRA_LATERAL - PADDING).toBeLessThan(MIN_TABLA);
    }
  });

  it("mover el corte de vuelta a `md:` volvería a romper el iPad vertical", () => {
    // 768 >= 768 → tabla en un ancho donde solo quedan 496 px útiles.
    expect(768 - BARRA_LATERAL - PADDING).toBe(496);
    expect(form).not.toContain('className="hidden md:block"');
    expect(form).not.toContain('className="md:hidden space-y-4"');
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

  /**
   * 30-jul-2026. El desplegable NO puede volver a ser hijo de la fila.
   *
   * La fila vive en un `ScrollableTable` = `overflow-x-auto`, y `overflow-x:
   * auto` con `overflow-y: visible` computa `overflow-y: auto`: recorta y se
   * vuelve scrolleable. Medido a 1440×900 con la lista `absolute` adentro:
   * `scrollHeight` 114 → 397 (283 px scrolleables) y 76 de los 81 px de la
   * lista recortados. Al scrollear, la fila se iba de y=612 a y=329 y en el
   * hueco quedaba un pedazo de la lista encima de DIRECCIÓN/EMPRESA/FACTURA(S).
   * Eso es lo que Daniel fotografió: *"se esconde… es problema mas de ux"*.
   */
  // 📌 Desde el 30-jul-2026 el MECANISMO de flotar no vive en ClientePicker: se
  // extrajo a `components/ui/DesplegableFlotante`, que comparten los seis
  // desplegables del sistema. Por eso el candado se parte en dos: que el
  // selector lo USE, y que el compartido siga haciendo lo que hay que hacer.
  it("la lista FLOTA en un portal — un `absolute` adentro vuelve a romper la fila", () => {
    expect(picker).toContain("DesplegableFlotante");
    expect(flotante).toContain("createPortal");
    expect(flotante).toContain("document.body");
    // Ni un `absolute` en la caja de la lista: el chip del código sí lo usa (y
    // no crece), pero el desplegable no puede.
    expect(picker).not.toMatch(/className="absolute z-30 left-0 right-0/);
    expect(flotante).toMatch(/position: "fixed"/);
  });

  it("la posición sale del módulo puro, no de números sueltos en el componente", () => {
    expect(flotante).toContain("calcularPosicionDesplegable");
    // Reancla al scrollear con `capture`: el scroll del ScrollableTable no
    // burbujea, así que sin capture la lista quedaría flotando en el aire.
    expect(flotante).toMatch(/addEventListener\("scroll", reubicar, true\)/);
  });

  it("el click de afuera mira TAMBIÉN el portal, o el primer toque cerraría", () => {
    expect(flotante).toContain("panelRef.current?.contains");
    expect(flotante).toContain("anclaRef.current?.contains");
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
