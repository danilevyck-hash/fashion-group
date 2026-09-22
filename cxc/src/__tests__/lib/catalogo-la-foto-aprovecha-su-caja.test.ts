// ─────────────────────────────────────────────────────────────────────────────
// LA FOTO APROVECHA SU CAJA, Y LA CAJA SALE DE MEDIR LAS FOTOS (22-sep-2026)
//
// Daniel, con la PRIMERA captura de celular del sistema —el catálogo de Reebok
// en su iPhone, dos tarjetas por fila—, textual: *«Opino aprovechar el espacio
// en blanco no?»*. En «CLASSIC LEATHER» el zapato ocupaba media tarjeta y el
// resto era fondo beige.
//
// 🩸 LA CAUSA: con `object-contain`, una foto CUADRADA metida en una caja 4:3
// se escala hasta el ALTO y deja barras de fondo a los dos lados — pierde el
// 25 % del ancho. Y las fotos de Reebok y Joybees son cuadradas.
//
// ─── CENSO DE LAS 838 FOTOS ACTIVAS (todas, no una muestra), 22-sep-2026 ────
//
//   marca    fotos  cuadradas  4:3 exactas   caja 4:3   caja 1:1
//   Reebok    220      122          0         72,9 %    79,8 %  ←
//   Joybees    81       77          0         74,6 %    97,5 %  ←
//   Tommy     455        5        322         88,9 %  ← 73,3 %
//   Calvin     82        1          7         63,7 %  ← 55,4 %
//
// («caja N llena» = qué fracción del ÁREA de la caja ocupa la foto, promediada
// sobre las fotos de esa marca.)
//
// 🔴 POR ESO LA RELACIÓN ES POR MARCA: Reebok y Joybees pasan a caja CUADRADA;
// Tommy y Calvin se quedan en 4:3, donde una caja más alta solo agregaría fondo
// vacío. Es un DATO DEL TEMA, no un `if` con el nombre de la marca.
//
// 🔴 LO QUE NO CAMBIA, Y ES LO QUE DE VERDAD PROTEGE ESTE CANDADO:
// `object-contain` y nada de padding en el `<img>`. `object-cover` llenaría el
// 100 % de cualquier caja, y está PROHIBIDO: medido el 25-jul-2026, corta
// PRODUCTO (no margen) en 67/138 de Reebok y 16/81 de Joybees.
//
// ⚠️ Esto NO arregla el margen que la foto trae ADENTRO del archivo. Eso solo
// se quita recortando el archivo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCA_THEME, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { MOSTRAR_EXISTENCIA } from "@/lib/catalogo/stock-en-la-tarjeta";

const LAS_CUATRO: MarcaUiKey[] = ["reebok", "joybees", "tommy", "calvin"];

/** El censo del 22-sep-2026: relación de caja que más área le da a las fotos
 *  de cada marca. Si alguien cambia una caja, tiene que cambiar esto — y para
 *  cambiarlo hay que volver a medir. */
const CAJA_MEDIDA: Record<MarcaUiKey, "cuadrada" | "4/3"> = {
  reebok: "cuadrada",   // 122 de 220 fotos cuadradas · 72,9 % → 79,8 %
  joybees: "cuadrada",  //  77 de  81 fotos cuadradas · 74,6 % → 97,5 %
  tommy: "4/3",         // 322 de 455 fotos exactamente 4:3 · 88,9 %
  calvin: "4/3",        // apaisadas, mediana 1,78 · 63,7 % (cuadrada: 55,4 %)
};

describe("la caja de la foto, marca por marca", () => {
  for (const m of LAS_CUATRO) {
    it(`${m}: la caja es la que midieron sus fotos`, () => {
      const caja = MARCA_THEME[m].card.imageBg;
      if (CAJA_MEDIDA[m] === "cuadrada") {
        expect(caja, m).toContain("aspect-square");
        expect(caja, m).not.toContain("aspect-[4/3]");
      } else {
        expect(caja, m).toContain("aspect-[4/3]");
        expect(caja, m).not.toContain("aspect-square");
      }
    });
  }

  it("🔴 no hay UNA sola caja para las cuatro: la decisión es por marca", () => {
    const cajas = new Set(LAS_CUATRO.map((m) => (MARCA_THEME[m].card.imageBg.includes("aspect-square") ? "1/1" : "4/3")));
    expect(cajas.size).toBe(2);
  });

  it("🔴 la foto NUNCA se recorta ni se deforma para llenar la caja", () => {
    for (const m of LAS_CUATRO) {
      const fit = MARCA_THEME[m].card.imageFit;
      expect(fit, m).toBe("w-full h-full object-contain");
      expect(fit, m).not.toContain("object-cover");
      expect(fit, m).not.toContain("object-fill");
      expect(fit, m).not.toMatch(/\bp-\d/);
    }
  });

  it("el hueco que reserva el navegador tiene el dibujo de SU caja", () => {
    for (const m of LAS_CUATRO) {
      const { ancho, alto } = MARCA_THEME[m].card.imageIntrinsic;
      expect(ancho, m).toBeGreaterThan(0);
      expect(alto, m).toBeGreaterThan(0);
      const esCuadrada = MARCA_THEME[m].card.imageBg.includes("aspect-square");
      // 🩸 Si el hueco no coincide con la caja, la grilla salta al cargar.
      expect(ancho / alto, m).toBeCloseTo(esCuadrada ? 1 : 4 / 3, 2);
    }
  });

  it("la caja conserva el fondo de la marca y el cursor de la lupa", () => {
    for (const m of LAS_CUATRO) {
      expect(MARCA_THEME[m].card.imageBg, m).toContain("relative overflow-hidden cursor-pointer");
      expect(MARCA_THEME[m].card.imageBg, m).toMatch(/bg-\[#[0-9A-Fa-f]{6}\]/);
    }
  });
});

describe("el segundo número del stock, pendiente de Daniel", () => {
  it("el interruptor existe y arranca PRENDIDO: la pantalla no cambió sola", () => {
    // 🔴 Cuál de los dos números se queda es un dato de NEGOCIO. Medido el
    // 22-sep-2026: «Disponibilidad» y «Existencia» dicen lo MISMO en 643 de 838
    // productos activos y difieren en 195; `disponibilidad` nunca es mayor.
    // Mientras Daniel no decida, se dibujan los dos.
    expect(MOSTRAR_EXISTENCIA).toBe(true);
  });
});
