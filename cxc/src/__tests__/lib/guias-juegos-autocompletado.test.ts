/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL AUTOCOMPLETADO DE «RECIBIDO POR» — la regla sola (25-ago-2026).
 *
 * Daniel, textual: ***"lo de poner transporte frecuente no le gusta, quita
 * espacio, que sea solo al escribir primeras 2 o 3 letras que aparezca las
 * opciones"***.
 *
 * 🔑 LO QUE ESTE ARCHIVO PROTEGE NO ES EL FILTRO: es que al filtrar NO SE
 * PIERDA lo que el bloque fijo hacía bien —el ORDEN POR FRECUENCIA— ni lo que
 * la pantalla promete: que nada aparezca antes de las dos letras.
 *
 * Los fixtures son valores REALES de producción (los mismos que usa
 * `guias-juegos-despacho.test.ts`), incluido el caso de Boston donde el juego
 * más usado NO es el de la guía más reciente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIN_LETRAS_JUEGO,
  juegosQueCoinciden,
  type JuegoDespacho,
} from "@/lib/guias/juegos-despacho";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
/** Este repo ya pagó CUATRO veces el candado que se cumple con su comentario. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Valores REALES de Boston, ya agrupados y ordenados POR FRECUENCIA. */
const BOSTON: JuegoDespacho[] = [
  { receptor: "Eric", cedula: "8-930", placa: "Ek0700", veces: 10 },
  { receptor: "Jocsan murillo", cedula: "8-918-246", placa: "DG7115", veces: 4 },
  { receptor: "Jose castillo", cedula: "4-803-1102", placa: "Dg7738", veces: 1 },
];

describe("🔴 nada aparece antes de las dos letras", () => {
  it("el piso son DOS letras, y está escrito con nombre", () => {
    expect(MIN_LETRAS_JUEGO).toBe(2);
  });

  it("con 0 y con 1 letra devuelve VACÍO — es lo que deja de tapar la pantalla", () => {
    expect(juegosQueCoinciden(BOSTON, "")).toEqual([]);
    expect(juegosQueCoinciden(BOSTON, "E")).toEqual([]);
    expect(juegosQueCoinciden(BOSTON, "J")).toEqual([]);
  });

  it("los espacios no cuentan como letras", () => {
    expect(juegosQueCoinciden(BOSTON, "  ")).toEqual([]);
    expect(juegosQueCoinciden(BOSTON, " E ")).toEqual([]);
  });

  it("null / undefined no revientan y no ofrecen nada", () => {
    expect(juegosQueCoinciden(BOSTON, null)).toEqual([]);
    expect(juegosQueCoinciden(BOSTON, undefined)).toEqual([]);
  });

  it("con dos letras SÍ ofrece", () => {
    expect(juegosQueCoinciden(BOSTON, "Er").map((j) => j.receptor)).toEqual(["Eric"]);
  });
});

describe("🔴 el orden es POR FRECUENCIA — el filtro NO reordena", () => {
  it("conserva el orden en que llegó la lista", () => {
    // `Jocsan murillo` (4 veces) va antes que `Jose castillo` (1), que es el
    // orden que trae `juegosMasFrecuentes`. Ordenar por fecha, alfabético o por
    // parecido invertiría esto — y en Boston el de 10 veces NO es el más
    // reciente (medido sobre las 185 guías despachadas, 14-ago-2026).
    expect(juegosQueCoinciden(BOSTON, "Jo").map((j) => j.receptor)).toEqual([
      "Jocsan murillo",
      "Jose castillo",
    ]);
  });

  it("una lista ya ordenada por frecuencia sale igual, filtre lo que filtre", () => {
    const soloUno = juegosQueCoinciden(BOSTON, "Eri");
    expect(soloUno).toHaveLength(1);
    expect(soloUno[0].veces).toBe(10);
  });

  it("devuelve los MISMOS objetos, sin inventar ni normalizar nada", () => {
    // Nunca se ofrece el valor normalizado: inventar `JOCSAN MURILLO`
    // estrenaría una forma MÁS de escribir lo mismo (ver la cabecera del
    // módulo), que es justo lo que la memoria de juegos vino a evitar.
    const [j] = juegosQueCoinciden(BOSTON, "Joc");
    expect(j).toBe(BOSTON[1]);
    expect(j.receptor).toBe("Jocsan murillo");
    expect(j.cedula).toBe("8-918-246");
    expect(j.placa).toBe("DG7115");
  });

  it("no muta la lista que recibe", () => {
    const copia = [...BOSTON];
    juegosQueCoinciden(BOSTON, "Jo");
    expect(BOSTON).toEqual(copia);
  });
});

