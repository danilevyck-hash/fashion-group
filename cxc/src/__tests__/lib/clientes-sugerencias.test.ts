// ─────────────────────────────────────────────────────────────────────────────
// Candado del motor de "¿quisiste decir…?".
//
// Todos los casos son TEXTOS REALES de `guia_items` contra CLIENTES REALES de
// `clientes_master`, medidos contra producción el 9-ago-2026. Un motor de
// parecido probado con ejemplos inventados no prueba nada: el valor está en que
// reconozca los tipeos que la gente realmente comete y calle donde realmente
// no hay nada.
//
// Lo que se protege, por orden de gravedad:
//
//   1. 🔴 que NUNCA ate solo — ni siquiera con un candidato clavado,
//   2. 🔴 que una diferencia de NÚMERO se vea y no se esconda,
//   3. que "no hay nada parecido" signifique eso y no "no supe mirar",
//   4. que no recomiende D-201, el duplicado que la migración vino a vaciar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  CODIGOS_QUE_NO_SE_SUGIEREN,
  MAX_SUGERENCIAS,
  TEXTO_AVISO,
  distanciaEdicion,
  mismaPalabra,
  sugerirClientes,
  type ClienteCandidato,
} from "@/lib/clientes/sugerencias";

/** Recorte REAL del directorio del grupo (nombre y razón social, tal cual). */
const DIRECTORIO: ClienteCandidato[] = [
  { codigo: "D-1", nombre: "A-Amani, S.A.", razon_social: "A-Amani, S.A." },
  { codigo: "D-2", nombre: "Aidy Shop No.2", razon_social: "Aidy Shop No.2" },
  { codigo: "D-5", nombre: "Almacen El Combate", razon_social: "Almacen El Combate" },
  { codigo: "D-7", nombre: "Almacen Flash", razon_social: "Almacen Flash" },
  { codigo: "D-14", nombre: "Bouti, S.A.", razon_social: "Bouti, S.A." },
  { codigo: "D-20", nombre: "Chez Moi", razon_social: "Boutique Chez Moi" },
  { codigo: "D-24", nombre: "City Mall David", razon_social: "City Mall David" },
  { codigo: "D-26", nombre: "City Moda Chorrera", razon_social: "Inversiones Z15, S.A." },
  { codigo: "D-32", nombre: "City Moda Los Andes, S.A.", razon_social: "City Moda Los Andes, S.A." },
  { codigo: "D-35", nombre: "City Shoes", razon_social: "Zarina City Shoes, S.A." },
  { codigo: "D-49", nombre: "El Punto Poderoso", razon_social: "El Punto Poderoso" },
  { codigo: "D-71", nombre: "Hanna Calzados", razon_social: "Hanna Calzados" },
  { codigo: "D-72", nombre: "Hanna Store", razon_social: "Hanna Store" },
  { codigo: "D-80", nombre: "Jerusalem De Panama", razon_social: "Jerusalem De Panama" },
  { codigo: "D-81", nombre: "Jerusalem Duty Free", razon_social: "Jerusalem Duty Free" },
  { codigo: "D-86", nombre: "Kings Sport", razon_social: "Kings Sport" },
  { codigo: "D-98", nombre: "Lutylui", razon_social: "Luis Angel Laboy Pacheco" },
  { codigo: "D-103", nombre: "Metro Shoes Panama S.A.", razon_social: "Metro Shoes Panama S.A." },
  { codigo: "D-108", nombre: "Multi Fashion Holding", razon_social: "Multi Fashion Holding, S.A." },
  { codigo: "D-112", nombre: "Nine Sports 9, S.A.", razon_social: "Nine Sports 9, S.A." },
  { codigo: "D-117", nombre: "Outlet Duty Free N2, S.A.", razon_social: "Outlet Duty Free N2, S.A." },
  { codigo: "D-118", nombre: "Outlet Duty Free N3, S.A.", razon_social: "Outlet Duty Free N3, S.A." },
  // 🩸 Éste es el que hace falta para que el orden se pueda medir: SIN número,
  // así que pega MÁS letras que el N3 y, sin la penalización, encabezaría la
  // lista de un texto que dice "# 3".
  { codigo: "D-119", nombre: "Outlet Duty Free S.A.", razon_social: "Outlet Duty Free S.A." },
  { codigo: "D-131", nombre: "R.J.A.S.A.", razon_social: "R.J.A.S.A." },
  { codigo: "D-142", nombre: "Sporting Shoes N 4", razon_social: "Sporting Shoes, S.A." },
  { codigo: "D-143", nombre: "Sportsam", razon_social: "Sportsam" },
  { codigo: "D-159", nombre: "Xtreme Shoes", razon_social: "Xtreme Shoes" },
  { codigo: "D-173", nombre: "Metro Shoes Panama S.A.", razon_social: "Metro Shoes Panama S.A." },
  { codigo: "D-201", nombre: "American Classics", razon_social: null },
];

