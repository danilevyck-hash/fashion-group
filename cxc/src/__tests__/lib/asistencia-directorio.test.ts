/* ─────────────────────────────────────────────────────────────────────────────
 * El directorio: código del reloj → nombre.
 *
 * Las dos reglas que se prueban son las dos que Daniel pidió con captura:
 *   1. sin nombre configurado se muestra EL CÓDIGO, nunca un blanco;
 *   2. se ordena por NOMBRE, y entre los que no tienen, el 5 va antes que el 49.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import {
  crearDirectorio,
  etiquetaPersona,
  compararPersonas,
  ordenarPersonas,
  armarPersonas,
} from "@/lib/asistencia/directorio";

// Fichas reales de producción (medidas el 6-ago-2026, 32 en total).
const FICHAS = [
  { empleado_codigo: "8", nombre: "BRICEIDA MONTERO" },
  { empleado_codigo: "7", nombre: "ANGELA GARCIA" },
  { empleado_codigo: "5", nombre: "JORMAN HERNANDEZ" },
  { empleado_codigo: "49", nombre: null },
];

describe("etiquetaPersona — regla 1: sin nombre, el código", () => {
  it("usa el nombre cuando existe", () => {
    expect(etiquetaPersona("8", "BRICEIDA MONTERO")).toBe("BRICEIDA MONTERO");
  });

  it("cae al código con null, con undefined y con cadena vacía", () => {
    // 🩸 La cadena vacía importa tanto como el `null`: el CHECK de la base no la
    // prohíbe y pintaría una celda en blanco, que no se busca ni se reclama.
    expect(etiquetaPersona("48", null)).toBe("48");
    expect(etiquetaPersona("48", undefined)).toBe("48");
    expect(etiquetaPersona("48", "   ")).toBe("48");
  });

  it("nunca devuelve la palabra «Sin nombre»", () => {
    expect(etiquetaPersona("48", null)).not.toMatch(/sin nombre/i);
  });

  it("normaliza los espacios de más del nombre", () => {
    expect(etiquetaPersona("8", "  BRICEIDA   MONTERO ")).toBe("BRICEIDA MONTERO");
  });
});

describe("crearDirectorio", () => {
  const d = crearDirectorio(FICHAS);

  it("traduce el código al nombre", () => {
    expect(d.nombre("8")).toBe("BRICEIDA MONTERO");
    expect(d.etiqueta("8")).toBe("BRICEIDA MONTERO");
    expect(d.configurado("8")).toBe(true);
  });

  it("un código sin ficha se muestra igual, con su número", () => {
    expect(d.nombre("48")).toBeNull();
    expect(d.etiqueta("48")).toBe("48");
    expect(d.configurado("48")).toBe(false);
  });

  it("una ficha con el nombre vacío cuenta como no configurada", () => {
    expect(d.configurado("49")).toBe(false);
    expect(d.etiqueta("49")).toBe("49");
  });

  it("aguanta que la migración no esté corrida (lista vacía)", () => {
    // Mismo patrón que `catalogo/cols-opcionales.ts`: se degrada, no se rompe.
    for (const vacio of [crearDirectorio([]), crearDirectorio(null), crearDirectorio(undefined)]) {
      expect(vacio.total).toBe(0);
      expect(vacio.etiqueta("8")).toBe("8");
      expect(vacio.persona("8").configurado).toBe(false);
    }
  });

  it("no se confunde con espacios alrededor del código", () => {
    expect(crearDirectorio([{ empleado_codigo: " 8 ", nombre: "X" }]).etiqueta("8")).toBe("X");
  });
});

describe("orden — regla 2: por nombre, no por código como texto", () => {
  const p = (codigo: string, nombre: string | null) =>
    crearDirectorio(nombre ? [{ empleado_codigo: codigo, nombre }] : []).persona(codigo);

  it("EL BUG DE LA CAPTURA: el 5 va antes que el 49", () => {
    // Ordenando texto, "49" < "5" y el 5 caía al final. `numeric: true` lo
    // arregla y es la única razón por la que esa opción está en el comparador.
    const orden = ordenarPersonas([p("49", null), p("5", null), p("7", null), p("50", null)]);
    expect(orden.map((x) => x.codigo)).toEqual(["5", "7", "49", "50"]);
  });

  it("los que tienen nombre van alfabéticos", () => {
    const orden = ordenarPersonas([
      p("8", "BRICEIDA MONTERO"),
      p("7", "ANGELA GARCIA"),
      p("5", "JORMAN HERNANDEZ"),
    ]);
    expect(orden.map((x) => x.nombre)).toEqual([
      "ANGELA GARCIA",
      "BRICEIDA MONTERO",
      "JORMAN HERNANDEZ",
    ]);
  });

  it("los pendientes van AL FINAL, no arriba de los nombres", () => {
    const orden = ordenarPersonas([p("49", null), p("8", "BRICEIDA MONTERO"), p("5", null)]);
    expect(orden.map((x) => x.etiqueta)).toEqual(["BRICEIDA MONTERO", "5", "49"]);
  });

  it("los acentos no mandan a Ángela al final del abecedario", () => {
    const orden = ordenarPersonas([p("2", "BERTA"), p("1", "ÁNGELA")]);
    expect(orden.map((x) => x.nombre)).toEqual(["ÁNGELA", "BERTA"]);
  });

  it("el comparador es estable consigo mismo", () => {
    const a = p("8", "BRICEIDA MONTERO");
    expect(compararPersonas(a, a)).toBe(0);
  });
});

describe("armarPersonas — el universo es la UNIÓN", () => {
  const directorio = crearDirectorio([
    { empleado_codigo: "8", nombre: "BRICEIDA MONTERO" },
    // Código 47: tiene ficha y CERO marcaciones (medido en producción).
    { empleado_codigo: "47", nombre: "YERIBETH GONZALEZ" },
  ]);

  it("incluye a quien marca sin ficha y a quien tiene ficha sin marcar", () => {
    const out = armarPersonas(directorio, ["8", "48", "49"]);
    expect(out.map((x) => x.codigo).sort()).toEqual(["47", "48", "49", "8"].sort());
  });

  it("los 6 sin ficha quedan elegibles y marcados como pendientes", () => {
    const out = armarPersonas(directorio, ["48", "49", "50", "51", "52", "53"]);
    const pendientes = out.filter((x) => !x.configurado);
    expect(pendientes.map((x) => x.etiqueta)).toEqual(["48", "49", "50", "51", "52", "53"]);
    // Ninguna etiqueta vacía: todas se pueden ver y elegir.
    expect(out.every((x) => x.etiqueta.trim() !== "")).toBe(true);
  });

  it("no duplica a quien está en los dos lados", () => {
    const out = armarPersonas(directorio, ["8", "8", "47"]);
    expect(out).toHaveLength(2);
  });

  it("sale ya ordenado", () => {
    const out = armarPersonas(directorio, ["49", "5"]);
    expect(out.map((x) => x.etiqueta)).toEqual(["BRICEIDA MONTERO", "YERIBETH GONZALEZ", "5", "49"]);
  });
});
