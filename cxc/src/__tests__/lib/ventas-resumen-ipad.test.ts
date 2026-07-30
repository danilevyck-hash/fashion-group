// Candado: la matriz de Ventas › Resumen no vuelve a arrastrarse — ni en el
// iPad ni en el escritorio.
//
// 🩸 LA HISTORIA, porque el número que se creía no era el medido. El #369 pasó
// el Resumen a tarjetas en CELULAR y lo reportó bien: "753 → 0" a 390 px, y
// "el escritorio no se tocó". Ese número se leyó como si también hubiera
// arreglado el iPad. No lo hizo, y no podía: la matriz quedó detrás de
// `hidden md:block`, o sea que TODO lo de 768 px para arriba la recibía.
//
// Medido el 30-jul-2026 sobre origin/main, con datos reales (88 celdas):
//
//     390 → 0     834 → 724     1024 → 534     1440 → 118
//
// El 1440 es el que cambia la conclusión: **la matriz nunca entró en ninguna
// pantalla**, tampoco en el escritorio. "En una pantalla ancha se ve entera"
// era una creencia, no una medición.
//
// LA CAUSA, con el número: son 15 columnas (Empresa + 12 meses + Total +
// Proyección) y su ancho MÍNIMO REAL era 1.276 px — el que pide el navegador
// después de partir todo lo que puede partir. Contra el ancho ÚTIL (viewport −
// 223 px de barra lateral − 56 px del main):
//
//     390 → 356    810 → 528    834 → 552    1024 → 742
//     1194 → 912   1366 → 1087  1440 → 1158
//
// Por eso el corte es 1440 y no `lg` ni `xl`: a 1280 el útil es 1.001 y
// faltarían 275 px. Y por eso además hubo que bajarle el piso a la matriz — sin
// eso, ni 1440 alcanzaba.
//
// Reproducible (solo lectura, sin tocar nada que ejecute):
//   node scripts/_ancho-util-ventas.mjs            ← ¿entra o no entra?
//   node scripts/_medir-ventas-vista-general.mjs   ← el arrastre por ancho
//   node scripts/_verif-resumen-ipad.mjs           ← ningún número cambió

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

const ventas = path.resolve(__dirname, "../../components/ventas");
const read = (f: string) => readFileSync(path.join(ventas, f), "utf8");

const matriz = read("ResumenView.tsx");
const tarjetas = read("ResumenViewMobile.tsx");

describe("la matriz se dibuja en TODOS los anchos, con la columna Empresa fija", () => {
  // 🩸 EL 30-jul-2026 DANIEL RECHAZÓ LAS TARJETAS, textual: *"porq ventas en el
  // celular me cambiastes el formato? no me gusta asi, me gusta ver mi tabla
  // completa, o buscar otra manera de verlo en el ihpone"*.
  //
  // El diagnóstico anterior estaba mal leído: se midió el ARRASTRE y se lo trató
  // como el defecto. El defecto era otro — al arrastrar se perdía la columna de
  // nombres y dejabas de saber qué fila estabas leyendo. Con la primera columna
  // FIJA, arrastrar deja de ser un problema y pasa a ser navegación normal.
  //
  // ⚠️ ACÁ SE ESPERA ARRASTRE, y eso NO es una regresión: es lo que se pidió.
  // Medido a 390 px: 744 px de desliz con la columna Empresa clavada al borde.
  //
  // Lo que SÍ se conserva del trabajo anterior: el piso de la matriz, que bajó
  // de 1.276 a 1.098 px. Menos ancho = menos que deslizar, y a 1440 entra entera.

  it("no queda ningún corte por ancho: una sola forma", () => {
    expect(matriz).not.toContain("min-[1440px]:block");
    expect(matriz).not.toContain("hidden md:block space-y-5");
    expect(matriz).toContain('<div className="space-y-5">');
  });

  it("las tarjetas de celular ya no se dibujan", () => {
    expect(matriz).not.toContain("<ResumenViewMobile");
    expect(matriz).not.toContain('from "./ResumenViewMobile"');
  });

  it("la columna Empresa NO se desliza (encabezado y las dos clases de fila)", () => {
    expect(matriz).toContain("sticky left-0 top-0 z-30");          // encabezado
    expect(matriz).toContain("sticky left-0 z-10 cursor-pointer"); // empresa
    expect(matriz).toContain("sticky left-0 z-10 border-r border-gray-800 bg-gray-950"); // Total Grupo
  });

  it("la celda fija tiene FONDO OPACO — sin eso los meses se ven por debajo al deslizar", () => {
    const i = matriz.indexOf('"sticky left-0 z-10 cursor-pointer');
    const bloque = matriz.slice(i - 400, i + 400);
    expect(bloque).toMatch(/bg-teal-50|bg-gray-50|bg-white/);
  });

  it("y un separador que marca dónde termina lo fijo y empieza lo que se desliza", () => {
    expect(matriz).toContain("sticky left-0 top-0 z-30 min-w-[120px] border-r border-gray-200");
    expect(matriz).toContain("border-b border-r border-gray-200 px-2.5 py-3.5");
  });

  it("el encabezado fijo queda POR ENCIMA del resto (si no, se solapan al deslizar)", () => {
    // esquina Empresa (30) > resto del encabezado (20) > columna fija (10) > datos
    const esquina = /sticky left-0 top-0 z-(\d+)/.exec(matriz);
    const encabezado = /sticky top-0 z-(\d+) bg-gray-100/.exec(matriz);
    const columna = /sticky left-0 z-(\d+) cursor-pointer/.exec(matriz);
    expect(Number(esquina![1])).toBeGreaterThan(Number(encabezado![1]));
    expect(Number(encabezado![1])).toBeGreaterThan(Number(columna![1]));
  });

  it("los toggles de la matriz miden 44 px (vivían solo en escritorio y median 30)", () => {
    expect(matriz.match(/inline-flex min-h-\[44px\] items-center rounded-full px-3\.5/g) ?? []).toHaveLength(2);
  });

  it("el verificador de la columna fija existe y NO se conforma con leer el CSS", () => {
    const script = path.resolve(__dirname, "../../../scripts/_verif-columna-fija.mjs");
    expect(existsSync(script)).toBe(true);
    const src = readFileSync(script, "utf8");
    // lleva el scroll al extremo y comprueba que quedó anclada al borde
    expect(src).toContain("cont.scrollLeft = cont.scrollWidth");
    expect(src).toContain("anclada");
    // fondo opaco y que nada se le monte encima
    expect(src).toContain("backgroundColor");
    expect(src).toContain("elementFromPoint");
    // y que de verdad haya habido algo que deslizar
    expect(src).toContain("huboDesliz");
  });
});