const codigos = (texto: string) => sugerirClientes(texto, DIRECTORIO).map((s) => s.codigo);
const primera = (texto: string) => sugerirClientes(texto, DIRECTORIO)[0];

describe("🔴 NUNCA ata sola", () => {
  it("no existe forma de sacar un 'elegido' de la respuesta", () => {
    // La API es una LISTA. No hay campo `elegido`, `auto`, `confirmado` ni
    // nada que un consumidor pueda leer como una decisión ya tomada.
    const s = sugerirClientes("Hanna Calzado", DIRECTORIO);
    expect(Array.isArray(s)).toBe(true);
    for (const c of s) {
      expect(Object.keys(c).sort()).toEqual(
        ["avisos", "codigo", "nombre", "puntaje", "tambienConocidoComo"].filter(
          (k) => k in c,
        ).sort(),
      );
      expect(c).not.toHaveProperty("elegido");
      expect(c).not.toHaveProperty("auto");
    }
  });

  it("un candidato ÚNICO y clavado sigue siendo un candidato", () => {
    const s = sugerirClientes("Hanna Calzado", DIRECTORIO);
    expect(s.length).toBe(1);
    expect(s[0].codigo).toBe("D-71");
    expect(s[0].puntaje).toBeGreaterThan(0.9);
    // Y aun así no hay nada que diga "usalo".
    expect(s[0]).not.toHaveProperty("aplicar");
  });

  it("🔴 Sporting Shoes N7 se ofrece con el aviso, no se ata", () => {
    // Comparten TODAS las palabras y son tiendas distintas. Es el caso que
    // haría un auto-atado meter un despacho en el negocio equivocado.
    const s = sugerirClientes("Sporting Shoes N7 ", DIRECTORIO);
    expect(s.map((x) => x.codigo)).toContain("D-142");
    expect(s.find((x) => x.codigo === "D-142")!.avisos).toContain("numeros-distintos");
  });
});

describe("🔴 los números se ven", () => {
  it("N2 contra N3 avisa que los números no son los mismos", () => {
    const s = sugerirClientes("Outlet Duty Free N2", DIRECTORIO);
    expect(s[0].codigo).toBe("D-117");
    expect(s[0].avisos).toEqual([]);
    const n3 = s.find((x) => x.codigo === "D-118");
    expect(n3?.avisos).toContain("numeros-distintos");
  });

  it("el que SÍ cuadra en números va primero aunque las letras peguen menos", () => {
    // "Outle Dutty Free # 3" pega más letras contra "Outlet Duty Free" (sin
    // número), pero el número es lo que separa dos tiendas.
    const s = sugerirClientes("Outle Dutty Free # 3 ", DIRECTORIO);
    expect(s[0].codigo).toBe("D-118");
  });

  it("uno con número y el otro sin: 'Aidy Shop' contra 'Aidy Shop No.2'", () => {
    expect(primera("Aidy Shop")!.codigo).toBe("D-2");
    expect(primera("Aidy Shop")!.avisos).toContain("falta-numero");
    // Con el número escrito, no hay nada que avisar.
    expect(primera("AIDY SHOP N2")!.avisos).toEqual([]);
  });

  it("los mismos dígitos escritos distinto NO son un aviso", () => {
    // "1,2,3," y "123" son la misma tienda.
    const dir = [{ codigo: "D-18", nombre: "Centro Dollar 1,2,3, Rifat" }];
    expect(sugerirClientes("Centro Dollar 123", dir)[0].avisos).toEqual([]);
    expect(sugerirClientes("Centro Dollar 1,2,3,", dir)[0].avisos).toEqual([]);
  });

  it("cada aviso tiene su texto en español simple, sin jerga", () => {
    for (const t of Object.values(TEXTO_AVISO)) {
      expect(t.length).toBeGreaterThan(10);
      expect(t).not.toMatch(/D-\d|puntaje|score|match|dice/i);
    }
  });
});