describe("cómo pega: por el principio del nombre o de cualquiera de sus palabras", () => {
  it("por el principio del nombre entero", () => {
    expect(juegosQueCoinciden(BOSTON, "joc").map((j) => j.receptor)).toEqual(["Jocsan murillo"]);
  });

  it("por el principio de CUALQUIER palabra — el mismo chofer se busca por el apellido", () => {
    expect(juegosQueCoinciden(BOSTON, "mur").map((j) => j.receptor)).toEqual(["Jocsan murillo"]);
    expect(juegosQueCoinciden(BOSTON, "cas").map((j) => j.receptor)).toEqual(["Jose castillo"]);
  });

  it("🔴 NO pega por el medio: dos letras no pueden abrir media lista", () => {
    expect(juegosQueCoinciden(BOSTON, "osa")).toEqual([]);
    expect(juegosQueCoinciden(BOSTON, "uri")).toEqual([]);
  });

  it("no distingue mayúsculas ni tildes — `Aníbal` se teclea `anibal`", () => {
    const sol: JuegoDespacho[] = [
      { receptor: "Aníbal Arauz", cedula: "1-1", placa: "AA1", veces: 3 },
      { receptor: "Walter arauz", cedula: "2-2", placa: "WA2", veces: 1 },
    ];
    expect(juegosQueCoinciden(sol, "ANI").map((j) => j.receptor)).toEqual(["Aníbal Arauz"]);
    expect(juegosQueCoinciden(sol, "arau").map((j) => j.receptor)).toEqual([
      "Aníbal Arauz",
      "Walter arauz",
    ]);
  });

  it("un juego sin nombre no se ofrece nunca (no puede pegar con nada)", () => {
    const raros: JuegoDespacho[] = [{ receptor: "   ", cedula: "1-1", placa: "AA1", veces: 9 }];
    expect(juegosQueCoinciden(raros, "aa")).toEqual([]);
  });

  it("sin juegos guardados devuelve vacío, se escriba lo que se escriba", () => {
    expect(juegosQueCoinciden([], "Eric")).toEqual([]);
  });
});

describe("🔴 el bloque FIJO no vuelve al formulario de despacho", () => {
  const form = sinComentarios(leer("src/app/guias/components/DespachoForm.tsx"));

  it("el rótulo del bloque fijo ya no se escribe en la pantalla", () => {
    expect(form).not.toContain("Los que más usa este transportista</span>");
    expect(form).not.toContain("Tócalo y se llenan los tres campos");
  });

  it("la lista se filtra con el módulo puro, no con un filtro escrito acá", () => {
    expect(form).toContain("juegosQueCoinciden(juegos, bReceptor)");
    // Si la pantalla reordenara por su cuenta, el orden por frecuencia se
    // perdería sin que el módulo puro se entere.
    expect(form).not.toMatch(/sugerenciasJuego[\s\S]{0,80}\.sort\(/);
  });

  it("se abre al ESCRIBIR y con nada más — ni al enfocar el campo", () => {
    expect(form).toContain("setBuscandoJuego(true)");
    expect(form).not.toContain("onFocus={() => setBuscandoJuego(true)}");
  });

  it("y el desplegable es el de la casa (portal a <body>), no un `absolute`", () => {
    expect(form).toContain("<DesplegableFlotante");
  });
});
