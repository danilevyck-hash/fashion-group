// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO · UN CORREO LARGO NO SE MONTA SOBRE EL TELÉFONO (16-nov-2026)
//
// Error n.º 11 de la revisión de los videos: en la ficha del cliente, un correo
// de ~50 caracteres sin espacios (`administracion.contabilidad.tienda@…`) no se
// partía, el botón `flex-1` no bajaba de su ancho mínimo y el correo junto con
// «Escribir» invadían la columna de al lado. Medido a 1440 px: el correo medía
// 320 px dentro de una celda de 274, y «Escribir» quedaba en x = 1032, dentro
// de la columna «Teléfono» (que empieza en x = 998). En el celular (390 px),
// «Escribir» salía 29 px fuera de su celda.
//
// Arreglo en la pieza compartida `CampoEnLinea` (la misma para contacto, correo
// y teléfono): la celda flexible lleva `min-w-0` para poder encoger, y el texto
// `break-words` para partirse en dos renglones. El dato sigue entero y
// copiable: nunca se recorta con puntos suspensivos.
//
// jsdom no mide layout; se exige la estructura en el código fuente.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const fuente = readFileSync(join(__dirname, "../app/clientes/[codigo]/ClienteDetail.tsx"), "utf8");

/** El cuerpo de `CampoEnLinea`, desde su firma hasta el final del archivo. */
const campoEnLinea = fuente.slice(fuente.indexOf("function CampoEnLinea("));

describe("ficha del cliente · correo largo (n.º 11)", () => {
  it("existe la pieza compartida CampoEnLinea", () => {
    expect(campoEnLinea.length).toBeGreaterThan(0);
  });

  it("toda celda flexible del dato puede encoger (`flex-1` va con `min-w-0`)", () => {
    const clases = [...campoEnLinea.matchAll(/className="([^"]*\bflex-1\b[^"]*)"/g)].map((m) => m[1]);
    expect(clases.length).toBeGreaterThanOrEqual(2); // el botón de editar y el <div> de solo lectura
    for (const c of clases) expect(c).toMatch(/\bmin-w-0\b/);
  });

  it("el dato se parte en renglones (`break-words`) en vez de montarse", () => {
    // El texto que se muestra (edita y solo lectura) y el enlace de solo lectura.
    expect(campoEnLinea).toMatch(/className="text-gray-900 whitespace-pre-wrap break-words"/);
    expect(campoEnLinea).toMatch(/className="relative break-words text-blue-600/);
  });

  it("nunca se recorta el dato: ni `truncate` ni `overflow-hidden` sobre el correo", () => {
    expect(campoEnLinea).not.toMatch(/\btruncate\b/);
    expect(campoEnLinea).not.toMatch(/\btext-ellipsis\b/);
  });
});
