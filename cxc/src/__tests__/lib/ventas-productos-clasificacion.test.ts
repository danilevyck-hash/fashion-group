// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del aviso "código mal clasificado" — el criterio, y NADA MÁS.
//
// 🔴 LO QUE ESTE ARCHIVO EXISTE PARA CAZAR:
//   · que el aviso salga por un TIPEO (`Agua Dana 600 ml 20 Und ` vs
//     `Agua Dana 600 Ml 20 Und`): ahí no hay nada que arreglar en Switch, y un
//     aviso que sale en 25 de 33 casos es el que se deja de leer a la semana;
//   · que el aviso NO salga en los 5 casos reales que sí lo son;
//   · que el ORDEN de las preguntas se invierta — la trampa fina de todas.
//
// Los casos de abajo son los MEDIDOS contra producción el 25-ago-2026.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  avisosDeClasificacion,
  catalogoAprobado,
  clasificarGrafia,
  normalizarDescripcion,
  soloAlfanumerico,
} from "@/lib/ventas/productos-clasificacion";

// Un recorte real del catálogo aprobado (`depurador_descripciones`, 240 filas).
const CATALOGO = catalogoAprobado([
  { descripcion: "Women-Sandals" },
  { descripcion: "Women-Flip Flops" },
  { descripcion: "Women-Dresses" },
  { descripcion: "Women-T-Shirts S/S" },
  { descripcion: "Women-T-Shirts S/S Core" },
  { descripcion: "Men-Hats" },
  { descripcion: "Men-Other Accessories" },
  { descripcion: "Men-T-Shirts S/S" },
  { descripcion: "Men-Bags", activa: false }, // desactivada: NO cuenta
]);

describe("normalización", () => {
  it("insensible a caja y a espacios de más", () => {
    expect(normalizarDescripcion("  Agua Dana   600 ML ")).toBe("agua dana 600 ml");
  });
  it("soloAlfanumerico se come la puntuación", () => {
    expect(soloAlfanumerico("Men-Shirts / Woven Tops L/S")).toBe("menshirtswoventopsls");
  });
});

describe("los 5 casos REALES de mala clasificación (medidos en producción)", () => {
  const reales: [string, string][] = [
    ["Women-Flip Flops", "Women-Sandals"],           // FW0FW05034-DW5, fashion_shoes
    ["Men-Hats", "Men-Other Accessories"],           // AU0AU02082BDS, fashion_wear
    ["Women-T-Shirts S/S", "Women-T-Shirts S/S Core"], // 76J4871P77, fashion_wear
    ["Women-Dresses", "Women-T-Shirts S/S"],         // 47AB802100, vistana
    ["Women-Flip Flops", "Women-Sandals"],           // KCSALYA929, vistana
  ];
  for (const [a, b] of reales) {
    it(`«${a}» vs «${b}» → mal clasificado`, () => {
      expect(clasificarGrafia(a, b, CATALOGO)).toBe("mal_clasificado");
    });
  }
});

describe("un TIPEO no avisa nada: en Switch ya quedó una sola grafía", () => {
  it("sólo cambian los espacios y la caja (el caso Agua Dana)", () => {
    expect(clasificarGrafia("Agua Dana 600 ml 20 Und ", "Agua Dana 600 Ml 20 Und", CATALOGO)).toBe("tipeo");
  });

  it("🩸 EL ORDEN DE LAS PREGUNTAS: un DOBLE ESPACIO no es una segunda categoría", () => {
    // La búsqueda en el catálogo normaliza los espacios, así que "Men-T-Shirts
    // S/S" con dos espacios "encuentra" la aprobada. Preguntando por el catálogo
    // PRIMERO, las dos darían aprobadas y esto saldría como mal clasificado —
    // o sea, el aviso saldría justo donde no hay problema.
    expect(clasificarGrafia("Men-T-Shirts  S/S", "Men-T-Shirts S/S", CATALOGO)).toBe("tipeo");
  });

  it("sólo cambia la puntuación", () => {
    expect(clasificarGrafia("Men-Shirts / Woven Tops L/S", "Men-Shirts Woven Tops L/S", CATALOGO)).toBe("tipeo");
  });

  it("una sola está aprobada: la otra es la mal escrita", () => {
    expect(clasificarGrafia("Women-Sandalss", "Women-Sandals", CATALOGO)).toBe("tipeo");
  });
});

describe("lo que no se sabe NO se afirma", () => {
  it("ninguna de las dos está en el catálogo → a revisar, sin aviso", () => {
    expect(clasificarGrafia("Outlet Duty Free N2", "Outlet Duty Free N3", CATALOGO)).toBe("a_revisar");
    expect(avisosDeClasificacion("Outlet Duty Free N2", [{ otra: "Outlet Duty Free N3", codigo: "X" }], CATALOGO))
      .toEqual([]);
  });

  it("🔴 `Outlet Duty Free N2` y `N3` NO se juntan por parecerse", () => {
    // Se parecen muchísimo y son dos cosas distintas. La identidad es el CÓDIGO;
    // acá sólo se comprueba que el clasificador no los declare "el mismo texto".
    expect(clasificarGrafia("Outlet Duty Free N2", "Outlet Duty Free N3", CATALOGO)).not.toBe("tipeo");
  });

  it("una descripción DESACTIVADA no cuenta como categoría real", () => {
    expect(clasificarGrafia("Men-Bags", "Men-Hats", CATALOGO)).not.toBe("mal_clasificado");
  });
});

describe("avisosDeClasificacion filtra, no inventa", () => {
  it("de tres grafías deja sólo la que es una categoría real", () => {
    const av = avisosDeClasificacion(
      "Women-Sandals",
      [
        { otra: "Women-Sandals ", codigo: "T-1" },   // tipeo (espacio)
        { otra: "Women-Flip Flops", codigo: "M-1" }, // mal clasificado
        { otra: "Zapatilla rara", codigo: "R-1" },   // ninguna aprobada
      ],
      CATALOGO,
    );
    expect(av).toEqual([{ otra: "Women-Flip Flops", codigo: "M-1" }]);
  });

  it("sin grafías no hay aviso", () => {
    expect(avisosDeClasificacion("Women-Sandals", [], CATALOGO)).toEqual([]);
  });

  it("con el catálogo VACÍO no se afirma nada (la lectura pudo fallar)", () => {
    expect(avisosDeClasificacion("Women-Sandals", [{ otra: "Women-Flip Flops", codigo: "M-1" }], new Set()))
      .toEqual([]);
  });
});
