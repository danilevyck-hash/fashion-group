/**
 * Candados de adaptación a iPhone / iPad de **Caja Menuda**, **Préstamos** y
 * **Cheques**.
 *
 * 🩸 POR QUÉ EXISTE. Regla de Daniel: *"cada módulo tiene que adaptarse a
 * iphone, y ipad"*. Tres de estas cuatro pantallas estaban rotas **SOLO en el
 * iPad**: en celular ya usaban tarjetas y en escritorio la tabla entraba, así
 * que nadie las miraba en el medio. La causa es aritmética y es la misma en las
 * cuatro: la barra lateral aparece en `md` (768 px) y se lleva **224 px**
 * (`md:ml-56` en `SidebarAwareMain`), justo en el mismo breakpoint en el que
 * estas pantallas encendían su tabla de escritorio. Un iPad de 834 px deja
 * ~562 px útiles — **más angosto que un iPhone acostado**.
 *
 * Medido en el navegador contra el build de producción, ANTES:
 *
 *   Préstamos › ficha        366 px de arrastre @390 · 178 @834   (fuera MONTO y SALDO)
 *   Caja › Períodos          384 px @834                          (fuera FONDO/GASTADO/SALDO)
 *   Cheques › Lista          206 px @834                          (fuera ESTADO y el menú ⋯)
 *   Caja › Detalle           327 px @390 · 164 @834               (fuera CATEGORÍA y TOTAL)
 *
 * ⚠️ **EL CORTE NO ES EL MISMO EN LAS CUATRO, Y ESO ES DELIBERADO.** Correr el
 * breakpoint "al siguiente" es la respuesta obvia y en dos casos NO alcanza:
 *
 *   · `Caja › Períodos` → **xl (1280)**. Sus 8 columnas piden ~744 px con el
 *     relleno mínimo y un iPad HORIZONTAL de 1024 deja 728 px útiles: con `lg`
 *     el problema seguía vivo, 16 px.
 *   · `Cheques › Lista` → **xl (1280)**. A 1024 reaparece la columna "N° Cheque"
 *     (`lg:table-cell`) y la tabla pide ~848 px contra 752 útiles.
 *   · `Préstamos › ficha` y `Caja › Detalle` → **lg (1024)**, donde sus tablas
 *     SÍ entran (740 y 702 px contra 752 y 728 útiles).
 *
 * 🩸 **LA TRAMPA QUE ESTE ARCHIVO EVITA.** Un verificador que busque los datos
 * por su clase de breakpoint (`.md\:hidden`) devuelve VACÍO en cuanto alguien
 * mueve el corte, y el chequeo **pasa sin haber comparado nada**. Por eso la
 * tarjeta y la fila de tabla llevan atributos `data-*` ESTABLES
 * (`data-<modulo>-fila` / `data-<modulo>-campo`), que no dependen de ningún
 * breakpoint, y lo que se congela acá es que existan en las DOS vistas.
 *
 * Son assertions sobre el fuente a propósito: jsdom no calcula layout, así que
 * no puede medir un getBoundingClientRect. Se congela la CAUSA, no la medición.
 * La medición real vive en `scripts/_medir-caja-prestamos-cheques.mjs`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(src, ...p), "utf8");

const movimientos = read("app", "prestamos", "components", "MovimientoTable.tsx");
const periodos = read("app", "caja", "components", "PeriodoList.tsx");
const gastos = read("app", "caja", "components", "GastoTable.tsx");
// 5-sep-2026: la pantalla pasó a `/recordatorios` y la lista salió a su propia
// pieza. La fila de un cheque vive acá.
const cheques = read("app", "recordatorios", "components", "AgendaLista.tsx");
const calendario = read("app", "recordatorios", "components", "CalendarioMes.tsx");
const gastoForm = read("app", "caja", "components", "GastoForm.tsx");

const veces = (t: string, re: RegExp) => (t.match(re) ?? []).length;

describe("El corte tarjetas/tabla queda POR ENCIMA del ancho que la barra lateral deja libre", () => {
  it("Préstamos › ficha: tarjetas hasta lg, tabla desde lg (antes: tabla desde 0, 366 px @390)", () => {
    expect(movimientos).toMatch(/className="lg:hidden space-y-2"/);
    expect(movimientos).toMatch(/className="hidden lg:block overflow-x-auto"/);
    // el envoltorio viejo sangraba la tabla a pantalla completa en celular
    expect(movimientos).not.toContain('className="overflow-x-auto -mx-4 sm:mx-0"');
  });

  it("Caja › Períodos: el corte es xl y NO lg — a 1024 la tabla no entra", () => {
    expect(periodos).toMatch(/className="xl:hidden space-y-3"/);
    expect(periodos).toMatch(/className="hidden xl:block overflow-x-auto"/);
    expect(periodos).not.toContain('className="md:hidden space-y-3"');
    expect(periodos).not.toContain('className="hidden md:block overflow-x-auto"');
  });

  /**
   * 🩸 CAMBIÓ DE DIRECCIÓN EL 5-SEP-2026.
   *
   * LO QUE MEDÍA ANTES: que el corte tarjetas/tabla de Cheques fuera `xl` y no
   * `sm`, porque a 834 px (iPad con la barra lateral) la tabla pedía 768 contra
   * 562 útiles y lo que se salía de la pantalla eran ESTADO y el menú ⋯.
   *
   * POR QUÉ YA NO: **la tabla desapareció.** Con la lista única del rediseño no
   * hay dos presentaciones que cortar — hay UNA, en tarjetas, igual en el
   * celular, en el iPad y en el escritorio. El problema no se movió de
   * breakpoint: se quedó sin causa.
   *
   * LO QUE MIDE AHORA: que la tabla no vuelva. Una tabla de 8 columnas es
   * exactamente lo que arrastraba la página de lado.
   */
  it("Recordatorios › Lista: UNA sola presentación — la tabla no vuelve", () => {
    expect(cheques).not.toContain("<table");
    expect(cheques).not.toContain("overflow-x-auto");
    expect(cheques).not.toContain("xl:hidden");
    expect(cheques).not.toContain("hidden xl:block");
  });

  it("Caja › Detalle: tarjetas hasta lg, tabla desde lg", () => {
    expect(gastos).toMatch(/className="lg:hidden space-y-3"/);
    expect(gastos).toMatch(/className="hidden lg:block overflow-hidden"/);
    expect(gastos).not.toContain('className="md:hidden space-y-3"');
    expect(gastos).not.toContain('className="hidden md:block overflow-hidden"');
  });
});

