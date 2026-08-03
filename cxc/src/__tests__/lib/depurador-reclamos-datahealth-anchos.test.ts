// ─────────────────────────────────────────────────────────────────────────────
// Depurador, Reclamos y Data Health entran en iPhone y en iPad (30-jul-2026).
//
// 🩸 LO MEDIDO, navegador real, build y datos de producción. Px de arrastre
// horizontal (390 iPhone / 834 iPad vertical / 1024 iPad horizontal / 1440):
//
//   Pantalla                        390   834   1024  1440   qué se perdía
//   Depurador › barra de pestañas   295    75      0     0   3 de 6 pestañas
//   Depurador › Historial           437   217     27     0   75 filas
//   Data Health › Panel             448   228     38     0   1 de 5 columnas; mapa 7/31 días
//   Reclamos › Detalle              310   138      8     8   PRECIO, SUBTOTAL, MOTIVO, FACTURA, PO
//   Reclamos › Por empresa            0   107      0     0   columna ACCIONES
//   Guías › Imprimir                158     0      0     0   —
//
// DESPUÉS: 0 en los cuatro anchos, en todas — salvo Guías › Imprimir a 390,
// que se deja a propósito (ver abajo).
//
// 🔑 EL ANCHO QUE DECIDE ES EL ÚTIL, NO EL DE LA VENTANA. La barra lateral se
// lleva ~224px, así que un iPad de 834 deja ~562: más angosto que un iPhone
// acostado. Por eso el corte es `lg` (1024) y no `sm`/`md`.
//
// ⚠️ **EL CORTE NO TIENE POR QUÉ SER EL MISMO EN TODAS.** Se mide pantalla por
// pantalla:
//   · Depurador › pestañas ..... `lg`: a 1024 la fila ya daba 0px sola.
//   · Reclamos (detalle y lista) `lg`: ídem.
//   · Depurador › Historial .... `lg` + relleno `px-1.5 xl:px-3`, porque a 1024
//     la tabla NO entraba sola (27px) y sí entra apretando el relleno.
//   · Data Health › mapa 30d ... NO es una tabla sino una CUADRÍCULA, y a 1024
//     todavía sobraban 38px. En vez de correr el corte, los puntos ENVUELVEN
//     (`flex-wrap`) hasta `xl`: 0px por construcción, en todos los anchos.
//
// Este archivo congela la CAUSA (jsdom no calcula layout, así que no puede
// medir un arrastre). La medición real vive en
// `scripts/_medir-depurador-reclamos-datahealth.mjs` (4 anchos, antes/después,
// con verificación de que ningún número cambió).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const CARGAR = "src/app/productos/cargar/page.tsx";
const HISTORIAL = "src/app/productos/cargar/HistorialView.tsx";
const FORMULAS = "src/app/productos/cargar/FormulasConfig.tsx";
const DATAHEALTH = "src/app/admin/data-health/page.tsx";
const RECLAMO_DETALLE = "src/app/reclamos/components/ReclamoDetail.tsx";
const EMPRESA_LIST = "src/app/reclamos/components/EmpresaList.tsx";
const GUIA_DETAIL = "src/app/guias/components/GuiaDetail.tsx";

