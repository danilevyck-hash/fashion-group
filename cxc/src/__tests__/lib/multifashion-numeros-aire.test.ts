// Candado del aire entre columnas de "Mes a mes" (Multifashion › Resumen).
//
// 🩸 QUÉ SE ROMPIÓ. Daniel, mirando el iPhone: *"lo pegado que estan los numeros"*.
// Medido en el navegador a 390 px con las cifras reales (5 dígitos con centavos,
// el peor caso), el aire entre el monto del año actual y el del anterior era de
// **−4,8 px**: no estaban apretados, se SUPERPONÍAN.
//
// La causa NO era el relleno ni el interletrado. Con las 4 columnas en una sola
// línea, a cada monto le tocaba una pista de **79,6 px** cuando el texto pide
// **92,4** — cada uno desbordaba 12,8 px y eso se comía los 8 px del `gap`
// (8 − 12,8 = −4,8). Las dos columnas competían por un ancho que no alcanzaba.
//
// La cuenta que cierra el caso, a 390 px: quedan 326 px útiles dentro de la
// tarjeta, y Mes (44,8) + dos montos (92,4 × 2) + Δ (96) + 3 separaciones = 350,4.
// **Faltan 24,4 px.** Las 4 columnas en una línea NO entran, y las dos salidas
// baratas están prohibidas: la letra no baja de 12 px (#301) y los montos van
// completos con centavos porque esta pantalla es de plata.
//
// Por eso en celular la fila usa DOS líneas. DESPUÉS: **+16 px** de aire, con
// desborde 0, arrastre 0 y sin tocar iPad ni escritorio (93 px a 834, 188 a 1024,
// 396 a 1440 — idénticos al antes).
//
// Este archivo mide el CÓDIGO. El aire, el arrastre y que ningún número haya
// cambiado se miden en el navegador con `scripts/_medir-aire-mes-a-mes.mjs` y
// `scripts/_verif-mes-a-mes.mjs` (32 celdas comparadas, 0 distintas).

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const raiz = path.resolve(__dirname, "../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const resumen = leer("components/multifashion/MultifashionResumenView.tsx");
const clientes = leer("components/multifashion/ClientesMultifashionSubtab.tsx");

describe("la tabla se puede medir sin adivinar", () => {
  // 🩸 Sin marcas fijas hay que buscar por clase de breakpoint, y eso devuelve
  // vacío en cuanto el corte se mueve: el chequeo compara CERO celdas y pasa en
  // verde sin haber mirado nada.
  it("la tabla y sus columnas llevan marcas que no dependen del breakpoint", () => {
    expect(resumen).toContain('data-tabla="mes-a-mes"');
    expect(resumen).toContain('data-fila="mes"');
    for (const col of ["mes", "actual", "previo", "delta"]) {
      expect(resumen).toContain(`data-col="${col}"`);
    }
  });

  it("la fila del YTD también está marcada (es la del peor caso)", () => {
    // 11 dígitos con centavos: es la fila que define si la tabla entra o no.
    const filas = resumen.match(/data-fila="mes"/g) ?? [];
    expect(filas.length).toBe(2); // las de los meses (map) + la del YTD
  });
});

describe("en celular los montos tienen su propio ancho, no compiten", () => {
  it("las dos columnas de monto son `auto`, no fracciones que se reparten", () => {
    // Con `auto` la pista vale lo mismo para TODAS las filas (el contenido más
    // largo), así que los montos siguen alineados de arriba abajo y el aire
    // entre ellos es EXACTAMENTE el gap.
    expect(resumen).toContain("grid-cols-[minmax(2.8rem,1fr)_auto_auto]");
  });

  it("el aire entre montos es el gap y es holgado", () => {
    expect(resumen).toContain("gap-x-4");
  });

  it("el Δ baja a una segunda línea y ocupa el ancho de los dos montos", () => {
    expect(resumen).toContain("col-start-2 col-span-2");
  });
});

describe("iPad y escritorio no cambian", () => {
  it("desde md vuelve el reparto de 4 columnas en una sola línea", () => {
    expect(resumen).toContain("md:grid-cols-[2.8rem_minmax(0,1fr)_minmax(0,1fr)_6rem]");
    expect(resumen).toContain("md:gap-x-2");
    expect(resumen).toContain("md:col-start-4");
  });

  it("el corte es md y no sm", () => {
    // A 640 px la tabla quedaría con 8 px de aire total: otra vez al borde de
    // tocarse. `sm` es demasiado temprano.
    expect(resumen).not.toMatch(/sm:grid-cols-\[2\.8rem/);
  });
});

describe("las reglas que no se pueden romper para ganar espacio", () => {
  it("no se achicó la letra de los montos: siguen en text-sm", () => {
    // Piso de 12 px decidido con Daniel en el #301, y esta pantalla es de plata.
    expect(resumen).toMatch(/data-fila="mes"[\s\S]{0,200}text-sm/);
    expect(resumen).not.toMatch(/data-col="actual"[^>]*text-\[?1[01]px/);
    expect(resumen).not.toMatch(/data-col="actual"[^>]*text-xs/);
  });

  it("los montos siguen completos: fmtMoney, nada de formato compacto", () => {
    expect(resumen).toMatch(/data-col="actual"[^>]*>\{fmtMoney\(/);
    expect(resumen).toMatch(/data-col="previo"[\s\S]{0,120}fmtMoney\(/);
    // `fmtMoneyCompact` da "$33.2K" — prohibido en esta tabla.
    const tabla = resumen.slice(resumen.indexOf('data-tabla="mes-a-mes"'));
    expect(tabla.slice(0, 2500)).not.toContain("fmtMoneyCompact");
  });
});

describe("blancos táctiles de Multifashion › Clientes", () => {
  it("las píldoras de período llegan a 44 px", () => {
    // Medían 26. Mínimo de la casa: 44.
    expect(clientes).toMatch(/opcionesRango\.map[\s\S]{0,600}min-h-\[44px\]/);
  });

  it("los chips de segmento llegan a 44 px", () => {
    // Medían 28. Son el filtro principal de la tabla de identificados.
    expect(clientes).toMatch(/SEG_OPCIONES\.map[\s\S]{0,600}min-h-\[44px\]/);
  });

  it("ninguno volvió al py-1 / py-0.5 que los dejaba chicos", () => {
    expect(clientes).not.toMatch(/rounded px-2\.5 py-1 text-xs font-medium transition/);
    expect(clientes).not.toMatch(/rounded-full border px-3 py-1 text-xs font-medium transition/);
  });
});
