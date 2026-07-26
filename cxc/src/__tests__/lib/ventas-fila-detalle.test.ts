// Candados de estructura del tab Resumen de Ventas.
//
// El detalle de una celda ya no vive en un panel lateral (tapaba las columnas
// AGO/SEP del heatmap, que era el problema de origen): la FILA de la empresa se
// transforma en su propio lugar. Estos tests fallan si alguien revive el panel,
// deja las dos formas conviviendo, o rompe alguna de las dos reglas que
// sostienen el diseño (alto fijo y ancho visible).

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
  it("las dos tablas cambian la <tr> por FilaDetalleTr cuando esa fila está abierta", () => {
    for (const src of [resumen, mobile]) {
      expect(src).toContain("FilaDetalleTr");
      expect(src).toMatch(/filaDetalle\?\.filaId === /);
      expect(src).toContain("colSpan={colSpanTabla}");
    }
  });

  it("una sola fila transformada a la vez (un único state en ResumenView)", () => {
    expect(resumen).toMatch(/useState<FilaDetalle \| null>\(null\)/);
    // La mobile NO tiene state propio: lo recibe por props.
    expect(mobile).not.toContain("useState<FilaDetalle");
  });

  it("colSpanTabla cubre empresa + períodos + Total + Proyección", () => {
    for (const src of [resumen, mobile]) {
      expect(src).toMatch(/colSpanTabla = 2 \+ cols\.length \+ \(/);
    }
  });
});

describe("las dos reglas que sostienen el diseño", () => {
  it("el alto se mide en el clic y se fija en la fila transformada", () => {
    expect(fila).toContain("export function medirFila");
    expect(fila).toMatch(/alto: tr \? tr\.getBoundingClientRect\(\)\.height : 0/);
    expect(fila).toMatch(/style=\{\{ height: detalle\.alto \|\| undefined \}\}/);
  });

  it("el contenido queda sticky al borde izquierdo con el ancho visible medido", () => {
    expect(fila).toMatch(/ancho: cont \? cont\.clientWidth : 0/);
    expect(fila).toContain("sticky left-0");
    expect(fila).toMatch(/style=\{\{ width: detalle\.ancho \|\| undefined \}\}/);
  });

  it("todas las celdas clicables miden la fila al abrir", () => {
    const abridores = (resumen + mobile).match(/onAbrir\(\{/g) ?? [];
    const medidas = (resumen + mobile).match(/\.\.\.medirFila\(e\),/g) ?? [];
    expect(abridores.length).toBeGreaterThan(0);
    expect(medidas.length).toBe(abridores.length);
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
    const abridores = (resumen + mobile).match(/onAbrir\(\{/g) ?? [];
    const marcas = (resumen + mobile).match(/data-celda=\{foco\}/g) ?? [];
    expect(marcas.length).toBe(abridores.length);
  });
});

describe("la fila abierta se ve seleccionada", () => {
  it("fondo indigo suave + borde indigo, claro y oscuro", () => {
    expect(fila).toContain("bg-indigo-50");
    expect(fila).toContain("ring-2 ring-inset ring-indigo-500");
    expect(fila).toContain("ring-2 ring-inset ring-indigo-300");
  });
});
