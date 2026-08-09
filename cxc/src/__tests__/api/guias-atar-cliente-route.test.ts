// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — "atar el cliente" NO puede volverse una edición de la guía.
//
// El contrato tiene dos mitades y las dos son fáciles de romper sin querer:
//
//   1. Una guía **Completada** sigue CERRADA a edición. El PUT y el PATCH de
//      `/api/guias/[id]` tienen que seguir devolviendo "Guía ya despachada, no
//      se puede editar". Si alguien "simplifica" moviendo `cliente_codigo` al
//      PUT, ese candado se lo lleva puesto.
//
//   2. …y por eso mismo el endpoint de atar NO puede mirar el estado. Medido el
//      8-ago-2026: **174 de 177 guías vivas están Completadas**. Un
//      `if (estado === "Completada") return 400` acá dejaría el 98% de las
//      guías del sistema inatables para siempre — que es exactamente el
//      problema que este endpoint vino a resolver.
//
// Se lee el fuente porque lo que se está fijando es una PROPIEDAD del archivo
// ("no consulta el estado", "toca una sola columna"), no el valor que devuelve
// una llamada. Mismo enfoque que `clientes-puerta-unica.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

const ATAR = "src/app/api/guias/[id]/cliente/route.ts";
const GUIA = "src/app/api/guias/[id]/route.ts";

/** Quita comentarios de línea y de bloque: la prohibición es sobre el CÓDIGO,
 *  y estos archivos explican en prosa justamente lo que no hacen. */
function soloCodigo(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("PATCH /api/guias/[id]/cliente — atar no es editar", () => {
  const codigo = soloCodigo(leer(ATAR));

  it("🩸 NO mira el estado de la guía: una Completada se puede atar igual", () => {
    expect(codigo).not.toMatch(/Completada/);
    expect(codigo).not.toMatch(/\bestado\b/);
  });

  it("escribe UNA sola columna, `cliente_codigo`, y nunca pisa el texto `cliente`", () => {
    const updates = codigo.match(/\.update\(\s*\{[^}]*\}/g) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatch(/cliente_codigo/);
    // `cliente:` a secas sería pisar el texto que escribió bodega.
    expect(updates[0]).not.toMatch(/\bcliente\s*:/);
  });

  it("no toca `guia_transporte` más que para comprobar que la guía existe", () => {
    const tocaGuia = codigo.match(/from\("guia_transporte"\)[\s\S]{0,120}/g) ?? [];
    expect(tocaGuia).toHaveLength(1);
    expect(tocaGuia[0]).toMatch(/\.select\(/);
    expect(codigo).not.toMatch(/from\("guia_transporte"\)\s*\.update/);
  });

  it("exige que la línea sea DE ESA guía (si no, cualquier id de línea serviría)", () => {
    expect(codigo).toMatch(/\.eq\("guia_id",\s*id\)/);
  });

  it("valida el código por el módulo compartido, no con un regex propio", () => {
    expect(codigo).toMatch(/validarCodigoParaAtar/);
    expect(codigo).toMatch(/leerClientesDelGrupo/);
  });

  it("es de escritura: vendedor no entra", () => {
    expect(codigo).toMatch(/requireRole/);
    expect(codigo).not.toMatch(/"vendedor"/);
  });
});

describe("en pantalla: una línea YA atada también se puede corregir", () => {
  // 🩸 Lo encontró el dogfood, no el código. La primera versión pintaba el
  // código puesto como un `<span>` muerto: se podía ATAR, pero una línea atada
  // al cliente EQUIVOCADO no se podía arreglar nunca desde la pantalla. Y hay
  // una así en producción — GT-183, atada a `111380`, que es un código de
  // Confecciones Boston. El chip tiene que ser un botón.
  const lista = leer("src/app/guias/components/GuiasList.tsx");
  const codigo = soloCodigo(lista);

  it("el chip del código es un botón que abre la ventana, no texto muerto", () => {
    const bloque = codigo.slice(codigo.indexOf("item.cliente_codigo ?"));
    const primeros = bloque.slice(0, 900);
    expect(primeros).toMatch(/<button/);
    expect(primeros).toMatch(/onAtarCliente\?\.\(item\)/);
  });

  it("los dos caminos (atar y corregir) piden el mismo permiso", () => {
    const veces = (codigo.match(/puedeAtarCliente && item\.id/g) ?? []).length;
    expect(veces).toBe(2);
  });
});

describe("el candado de Completada sigue en pie donde SÍ corresponde", () => {
  const guia = leer(GUIA);

  it("el PUT y el PATCH de la guía siguen rechazando editar una despachada", () => {
    const rechazos = guia.match(/Guía ya despachada, no se puede editar/g) ?? [];
    expect(rechazos.length).toBeGreaterThanOrEqual(2);
  });
});
