/**
 * EL LUGAR DE UNA MARCA (25-sep-2026) — el candado de la regla pura.
 *
 * 🔴 LA PREMISA LA PUSO DANIEL: *«Todos salen de la tienda, para eso es la
 * app»*. Las cinco personas que marcan por teléfono no tienen local propio, así
 * que lo que la fila dice es EL LUGAR, y la distancia es un extra que solo
 * aparece cuando hay contra qué medirla.
 *
 * Lo que este archivo fija, y que nadie puede cambiar sin venir acá:
 *   1. el NOMBRE del lugar manda; la distancia se le pega detrás;
 *   2. sin punto de referencia no se dice ninguna distancia;
 *   3. dentro del radio, tampoco;
 *   4. sin coordenada no se pregunta nada y la celda dice «—»;
 *   5. toda marca con coordenada y sin nombre PIDE que se le pregunte;
 *   6. la distancia se escribe con coma y en metros bajo el kilómetro.
 *
 * Los números de los casos salen de PRODUCCIÓN (medido el 25-sep-2026 contra
 * `asistencia_marcaciones`): el punto de Multifashion es la mediana de las 32
 * marcas de teléfono de los códigos 2, 3, 305 y 306 —8,535117 / −82,838671, con
 * la mitad a menos de 3,6 m—, y la marca de Ángel del 24-sep a las 7:06 p.m.
 * (8,43025 / −82,42733) está a 46,7 km de ahí.
 */
import { describe, it, expect } from "vitest";
import {
  RADIO_REFERENCIA_M,
  SIN_LUGAR,
  distanciaEnPalabras,
  distanciaMetros,
  lugarDeMarca,
  referenciaDeLaEmpresa,
  type LugarReferencia,
} from "@/lib/asistencia/lugar-de-marca";
import { direccionCorta, hayLlaveDeMapas, mejorLugar } from "@/lib/mapas/geocoding";

/** El punto sembrado por la migración, tal cual. */
const CITY_MALL: LugarReferencia = {
  empresa_key: "american_classic",
  nombre: "City Mall David",
  lat: 8.535117,
  lng: -82.838671,
  radio_m: 200,
};

/** Una marca de las cuatro de la tienda: cae sobre el punto. */
const EN_EL_PUNTO = { lat: 8.53512, lng: -82.83869 };
/** La marca de Ángel del 24-sep a las 7:06 p.m. */
const LEJOS = { lat: 8.43025, lng: -82.42733 };

describe("la distancia, medida", () => {
  it("las cuatro marcas de la tienda caen a metros del punto sembrado", () => {
    const m = distanciaMetros(EN_EL_PUNTO.lat, EN_EL_PUNTO.lng, CITY_MALL.lat, CITY_MALL.lng);
    expect(m).toBeLessThan(20);
  });

  it("🔴 la marca de Ángel está a 46,7 km — el número medido en producción", () => {
    const m = distanciaMetros(LEJOS.lat, LEJOS.lng, CITY_MALL.lat, CITY_MALL.lng);
    expect(m / 1000).toBeCloseTo(46.7, 1);
  });

  it("se escribe con coma, y en metros abajo del kilómetro", () => {
    expect(distanciaEnPalabras(46_717)).toBe("a 46,7 km");
    expect(distanciaEnPalabras(1_500)).toBe("a 1,5 km");
    expect(distanciaEnPalabras(347)).toBe("a 350 m");
    expect(distanciaEnPalabras(3)).toBe("a 10 m");
    // Nunca un punto decimal: acá se escribe con coma.
    expect(distanciaEnPalabras(46_717)).not.toContain(".");
  });
});

describe("🔴 el nombre del lugar manda; la distancia es el extra", () => {
  it("con referencia y DENTRO del radio, solo el nombre — sin distancia", () => {
    const r = lugarDeMarca({ ...EN_EL_PUNTO, lugar_texto: "City Mall David" }, CITY_MALL);
    expect(r.texto).toBe("City Mall David");
    expect(r.cercaDeLaReferencia).toBe(true);
    expect(r.texto).not.toMatch(/km|\bm\b/);
  });

  it("con referencia y FUERA del radio, el nombre Y la distancia", () => {
    const r = lugarDeMarca({ ...LEJOS, lugar_texto: "Vía Interamericana, David" }, CITY_MALL);
    expect(r.texto).toBe("Vía Interamericana, David · a 46,7 km");
    expect(r.cercaDeLaReferencia).toBe(false);
  });

  it("🔴 SIN punto de referencia no se dice NINGUNA distancia", () => {
    const r = lugarDeMarca({ ...LEJOS, lugar_texto: "Calle 50, Ciudad de Panamá" }, null);
    expect(r.texto).toBe("Calle 50, Ciudad de Panamá");
    expect(r.metros).toBeNull();
    expect(r.texto).not.toContain("km");
  });

  it("sin nombre todavía, sale lo que se sepa: la distancia sola, o «—»", () => {
    expect(lugarDeMarca(LEJOS, CITY_MALL).texto).toBe("a 46,7 km");
    expect(lugarDeMarca(LEJOS, null).texto).toBe(SIN_LUGAR);
    expect(lugarDeMarca(EN_EL_PUNTO, CITY_MALL).texto).toBe(SIN_LUGAR);
  });

  it("🔴 sin coordenada: «—», y no se le pregunta nada a nadie", () => {
    const r = lugarDeMarca({ lat: null, lng: null }, CITY_MALL);
    expect(r.texto).toBe(SIN_LUGAR);
    expect(r.pideDireccion).toBe(false);
    expect(r.metros).toBeNull();
  });
});

