// ─────────────────────────────────────────────────────────────────────────────
// El buscador de clientes filtra en el NAVEGADOR, y tiene que dar exactamente
// lo mismo que daba el servidor.
//
// 🩸 Contexto (3-ago-2026). Daniel: *"no me gusta que demore en buscar"*. Cada
// pausa de tecleo salía a la red, y el endpoint —para responder— leía
// `clientes_master` ENTERA (5.063 filas) antes de achicarla al grupo (~150).
// Ahora el directorio se trae UNA vez y se filtra en memoria.
//
// El riesgo de ese cambio no es la velocidad: es que el filtro local se
// comporte DISTINTO al del servidor. Ahí el usuario vería resultados que
// dependen de si el caché cargó o no — un bug irreproducible. Por eso el hook
// importa `coincideBusqueda`, el MISMO módulo puro que usa el endpoint, y este
// test fija esa equivalencia además de prohibir que alguien escriba el filtro
// a mano en el futuro.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { coincideBusqueda } from "@/lib/buscar-normalizado";

const hook = readFileSync(
  path.join(process.cwd(), "src/lib/hooks/useBusquedaClientes.ts"),
  "utf8",
);

// El universo real que Daniel tenía enfrente cuando reportó el problema.
const CLIENTES = [
  { codigo: "D-24", nombre: "City Mall David", razon_social: null },
  { codigo: "D-25", nombre: "City Mall Paso Canoa", razon_social: null },
  { codigo: "D-26", nombre: "City Moda Chorrera", razon_social: null },
  { codigo: "D-35", nombre: "City Shoes", razon_social: null },
  { codigo: "D-108", nombre: "Multi Fashion Holding", razon_social: null },
  { codigo: "D-81", nombre: "Jerusalem Duty Free", razon_social: null },
];

const buscar = (q: string) =>
  CLIENTES.filter((c) => coincideBusqueda(q, [c.nombre, c.razon_social, c.codigo])).map(
    (c) => c.codigo,
  );

describe("🔴 el filtro local usa el mismo criterio que el servidor", () => {
  it("el hook importa `coincideBusqueda`, no escribe el suyo", () => {
    expect(hook).toContain('from "@/lib/buscar-normalizado"');
    expect(hook).toContain("coincideBusqueda(q, [c.nombre, c.razon_social, c.codigo])");
  });

  it("no quedó un filtro a mano (toLowerCase + includes)", () => {
    expect(hook).not.toMatch(/\.toLowerCase\(\)\s*\.includes\(/);
  });
});

describe("🔴 el fallback: nunca mostrar una lista recortada como completa", () => {
  it("compara lo recibido contra `total` antes de dar por completo el directorio", () => {
    expect(hook).toContain("if (clientes.length < total) return { completo: false");
  });

  it("si no está completo, consulta al servidor como antes", () => {
    expect(hook).toContain("/api/clientes?q=");
  });

  it("un fallo de carga NO envenena el caché para toda la sesión", () => {
    expect(hook).toContain("cache = null;");
  });
});

describe("resultados: lo que Daniel escribió de verdad", () => {
  it('"City" trae los 4 que empiezan con City, y NO el duty free', () => {
    const r = buscar("City");
    expect(r).toEqual(["D-24", "D-25", "D-26", "D-35"]);
  });

  it('"city mall" trae exactamente los 2 reales', () => {
    expect(buscar("city mall")).toEqual(["D-24", "D-25"]);
  });

  it("ignora acentos, mayúsculas y espacios de más", () => {
    expect(buscar("CITY MALL")).toEqual(["D-24", "D-25"]);
    expect(buscar("citymall")).toEqual(["D-24", "D-25"]);
  });

  it('"multifashion" sin espacio encuentra "Multi Fashion Holding"', () => {
    // El caso que originó `buscar-normalizado`; el filtro local lo conserva.
    expect(buscar("multifashion")).toEqual(["D-108"]);
  });

  it("busca también por código", () => {
    expect(buscar("D-81")).toEqual(["D-81"]);
    expect(buscar("d81")).toEqual(["D-81"]);
  });

  it("algo que no existe no trae nada", () => {
    expect(buscar("zzzz")).toEqual([]);
  });
});

describe("el caché vive a nivel de módulo, no de componente", () => {
  it("una guía con 10 filas no dispara 10 lecturas idénticas", () => {
    expect(hook).toMatch(/^let cache: Promise<Directorio> \| null = null;/m);
  });

  it("se puede invalidar al editar un cliente", () => {
    expect(hook).toContain("export function invalidarDirectorioClientes");
  });
});
