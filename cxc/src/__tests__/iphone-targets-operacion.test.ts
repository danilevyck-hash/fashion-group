/**
 * Candados de la auditoría iPhone (390×844, dsf 3) sobre los módulos de
 * Operación + Marketing + login.
 *
 * Regla de la casa: **44×44 px mínimo al tacto**. Y el tamaño de letra más
 * chico permitido es `text-xs` (0.8125rem = 13px en la escala custom de
 * `tailwind.config.ts`) — nada de valores arbitrarios sub-12px.
 *
 * Los tres hallazgos que estos tests protegen se midieron en un browser real
 * con emulación por CDP, no leyendo el código:
 *
 *  1. `/productos/cargar` era la ÚNICA de 23 páginas con scroll horizontal:
 *     la barra de 6 pestañas era `inline-flex` sin wrap ni scroll, así que sus
 *     543px empujaban la PÁGINA entera (scrollWidth 547 vs clientWidth 390) y
 *     "Reglas"/"Historial" solo se alcanzaban arrastrando todo el layout.
 *  2. Targets por debajo de 44px en Reclamos (↓PDF/↓Excel y los toggles de
 *     Historial), Gastos de Empresa (Guardar), Multifashion (flechas de mes,
 *     toggle Mes/Año) y el login (ver contraseña, ¿olvidaste?).
 *  3. Modales sin botón de cerrar: en iPhone no existe la tecla Escape, así
 *     que un modal sin ✕ solo se cierra por el backdrop (que no se descubre).
 *
 * Son assertions sobre el fuente a propósito: un test de DOM con jsdom no
 * calcula layout, así que no puede medir un `getBoundingClientRect`. Lo que se
 * congela acá es la CAUSA de cada medición, no la medición.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(src, ...p), "utf8");

const depurador = read("app", "productos", "cargar", "page.tsx");
const prestamos = read("app", "prestamos", "components", "ElegirPersonaModal.tsx");
// NuevoProyectoModal se borró el 11-ago-2026: el paso de crear proyecto se
// retiró (el proyecto se autocrea desde "Registrar gasto"), así que su modal
// quedó sin caller y su chequeo de ✕ se fue con él.
const empresaSelector = read("app", "reclamos", "components", "EmpresaSelector.tsx");
// Se mudó con su módulo, DOS veces, y siempre es el MISMO archivo (nunca una
// copia): salió de "Gastos de Empresa" (11-ago-2026), fue módulo suelto dos
// días, y desde el 13-ago-2026 es la 2ª pestaña de "Gastos".
const saldosBancarios = read("app", "gastos-contabilidad", "components", "saldos", "SaldosBancarios.tsx");
const mfResumen = read("components", "multifashion", "MultifashionResumenView.tsx");
const mfView = read("components", "multifashion", "MultifashionView.tsx");
const mfPeriodoSelect = read("components", "multifashion", "PeriodoSelect.tsx");
const mfCharts = read("components", "multifashion", "DetalleMensualCharts.tsx");
const login = read("app", "page.tsx");

describe("Depurador · la barra de pestañas no puede volver a desbordar la página", () => {
  it("ninguna barra de pestañas usa inline-flex (era lo que empujaba el layout)", () => {
    expect(depurador).not.toMatch(/className="inline-flex rounded-lg border border-stone-200/);
  });

  it("las barras de pestañas scrollean solas: flex-nowrap + overflow-x-auto", () => {
    const barras = depurador.match(/className="[^"]*rounded-lg border border-stone-200 bg-white p-1[^"]*"/g) ?? [];
    expect(barras.length).toBeGreaterThanOrEqual(2); // pestañas del módulo + scope de fórmulas
    for (const b of barras) {
      expect(b).toContain("flex-nowrap");
      expect(b).toContain("overflow-x-auto");
    }
  });

  // 🩸 Este candado FIJABA `px-4` literal, y el relleno nunca fue el invariante:
  // lo que protege es que la pestaña mida 44 px de alto, no se comprima y no
  // parta el texto. Al entrar la 7ª pestaña ("Fotos a mi Excel") el relleno tuvo
  // que bajar a `px-2.5` hasta `xl` porque a 1024 px la fila desbordaba 24 px —
  // o sea que el candado exigía justamente lo que producía el defecto. Ahora
  // exige las tres reglas de verdad, y que SIGA habiendo relleno horizontal
  // (quitarlo del todo pegaría las pestañas entre sí).
  it("cada pestaña mide 44px de alto y no se comprime ni parte el texto", () => {
    expect(depurador).toMatch(/shrink-0 whitespace-nowrap rounded-md px-[\d.]+(?: [a-z]+:px-[\d.]+)? min-h-\[44px\]/);
  });
});

describe("Modales · en iPhone no hay Escape, así que necesitan ✕", () => {
  // El modal se llama «¿A quién?» desde el 5-sep-2026 y se mudó a su propio
  // archivo: elige a la persona de ASISTENCIA (37 activas) en vez de listar las
  // 15 fichas que ya existían. La regla del ✕ de 44×44 no cambió.
  it('Préstamos · el modal de elegir persona tiene un cerrar de 44×44', () => {
    const i = prestamos.indexOf("¿A quién?");
    expect(i).toBeGreaterThan(-1);
    const bloque = prestamos.slice(i - 400, i + 700);
    expect(bloque).toMatch(/aria-label="Cerrar"/);
    expect(bloque).toMatch(/w-11 h-11/);
  });

});

describe("Targets de 44px", () => {
  // 🔄 CAMBIÓ DE DIRECCIÓN EL 10-sep-2026 (rediseño de Reclamos). Pedía que
  // los ↓Excel/↓PDF y el toggle «Historial» de la TARJETA midieran 44. La
  // tarjeta ya no lleva ninguno de los tres (mockup aprobado: contacto, «el
  // más viejo lleva N días», la plata y el chip «sin reclamar»); las descargas
  // viven en la página de la empresa (`EmpresaList`), donde SÍ miden 44.
  it("Reclamos · la tarjeta de la portada ya no lleva ↓Excel/↓PDF ni «Historial»", () => {
    expect(empresaSelector).not.toContain("↓ Excel");
    expect(empresaSelector).not.toContain("setExpandedHistorial");
    expect(empresaSelector).not.toContain("Historial (");
  });

  it("Reclamos · «Descargar Excel» y «Descargar PDF» miden 44 en la página de la empresa", () => {
    const lista = read("app", "reclamos", "components", "EmpresaList.tsx");
    const i = lista.indexOf("const accion = ");
    expect(i).toBeGreaterThan(-1);
    expect(lista.slice(i, i + 200)).toContain("min-h-[44px]");
    expect(lista).toContain("Descargar Excel");
    expect(lista).toContain("Descargar PDF");
  });

  it("Saldos de Banco · Guardar llega a 44 (medía 41)", () => {
    expect(saldosBancarios).toMatch(/bg-black text-white px-3 min-h-\[44px\]/);
  });

  // 🔄 CAMBIÓ DE DIRECCIÓN EL 6-sep-2026. Pedía que las flechas ‹ › del mes
  // midieran 44×44. **Ya no hay flechas**: el mes se elige en el desplegable
  // único del módulo (`PeriodoSelect`), que es el que tiene que medir 44. El
  // candado se conserva apuntando al control que quedó, no se borra.
  it("Multifashion · el selector de período mide 44 y ya no hay flechas de mes", () => {
    expect(mfView).not.toMatch(/aria-label="Mes anterior"/);
    expect(mfView).not.toMatch(/aria-label="Mes siguiente"/);
    expect(mfPeriodoSelect).toContain('aria-label="Período"');
    expect(mfPeriodoSelect).toMatch(/className="h-11 [^"]*"/);
  });

  it("Multifashion · el toggle Mes/Año deja de medir 26px", () => {
    const i = mfResumen.indexOf("function SegmentedToggle");
    expect(i).toBeGreaterThan(-1);
    expect(mfResumen.slice(i, i + 900)).toContain("min-h-[44px]");
  });

  it("Login · ver contraseña y ¿olvidaste? llegan a 44", () => {
    expect(login).toMatch(/aria-label=\{showPassword \? "Ocultar contraseña" : "Ver contraseña"\}/);
    expect(login).toMatch(/min-w-\[44px\] h-11/);
    expect(login).toMatch(/inline-flex min-h-\[44px\] items-center justify-center px-4 text-xs/);
  });
});

describe("Tamaño de letra · nada por debajo de text-xs (13px)", () => {
  const modulos: Record<string, string[]> = {
    marketing: ["app/marketing"],
    reclamos: ["app/reclamos"],
    "saldos-banco": ["app/gastos-contabilidad/components/saldos"],
    multifashion: ["components/multifashion"],
  };

  for (const [nombre, dirs] of Object.entries(modulos)) {
    it(`${nombre} no usa clases arbitrarias sub-12px`, async () => {
      const { globSync } = await import("glob");
      const files = dirs.flatMap((d) => globSync(join(src, d, "**", "*.tsx")));
      expect(files.length).toBeGreaterThan(0);
      const ofensores: string[] = [];
      for (const f of files) {
        // text-[10px], text-[11px], text-[8.5px]… cualquier px < 12
        const hits = readFileSync(f, "utf8").match(/text-\[(\d+(?:\.\d+)?)px\]/g) ?? [];
        for (const h of hits) {
          const px = parseFloat(h.replace(/[^\d.]/g, ""));
          if (px < 12) ofensores.push(`${f.replace(src, "")} → ${h}`);
        }
      }
      expect(ofensores).toEqual([]);
    });
  }

  it("los ejes de los gráficos de Multifashion pasaron de 10px a 12px", () => {
    expect(mfCharts).not.toMatch(/fontSize: 10/);
    expect((mfCharts.match(/fontSize: 12/g) ?? []).length).toBe(4);
  });

  it('las iniciales de día de "Mejor día de la semana" ya no están a 8.5px', () => {
    expect(mfResumen).not.toContain("text-[8.5px]");
    expect(mfResumen).toMatch(/flex-1 text-center text-xs leading-tight uppercase/);
  });
});
