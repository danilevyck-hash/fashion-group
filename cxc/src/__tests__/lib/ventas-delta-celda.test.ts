// El % del cambio vs. el año anterior tiene que estar A LA VISTA en cada celda
// del heatmap de Ventas, no escondido detrás de un clic.
//
// Historia: estuvo visible del 1-jun al 25-jul-2026 (commit f81455a5) y el PR
// #279 lo borró sin querer al cambiar el tooltip por el panel lateral. Estos
// tests son el candado para que no se vuelva a caer.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { deltaCelda, cellDelta, type CeldaBase } from "@/lib/ventas/celda";

const dir = path.resolve(__dirname, "../../components/ventas");
const read = (f: string) => readFileSync(path.join(dir, f), "utf8");

describe("deltaCelda — el texto del % que va bajo el monto", () => {
  it("subida fuerte: flecha arriba y % con signo", () => {
    expect(deltaCelda(0.36, "ventas")).toEqual({ texto: "▲ +36%", tone: "emerald" });
  });

  it("bajada fuerte: flecha abajo y % negativo", () => {
    expect(deltaCelda(-0.12, "ventas")).toEqual({ texto: "▼ -12%", tone: "orange" });
  });

  it("cambio chico (±5%): se muestra el número igual, pero sin flecha ni color", () => {
    // Es el caso que a Daniel más le importa: "5% en mayo" tiene que VERSE.
    expect(deltaCelda(0.05, "ventas")).toEqual({ texto: "+5%", tone: "neutral" });
    expect(deltaCelda(-0.02, "utilidad")).toEqual({ texto: "-2%", tone: "neutral" });
  });

  it("margen se expresa en puntos, no en porcentaje de porcentaje", () => {
    expect(deltaCelda(0.021, "margen")).toEqual({ texto: "▲ +2.1 pts", tone: "emerald" });
    expect(deltaCelda(0.001, "margen")).toEqual({ texto: "≈0 pts", tone: "neutral" });
  });

  it("sin base comparativa devuelve null (la celda queda con el monto solo)", () => {
    expect(deltaCelda(null, "ventas")).toBeNull();
  });

  it("con valor actual pero sin año previo dice 'n/a', no un número inventado", () => {
    expect(deltaCelda(null, "ventas", true)).toEqual({ texto: "n/a", tone: "neutral" });
  });

  it("encadena con cellDelta sin que el caller reimplemente la matemática", () => {
    const c: CeldaBase = { ventas: 120_000, ventasPrev: 100_000, utilidad: 0, utilidadPrev: 0 };
    expect(deltaCelda(cellDelta(c, "ventas"), "ventas")).toEqual({ texto: "▲ +20%", tone: "emerald" });
  });
});

describe("las 8 celdas de las dos tablas pintan el %", () => {
  const resumen = read("ResumenView.tsx");
  const mobile = read("ResumenViewMobile.tsx");

  it("escritorio: mes, total anual por empresa, total grupo y anual del grupo", () => {
    // 4 celdas clicables + las 2 funciones de color = 6 usos de la pareja.
    expect(resumen.match(/deltaCelda\(/g) ?? []).toHaveLength(4);
    expect(resumen.match(/dc\.texto/g) ?? []).toHaveLength(4);
  });

  // ⚠️ El celular pasó de matriz a TARJETAS el 30-jul-2026 (753 px de scroll
  // lateral, el peor del sistema). Ya no hay 4 celdas distintas: hay UN renglón
  // reusado para los 12 períodos, el Total y la Proyección — así que contar usos
  // de `deltaCelda(` mediría cuántas veces se copió el código, no cuántos
  // números pintan el %. Lo que hay que sostener es que el % siga saliendo en
  // TODOS: el período, el resumen cerrado de la tarjeta y el total.
  it("celular: el % se pinta en el renglón, en el total y en el período en curso", () => {
    expect(mobile).toContain("renglon.dc.texto");
    expect(mobile).toContain("tarjeta.resumen.dc.texto");
    expect(mobile).toContain("tarjeta.enCurso.dc.texto");
    // El cálculo sigue siendo el compartido, no una matemática nueva.
    expect(mobile.match(/deltaCelda\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("el monto y el % van apilados en el escritorio, no en la misma línea", () => {
    // Apilarlos es lo que deja el ancho de la tabla intacto: el % nunca es más
    // ancho que el monto, así que la columna no crece.
    expect(resumen).toContain("flex flex-col items-end leading-tight");
  });

  it("celular: el % tiene ancho fijo para que quede en columna", () => {
    // En una lista vertical el reparto es al revés que en la matriz: lo que hay
    // que sostener es que los % se puedan comparar de un barrido de arriba a
    // abajo, y para eso su caja no puede cambiar de ancho con el texto.
    expect(mobile).toContain("w-[54px] shrink-0 text-right");
  });

  it("celular conserva el área táctil de 44px", () => {
    expect(mobile.match(/min-h-\[44px\]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("nadie quedó pintando solo la flecha suelta (la regresión del #279)", () => {
    expect(resumen).not.toContain("{fmt.arrow && <span");
    expect(mobile).not.toContain("{fmt.arrow && <span");
  });
});
