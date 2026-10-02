// ============================================================================
// 🔴 «APROBACIONES ▾» SE ABRE CON UN TOQUE EN EL IPHONE (2-oct-2026).
//
// 🩸 Daniel, desde el iPhone: tocaba «Aprobaciones ▾» y no pasaba nada.
// Medido a 390 px: la fila entera era un <label> de 358 px y la lista solo
// medía su texto (143 px). El ▾ y el resto de la fila eran el RÓTULO, y en iOS
// Safari tocar un rótulo enfoca la lista pero NO la abre.
//
// Lo que este candado congela: la lista nativa, invisible, CUBRE todo lo que
// se ve («Aprobaciones ▾»), y no vive dentro de un <label>.
//
// Mutaciones que caza: (a) volver a envolverla en <label> · (b) quitarle
// `absolute inset-0` (vuelve a medir solo su texto) · (c) dejar la lista
// visible con su propio texto, otra vez con el ancho del navegador.
// Controles: el cambio sigue pasando por `irAPestana` (push en el celular) y
// la empresa, que es una lista normal con borde, no se toca.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FUENTE = readFileSync(
  join(__dirname, "..", "..", "app", "asistencia", "AsistenciaClient.tsx"),
  "utf8",
);

/** El bloque del selector de sección: desde que se elige dibujarlo hasta su </select>. */
function bloque(): string {
  const i = FUENTE.indexOf("selectorDeSeccionEnCelular(celular) ? (");
  expect(i).toBeGreaterThan(-1);
  expect(FUENTE.indexOf("data-selector-seccion", i)).toBeGreaterThan(i);
  // Se saltan los comentarios: ahí sí se puede hablar del <label> de antes.
  return FUENTE.slice(i, FUENTE.indexOf("</select>", i)).replace(/\/\/.*$/gm, "");
}

describe("el selector de sección del celular", () => {
  it("la lista cubre exactamente lo que se ve", () => {
    const b = bloque();
    const select = b.slice(b.indexOf("<select"));
    expect(select).toMatch(/aria-label="Sección"/);
    expect(select).toMatch(/className="[^"]*\babsolute inset-0\b[^"]*"/);
    expect(select).toMatch(/className="[^"]*\bopacity-0\b[^"]*"/);
    // El contenedor es `relative`, para que el `inset-0` sea el suyo.
    expect(b.slice(0, b.indexOf("<select"))).toMatch(/data-selector-seccion\s+className="relative inline-flex/);
  });

  it("no vive dentro de un <label> (en iOS el rótulo no abre la lista)", () => {
    const b = bloque();
    expect(b).not.toMatch(/<label/);
  });

  it("el texto visible sale de la pestaña elegida, no de la lista", () => {
    expect(bloque()).toMatch(/visibles\.find\(\(\[k\]\) => k === tab\)/);
  });

  it("control: elegir sigue pasando por irAPestana", () => {
    expect(FUENTE).toMatch(/aria-label="Sección"[\s\S]{0,200}onChange=\{\(e\) => irAPestana\(/);
  });

  it("control: la empresa sigue siendo una lista normal con su borde", () => {
    expect(FUENTE).toMatch(/aria-label="Empresa"[\s\S]{0,200}rounded-lg border border-gray-200/);
  });
});
