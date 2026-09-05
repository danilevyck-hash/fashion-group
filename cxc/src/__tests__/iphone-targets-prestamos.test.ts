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
// `MovimientoModal.tsx` (las 6 tarjetas para 5 conceptos) se retiró el
// 5-sep-2026: hay TRES conceptos y el formulario vive en NuevoMovimientoModal.
const movModal = read("app", "prestamos", "components", "NuevoMovimientoModal.tsx");
const elegirPersona = read("app", "prestamos", "components", "ElegirPersonaModal.tsx");
const aprobaciones = read("app", "prestamos", "aprobaciones", "page.tsx");
const editEmp = read("app", "prestamos", "components", "EditEmpleadoModal.tsx");
const editMov = read("app", "prestamos", "components", "EditMovimientoModal.tsx");
const confirms = read("app", "prestamos", "components", "ConfirmModals.tsx");

const TODOS: Record<string, string> = {
  "PrestamosClient.tsx": lista,
  "[id]/page.tsx": detalle,
  "EmpleadoHeader.tsx": header,
  "MovimientoTable.tsx": tabla,
  "DangerZone.tsx": danger,
  "NuevoMovimientoModal.tsx": movModal,
  "ElegirPersonaModal.tsx": elegirPersona,
  "aprobaciones/page.tsx": aprobaciones,
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

  it('⛔ "Ver archivados" no vuelve — la bandera `activo` se retiró', () => {
    // 🩸 Este caso protegía el target de la casilla «Ver archivados». La casilla
    // se fue el 5-sep-2026 con la bandera que filtraba: `activo` nunca significó
    // «trabaja acá» sino «tiene algo abierto» —a ESMER CRUZ le archivaron la
    // ficha al terminar de pagar sus $600 y sigue trabajando—, y el saldo ya
    // dice eso. La lista muestra SOLO a quien debe.
    //
    // ⚠️ El candado cambia de dirección, no se afloja: si alguien devuelve la
    // casilla, tiene que devolverla con la <label> de 44 px y el cuadradito en
    // 18 (que es lo que se midió: medía 13×13).
    expect(lista).not.toContain("Ver archivados");
    expect(lista).not.toContain("showArchived");
    expect(lista).not.toContain("archivados=");
  });
});