describe("los tipeos reales se reconocen", () => {
  it.each([
    ["Nine Sport", "D-112"],
    ["NINE SPORTS", "D-112"],
    ["Hanna Calzado", "D-71"],
    ["Hanna Stores", "D-72"],
    ["Sportsam Centro Atletico ", "D-143"],
    ["Sporsam Centro Atletico ", "D-143"],
    ["Jerusamen Panama ", "D-80"],
    ["Boutique Chez moi ", "D-20"],
    ["Punto poderoso", "D-49"],
    ["City Shoes Zarina ", "D-35"],
    ["Amani", "D-1"],
    ["AMANI (IMAN PODEROSO)", "D-1"],
    ["American Clasicc ", "D-108"],
    ["Xtreme Shos ", "D-159"],
    ["BOUTI SHOPPING CENTER", "D-14"],
    ["King Sport ", "D-86"],
    ["City Moda Inversiones Z15", "D-26"],
    // Las letras son las mismas, solo cambian los espacios.
    ["LUTY LUI", "D-98"],
    ["Rja", "D-131"],
    // Alguien escribió el CÓDIGO en el campo del nombre.
    ["d-35", "D-35"],
  ])("«%s» → %s", (escrito, esperado) => {
    expect(codigos(escrito)[0]).toBe(esperado);
  });

  it("'LUTY LUI' contra 'Lutylui' no avisa que los nombres difieren", () => {
    // Son las mismas letras mal separadas, no dos nombres distintos.
    expect(primera("LUTY LUI")!.avisos).toEqual([]);
  });

  it("cuando hay DOS candidatos legítimos, se ofrecen los dos", () => {
    expect(codigos("Jerusalem")).toEqual(expect.arrayContaining(["D-80", "D-81"]));
    expect(codigos("METRO SHOES")).toEqual(expect.arrayContaining(["D-103", "D-173"]));
  });

  it("dice con qué texto pegó cuando no es el nombre que se muestra", () => {
    // `City Shoes` factura como "Zarina City Shoes, S.A." — sin decirlo, la
    // sugerencia parecería sacada de la nada.
    const s = primera("City Moda Inversiones Z15")!;
    expect(s.tambienConocidoComo).toBe("Inversiones Z15, S.A.");
    // Y cuando pegó con el nombre visible, no repite el texto.
    expect(primera("Hanna Calzado")!.tambienConocidoComo).toBeUndefined();
  });
});

describe("🔴 cuando no hay nada parecido, la lista queda VACÍA", () => {
  it.each([
    "ALMACEN JORDANIA",
    "Almacen Amin",
    "Business display",
    "DUCASA ",
    "HOTEL GRAN DAVID",
    "Punto Maravilloso ",
  ])("«%s» no tiene candidatos", (escrito) => {
    expect(sugerirClientes(escrito, DIRECTORIO)).toEqual([]);
  });

  it("'HOTEL GRAN DAVID' no arrastra a 'City Mall David' por compartir una palabra", () => {
    expect(codigos("HOTEL GRAN DAVID")).not.toContain("D-24");
  });

  it("texto vacío o sin letras no devuelve nada", () => {
    expect(sugerirClientes("", DIRECTORIO)).toEqual([]);
    expect(sugerirClientes("   ", DIRECTORIO)).toEqual([]);
    expect(sugerirClientes(null, DIRECTORIO)).toEqual([]);
    expect(sugerirClientes("Hanna Calzado", [])).toEqual([]);
  });
});

describe("🔴 D-201 no se recomienda", () => {
  it("'American Clasicc' va a D-108, no al duplicado", () => {
    const s = sugerirClientes("American Clasicc ", DIRECTORIO);
    expect(s.map((x) => x.codigo)).not.toContain("D-201");
    expect(s[0].codigo).toBe("D-108");
    // Y se muestra con el nombre que el personal reconoce, no con la razón social.
    expect(s[0].nombre).toBe("American Classics Store");
  });

  it("la lista de excluidos existe y dice por qué (está en el módulo)", () => {
    expect(CODIGOS_QUE_NO_SE_SUGIEREN).toContain("D-201");
    // Corta a propósito: cada entrada es un cliente que deja de ofrecerse.
    expect(CODIGOS_QUE_NO_SE_SUGIEREN.length).toBe(1);
  });
});

describe("detalles del motor", () => {
  it("no ofrece más de MAX_SUGERENCIAS", () => {
    expect(MAX_SUGERENCIAS).toBe(3);
    expect(sugerirClientes("City Moda Los Andes ", DIRECTORIO).length).toBeLessThanOrEqual(3);
  });

  it("la distancia de edición es la de siempre", () => {
    expect(distanciaEdicion("duty", "dutty")).toBe(1);
    expect(distanciaEdicion("clasicc", "classics")).toBe(2);
    expect(distanciaEdicion("", "abc")).toBe(3);
    expect(distanciaEdicion("abc", "abc")).toBe(0);
  });

  it("dos palabras cortas y distintas NO son la misma", () => {
    expect(mismaPalabra("king", "nine")).toBe(false);
    expect(mismaPalabra("shoes", "moda")).toBe(false);
    expect(mismaPalabra("shos", "shoes")).toBe(true);
  });

  it("🔴 'King Sport' no se parece a 'Nine Sports' aunque compartan 'sport'", () => {
    // Compartir una palabra CASI igual y corta no alcanza: sería el motor
    // ofreciendo cualquier cosa que termine en "shoes" o "sport".
    expect(codigos("King Sport ")).not.toContain("D-112");
  });
});
