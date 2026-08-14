// ─────────────────────────────────────────────────────────────────────────────
// LA DIRECCIÓN DEL CLIENTE, COMO PRIMERA OPCIÓN.
//
// Daniel, textual: *«Ponerla sola, pero sí como primera opción.»*
//
// 🔑 EL MATIZ ES LA MITAD DEL PEDIDO: aparece PRIMERA en la lista, no se
// escribe sola en el campo. Por eso el módulo devuelve una LISTA y no expone
// ningún "elegido" del que alguien pueda deducir "escribí esto".
//
// Los datos son los MEDIDOS contra producción el 14-ago-2026 (491 envíos vivos,
// 200 guías desde el 25-mar):
//   · 380 envíos atados a un cliente del directorio
//   · 47 clientes atados · 37 con UNA SOLA dirección en toda su historia
//   · "la anterior acierta": 267/333 = 80,2% por código
//   · 78 direcciones distintas; Paso Canoas 192 · David 98 · Santiago 26 ·
//     Changinola 21 · Guabito 11
//
// ⚠️ Y LA EMPRESA NO ENTRA ACÁ, medido con el mismo método: la empresa anterior
// de un cliente acierta 114/333 = 34,2%. Autocompletarla metería el dato
// equivocado en dos de cada tres envíos.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sugerenciasDireccion,
  ultimaDireccionPorCliente,
} from "@/lib/guias/direccion-sugerida";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const GUIAS = [
  { id: "g1", fecha: "2026-03-25", numero: 1 },
  { id: "g2", fecha: "2026-06-10", numero: 40 },
  { id: "g3", fecha: "2026-08-11", numero: 194 },
  // Dos del MISMO día: el número correlativo desempata.
  { id: "g4", fecha: "2026-08-11", numero: 196 },
];

describe("🔴 la última dirección de cada cliente", () => {
  it("es la de la guía MÁS RECIENTE, no la primera que aparezca", () => {
    const mapa = ultimaDireccionPorCliente(
      [
        { guia_id: "g1", cliente_codigo: "D-25", direccion: "David" },
        { guia_id: "g3", cliente_codigo: "D-25", direccion: "Paso Canoas" },
        { guia_id: "g2", cliente_codigo: "D-25", direccion: "Santiago" },
      ],
      GUIAS,
    );
    expect(mapa["D-25"]).toBe("Paso Canoas");
  });

  it("dos guías del mismo día se desempatan por el número (es correlativo)", () => {
    const mapa = ultimaDireccionPorCliente(
      [
        { guia_id: "g4", cliente_codigo: "D-24", direccion: "Guabito" },
        { guia_id: "g3", cliente_codigo: "D-24", direccion: "David" },
      ],
      GUIAS,
    );
    expect(mapa["D-24"]).toBe("Guabito");
  });

  it("solo cuenta el cliente del DIRECTORIO: sin código no hay sugerencia", () => {
    // Por nombre normalizado el acierto baja de 80,2% a 67,2%, y el mismo
    // negocio se escribe de varias formas ("City Mall" / "City Mall Paso
    // Canoa"). Cuando hay código, es inequívoco.
    const mapa = ultimaDireccionPorCliente(
      [{ guia_id: "g3", cliente_codigo: "", direccion: "Paso Canoas" }],
      GUIAS,
    );
    expect(mapa).toEqual({});
  });

  it("un envío sin dirección no ensucia el mapa", () => {
    const mapa = ultimaDireccionPorCliente(
      [
        { guia_id: "g3", cliente_codigo: "D-80", direccion: "  " },
        { guia_id: "g1", cliente_codigo: "D-80", direccion: "Panamá" },
      ],
      GUIAS,
    );
    expect(mapa["D-80"]).toBe("Panamá");
  });

  it("un envío o una guía BORRADOS no sugieren nada", () => {
    const mapa = ultimaDireccionPorCliente(
      [
        { guia_id: "g3", cliente_codigo: "D-25", direccion: "Guabito", deleted: true },
        { guia_id: "gX", cliente_codigo: "D-25", direccion: "Chitré" },
        { guia_id: "g1", cliente_codigo: "D-25", direccion: "David" },
      ],
      [...GUIAS, { id: "gX", fecha: "2026-08-12", numero: 200, deleted: true }],
    );
    expect(mapa["D-25"]).toBe("David");
  });

  it("el caso REAL: 37 de 47 clientes tienen una sola dirección — ahí siempre acierta", () => {
    const mapa = ultimaDireccionPorCliente(
      [
        { guia_id: "g1", cliente_codigo: "D-25", direccion: "Paso Canoas" },
        { guia_id: "g2", cliente_codigo: "D-25", direccion: "Paso Canoas" },
        { guia_id: "g3", cliente_codigo: "D-25", direccion: "Paso Canoas" },
      ],
      GUIAS,
    );
    expect(mapa["D-25"]).toBe("Paso Canoas");
  });
});