describe("Los mismos datos en las dos vistas, marcados con `data-` estables (no por clase de breakpoint)", () => {
  it("Préstamos: fila + fecha/concepto/notas/monto/saldo/espera, en tarjeta Y en tabla", () => {
    expect(veces(movimientos, /data-mov-fila=/g)).toBe(2);
    // ⚠️ `estado` se fue el 5-sep-2026 con las 4 pestañas: con 443 filas de 443
    // en `aprobado` la columna nunca se pintaba. Lo reemplaza `espera`, que es
    // el dato que SÍ hay que ver — «Esperando a Daniel · hace N días» —, y por
    // eso viaja en las DOS vistas igual que los demás.
    for (const campo of ["fecha", "concepto", "notas", "monto", "saldo", "espera"]) {
      expect(veces(movimientos, new RegExp(`data-mov-campo="${campo}"`, "g"))).toBe(2);
    }
    expect(veces(movimientos, /data-mov-campo="estado"/g)).toBe(0);
  });

  it("Caja › Períodos: fila + fondo/gastado/saldo, en tarjeta Y en tabla", () => {
    expect(veces(periodos, /data-periodo-fila=/g)).toBe(2);
    for (const campo of ["fondo", "gastado", "saldo"]) {
      expect(veces(periodos, new RegExp(`data-periodo-campo="${campo}"`, "g"))).toBe(2);
    }
  });

  it("Caja › Detalle: fila + descripción/categoría/total, en tarjeta Y en tabla", () => {
    expect(veces(gastos, /data-gasto-fila=/g)).toBe(2);
    for (const campo of ["descripcion", "categoria", "total"]) {
      expect(veces(gastos, new RegExp(`data-gasto-campo="${campo}"`, "g"))).toBe(2);
    }
  });

  /**
   * 🩸 CAMBIÓ DE DIRECCIÓN EL 5-SEP-2026, por lo mismo que el bloque de arriba:
   * ya no hay DOS vistas que comparar, hay UNA. Las marcas `data-*` se quedan —
   * son lo que buscan los candados de conducta — pero ahora tienen que aparecer
   * UNA vez, no dos. Que aparezcan CERO veces seguiría siendo un rojo, que es
   * lo que este bloque siempre vino a evitar.
   *
   * El menú ⋯ (`ChequeMoreMenu`) se retiró con las pestañas: las acciones de la
   * fila —depositar, rebotado, re-depositar— están a la vista, y «Eliminar» vive
   * en el detalle del cheque, que es donde Daniel lo usa para el que no se va a
   * cobrar («no lo quiero marcar», se borra).
   */
  it("Recordatorios: la fila del cheque conserva cliente/monto/estado, marcados", () => {
    expect(veces(cheques, /data-cheque-fila=/g)).toBe(1);
    for (const campo of ["cliente", "monto", "estado"]) {
      expect(veces(cheques, new RegExp(`data-cheque-campo="${campo}"`, "g"))).toBe(1);
    }
  });

  it("y la fila del RECORDATORIO también está marcada (es la mitad nueva de la lista)", () => {
    expect(veces(cheques, /data-recordatorio-fila=/g)).toBe(1);
    for (const campo of ["texto", "fecha"]) {
      expect(veces(cheques, new RegExp(`data-recordatorio-campo="${campo}"`, "g"))).toBe(1);
    }
  });
});

