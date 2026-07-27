/**
 * La UI cerrada no puede ser la única garantía.
 *
 * Desde jul-2026 el formulario obliga a elegir una de las 8 empresas del grupo,
 * pero la API aceptaba cualquier string en `guia_items.empresa` — que es
 * exactamente cómo se llenó de "VISTANA" y "VISTANA / FASHION WEAR". Un
 * formulario cerrado con una API abierta da una falsa sensación de garantía: el
 * próximo escritor (un import, un script, una pestaña abierta con el bundle
 * viejo) vuelve a ensuciarla.
 *
 * La regla tiene dos puertas distintas A PROPÓSITO — ver validar-items.ts.
 */
import { describe, it, expect } from "vitest";
import { EMPRESAS_GUIA, validarEmpresasItems } from "@/lib/guias/validar-items";

describe("POST · una guía NUEVA no tiene excusa histórica", () => {
  it("acepta las 8 del grupo", () => {
    for (const e of EMPRESAS_GUIA) {
      expect(validarEmpresasItems([{ empresa: e }]), e).toBeNull();
    }
  });

  it("rechaza el texto sucio que hoy tienen las guías viejas", () => {
    for (const sucio of ["VISTANA", "VISTANA / FASHION WEAR", "MultiFashion Holding", "vistana international"]) {
      expect(validarEmpresasItems([{ empresa: sucio }]), sucio).toMatch(/no es una de las del grupo/);
    }
  });

  it("el mensaje de error dice qué hacer, en español simple", () => {
    const msg = validarEmpresasItems([{ empresa: "VISTANA" }]);
    expect(msg).toBe('La empresa "VISTANA" no es una de las del grupo. Elige una de la lista.');
  });

  it("basta UNA fila mala para rechazar toda la guía", () => {
    expect(
      validarEmpresasItems([{ empresa: "Fashion Wear" }, { empresa: "INVENTADA" }]),
    ).toMatch(/INVENTADA/);
  });

  it("vacío no se valida acá: eso lo exige el formulario, no este guard", () => {
    expect(validarEmpresasItems([{ empresa: "" }])).toBeNull();
    expect(validarEmpresasItems([{}])).toBeNull();
  });

  it("una guía sin ítems no rompe", () => {
    expect(validarEmpresasItems([])).toBeNull();
  });

  it("los espacios de sobra no convierten un valor bueno en malo", () => {
    expect(validarEmpresasItems([{ empresa: "  Fashion Wear  " }])).toBeNull();
  });
});

describe("PUT · una guía VIEJA se tiene que poder editar y guardar", () => {
  // Este es el riesgo del cambio: si el guard fuera igual de estricto en las dos
  // puertas, abrir GT-012 (empresa "VISTANA / FASHION WEAR"), corregir un número
  // de factura y guardar daría 400 — la guía quedaría atrapada.
  const heredadas = ["VISTANA / FASHION WEAR"];

  it("conservar el valor sucio que ya estaba guardado PASA", () => {
    expect(validarEmpresasItems([{ empresa: "VISTANA / FASHION WEAR" }], heredadas)).toBeNull();
  });

  it("cambiarlo a una de las 8 también pasa", () => {
    expect(validarEmpresasItems([{ empresa: "Fashion Wear" }], heredadas)).toBeNull();
  });

  it("pero NO se puede meter un valor sucio NUEVO amparándose en el viejo", () => {
    expect(validarEmpresasItems([{ empresa: "OTRA COSA" }], heredadas)).toMatch(/OTRA COSA/);
  });

  it("la excepción es por guía: lo heredado de OTRA guía no sirve", () => {
    expect(validarEmpresasItems([{ empresa: "VISTANA" }], heredadas)).toMatch(/VISTANA/);
  });

  it("sin nada heredado, PUT es tan estricto como POST", () => {
    expect(validarEmpresasItems([{ empresa: "VISTANA" }], [])).toMatch(/no es una de las del grupo/);
  });

  it("una guía con varias empresas sucias las conserva todas", () => {
    const varias = ["VISTANA", "F. WEAR"];
    expect(validarEmpresasItems([{ empresa: "VISTANA" }, { empresa: "F. WEAR" }], varias)).toBeNull();
  });
});

describe("una sola fuente de empresas", () => {
  it("el servidor y el formulario validan contra la MISMA lista", async () => {
    const { EMPRESAS_CANONICAS } = await import("@/app/guias/components/guia-form-logic");
    expect(EMPRESAS_GUIA).toEqual(EMPRESAS_CANONICAS);
  });

  it("las dos rutas de escritura pasan por el guard", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const ruta of ["src/app/api/guias/route.ts", "src/app/api/guias/[id]/route.ts"]) {
      const src = readFileSync(resolve(process.cwd(), ruta), "utf8");
      expect(src, ruta).toContain("validarEmpresasItems");
    }
  });

  it("el PUT valida ANTES de escribir la cabecera (un body malo no deja la guía a medias)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "src/app/api/guias/[id]/route.ts"), "utf8");
    const guard = src.indexOf("validarEmpresasItems(items, heredadas)");
    const update = src.indexOf('.from("guia_transporte").update(updateData)');
    expect(guard).toBeGreaterThan(0);
    expect(update).toBeGreaterThan(0);
    expect(guard).toBeLessThan(update);
  });
});
