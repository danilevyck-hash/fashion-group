// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «AMERICAN CLASSICS» DEJA DE ESTAR REPETIDO.
//
// Daniel, 5-sep-2026: *«Multifashion y american classic es el mismo»* y
// *«escoge al cliente multifashion, que amarre ese, pero que se escriba
// American Classics en la guía»*.
//
// 🩸 Medido contra producción ese día:
//   · `D-201 American Classics` NO existe en `switch_clientes` en ninguna de las
//     6 empresas del grupo, no tiene ni una factura, y vive solo en
//     `clientes_master` y en **2 renglones** de guías de agosto (los dos con
//     `facturas = '0000'`).
//   · `D-108 Multi Fashion Holding` está en las 6 y lleva **49 renglones**.
//
// 🔑 LA MITAD DEL NOMBRE YA ESTABA HECHA. El alias D-108 → «American Classics
// Store» existe desde el 9-ago-2026 en `lib/clientes/nombre-display.ts`, es
// BUSCABLE, y tiene candado propio que prohíbe escribirlo a mano en otro
// archivo. Lo nuevo del 5-sep es solo que **D-201 deja de ofrecerse**.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  CODIGOS_RETIRADOS_DE_GUIAS,
  CODIGO_AMERICAN_CLASSICS_RETIRADO,
  CODIGO_MULTIFASHION,
  estaRetiradoDeGuias,
  sinLosRetiradosDeGuias,
} from "@/lib/guias/american-classics";
import { nombreParaMostrar } from "@/lib/clientes/nombre-display";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

describe("🔴 D-201 deja de ofrecerse al armar una guía", () => {
  it("la lista de retirados es EXPLÍCITA y hoy tiene solo a D-201", () => {
    expect(CODIGO_AMERICAN_CLASSICS_RETIRADO).toBe("D-201");
    expect([...CODIGOS_RETIRADOS_DE_GUIAS]).toEqual(["D-201"]);
  });

  it("reconoce el código sin bordes y sin importar mayúsculas", () => {
    expect(estaRetiradoDeGuias("D-201")).toBe(true);
    expect(estaRetiradoDeGuias(" d-201 ")).toBe(true);
  });

  it("🔴 D-108 NO está retirado: es el que factura en las 6 empresas", () => {
    expect(CODIGO_MULTIFASHION).toBe("D-108");
    expect(estaRetiradoDeGuias("D-108")).toBe(false);
    expect(estaRetiradoDeGuias("D-25")).toBe(false);
    expect(estaRetiradoDeGuias("")).toBe(false);
    expect(estaRetiradoDeGuias(null)).toBe(false);
  });

  it("filtra una lista de clientes sin mutarla", () => {
    const lista = [{ codigo: "D-25" }, { codigo: "D-201" }, { codigo: "D-108" }];
    const salida = sinLosRetiradosDeGuias(lista);
    expect(salida.map((c) => c.codigo)).toEqual(["D-25", "D-108"]);
    expect(lista).toHaveLength(3);
  });
});

describe("🔴 el NOMBRE de D-108 lo decide UN solo módulo", () => {
  it("al elegir D-108 el selector escribe el alias que usa la bodega", () => {
    expect(nombreParaMostrar("D-108", "Multi Fashion Holding")).toBe("American Classics Store");
  });

  it("🔴 y guías NO escribe ese texto por su cuenta", () => {
    // Dos alias es cómo la pantalla termina contradiciéndose: el chip diría un
    // nombre que, tecleado en el selector, no encuentra nada.
    const enGuias = leer("src/lib/guias/american-classics.ts");
    expect(enGuias).not.toMatch(/=\s*"American Classics Store"/);
    expect(enGuias).not.toContain("export function nombreEnLaGuia");
  });

  it("el selector aplica el alias al dibujar Y al elegir", () => {
    const picker = leer("src/components/ClientePicker.tsx");
    expect(picker).toContain("nombreParaMostrar(hit.codigo, hit.nombre)");
    expect(picker).toContain("onElegir(nombre, hit.codigo)");
  });
});

describe("🔴 las TRES puertas al cliente de una guía filtran al retirado", () => {
  const puertas: Array<[string, string]> = [
    ["el renglón del formulario", "src/app/guias/components/GuiaForm.tsx"],
    ["el panel de facturas", "src/app/guias/components/FacturasDelCliente.tsx"],
    ["la ventana de atar cliente", "src/app/guias/components/AtarClienteModal.tsx"],
  ];

  it.each(puertas)("%s le pasa codigosOcultos al selector", (_n, ruta) => {
    const src = leer(ruta);
    expect(src).toContain("codigosOcultos={CODIGOS_RETIRADOS_DE_GUIAS}");
    expect(src).toContain('from "@/lib/guias/american-classics"');
  });

  it("el selector esconde el retirado de la BÚSQUEDA, de «Más usados» y de la red de seguridad", () => {
    const picker = leer("src/components/ClientePicker.tsx");
    // Las tres listas pasan por el mismo filtro: dejar una sin filtrar deja
    // el retirado a un toque por la otra puerta.
    expect(picker).toContain("const hitsVisibles = ocultar(hits)");
    expect(picker).toContain("ocultar(topClientes ?? [])");
    expect(picker).toContain("ocultar(directorioCrudo)");
    // Y el Enter elige de la lista ya filtrada.
    expect(picker).toContain("const primero = hitsVisibles[0] ?? listaTop[0]");
  });

  it("«Más usados» tampoco lo trae desde el servidor", () => {
    const ruta = leer("src/app/api/guias/frecuencias/route.ts");
    expect(ruta).toContain("!estaRetiradoDeGuias(c)");
  });
});

describe("⚠️ lo que NO se toca", () => {
  it("no hay ninguna migración que borre a D-201 del directorio", () => {
    // «No se borra, deja de ofrecerse» — el mismo mecanismo que los ausentes.
    const src = leer("src/lib/guias/american-classics.ts");
    expect(src).toContain("no se borra");
  });

  it("🔴 las 2 guías viejas de D-201 no se tocan: nadie reescribe guia_items", () => {
    for (const p of [
      "src/lib/guias/american-classics.ts",
      "src/app/api/guias/frecuencias/route.ts",
    ]) {
      const src = leer(p);
      expect(src).not.toMatch(/from\("guia_items"\)[\s\S]{0,80}\.update\(/);
      expect(src).not.toContain('cliente_codigo: "D-108"');
    }
  });
});