describe("Textos que se cortaban", () => {
  it("La nota del movimiento se ENVUELVE — se cortaba en los 3 anchos (942 px a 1440)", () => {
    expect(movimientos).not.toContain('max-w-[200px] truncate');
    expect(movimientos).toContain('max-w-[200px] break-words');
    // en la tarjeta va completa, en su propio renglón (con la cuenta y el
    // origen del pago delante: siguen siendo texto que se envuelve, no columnas)
    expect(movimientos).toMatch(/<p className="text-xs text-gray-500 mt-2 break-words" data-mov-campo="notas">/);
  });

  it("La píldora del calendario pone el MONTO en su propio renglón (perdía 121 px @834)", () => {
    // el nombre y el monto ya no comparten el mismo `truncate`
    expect(calendario).not.toContain('cheque.cliente.slice(0, 12)');
    expect(calendario).toMatch(/<span className="block tabular-nums font-medium">\$\{fmt\(cheque\.monto\)\}<\/span>/);
  });
});

describe("Nada que se toque por debajo de 44 px", () => {
  it("Los campos del formulario de gasto miden 44 (medían 36) — eran 13 targets chicos", () => {
    expect(gastoForm).not.toContain("height: 36,");
    expect(veces(gastoForm, /height: 44,/g)).toBe(3);
  });

  it("Ningún botón de Caja se quedó en h-9 (36 px)", () => {
    for (const t of [periodos, gastos, gastoForm]) {
      expect(t).not.toMatch(/\bh-9 rounded-md/);
    }
  });

  it("Los chips de categoría llegan a 44 y se ENVUELVEN en vez de arrastrarse", () => {
    expect(gastos).toMatch(/inline-flex min-h-\[44px\] items-center gap-2 whitespace-nowrap px-3 rounded-full/);
    expect(gastos).toMatch(/className="flex flex-wrap gap-2 pb-2 mb-3\.5"/);
    expect(gastos).not.toContain("snap-x snap-mandatory");
  });

  it("⛔ las 4 pestañas de estado de Préstamos NO vuelven — y si vuelven, vuelven medidas", () => {
    // 🩸 Se fueron el 5-sep-2026 con el botón «Aprobar» que las acompañaba: con
    // 443 filas de 443 en `aprobado` decían siempre `443 · 0 · 0`. Lo que
    // espera aprobación va RESALTADO EN LA MISMA LISTA, no detrás de un filtro
    // que nadie toca — que es exactamente cómo los $700 de Luis Arroyo pasaron
    // 22 días invisibles.
    //
    // ⚠️ Este candado cambió de dirección, no se aflojó: si alguien devuelve
    // las pestañas, tiene que devolverlas con `flex-wrap` (perdían 89 px @390)
    // y sin `overflow-x-auto`.
    // ⚠️ Se busca el MECANISMO, no la palabra: «Rechazados» aparece en el
    // comentario que explica por qué se fueron, y un barrido sobre el texto
    // entero se engañaría solo con su propia documentación.
    expect(movimientos).not.toContain("FiltroEstado");
    expect(movimientos).not.toContain("setFiltro");
    expect(movimientos).not.toContain("max-w-md overflow-x-auto");
    if (movimientos.includes("bg-gray-100 rounded-lg p-0.5 mb-4 max-w-md")) {
      expect(movimientos).toMatch(/className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-0\.5 mb-4 max-w-md"/);
    }
  });

  it("Los 2 botones del calendario en celular llegan a 44 (medían 119×26 y 59×26)", () => {
    // 4 = los 2 del globo de escritorio + los 2 de la lista de celular. Viven
    // en `CalendarioMes.tsx` desde el 5-sep-2026, con el mismo código.
    expect(veces(calendario, /hover:underline min-h-\[44px\] inline-flex items-center/g)).toBe(4);
  });
});
