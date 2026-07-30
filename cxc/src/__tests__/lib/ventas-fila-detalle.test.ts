// Candados de estructura del tab Resumen de Ventas.
//
// El detalle de una celda ya no vive en un panel lateral (tapaba las columnas
// AGO/SEP del heatmap, que era el problema de origen): la fila —o el renglón, en
// celular— se transforma en su propio lugar. Estos tests fallan si alguien
// revive el panel, deja las dos formas conviviendo, o rompe las reglas que
// sostienen el diseño.
//
// ⚠️ ESCRITORIO y CELULAR ya NO son la misma estructura (30-jul-2026). El
// escritorio conserva su MATRIZ (`FilaDetalleTr` dentro de un `<tr>`, con alto y
// ancho visible medidos porque su contenedor scrollea a lo ancho); el celular
// pasó a TARJETAS (`FilaDetalleBloque` dentro de un `<li>`) justamente para
// eliminar ese scroll — pedía 1.109 px contra 356 visibles, 753 px de arrastre.
// Por eso cada regla se verifica contra la vista que le corresponde: exigirle al
// celular un `colSpan` o un ancho medido sería exigirle la tabla de vuelta.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

const dir = path.resolve(__dirname, "../../components/ventas");
const read = (f: string) => readFileSync(path.join(dir, f), "utf8");

const resumen = read("ResumenView.tsx");
const mobile = read("ResumenViewMobile.tsx");
const fila = read("FilaDetalle.tsx");

describe("el panel lateral quedó retirado", () => {
  it("CeldaDetallePanel.tsx ya no existe", () => {
    expect(existsSync(path.join(dir, "CeldaDetallePanel.tsx"))).toBe(false);
  });

  it("nadie lo importa (no conviven las dos formas)", () => {
    expect(resumen).not.toContain("CeldaDetallePanel");
    expect(mobile).not.toContain("CeldaDetallePanel");
  });

  it("la fila transformada no es overlay: sin portal, sin body scroll lock", () => {
    expect(fila).not.toContain("createPortal");
    expect(fila).not.toContain("useBodyScrollLock");
    expect(fila).not.toContain("aria-modal");
  });

  it("tampoco quedó el encabezado pegado que se descartó", () => {
    expect(resumen).not.toContain("sticky top-[72px]");
    expect(mobile).not.toContain("sticky top-[46px]");
  });
});

