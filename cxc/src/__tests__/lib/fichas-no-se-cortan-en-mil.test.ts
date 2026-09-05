// ─────────────────────────────────────────────────────────────────────────────
// LA LECTURA DE «QUÉ FICHAS YA TENGO» SE PAGINA — Y SE VERIFICA CONTRA EL COUNT.
//
// 🩸 QUÉ PASÓ (medido el 5-sep-2026). `sync-articulo-info.ts` preguntaba, con un
// `select` pelado, qué artículos ya tenían ficha. `db-max-rows` es **1000 y
// corta EN SILENCIO**: el día que active_shoes pasó las 1.000 fichas traídas, la
// respuesta se quedó en 1.000 y el resto **volvió a verse como pendiente**.
//
// Medido ese día: **1.408 fichas de 1.763 artículos**. Se le pedían a Switch
// ~400 fichas por corrida que YA estaban, y como el presupuesto por corrida es
// fijo, **los 355 que faltaban de verdad no llegaban nunca**. El 2-sep eran 400
// fichas y todo funcionaba: el defecto se estrenó al cruzar el tope, sin un solo
// error en el log. Y esa clasificación es de donde sale el bulto del catálogo.
//
// ⚠️ Vistana tiene 8.273 artículos: cruza el tope ocho veces.
//
// LO QUE ESTE CANDADO EXIGE:
//   1. La lectura pasa por `leerTodoPaginado` (que verifica contra un COUNT
//      exacto y tira si sale incompleta), no por un `select` suelto.
//   2. Lleva `.order()` estable — sin él, paginar repite y saltea filas.
//   3. Sigue filtrando por `ficha_at` no nulo: preguntar por TODAS las filas
//      daría por hecha una ficha que nunca se pidió (ver `fichaLlego`).
//   4. El fallo de esa lectura NO se traduce en «no hay nada hecho».
//
// Es un barrido de código a propósito: montar el sync entero exigiría un cliente
// de Switch y una base, y lo que hay que proteger es la FORMA de la consulta.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../../..");
const FUENTE = readFileSync(path.join(RAIZ, "src/lib/switch-api/sync-articulo-info.ts"), "utf8");

/** El cuerpo de la fase de fichas, desde su marca hasta el final del archivo. */
const BLOQUE = FUENTE.slice(FUENTE.indexOf("switch_articulo_info fichas"));

describe("las fichas ya traídas se leen paginadas", () => {
  it("1 · usa leerTodoPaginado, que verifica contra el COUNT", () => {
    expect(FUENTE).toContain('from "@/lib/supabase-paginado"');
    expect(FUENTE).toContain("leerTodoPaginado<{ codigo: unknown }>");
    expect(BLOQUE).toContain("pedirCount");
    expect(BLOQUE).toContain('{ count: "exact" }');
  });

  it("2 · pagina con orden estable y con rango", () => {
    expect(BLOQUE).toContain('.order("codigo", { ascending: true })');
    expect(BLOQUE).toContain(".range(desde, hasta)");
  });

  it("3 · sigue preguntando SOLO por las que tienen ficha", () => {
    expect(BLOQUE).toContain('.not("ficha_at", "is", null)');
  });

  it("4 · no queda ninguna lectura sin paginar de switch_articulo_info en este archivo", () => {
    // Cada `.from("switch_articulo_info")` de la fase de fichas tiene que estar
    // dentro de una lectura paginada o ser la sonda de columnas (`.limit(1)`).
    const lecturas = [...FUENTE.matchAll(/\.from\("switch_articulo_info"\)/g)];
    expect(lecturas.length).toBeGreaterThan(0);
    for (const m of lecturas) {
      const ventana = FUENTE.slice(m.index ?? 0, (m.index ?? 0) + 420);
      const esSonda = ventana.includes(".limit(1)");
      const esUpsert = ventana.includes(".upsert(");
      // Un conteo con `head: true` no trae filas: no lo alcanza el tope.
      const esConteo = ventana.includes("head: true");
      const pagina = ventana.includes(".range(desde, hasta)");
      expect(
        esSonda || esUpsert || esConteo || pagina,
        `una lectura de switch_articulo_info no pagina ni es sonda ni conteo:\n${ventana.slice(0, 220)}`,
      ).toBe(true);
    }
  });

  it("5 · si la lectura falla, se salta la fase — nunca se asume que no hay nada hecho", () => {
    expect(BLOQUE).toContain("no pude leer qué fichas ya están");
    expect(BLOQUE).toContain("columnasListas: true");
    // El `catch` devuelve temprano: no puede seguir con un Set vacío.
    const iCatch = BLOQUE.indexOf("} catch (e) {");
    const iReturn = BLOQUE.indexOf("return { ...vacio, columnasListas: true };", iCatch);
    expect(iCatch).toBeGreaterThan(-1);
    expect(iReturn).toBeGreaterThan(iCatch);
  });

  it("6 · el otro lector de fichas (el catálogo de Reebok) también pagina", () => {
    const reebok = readFileSync(path.join(RAIZ, "src/lib/switch-api/sync-catalogo-reebok.ts"), "utf8");
    expect(reebok).toContain(".range(p * 1000, p * 1000 + 999)");
    expect(reebok).toContain('.order("codigo", { ascending: true })');
  });
});