describe("Préstamos · el barrido del resto del módulo", () => {
  // 🔴 Los dos casos de la LISTA DE APROBACIÓN se retiraron el 27-ago-2026 con
  // la pantalla que vigilaban. Daniel: «quita poder aprobar prestamos, todos
  // deben de pasar». Protegían los checkboxes y los botones «Aprobar» /
  // «Aprobar todos» de esa lista; hoy no existe ninguno de los cinco.
  //
  // ⚠️ No se aflojó nada: lo que sigue vivo del módulo se mide igual, y el
  // barrido de abajo pone el build ROJO si la lista vuelve sin sus 44 px.
  /**
   * 🔴 EL CANDADO CAMBIA DE DIRECCIÓN, NO SE AFLOJA (5-sep-2026).
   *
   * Hasta hoy este caso decía: «`pendiente_aprobacion` no puede reaparecer».
   * Era correcto para lo que existía —la lista de aprobación de préstamos por
   * MONTO, retirada el 27-ago porque **escondía plata**: los $700 de LUIS
   * ADRIAN ARROYO estuvieron 22 días con el saldo mostrando $0—.
   *
   * La aprobación volvió, pero para OTRA COSA: **el tope de un sueldo mensual**,
   * que es una decisión de negocio de Daniel, no un umbral de monto. Y volvió
   * con la condición que faltaba la primera vez: **lo que espera SE VE**.
   *
   * Por eso este caso ahora exige LAS DOS cosas a la vez, y sigue poniendo el
   * build rojo si vuelve la lista de lote (que es lo que de verdad escondía):
   *
   *   1. la lista de aprobación por LOTE no vuelve («Aprobar todos», casillas);
   *   2. lo pendiente NO suma al saldo (`calcularSaldoPrestamo` filtra por
   *      `estado === "aprobado"`, y hay candado propio en prestamos-tope);
   *   3. y SE VE: la ficha lo dice, la lista lo dice y hay pantalla propia.
   */
  it("⛔ la lista de aprobación por LOTE no vuelve", () => {
    for (const marca of ["Aprobar todos", "selectedPending", "doBatchAction"]) {
      expect(lista, `«${marca}» reapareció en Préstamos`).not.toContain(marca);
    }
  });

  it("🔴 lo que ESPERA APROBACIÓN se ve en las tres superficies", () => {
    // En la lista: el total, con su explicación de que no suma.
    expect(lista).toContain("Esperando aprobación");
    expect(lista).toContain("no suma al saldo hasta que Daniel lo apruebe");
    // En la ficha: el movimiento resaltado, con desde cuándo espera — en las
    // DOS vistas (tarjeta y tabla), como todo dato de esta pantalla desde el
    // rediseño de iPad. Con una sola, el iPhone se queda sin saberlo.
    // (3 apariciones: la tarjeta, la tabla y el comentario que explica por qué
    // no vuelve a una pestaña.)
    expect((tabla.match(/Esperando a Daniel/g) ?? []).length).toBe(3);
    expect((tabla.match(/desdeCuandoEspera\(m\.fecha, hoy\)/g) ?? []).length).toBe(2);
    // Y su pantalla propia, con los dos botones.
    expect(aprobaciones).toContain("Aprobar");
    expect(aprobaciones).toContain("Rechazar");
  });

  it("🔴 quien NO puede decidir lo ve igual, en gris — no se le esconde", () => {
    expect(aprobaciones).toContain("puedeDecidir");
    expect(aprobaciones).toContain("Esto lo aprueba Daniel. Aquí se ve, pero no se puede tocar.");
    // Los botones se APAGAN, no desaparecen.
    expect(aprobaciones).toMatch(/disabled=\{!puedeDecidir \|\| ocupado === p\.id\}/);
  });

  it("detalle · Pago Quincenal y + Nuevo Movimiento llegan a 44 (medían 37)", () => {
    expect(detalle).not.toMatch(/px-5 py-2 rounded-md text-sm/);
    expect((detalle.match(/min-h-\[44px\]/g) ?? []).length).toBe(2);
  });

  it("EmpleadoHeader · Editar y ← Colaboradores llegan a 44 (medían 39)", () => {
    // Eran 5 botones: Editar · Archivar (activo) · Archivar (apagado) ·
    // Reactivar · ← Colaboradores. «Archivar»/«Reactivar» se fueron con la
    // bandera `activo` el 5-sep-2026 y quedan 2. Los dos siguen midiendo 44.
    expect(header).not.toContain("px-4 py-2 rounded-md text-sm");
    expect((header.match(/min-h-\[44px\]/g) ?? []).length).toBe(2);
    expect(header).not.toContain("Archivar");
    expect(header).not.toContain("Reactivar");
  });

  it("MovimientoTable · los iconos de editar/eliminar llegan a 44", () => {
    // ⚠️ Las pestañas de estado y el botón «Aprobar» se fueron el 5-sep-2026
    // (ver `ipad-caja-prestamos-cheques.test.ts`). Lo que se sigue midiendo son
    // los iconos, que son los que medían 26×26.
    // los iconos de editar/eliminar medían 26×26 con p-1.5
    expect(tabla).not.toContain('className="p-1.5 hover:bg-blue-50');
    expect(tabla).not.toContain('className="p-1.5 hover:bg-red-50');
    // 4 y no 2: el mismo par (editar/eliminar) aparece en la TARJETA y en la
    // TABLA desde que la ficha pasó a tarjetas por debajo de 1024 px. Lo que
    // congela el candado es que ninguno vuelva a medir menos de 44.
    expect((tabla.match(/inline-flex h-11 w-11 items-center justify-center/g) ?? []).length).toBe(4);
  });

  it("DangerZone · el toggle (medía 18) y los 2 botones rojos llegan a 44", () => {
    // Eran 3: «Forzar Archivado» se fue con la bandera `activo` (5-sep-2026).
    expect(danger).toMatch(/flex min-h-\[44px\] items-center gap-2 text-xs text-gray-400/);
    expect(danger).not.toContain("px-4 py-2 bg-red-600");
    expect((danger.match(/px-4 min-h-\[44px\] bg-red-600/g) ?? []).length).toBe(2);
    expect(danger).not.toContain("Forzar Archivado");
  });

  it("NuevoMovimientoModal · los 3 conceptos y las píldoras llegan a 44", () => {
    // 🩸 La flecha «atrás» de 16×16 se fue con el modal de dos pasos: el
    // formulario es UNO solo (tres conceptos, no seis tarjetas para cinco).
    expect(movModal).not.toContain('className="text-gray-400 hover:text-black transition"');
    // Los tres conceptos, las dos cuentas de «Baja de» y los cinco orígenes.
    expect((movModal.match(/min-h-\[44px\]/g) ?? []).length).toBeGreaterThanOrEqual(6);
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
  /**
   * EL LAYOUT DEL PR #301 SIGUE INTACTO. Lo único que cambió es el ANCHO en el
   * que arranca la vista de escritorio: `sm` (640) → `lg` (1024).
   *
   * 🩸 POR QUÉ CAMBIÓ EL NÚMERO. El corte estaba DESALINEADO con la barra
   * lateral: las columnas de progreso (w-36) y chip-quincena (w-24) se
   * encendían en `sm` = 640 px, pero la barra lateral entra en `md` = 768 y se
   * lleva **224 px** (`md:ml-56` en `SidebarAwareMain`). Entre 768 y 1023 pasan
   * las dos cosas a la vez —240 px de columnas nuevas Y 224 px menos de
   * ancho— y el nombre, que es lo único elástico de la fila, paga la cuenta.
   *
   * MEDIDO en el navegador contra el build de producción, con los 12 nombres
   * REALES de la base (`scripts/_medir-prestamos-nombre.mjs`):
   *
   *              390     834     1024    1440
   *   antes       0      11/12     0       0     ← "MARIA BETHANCOURTH" perdía
   *   después     0        0       0       0        79 px: pedía 184 y le
   *                                                 caían 105
   *
   * El nombre más largo de la base pide 184 px y a 834 ahora le caben 382.
   * A 1024 y 1440 nada cambió: ahí el corte ya estaba encendido y el nombre
   * entraba con 300 px y 652 px de espacio. **El escritorio no se tocó.**
   *
   * EL `truncate` SE QUEDA, y no es contradictorio: es el mecanismo correcto
   * para un nombre que no entra. Lo que estaba mal era que NO entrara.
   */
  it("la fila sigue con los chips en la línea 2 en mobile y iPad (PR #301)", () => {
    // el chip de quincena y los badges bajan junto a la empresa en <lg
    expect(lista).toMatch(/<div className="flex shrink-0 items-center gap-1\.5 lg:hidden">\{badges\}\{chipQuincena\}<\/div>/);
    // y en desktop siguen en su columna propia de w-24
    expect(lista).toMatch(/<div className="hidden shrink-0 text-center lg:block lg:w-24">/);
    // el nombre conserva flex-1 + truncate en su propia línea
    expect(lista).toMatch(/<span data-empleado-campo="nombre" className="font-medium truncate tracking-tight">\{emp\.nombre\}<\/span>/);
    // los badges de la línea 1 acompañan el mismo corte
    expect(lista).toMatch(/<div className="hidden shrink-0 items-center gap-2 lg:flex">\{badges\}<\/div>/);
    // y la columna de progreso también
    expect(lista).toMatch(/<div className="hidden lg:flex items-center gap-2 w-36 shrink-0">/);
  });

  it("ninguna columna de la fila vuelve a encenderse en `sm` — es el bug, no un detalle", () => {
    // Devolver cualquiera de las 4 a `sm` reabre la banda 768-1023 donde la
    // barra lateral ya se llevó 224 px y las columnas todavía no caben.
    expect(lista).not.toContain('gap-1.5 sm:hidden">{badges}{chipQuincena}');
    expect(lista).not.toContain('text-center sm:block sm:w-24');
    expect(lista).not.toContain('items-center gap-2 sm:flex">{badges}');
    expect(lista).not.toContain('hidden sm:flex items-center gap-2 w-36 shrink-0');
  });

  it("el nombre se puede localizar por un `data-` fijo, no por su clase de breakpoint", () => {
    // 🩸 Un verificador que busque el nombre por `.sm\\:hidden` devuelve VACÍO
    // en cuanto el corte se mueve, y comparar dos listas vacías PASA. El
    // `data-empleado-campo` no depende de ningún breakpoint.
    expect(lista).toContain("data-empleado-fila={emp.id}");
    expect(lista).toContain('data-empleado-campo="nombre"');
  });

  it("ninguna letra del módulo baja de 12px", () => {
    for (const [nombre, código] of Object.entries(TODOS)) {
      const hits = código.match(/text-\[(\d+(?:\.\d+)?)px\]/g) ?? [];
      const ofensores = hits.filter((h) => parseFloat(h.replace(/[^\d.]/g, "")) < 12);
      expect(ofensores, nombre).toEqual([]);
    }
  });
});
