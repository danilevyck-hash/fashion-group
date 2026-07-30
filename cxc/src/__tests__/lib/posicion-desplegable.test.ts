/**
 * Candado de la aritmética que ubica la lista flotante del selector de cliente.
 *
 * jsdom no calcula layout, así que la posición real no se puede medir acá — se
 * mide en el navegador (`scripts/_medir-guia-cliente.mjs`). Lo que se congela
 * acá es la ARITMÉTICA, que es donde vive el riesgo: una lista mal ubicada se
 * sale de la pantalla o tapa el campo, que es exactamente el defecto que este
 * cambio vino a arreglar.
 */
import { describe, it, expect } from "vitest";
import {
  calcularPosicionDesplegable,
  ALTO_MAXIMO,
  ALTO_UTIL_MINIMO,
  ANCHO_MINIMO,
  MARGEN,
  SEPARACION,
} from "@/lib/ui/posicion-desplegable";

/** El caso de Daniel: fila de la tabla a 1440×900, columna Cliente de 215 px. */
const ANCLA_TABLA = { top: 612, bottom: 646, left: 326, width: 215 };
const ESCRITORIO = { width: 1440, height: 900 };

describe("Abre hacia abajo cuando hay lugar", () => {
  it("se cuelga del borde de abajo del campo, con la separación de siempre", () => {
    const p = calcularPosicionDesplegable(
      { top: 200, bottom: 234, left: 100, width: 300 },
      ESCRITORIO,
    );
    expect(p.hacia).toBe("abajo");
    expect(p.top).toBe(234 + SEPARACION);
    expect(p.left).toBe(100);
  });

  it("con toda la pantalla libre usa el alto máximo y nada más", () => {
    const p = calcularPosicionDesplegable({ top: 100, bottom: 134, left: 10, width: 300 }, ESCRITORIO);
    expect(p.maxHeight).toBe(ALTO_MAXIMO);
  });
});

describe("Voltea hacia arriba solo cuando abajo no alcanza", () => {
  it("pegado al borde de abajo se abre hacia ARRIBA", () => {
    // Campo casi al pie de la pantalla: abajo quedan ~30 px.
    const p = calcularPosicionDesplegable({ top: 820, bottom: 854, left: 100, width: 300 }, ESCRITORIO);
    expect(p.hacia).toBe("arriba");
    // Termina justo encima del campo, nunca encima de él.
    expect(p.top + p.maxHeight).toBe(820 - SEPARACION);
    expect(p.top).toBeGreaterThanOrEqual(MARGEN);
  });

  it("con lugar justo para 3 opciones se QUEDA abajo (el teclado del iPhone)", () => {
    // Preferir abajo evita que la lista tape el campo cuando sube el teclado.
    const alto = 400;
    const bottom = alto - MARGEN - SEPARACION - ALTO_UTIL_MINIMO;
    const p = calcularPosicionDesplegable(
      { top: bottom - 34, bottom, left: 10, width: 300 },
      { width: 390, height: alto },
    );
    expect(p.hacia).toBe("abajo");
    expect(p.maxHeight).toBeGreaterThanOrEqual(ALTO_UTIL_MINIMO);
  });

  it("si arriba tampoco hay más lugar que abajo, se queda abajo", () => {
    // Campo centrado en una pantalla bajita: ninguno de los dos lados alcanza,
    // y voltear no compraría nada.
    const p = calcularPosicionDesplegable(
      { top: 90, bottom: 124, left: 10, width: 300 },
      { width: 390, height: 240 },
    );
    expect(p.hacia).toBe("abajo");
  });
});

describe("Nunca se sale de la pantalla", () => {
  const CASOS = [
    { nombre: "iPhone 390", viewport: { width: 390, height: 844 } },
    { nombre: "iPad 834", viewport: { width: 834, height: 1194 } },
    { nombre: "escritorio 1440", viewport: { width: 1440, height: 900 } },
  ];

  for (const c of CASOS) {
    it(`${c.nombre}: ningún borde se pasa, esté el campo donde esté`, () => {
      for (const top of [0, 40, c.viewport.height / 2, c.viewport.height - 40]) {
        for (const left of [-20, 0, c.viewport.width - 40, c.viewport.width + 50]) {
          const p = calcularPosicionDesplegable(
            { top, bottom: top + 34, left, width: 215 },
            c.viewport,
          );
          expect(p.left, `left ${left}/${top}`).toBeGreaterThanOrEqual(MARGEN);
          expect(p.left + p.width, `derecha ${left}/${top}`).toBeLessThanOrEqual(c.viewport.width);
          expect(p.top, `top ${left}/${top}`).toBeGreaterThanOrEqual(0);
          expect(p.top + p.maxHeight, `abajo ${left}/${top}`).toBeLessThanOrEqual(c.viewport.height);
        }
      }
    });
  }

  it("un campo tirado a la derecha se acomoda hacia la izquierda", () => {
    const p = calcularPosicionDesplegable(
      { top: 100, bottom: 134, left: 1300, width: 215 },
      ESCRITORIO,
    );
    expect(p.left + p.width).toBeLessThanOrEqual(ESCRITORIO.width - MARGEN);
  });
});

describe("El ancho: arranca en el del campo y crece si el campo es angosto", () => {
  it("la columna de 215 px de la tabla se ensancha para que los nombres se lean", () => {
    // "CIA ALIMENTOS DE ANIMALES S.A" no entra en 215 px. La lista flota, así
    // que puede ser más ancha que su columna.
    const p = calcularPosicionDesplegable(ANCLA_TABLA, ESCRITORIO);
    expect(p.width).toBe(ANCHO_MINIMO);
    expect(p.width).toBeGreaterThan(ANCLA_TABLA.width);
  });

  it("un campo ancho manda: la lista lo iguala, no lo encoge", () => {
    const p = calcularPosicionDesplegable(
      { top: 100, bottom: 134, left: 20, width: 500 },
      ESCRITORIO,
    );
    expect(p.width).toBe(500);
  });

  it("en 390 px el ancho mínimo no desborda la pantalla", () => {
    const p = calcularPosicionDesplegable(
      { top: 300, bottom: 334, left: 16, width: 100 },
      { width: 390, height: 844 },
    );
    expect(p.width).toBeLessThanOrEqual(390 - MARGEN * 2);
    expect(p.left + p.width).toBeLessThanOrEqual(390);
  });

  it("una pantalla más angosta que el mínimo no produce un ancho negativo", () => {
    const p = calcularPosicionDesplegable(
      { top: 100, bottom: 134, left: 0, width: 50 },
      { width: 200, height: 400 },
    );
    expect(p.width).toBeGreaterThan(0);
  });
});

describe("El alto declarado SIEMPRE cabe — si no, volvería el recorte invisible", () => {
  it("el maxHeight nunca pasa el espacio del lado elegido", () => {
    for (const alto of [300, 500, 844, 1194]) {
      for (const bottom of [50, alto / 2, alto - 20]) {
        const p = calcularPosicionDesplegable(
          { top: bottom - 34, bottom, left: 10, width: 300 },
          { width: 390, height: alto },
        );
        const disponible =
          p.hacia === "abajo" ? alto - bottom - SEPARACION - MARGEN : bottom - 34 - SEPARACION - MARGEN;
        expect(p.maxHeight, `${alto}/${bottom}`).toBeLessThanOrEqual(Math.max(0, disponible));
        expect(p.maxHeight).toBeLessThanOrEqual(ALTO_MAXIMO);
      }
    }
  });
});