describe("🔴 a TODA marca con coordenada se le pregunta el lugar, esté donde esté", () => {
  it("la que cayó en el punto también lo pide — porque nadie tiene local propio", () => {
    expect(lugarDeMarca(EN_EL_PUNTO, CITY_MALL).pideDireccion).toBe(true);
  });

  it("la lejana, igual", () => {
    expect(lugarDeMarca(LEJOS, CITY_MALL).pideDireccion).toBe(true);
    expect(lugarDeMarca(LEJOS, null).pideDireccion).toBe(true);
  });

  it("y la que ya lo tiene guardado, no se vuelve a preguntar nunca", () => {
    expect(lugarDeMarca({ ...EN_EL_PUNTO, lugar_texto: "City Mall David" }, CITY_MALL).pideDireccion).toBe(false);
    expect(lugarDeMarca({ ...LEJOS, lugar_texto: "Vía Interamericana" }, null).pideDireccion).toBe(false);
    // Un texto en blanco no cuenta como guardado.
    expect(lugarDeMarca({ ...LEJOS, lugar_texto: "   " }, null).pideDireccion).toBe(true);
  });
});

describe("la referencia se busca por la EMPRESA de la ficha", () => {
  const mapa = new Map([[CITY_MALL.empresa_key, CITY_MALL]]);

  it("la encuentra por su empresa", () => {
    expect(referenciaDeLaEmpresa("american_classic", mapa)?.nombre).toBe("City Mall David");
  });

  it("una empresa sin fila, o sin ficha, no tiene referencia", () => {
    expect(referenciaDeLaEmpresa("vistana", mapa)).toBeNull();
    expect(referenciaDeLaEmpresa(null, mapa)).toBeNull();
    expect(referenciaDeLaEmpresa("american_classic", null)).toBeNull();
  });

  it("un radio roto cae en el de siempre, nunca en cero", () => {
    const roto = { ...CITY_MALL, radio_m: 0 };
    // A 100 m: con el radio por omisión (200 m) sigue estando cerca.
    const cien = { lat: CITY_MALL.lat + 0.0009, lng: CITY_MALL.lng };
    expect(distanciaMetros(cien.lat, cien.lng, CITY_MALL.lat, CITY_MALL.lng)).toBeLessThan(RADIO_REFERENCIA_M);
    expect(lugarDeMarca({ ...cien, lugar_texto: "X" }, roto).cercaDeLaReferencia).toBe(true);
  });
});

describe("🔴 el servicio de mapas: el NOMBRE antes que la calle, y falla ABIERTO", () => {
  it("prefiere el resultado que es un lugar con nombre", () => {
    expect(
      mejorLugar([
        { formatted_address: "Vía Interamericana, David, Chiriquí, Panamá", types: ["route"] },
        { formatted_address: "City Mall, Vía Interamericana, David, Panamá", types: ["shopping_mall", "establishment"] },
      ]),
    ).toBe("City Mall, Vía Interamericana");
  });

  it("sin ningún lugar con nombre, la calle — que es honesto", () => {
    expect(
      mejorLugar([{ formatted_address: "Vía Interamericana, David, Chiriquí, Panamá", types: ["route"] }]),
    ).toBe("Vía Interamericana, David");
  });

  it("sin respuesta usable, vacío — nunca una calle inventada", () => {
    expect(mejorLugar([])).toBe("");
    expect(mejorLugar(undefined)).toBe("");
  });

  it("se recorta a dos tramos y se le saca el país", () => {
    expect(direccionCorta("Calle 50, Ciudad de Panamá, Provincia de Panamá, Panamá"))
      .toBe("Calle 50, Ciudad de Panamá");
    expect(direccionCorta("")).toBe("");
  });

  it("🔴 hoy NO hay llave, y eso no rompe nada", () => {
    // 25-sep-2026: `GOOGLE_MAPS_API_KEY` no existe en el entorno. Que este
    // candado lo diga es lo que hace visible el día en que alguien la cargue.
    expect(hayLlaveDeMapas()).toBe(process.env.GOOGLE_MAPS_API_KEY !== undefined && process.env.GOOGLE_MAPS_API_KEY !== "");
  });
});

describe("🔴 ningún camino escribe sobre una marca ya guardada", () => {
  it("el lugar se resuelve AL MARCAR, no con un update posterior", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    // Sin comentarios: la cabecera EXPLICA por qué no hay un update, y nombrar
    // la tabla en una nota no es tocarla. Es el mismo criterio de los barridos
    // de `asistencia-correcciones.test.ts`.
    const sinComentarios = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const modulo = sinComentarios(
      readFileSync(join(process.cwd(), "src/lib/marcacion/lugar-al-marcar.ts"), "utf8"),
    );
    // Ni una escritura: este módulo solo pregunta y devuelve el texto.
    expect(modulo).not.toContain(".update(");
    expect(modulo).not.toContain(".upsert(");
    expect(modulo).not.toContain("asistencia_marcaciones");
    expect(modulo).not.toContain("supabase");
  });
});
