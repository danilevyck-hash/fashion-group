/**
 * Segunda tanda del barrido iPhone/iPad (26-ago-2026): TEXTO CORTADO.
 *
 * Después de arreglar Depurador › Fórmulas (#639) barrí las 49 pantallas del
 * sistema en 390 / 834 / 1440 con `scripts/_barrido-iphone-todo.mjs`. El
 * hallazgo de fondo es que «▸M» no era un caso: es un PATRÓN. Un `truncate`
 * (o un flex que no encoge) dentro de una caja que no da el ancho no pide un
 * solo píxel de arrastre, así que las dos vueltas anteriores (#297-318), que
 * medían arrastre y tocables, lo daban por sano.
 *
 * 🩸 Y EL ANCHO QUE MÁS APARECE ES 834 — el iPad vertical, "el ancho del medio
 * que nadie mira". Ahí la barra lateral se lleva 224 px y deja ~562 útiles:
 * más angosto que un iPhone acostado. Cuatro de los cinco defectos de este
 * archivo solo existen a 834.
 *
 * MEDIDO, navegador real, cookie firmada, datos de producción:
 *
 *   Pantalla                     390        834       qué se perdía
 *   CXC › Panel                  0 → 0     1 → 0     el nombre del cliente al 49 %
 *                                            (+ 11 tocables <44 y 8 encimados → 0)
 *   Multifashion › Clientes      0 → 0     6 → 0     los rótulos de los KPI a la mitad
 *   Marketing › Mobiliario       8 → 0     0 → 0     "$ TOMMY HILFIGER" al 57 %
 *   Cheques (lista y calendario) arrastre del cuerpo 15 px → 0 (solo a 834)
 *
 * Este archivo congela la CAUSA de cada uno (jsdom no calcula layout).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("CXC › Panel — el corte tarjeta/tabla sube de md (768) a lg (1024)", () => {
  const movil = leer("src/app/admin/components/PanelCxcMobile.tsx");
  const pagina = leer("src/app/admin/page.tsx");

  it("la vista de tarjetas llega hasta lg, no hasta md", () => {
    expect(movil).toContain('<div className="lg:hidden bg-gray-50">');
    expect(movil).not.toContain('<div className="md:hidden bg-gray-50">');
  });

  it("la grilla de 12 columnas empieza en lg, no en md", () => {
    expect(pagina).toContain('<div className="hidden lg:block max-w-6xl mx-auto px-6 py-8">');
    expect(pagina).not.toContain('<div className="hidden md:block max-w-6xl mx-auto px-6 py-8">');
  });

  it("a 834 la grilla de 12 columnas NO le da al nombre el ancho que pide", () => {
    // El ancho que decide es el ÚTIL: 834 − 224 de barra lateral − 48 de
    // relleno = 562. El nombre vive en `col-span-4` = un tercio de eso, y
    // encima comparte la celda con la estrella de favorito y la flechita.
    const BARRA = 224, RELLENO = 48;
    const util = 834 - BARRA - RELLENO;
    const columnaNombre = Math.round((util * 4) / 12);
    expect(columnaNombre).toBeLessThan(270); // "GRUP MEL INTERNATIONAL SA(AGUAS)" mide 270
    // Y la celda del nombre sigue siendo col-span-4 (si cambia, este número miente).
    expect(leer("src/app/admin/components/ClientRow.tsx")).toContain('className="col-span-4 font-medium truncate');
  });
});

describe("Multifashion › Clientes — los rótulos del KPI envuelven", () => {
  const src = leer("src/components/multifashion/ClientesMultifashionSubtab.tsx");
  it("ni el rótulo ni el subtítulo se cortan", () => {
    const i = src.indexOf("function SegCard(");
    expect(i).toBeGreaterThan(0);
    const card = src.slice(i, src.indexOf("function ClientesSection("));
    expect(card).toContain('<p className="text-xs font-medium text-gray-900">{label}</p>');
    expect(card).toContain('<p className="text-xs text-gray-400">{sub}</p>');
    // Se miran las CLASES, no el archivo: el comentario de arriba también
    // nombra `truncate` y contarlo sería un falso rojo.
    for (const c of card.match(/className="[^"]*"/g) ?? []) expect(c).not.toContain("truncate");
  });
});

describe("Marketing › Mobiliario — el rótulo del dato envuelve, el valor no encoge", () => {
  const src = leer("src/app/marketing/mobiliario/page.tsx");
  it("el <dt> ya no trunca", () => {
    const i = src.indexOf("function Dato(");
    expect(i).toBeGreaterThan(0);
    const dato = src.slice(i, i + 1800);
    expect(dato).toContain("min-w-0 break-words text-xs uppercase tracking-wide");
    expect(dato).not.toMatch(/uppercase tracking-wide truncate/);
    // El valor sigue entero: lo que baja de renglón es el rótulo.
    expect(dato).toContain("shrink-0");
  });
});

/**
 * 🩸 ESTE BLOQUE CAMBIÓ DE DIRECCIÓN EL 5-SEP-2026.
 *
 * LO QUE MEDÍA ANTES: que las tres casillas de totales de Cheques (Total a
 * cobrar · Vencen esta semana · Depositados) entraran recién en `lg`, porque a
 * 834 px se salían 15 px del viewport y arrastraban la página entera.
 *
 * POR QUÉ YA NO: **las tres casillas se fueron y no se reemplazaron por nada.**
 * Daniel eligió explícitamente que el módulo Recordatorios no muestre ningún
 * total sumado. Un arrastre que salía de tres casillas que ya no existen no se
 * puede medir — y dejar el test viejo apuntando a un archivo renombrado lo
 * habría vuelto verde por no encontrar nada.
 *
 * LO QUE MIDE AHORA: que no VUELVAN. Es el mismo invariante mirado al revés, y
 * es el que importa: la regla nueva («ningún total sumado») se rompe sola el día
 * que alguien reponga una tarjeta de resumen porque «se ve vacío arriba».
 *
 * ⚠️ Vive acá y no en el archivo del rediseño a propósito: quien vuelva a poner
 * una fila de KPIs va a estar mirando el ancho, no la regla de negocio.
 */