describe("🔴 la sugerencia va PRIMERA, y no se escribe sola", () => {
  const BASE = ["David", "Paso Canoas", "Santiago", "Changinola"];

  it("la del cliente encabeza la lista", () => {
    expect(sugerenciasDireccion("Santiago", BASE)[0]).toBe("Santiago");
  });

  it("y NO se repite más abajo", () => {
    const lista = sugerenciasDireccion("Santiago", BASE);
    expect(lista.filter((d) => d === "Santiago")).toHaveLength(1);
    expect(lista).toEqual(["Santiago", "David", "Paso Canoas", "Changinola"]);
  });

  it("la lista de siempre NO se pierde: la dirección se puede cambiar a cualquier otra", () => {
    const lista = sugerenciasDireccion("Santiago", BASE);
    for (const d of BASE) expect(lista).toContain(d);
  });

  it("sin dirección conocida devuelve la lista de siempre, tal cual", () => {
    expect(sugerenciasDireccion(undefined, BASE)).toEqual(BASE);
    expect(sugerenciasDireccion("", BASE)).toEqual(BASE);
    expect(sugerenciasDireccion("   ", BASE)).toEqual(BASE);
  });

  it("una dirección que NO está en la lista base igual se ofrece primera", () => {
    expect(sugerenciasDireccion("Guabito", BASE)[0]).toBe("Guabito");
    expect(sugerenciasDireccion("Guabito", BASE)).toHaveLength(BASE.length + 1);
  });

  it("no duplica por mayúsculas o espacios de más", () => {
    expect(sugerenciasDireccion("PASO CANOAS", ["Paso Canoas", "David"])).toEqual(["PASO CANOAS", "David"]);
    expect(sugerenciasDireccion("Paso  Canoas", ["Paso Canoas"])).toHaveLength(1);
  });

  it("🔑 devuelve una LISTA: no hay ningún campo del que deducir 'escribí esto'", () => {
    const lista = sugerenciasDireccion("Santiago", BASE);
    expect(Array.isArray(lista)).toBe(true);
    expect(lista.every((d) => typeof d === "string")).toBe(true);
  });
});

describe("⚠️ la EMPRESA no se autocompleta, y el código no puede empezar a hacerlo", () => {
  it("el módulo no expone nada de empresa", () => {
    const modulo = sinComentarios(leer("src/lib/guias/direccion-sugerida.ts"));
    expect(modulo).not.toContain("empresa:");
    expect(modulo).not.toMatch(/\bempresaPorCliente\b/);
  });

  it("la ruta de frecuencias no devuelve una empresa por cliente", () => {
    const ruta = sinComentarios(leer("src/app/api/guias/frecuencias/route.ts"));
    expect(ruta).toContain("direcciones");
    expect(ruta).not.toMatch(/empresaPorCliente|ultimaEmpresaPorCliente/);
    // Las empresas siguen siendo la lista de las 8 ordenada por frecuencia,
    // que es lo que ya existía y no se tocó.
    expect(ruta).toContain("empresas");
  });

  it("el formulario no le pone una lista propia al campo de empresa", () => {
    const form = sinComentarios(leer("src/app/guias/components/GuiaForm.tsx"));
    const i = form.indexOf("function campoEmpresa");
    const bloque = form.slice(i, form.indexOf("function campoFacturas"));
    expect(i).toBeGreaterThan(0);
    expect(bloque).not.toContain("direccionPorCliente");
    expect(bloque).not.toContain("idListaDirecciones");
  });
});
