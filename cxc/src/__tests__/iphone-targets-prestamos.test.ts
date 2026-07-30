/**
 * Candados de targets táctiles del módulo **Préstamos** (iPhone 390×844, dsf 3).
 *
 * Regla de la casa: **44×44 px mínimo al tacto**. Los PRs #298 y #301 tocaron
 * otras cosas del módulo y estos controles quedaron preexistentes por debajo.
 * Medido en browser real con emulación por CDP (no leyendo el código):
 *
 *   Aplicar quincena      41 px
 *   + Nuevo préstamo      41 px
 *   Buscador              38 px
 *   Selector de empresa   39 px
 *   Ver archivados      13×13 px  ← el peor
 *
 * El barrido del módulo entero encontró además: los chips de estado de la tabla
 * de movimientos (34), los iconos de editar/eliminar (26×26), la flecha "atrás"
 * del modal de movimiento (16×16), el toggle de la Zona peligrosa (18), y todos
 * los Cancelar/Guardar e inputs de los 6 modales (36-40).
 *
 * **El checkbox no se agranda: se agranda su ETIQUETA.** Un cuadradito de 44px
 * se ve mal; lo que tiene que medir 44×44 es el área que recibe el dedo. Como
 * el `<input>` vive DENTRO de la `<label>`, tocar el texto ya activa el
 * checkbox (comportamiento nativo) — verificado con un tap real sobre el texto.
 *
 * Son assertions sobre el fuente a propósito: jsdom no calcula layout, así que
 * no puede medir un getBoundingClientRect. Se congela la CAUSA, no la medición.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(src, ...p), "utf8");

const lista = read("app", "prestamos", "PrestamosClient.tsx");
const detalle = read("app", "prestamos", "[id]", "page.tsx");
const header = read("app", "prestamos", "components", "EmpleadoHeader.tsx");
const tabla = read("app", "prestamos", "components", "MovimientoTable.tsx");
const danger = read("app", "prestamos", "components", "DangerZone.tsx");
const movModal = read("app", "prestamos", "components", "MovimientoModal.tsx");
const editEmp = read("app", "prestamos", "components", "EditEmpleadoModal.tsx");
const editMov = read("app", "prestamos", "components", "EditMovimientoModal.tsx");
const confirms = read("app", "prestamos", "components", "ConfirmModals.tsx");

const TODOS: Record<string, string> = {
  "PrestamosClient.tsx": lista,
  "[id]/page.tsx": detalle,
  "EmpleadoHeader.tsx": header,
  "MovimientoTable.tsx": tabla,
  "DangerZone.tsx": danger,
  "MovimientoModal.tsx": movModal,
  "EditEmpleadoModal.tsx": editEmp,
  "EditMovimientoModal.tsx": editMov,
  "ConfirmModals.tsx": confirms,
};

describe("Préstamos · los 5 controles medidos por debajo de 44", () => {
  it('"Aplicar quincena" llega a 44 (medía 41)', () => {
    const i = lista.indexOf("Aplicar quincena (");
    expect(i).toBeGreaterThan(-1);
    const bloque = lista.slice(i - 500, i);
    expect(bloque).toContain("min-h-[44px]");
    expect(bloque).not.toMatch(/px-5 py-2\.5 rounded-md text-sm font-medium hover:bg-emerald-700/);
  });

  it('"+ Nuevo préstamo" llega a 44 (medía 41)', () => {
    const i = lista.indexOf("+ Nuevo préstamo</button>");
    expect(i).toBeGreaterThan(-1);
    expect(lista.slice(i - 300, i)).toContain("min-h-[44px]");
    // el py-2.5 sm:py-2 de antes daba 41 en iPhone y 37 en desktop
    expect(lista).not.toContain("px-5 py-2.5 sm:py-2 rounded-md");
  });

  it("el buscador llega a 44 (medía 38)", () => {
    const i = lista.indexOf('placeholder="Buscar empleado..."');
    expect(i).toBeGreaterThan(-1);
    expect(lista.slice(i, i + 250)).toContain("min-h-[44px]");
  });

  it("el selector de empresa llega a 44 (medía 39)", () => {
    const i = lista.indexOf('<option value="all">Todas las empresas</option>');
    expect(i).toBeGreaterThan(-1);
    expect(lista.slice(i - 400, i)).toContain("min-h-[44px]");
  });

  it('"Ver archivados": el target de 44 lo pone la etiqueta, no el cuadradito', () => {
    // lastIndexOf: la primera aparición es el comentario que explica el patrón
    const i = lista.lastIndexOf("Ver archivados");
    expect(i).toBeGreaterThan(-1);
    const bloque = lista.slice(i - 500, i);
    // la <label> entera mide 44 de alto → tocar el texto activa el checkbox
    expect(bloque).toMatch(/<label className="flex min-h-\[44px\] items-center gap-2/);
    // y el checkbox NO se infló a 44: queda en 18, que se ve bien
    expect(bloque).toMatch(/type="checkbox"[^/]*className="h-\[18px\] w-\[18px\] accent-black"/);
    expect(bloque).not.toMatch(/type="checkbox"[^/]*className="accent-black"/);
  });
});

describe("Préstamos · el barrido del resto del módulo", () => {
  it("los checkboxes de la lista de aprobación van envueltos en un target de 44", () => {
    const labels = lista.match(/<label className="-ml-2\.5 flex min-h-\[44px\] min-w-\[44px\] cursor-pointer items-center justify-center px-2\.5">/g) ?? [];
    expect(labels.length).toBe(2); // "seleccionar todos" + el de cada fila
    // ningún checkbox suelto con el estilo viejo de 13×13 (accent-black a secas)
    expect(lista).not.toMatch(/type="checkbox"[^\n]*className="accent-black"/);
  });

  it("los botones de aprobación por lote llegan a 44 (medían ~29)", () => {
    expect(lista).not.toMatch(/text-xs bg-green-600 text-white px-4 py-1\.5/);
    expect(lista).not.toMatch(/text-red-500 hover:text-red-700 transition px-3 py-1\.5/);
    expect((lista.match(/min-h-\[44px\][^"]*text-xs bg-green-600/g) ?? []).length).toBe(2);
  });

  it("detalle · Pago Quincenal y + Nuevo Movimiento llegan a 44 (medían 37)", () => {
    expect(detalle).not.toMatch(/px-5 py-2 rounded-md text-sm/);
    expect((detalle.match(/min-h-\[44px\]/g) ?? []).length).toBe(2);
  });

  it("EmpleadoHeader · Editar / Archivar / Reactivar / ← Colaboradores llegan a 44 (medían 39)", () => {
    expect(header).not.toContain("px-4 py-2 rounded-md text-sm");
    expect((header.match(/min-h-\[44px\]/g) ?? []).length).toBe(5);
  });

  it("MovimientoTable · pestañas de estado, Aprobar e iconos llegan a 44", () => {
    expect(tabla).toMatch(/flex min-h-\[44px\] items-center gap-1\.5 px-3 text-sm rounded-md/);
    expect(tabla).toMatch(/min-h-\[44px\][^"]*text-xs bg-green-600 text-white px-3 rounded-md/);
    // los iconos de editar/eliminar medían 26×26 con p-1.5
    expect(tabla).not.toContain('className="p-1.5 hover:bg-blue-50');
    expect(tabla).not.toContain('className="p-1.5 hover:bg-red-50');
    // 4 y no 2: el mismo par (editar/eliminar) aparece en la TARJETA y en la
    // TABLA desde que la ficha pasó a tarjetas por debajo de 1024 px. Lo que
    // congela el candado es que ninguno vuelva a medir menos de 44.
    expect((tabla.match(/inline-flex h-11 w-11 items-center justify-center/g) ?? []).length).toBe(4);
  });

  it("DangerZone · el toggle (medía 18) y los 3 botones rojos llegan a 44", () => {
    expect(danger).toMatch(/flex min-h-\[44px\] items-center gap-2 text-xs text-gray-400/);
    expect(danger).not.toContain("px-4 py-2 bg-red-600");
    expect((danger.match(/px-4 min-h-\[44px\] bg-red-600/g) ?? []).length).toBe(3);
  });

  it('MovimientoModal · la flecha "atrás" deja de medir 16×16', () => {
    expect(movModal).not.toContain('className="text-gray-400 hover:text-black transition"');
    expect(movModal).toMatch(/inline-flex h-11 w-11 shrink-0 items-center justify-center/);
  });

  it("ningún modal del módulo conserva un Cancelar/Guardar de py-2 (medían 36-39)", () => {
    for (const [nombre, código] of Object.entries(TODOS)) {
      expect(código, nombre).not.toMatch(/className="flex-1 py-2 (border|bg-)/);
      expect(código, nombre).not.toMatch(/className="w-full py-2 border rounded-md/);
    }
  });

  it("ningún input/select del módulo conserva el borde inferior de py-2 sin min-h", () => {
    // los <textarea rows={2}> ya pasan de 44 solos: la regla aplica a
    // inputs y selects, que son los que quedaban en 36-40.
    for (const [nombre, código] of Object.entries(TODOS)) {
      const ofensores = código
        .split("\n")
        .filter((l) => /<(input|select)\b/.test(l) || /^\s*(type|value|onChange|placeholder|step|min)=/.test(l))
        .filter((l) => /className="w-full border-b border-gray-200 py-2 text-sm/.test(l));
      expect(ofensores, nombre).toEqual([]);
    }
  });
});

describe("Préstamos · lo que NO se puede romper", () => {
  it("la fila sigue con los chips en la línea 2 en mobile (PR #301)", () => {
    // el chip de quincena y los badges bajan junto a la empresa en <sm
    expect(lista).toMatch(/<div className="flex shrink-0 items-center gap-1\.5 sm:hidden">\{badges\}\{chipQuincena\}<\/div>/);
    // y en desktop siguen en su columna propia de w-24
    expect(lista).toMatch(/<div className="hidden shrink-0 text-center sm:block sm:w-24">/);
    // el nombre conserva flex-1 + truncate en su propia línea
    expect(lista).toMatch(/<span className="font-medium truncate tracking-tight">\{emp\.nombre\}<\/span>/);
  });

  it("ninguna letra del módulo baja de 12px", () => {
    for (const [nombre, código] of Object.entries(TODOS)) {
      const hits = código.match(/text-\[(\d+(?:\.\d+)?)px\]/g) ?? [];
      const ofensores = hits.filter((h) => parseFloat(h.replace(/[^\d.]/g, "")) < 12);
      expect(ofensores, nombre).toEqual([]);
    }
  });
});