describe("Recordatorios — las tres casillas de totales NO vuelven", () => {
  const ARCHIVOS = [
    "src/app/recordatorios/RecordatoriosClient.tsx",
    "src/app/recordatorios/components/AgendaLista.tsx",
    "src/app/recordatorios/components/CalendarioMes.tsx",
  ];

  it("no hay ninguna grilla de tres casillas de resumen", () => {
    for (const f of ARCHIVOS) {
      const src = leer(f);
      expect(src, f).not.toContain("lg:grid-cols-3 gap-2 mb-8");
      expect(src, f).not.toContain("sm:grid-cols-3 gap-2 mb-8");
    }
  });

  it("🔴 y nadie SUMA montos en la pantalla", () => {
    // El arrastre de 15 px salía de un monto sumado que no cabía. Sin sumas no
    // hay monto largo que se salga, y sobre todo: Daniel pidió que no los haya.
    for (const f of ARCHIVOS) {
      const src = leer(f);
      expect(src, `${f} volvió a sumar montos`).not.toMatch(/reduce\([^)]*monto/);
      expect(src, `${f} tiene una casilla "Total"`).not.toMatch(/Total a cobrar|Depositados<|Vencen esta semana/);
    }
  });
});

describe("Depurador › Fórmulas — la ayuda dice lo que no se ve solo", () => {
  const src = leer("src/app/productos/cargar/FormulasConfig.tsx");
  it("el acordeón sigue, con la fórmula", () => {
    expect(src).toContain("Cómo funcionan las fórmulas");
    expect(src).toContain("TECHO(Costo CIF ÷ divisor)");
  });
  it("pero ya no explica lo que la tarjeta muestra sola", () => {
    // "vacía = hereda" y "precio fijo" se ven en la propia fila: la chapita
    // dice "propia"/"precio fijo" y el conteo dice cuántas heredan.
    expect(src).not.toContain("Cada marca tiene su fórmula");
    expect(src).not.toContain("vacía = hereda la de la marca");
  });
});
