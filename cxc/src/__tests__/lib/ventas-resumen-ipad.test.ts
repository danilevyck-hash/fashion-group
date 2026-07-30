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

describe("el corte de Resumen cubre TODOS los iPad, no solo el iPhone", () => {
  it("la matriz se dibuja desde 1440 px, no desde md", () => {
    expect(matriz).toContain('className="hidden min-[1440px]:block space-y-5"');
    // `md:block` era lo que le entregaba la matriz a un iPad de 834.
    expect(matriz).not.toContain('className="hidden md:block space-y-5"');
  });

  it("las tarjetas cubren todo lo que está por debajo de 1440", () => {
    expect(tarjetas).toContain('<div className="min-[1440px]:hidden space-y-4">');
    expect(tarjetas).not.toContain('<div className="md:hidden space-y-4">');
  });

  it("los dos cortes son el MISMO número — si divergen, un ancho ve las dos formas o ninguna", () => {
    const dMatriz = /hidden min-\[(\d+)px\]:block/.exec(matriz);
    const dTarjetas = /min-\[(\d+)px\]:hidden/.exec(tarjetas);
    expect(dMatriz).not.toBeNull();
    expect(dTarjetas).not.toBeNull();
    expect(dMatriz![1]).toBe(dTarjetas![1]);
  });

  it("el corte deja del lado de las tarjetas al iPad Pro de 12.9 acostado (1366)", () => {
    const corte = Number(/hidden min-\[(\d+)px\]:block/.exec(matriz)![1]);
    expect(corte).toBeGreaterThan(1366);
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
    expect(tarjetas).toContain('celdaKey("m"');
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

  it("el contenido de las tarjetas no se tocó: solo cambió la clase del contenedor", () => {
    // Si alguien edita una celda de la tarjeta, este candado no lo ve — lo ve el
    // verificador del navegador. Acá se fija lo que SÍ es estático: que las
    // tarjetas siguen dibujando los 12 meses + Total + Proyección.
    expect(tarjetas).toContain('celdaKey("m", filaId, String(ci))');
    expect(tarjetas).toContain('celdaKey("m", filaId, "total")');
    expect(tarjetas).toContain('celdaKey("m", id, "proy")');
  });
});