describe("a la matriz se le bajó el piso para que entre de verdad en su tramo", () => {
  it("la columna Empresa puede partirse en dos líneas (era lo que más pesaba: 189 px)", () => {
    const i = matriz.indexOf('"sticky left-0 z-10 cursor-pointer');
    expect(i).toBeGreaterThan(-1);
    const clase = /"sticky left-0 z-10 cursor-pointer[^"]*"/.exec(matriz.slice(i))![0];
    expect(clase).not.toContain("whitespace-nowrap");
  });

  it("su min-width bajó de 180 px", () => {
    const m = /sticky left-0 top-0 z-30 min-w-\[(\d+)px\]/.exec(matriz);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(120);
  });

  it("las celdas de mes aflojaron el relleno (12 columnas × 8 px = 96 px)", () => {
    expect(matriz).toContain("bg-gray-100 px-1.5 py-3.5 text-right text-xs font-medium");
    expect(matriz).not.toContain("bg-gray-100 px-2.5 py-3.5 text-right text-xs font-medium");
  });

  it("NINGÚN texto se abrevió: los encabezados siguen enteros", () => {
    expect(matriz).toContain(">Total</th>");
    expect(matriz).toContain(">Proyección</th>");
    expect(matriz).toContain(">\n                  Empresa\n                </th>");
  });
});

describe("las dos formas siguen mostrando los mismos números", () => {
  it("comparten la llave `data-celda`, que es un ancla estable y no una clase de breakpoint", () => {
    // 🩸 Buscar la vista angosta por `.md\:hidden` devuelve VACÍO en cuanto el
    // corte se mueve —que es justo lo que hace este cambio— y entonces el
    // chequeo recorre cero celdas y pasa en verde sin comparar nada.
    expect(matriz).toContain("data-celda={foco}");
    expect(tarjetas).toContain("data-celda={renglon.foco}");
    // El prefijo de vista TIENE que diferir: las dos formas conviven en el DOM
    // y esa llave es la que dice cuál celda está abierta.
    expect(matriz).toContain('celdaKey("d"');
  });

  it("el verificador existe, exige cobertura y declara que cero celdas es FALLA", () => {
    const script = path.resolve(__dirname, "../../../scripts/_verif-resumen-ipad.mjs");
    expect(existsSync(script)).toBe(true);
    const src = readFileSync(script, "utf8");
    expect(src).toContain("SIN CELDAS");
    expect(src).toContain("Cobertura insuficiente");
    // Mide los 3 anchos que antes arrastraban, no solo el celular.
    expect(src).toContain("[390, 834, 1024, 1366]");
    // Y no busca por clase de breakpoint.
    expect(src).not.toMatch(/\\:hidden/);
  });

  it("ResumenViewMobile sigue en el repo pero NO se dibuja", () => {
    // No se borró a propósito: Daniel acaba de cambiar de opinión una vez y el
    // componente tiene 5 archivos de test que cubren lógica compartida. Queda
    // como está hasta que confirme que la tabla le gusta; si confirma, se borra
    // junto con sus tests en un PR aparte.
    expect(tarjetas.length).toBeGreaterThan(0);
    expect(matriz).not.toContain("ResumenViewMobile");
  });
});