describe("la fila se transforma en su propio lugar", () => {
  it("el escritorio cambia la <tr> por FilaDetalleTr cuando esa fila está abierta", () => {
    expect(resumen).toContain("FilaDetalleTr");
    expect(resumen).toMatch(/filaDetalle\?\.filaId === /);
    expect(resumen).toContain("colSpan={colSpanTabla}");
  });

  it("el celular cambia el RENGLÓN del período por FilaDetalleBloque", () => {
    expect(mobile).toContain("FilaDetalleBloque");
    // La llave es el `focoCelda`, no el `filaId`: en una tarjeta abierta hay 14
    // renglones de la MISMA fila y sólo el que se tocó debe transformarse.
    expect(mobile).toMatch(/filaDetalle\?\.focoCelda === r\.foco/);
    // Y no vuelve a la tabla por la puerta de atrás.
    expect(mobile).not.toContain("FilaDetalleTr");
    expect(mobile).not.toContain("colSpan");
  });

  it("una sola fila transformada a la vez (un único state en ResumenView)", () => {
    expect(resumen).toMatch(/useState<FilaDetalle \| null>\(null\)/);
    // La mobile NO tiene state propio del detalle: lo recibe por props. (Sí
    // tiene el suyo para qué tarjeta está abierta, que es otra cosa.)
    expect(mobile).not.toContain("useState<FilaDetalle");
  });

  it("colSpanTabla del escritorio cubre empresa + períodos + Total + Proyección", () => {
    expect(resumen).toMatch(/colSpanTabla = 2 \+ cols\.length \+ \(/);
  });

  it("cerrar la tarjeta también cierra el detalle que tuviera adentro", () => {
    // Sin esto el detalle queda vivo en el state del padre y reaparece al volver
    // a abrir la tarjeta.
    expect(mobile).toMatch(/if \(abierta === id && filaDetalle\) onCerrarFila\(\)/);
  });
});

describe("las reglas que sostienen el diseño", () => {
  it("el alto se mide en el clic y se fija — en las DOS formas", () => {
    expect(fila).toContain("export function medirFila");
    expect(fila).toMatch(/alto: tr \? tr\.getBoundingClientRect\(\)\.height : 0/);
    expect(fila).toMatch(/style=\{\{ height: detalle\.alto \|\| undefined \}\}/);
    // Tarjetas: el "alto de la fila" es el del renglón tocado (no hay <tr>).
    expect(fila).toContain("export function medirRenglon");
    expect(fila).toMatch(/style=\{\{ minHeight: detalle\.alto \|\| undefined \}\}/);
  });

  it("en la TABLA el contenido queda sticky al borde con el ancho visible medido", () => {
    expect(fila).toMatch(/ancho: cont \? cont\.clientWidth : 0/);
    expect(fila).toContain("sticky left-0");
    expect(fila).toMatch(/style=\{\{ width: anchoFijo \|\| undefined \}\}/);
  });

  it("en la TARJETA no se fija ancho: no hay scroll lateral que compensar", () => {
    // Es el punto del rediseño. Si alguien le pasara `anchoFijo` al bloque,
    // estaría clavándole el ancho de un contenedor que ya no scrollea.
    expect(mobile).not.toContain("anchoFijo");
    expect(fila).toMatch(/ancho: 0/);
  });

  it("una sola implementación del contenido para las dos formas", () => {
    // Dos copias del mismo detalle es una que se arregla y otra que se queda
    // vieja — ya pasó con las 5 celdas del heatmap.
    expect(fila.match(/aria-label="Cerrar detalle"/g) ?? []).toHaveLength(1);
    expect(fila).toContain("function FilaDetalleContenido");
  });

  it("todo lo clicable mide su alto al abrir, en las dos vistas", () => {
    const abridoresEscritorio = resumen.match(/onAbrir\(\{/g) ?? [];
    const medidasEscritorio = resumen.match(/\.\.\.medirFila\(e\),/g) ?? [];
    expect(abridoresEscritorio.length).toBeGreaterThan(0);
    expect(medidasEscritorio.length).toBe(abridoresEscritorio.length);

    const abridoresMovil = mobile.match(/onAbrirFila\(\{/g) ?? [];
    const medidasMovil = mobile.match(/\.\.\.medirRenglon\(e\),/g) ?? [];
    expect(abridoresMovil.length).toBeGreaterThan(0);
    expect(medidasMovil.length).toBe(abridoresMovil.length);
  });
});

describe("cierre y foco", () => {
  it("Escape cierra", () => {
    expect(resumen).toContain("useEscapeClose(filaDetalle !== null, cerrarFila)");
  });

  it("la × está en la fila transformada", () => {
    expect(fila).toContain('aria-label="Cerrar detalle"');
  });

  it("el foco no se pierde: pasa a la × y vuelve a la celda al cerrar", () => {
    expect(fila).toMatch(/cerrarRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
    expect(resumen).toContain("focoPendiente");
    expect(resumen).toMatch(/\[data-celda="\$\{focoPendiente\.current\}"\]/);
  });

  it("cada celda declara su data-celda para poder recuperar el foco", () => {
    const abridores = resumen.match(/onAbrir\(\{/g) ?? [];
    const marcas = resumen.match(/data-celda=\{foco\}/g) ?? [];
    expect(marcas.length).toBe(abridores.length);
    // En celular hay un solo componente de renglón, así que una marca alcanza
    // para todos los períodos.
    expect(mobile).toContain("data-celda={renglon.foco}");
  });
});

describe("la fila abierta se ve seleccionada", () => {
  it("fondo indigo suave + borde indigo, claro y oscuro", () => {
    expect(fila).toContain("bg-indigo-50");
    expect(fila).toContain("ring-2 ring-inset ring-indigo-500");
    expect(fila).toContain("ring-2 ring-inset ring-indigo-300");
  });
});
