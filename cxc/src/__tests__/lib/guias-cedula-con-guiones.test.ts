/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CÉDULA SE ESCRIBE CON GUIONES — Y SOLO AL MOSTRARLA (5-sep-2026).
 *
 * Daniel: la cédula del que recibe salía `89822270`, y una cédula panameña se
 * escribe `8-982-2270`.
 *
 * 🔴 DOS COSAS QUE NO SE PUEDEN ROMPER:
 *   1. **Lo guardado no se toca.** El formato se aplica AL LEER: ninguna guía
 *      firmada se reescribe, y el formulario de despacho sigue guardando lo que
 *      se teclea.
 *   2. **Lo que no parece una cédula se muestra TAL CUAL.** Un pasaporte, un
 *      extranjero o una cadena rara no se decoran con guiones inventados. Esa
 *      cédula es lo que respalda quién recibió la mercancía.
 *
 * 🔑 LA REGLA NO SE INVENTÓ, SE MIDIÓ. En producción (5-sep-2026) hay 14 casos
 * donde la MISMA cédula quedó escrita de las dos formas —con guiones y pelada—
 * y las 14 tienen que salir iguales. El porqué está en `src/lib/guias/cedula.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cedulaParaMostrar } from "@/lib/guias/cedula";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Los 14 pares de PRODUCCIÓN: la misma persona escrita pelada y con guiones.
 * Es la única evidencia de dónde va cada guion, y por eso es el candado.
 */
const PARES_DE_PRODUCCION: Array<[string, string]> = [
  ["172744", "1-727-44"],
  ["8918246", "8-918-246"],
  ["8918 2 46", "8-918-246"],
  ["9701101", "9-701-101"],
  ["8 880 528", "8-880-528"],
  ["37461142", "3-746-1142"],
  ["47811121", "4-781-1121"],
  ["89921212", "8-992-1212"],
  ["97642287", "9-764-2287"],
  ["88791944", "8-879-1944"],
  ["89342485", "8-934-2485"],
  ["48031102", "4-803-1102"],
  ["810102403", "8-1010-2403"],
  ["810251353", "8-1025-1353"],
];

describe("🔴 los 14 pares medidos en producción salen iguales", () => {
  it.each(PARES_DE_PRODUCCION)("%s → %s", (pelada, conGuiones) => {
    expect(cedulaParaMostrar(pelada)).toBe(conGuiones);
    // Y la que ya venía bien no se vuelve a partir.
    expect(cedulaParaMostrar(conGuiones)).toBe(conGuiones);
  });

  it("el ejemplo exacto de Daniel", () => {
    expect(cedulaParaMostrar("89822270")).toBe("8-982-2270");
  });

  it("🔴 el tomo de CUATRO existe: la regla ingenua «1-3-el resto» daría otra cédula", () => {
    // Es el caso que prueba que no hay atajo. `810102403` es 8-1010-2403 y no
    // 8-101-02403: con folio de 5 la cédula sería de otra persona.
    expect(cedulaParaMostrar("810102403")).toBe("8-1010-2403");
    expect(cedulaParaMostrar("810102403")).not.toBe("8-101-02403");
  });
});

describe("🔴 lo que no parece una cédula NO se decora", () => {
  const TAL_CUAL = [
    "Co272797",       // pasaporte
    "C02562509",      // pasaporte
    "Bx4289",         // pasaporte
    "G",              // alguien tecleó una letra
    "S",
    "97642287...",    // con puntos suspensivos: no es la forma con puntos
    "9200240095",     // 10 dígitos: ninguna repartición deja tomo y folio ≤ 4
    "88246",          // una cédula a medias: el folio quedaría de UN dígito
    "8-930",          // dos partes, no tres — la más tecleada de las malas
    "8-9302142",      // mal tecleada: re-partirla sería inventar
    "10-3126",        // provincia de dos y dos partes
    "9-70013387",
    // ⚠️ No está en producción hoy: es la forma de la regla, no un dato. Sin
    // este caso, «quitarle los espacios a lo que no es una cédula» pasa sin que
    // nadie lo note.
    "C0 272797",
  ];
  it.each(TAL_CUAL)("%s se muestra igual", (v) => {
    expect(cedulaParaMostrar(v)).toBe(v);
  });

  it("vacío es vacío — nunca un guion de relleno", () => {
    expect(cedulaParaMostrar("")).toBe("");
    expect(cedulaParaMostrar(null)).toBe("");
    expect(cedulaParaMostrar(undefined)).toBe("");
    expect(cedulaParaMostrar("   ")).toBe("");
  });

  it("🔴 nunca inventa, quita ni reordena un dígito", () => {
    const soloDigitos = (v: string) => v.replace(/[^0-9]/g, "");
    for (const v of [...PARES_DE_PRODUCCION.map(([p]) => p), ...TAL_CUAL, "8.1277.738", "E- 8-73291"]) {
      expect(soloDigitos(cedulaParaMostrar(v)), v).toBe(soloDigitos(v));
    }
  });
});

describe("las grafías raras que YA traen las partes solo se ordenan", () => {
  it("los espacios de más se van, las partes no se tocan", () => {
    expect(cedulaParaMostrar("9- 701-101")).toBe("9-701-101");
    expect(cedulaParaMostrar("E- 8-73291")).toBe("E-8-73291");
  });
  it("los puntos son guiones: mismas tres partes, otro separador", () => {
    expect(cedulaParaMostrar("8.1277.738")).toBe("8-1277-738");
  });
  it("el extranjero conserva su letra", () => {
    expect(cedulaParaMostrar("E-8-94103")).toBe("E-8-94103");
  });
});

describe("🔴 dónde se aplica, y dónde NO", () => {
  const SUPERFICIES = [
    ["el acordeón de la lista", "src/app/guias/components/GuiasList.tsx"],
    ["la página de la guía", "src/app/guias/[id]/page.tsx"],
    ["el papel", "src/app/guias/components/PrintDocument.tsx"],
    ["el PDF", "src/lib/guias/pdf-guia.ts"],
  ] as const;

  it.each(SUPERFICIES)("%s pasa la cédula por cedulaParaMostrar", (_n, ruta) => {
    const src = leer(ruta);
    expect(src).toContain("cedulaParaMostrar");
    // Y ninguna la dibuja CRUDA: importar la función y no usarla en la celda es
    // exactamente la mutación que hay que cazar.
    expect(src).not.toMatch(/\b(g|expandedGuia)\.cedula\s*(\|\||\?\?)/);
  });

  it("🔴 el formulario de despacho NO la formatea: ahí se ESCRIBE", () => {
    // El juego frecuente ofrece la cédula para copiarla dentro del campo, y ese
    // texto se guarda. Mostrar una cosa y escribir otra sería peor que nada.
    const form = leer("src/app/guias/components/DespachoForm.tsx");
    expect(form).not.toContain("cedulaParaMostrar");
    expect(leer("src/app/guias/components/useDespachoGuia.ts")).not.toContain("cedulaParaMostrar");
  });

  it("🔴 nada de esto escribe en la base", () => {
    // Ni la ruta que guarda la guía ni el módulo puro conocen un UPDATE de
    // cédula: el formato existe solo del lado de la lectura.
    const modulo = leer("src/lib/guias/cedula.ts");
    expect(modulo).not.toMatch(/supabase|update|insert/i);
    expect(leer("src/app/api/guias/[id]/route.ts")).not.toContain("cedulaParaMostrar");
  });
});