describe("Depurador — las 6 pestañas son un desplegable en angosto", () => {
  it("usa el DesplegableFlotante de la casa, no un panel absolute a mano", () => {
    const src = leer(CARGAR);
    expect(src).toContain('from "@/components/ui/DesplegableFlotante"');
    expect(src).toContain("<DesplegableFlotante");
  });

  it("las 6 pestañas salen de UNA sola lista (desplegable y píldoras no pueden desincronizarse)", () => {
    const src = leer(CARGAR);
    const bloque = src.slice(src.indexOf("const PESTANAS"), src.indexOf("];", src.indexOf("const PESTANAS")));
    for (const label of ["Depurador", "Facturas Tienda", "Tallas", "Fórmulas por marca", "Reglas", "Historial"]) {
      expect(bloque).toContain(`label: "${label}"`);
    }
    // La fila de píldoras se dibuja MAPEANDO esa lista, no repitiendo el marcado.
    expect(src).toContain("PESTANAS.map");
  });

  it("el corte es lg: desplegable hasta 1024, fila de píldoras de 1024 para arriba", () => {
    const src = leer(CARGAR);
    expect(src).toContain('<div className="lg:hidden">');
    expect(src).toContain("hidden lg:flex w-full flex-nowrap overflow-x-auto");
    // El corte NO puede volver a sm/md: a 834 la fila no entra (75px medidos).
    expect(src).not.toContain("hidden sm:flex w-full flex-nowrap");
    expect(src).not.toContain("hidden md:flex w-full flex-nowrap");
  });

  it("el disparador y cada opción son de 44px", () => {
    const src = leer(CARGAR);
    const sel = src.slice(src.indexOf("function SelectorPestanas"));
    expect(sel.match(/min-h-\[44px\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("no se cambió ninguna etiqueta visible", () => {
    const src = leer(CARGAR);
    for (const label of ["Depurador", "Facturas Tienda", "Tallas", "Fórmulas por marca", "Reglas", "Historial"]) {
      expect(src).toContain(label);
    }
  });
});

describe("Depurador › Historial — tarjetas en angosto, tabla apretada a 1024", () => {
  it("tiene las dos vistas con marca FIJA (no una clase de breakpoint)", () => {
    const src = leer(HISTORIAL);
    expect(src).toContain('data-medir="depurador-historial"');
    expect(src).toContain('data-vista="tarjetas"');
    expect(src).toContain('data-vista="tabla"');
  });

  it("corte lg + relleno reducido hasta xl (a 1024 la tabla no entraba sola)", () => {
    const src = leer(HISTORIAL);
    expect(src).toContain("lg:hidden");
    expect(src).toContain("hidden lg:block");
    expect(src).toContain("px-1.5 xl:px-3");
  });
});

describe("Depurador › Fórmulas — era la peor pestaña en área táctil", () => {
  it("los campos de divisor y redondeo son de 44px, no de 28 (h-7)", () => {
    const src = leer(FORMULAS);
    const selCls = src.slice(src.indexOf("const selCls"), src.indexOf("\n", src.indexOf("const selCls")));
    const numCls = src.slice(src.indexOf("const numCls"), src.indexOf("\n", src.indexOf("const numCls")));
    expect(selCls).toContain("min-h-[44px]");
    expect(numCls).toContain("min-h-[44px]");
    expect(selCls).not.toContain("h-7 ");
    expect(numCls).not.toContain("h-7 ");
  });

  it("el botón de guardar de cada fila llega a 44 en los dos lados", () => {
    const src = leer(FORMULAS);
    const save = src.slice(src.indexOf("function SaveBtn"));
    expect(save).toContain("min-h-[44px]");
    expect(save).toContain("min-w-[44px]");
  });
});

describe("Data Health — tabla de checks y mapa de 30 días", () => {
  it("la tabla de checks tiene marca fija y corte lg", () => {
    const src = leer(DATAHEALTH);
    expect(src).toContain('data-medir="dh-checks"');
    expect(src).toContain("lg:hidden divide-y");
    expect(src).toContain("hidden lg:block overflow-x-auto");
  });

  it("el mapa de 30 días ENVUELVE hasta xl — no es una tabla, es una cuadrícula", () => {
    const src = leer(DATAHEALTH);
    expect(src).toContain("xl:hidden space-y-3");
    expect(src).toContain("hidden xl:block overflow-x-auto");
    // Los puntos bajan de renglón: 0px de arrastre por construcción.
    expect(src).toContain("flex flex-wrap gap-1");
  });

  it("la leyenda de severidad envuelve (la card la RECORTA: overflow-hidden sin scroller)", () => {
    const src = leer(DATAHEALTH);
    expect(src).toContain("flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs");
  });
});

describe("Reclamos › Detalle — PRECIO y SUBTOTAL dejan de quedar fuera", () => {
  it("los ítems tienen las dos vistas con marca fija", () => {
    const src = leer(RECLAMO_DETALLE);
    expect(src).toContain('data-medir="reclamo-items"');
    expect(src).toContain('data-vista="tarjetas"');
    expect(src).toContain('data-vista="tabla"');
    expect(src).toContain("ul className=\"lg:hidden space-y-2\"");
  });

  it("la tarjeta muestra las 10 columnas de la tabla, incluidas las que se perdían", () => {
    const src = leer(RECLAMO_DETALLE);
    const tarjetas = src.slice(src.indexOf('data-vista="tarjetas"'), src.indexOf('data-vista="tabla"'));
    for (const campo of ["Subtotal", "Cant.", "Precio", "Talla", "Género", "Motivo", "Factura", "PO"]) {
      expect(tarjetas).toContain(campo);
    }
    expect(tarjetas).toContain("item.referencia");
    expect(tarjetas).toContain("item.descripcion");
  });

  it("la fila de botones ya no lleva un scroller que no necesita (arrastraba 8px hasta en 1440)", () => {
    const src = leer(RECLAMO_DETALLE);
    expect(src).not.toContain("flex items-center gap-2 mb-6 flex-wrap overflow-x-auto");
    expect(src).toContain("flex items-center gap-2 mb-6 flex-wrap pb-1");
  });

  it("los 44px de los botones llegan hasta xl — el iPad HORIZONTAL también es táctil", () => {
    const src = leer(RECLAMO_DETALLE);
    expect(src).toContain("xl:min-h-0");
    expect(src).not.toContain("sm:min-h-0");
    expect(src).not.toContain("lg:min-h-0");
  });
});

describe("Reclamos › Por empresa — la columna ACCIONES entra en iPad", () => {
  it("el corte de tarjetas subió de sm a lg", () => {
    const src = leer(EMPRESA_LIST);
    expect(src).toContain('className="lg:hidden space-y-2 mb-4" data-vista="tarjetas"');
    expect(src).toContain('hidden lg:block" data-vista="tabla"');
    expect(src).not.toContain('className="sm:hidden space-y-2 mb-4"');
  });

  it("los íconos densos de la TABLA se quedan en 26px a propósito", () => {
    const src = leer(EMPRESA_LIST);
    // Darles 44px —o un ::after de 9px— ensancha la columna y devuelve 8px de
    // arrastre a 1024 y 1440. El escritorio no puede empeorar.
    expect(src).not.toContain("after:-inset-[9px]");
    expect(src).toContain("p-1.5 text-gray-400 hover:text-black rounded transition");
  });

  it("las píldoras de estado y los íconos de la TARJETA sí son de 44px", () => {
    const src = leer(EMPRESA_LIST);
    const tarjetas = src.slice(src.indexOf('data-vista="tarjetas"'), src.indexOf('data-vista="tabla"'));
    expect(tarjetas).toContain("min-h-[44px]");
    expect(src).toContain("inline-flex min-h-[44px] items-center justify-center text-xs px-3 rounded-full");
  });
});

describe("Guías › Imprimir — el arrastre deja de ser de la PÁGINA", () => {
  // 🩸 ACTUALIZADO: el marco se MUDÓ a `HojaEscalada` cuando Daniel eligió ver
  // la hoja entera y achicada en el celular. La garantía de este bloque no se
  // aflojó — se hizo más fuerte: a 390 la hoja ya no se arrastra (0px, escala
  // 0.733) y en modo ampliado sigue scrolleando en su marco, no la página. El
  // detalle vive en `guia-imprimir-escala.test.ts`.
  it("el documento scrollea dentro de su propio marco, y al imprimir no hay scroller", () => {
    const src = leer("src/app/guias/components/HojaEscalada.tsx");
    expect(src).toContain("overflow-x-auto");
    expect(src).toContain("print:overflow-visible");
    expect(src).toContain("print:mx-0");
  });

  it("NO se convirtió en tarjetas: es un documento que se firma y se entrega", () => {
    const src = leer(GUIA_DETAIL);
    expect(src).toContain("<PrintDocument guia={guia} />");
    expect(src).not.toContain('data-vista="tarjetas"');
  });
});
