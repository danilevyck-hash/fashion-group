// ─────────────────────────────────────────────────────────────────────────────
// LA FACTURA TAMBIÉN ENTRA COMO FOTO (24-sep-2026).
//
// 🩸 Qué pasaba: `FacturaPdfUploader` pedía `accept="application/pdf"`, así que
// en el iPhone «Elegir archivo» abría **Archivos y nada más** —ni la cámara ni
// la fototeca—, y el PDF es obligatorio para guardar: desde el teléfono NO
// había forma de empezar un reclamo. La factura le llega a Andrea por CORREO y
// a Daniel muchas veces en papel.
//
// 🔴 LO QUE ESTE CANDADO SOSTIENE:
//   1. Un PDF sigue viajando EXACTAMENTE como antes: bloque `document`,
//      `media_type: "application/pdf"`, el mismo base64.
//   2. Una foto viaja como bloque `image` con SU tipo.
//   3. Cualquier otra cosa se RECHAZA, en español, y no llega al proveedor.
//   4. El prompt, el modelo, el parser y el bucket no cambian.
//   5. La caja de la factura ofrece foto y PDF, y su validación ya no rechaza
//      lo que no es PDF.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  TIPO_PDF,
  TIPOS_IMAGEN,
  bloqueDeArchivo,
  esTipoQueLee,
  tipoPorNombre,
} from "@/lib/ia/bloque-archivo";
import { MODELO_LECTOR, PROMPT_LECTOR } from "@/lib/reclamos/lector-factura";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

describe("El bloque que viaja al modelo", () => {
  it("un PDF va como `document`, con el media_type de siempre", () => {
    const b = bloqueDeArchivo(TIPO_PDF, "QkFTRTY0");
    expect(b.type).toBe("document");
    expect(b.source.media_type).toBe("application/pdf");
    expect(b.source.type).toBe("base64");
    expect(b.source.data).toBe("QkFTRTY0");
  });

  it("una foto va como `image`, con SU tipo", () => {
    for (const tipo of TIPOS_IMAGEN) {
      const b = bloqueDeArchivo(tipo, "Rk9UTw==");
      expect(b.type).toBe("image");
      expect(b.source.media_type).toBe(tipo);
      expect(b.source.data).toBe("Rk9UTw==");
    }
  });

  it("cualquier otro tipo se rechaza, y lo dice en español", () => {
    for (const tipo of ["application/msword", "text/plain", "application/zip", "", "image/tiff"]) {
      expect(() => bloqueDeArchivo(tipo, "WA==")).toThrow(/PDF o una foto/);
    }
    expect(esTipoQueLee("application/zip")).toBe(false);
    expect(esTipoQueLee(TIPO_PDF)).toBe(true);
  });

  it("sin extensión conocida el archivo guardado se sigue leyendo como PDF", () => {
    expect(tipoPorNombre("abc/123_factura.pdf")).toBe(TIPO_PDF);
    expect(tipoPorNombre("abc/123_factura")).toBe(TIPO_PDF);
    expect(tipoPorNombre("abc/123_factura.JPG")).toBe("image/jpeg");
    expect(tipoPorNombre("abc/123_factura.jpeg?token=1")).toBe("image/jpeg");
    expect(tipoPorNombre("abc/123_factura.png")).toBe("image/png");
    expect(tipoPorNombre("abc/123_factura.webp")).toBe("image/webp");
  });
});

describe("Lo que NO cambió", () => {
  it("el punto único de llamada arma el bloque con `bloqueDeArchivo` y no con un `document` a mano", () => {
    const src = leer("src/lib/ia/anthropic.ts");
    expect(src).toContain("bloqueDeArchivo(");
    // Ni un segundo armador de bloques suelto adentro del `messages.create`.
    expect(src).not.toMatch(/type:\s*"document"/);
  });

  it("el modelo y el prompt del lector de Reclamos son los mismos", () => {
    expect(MODELO_LECTOR).toBe("claude-sonnet-4-6");
    expect(PROMPT_LECTOR).toContain('"empresa_facturada"');
    expect(PROMPT_LECTOR).toContain('"lineas"');
  });

  it("la ruta que lee la factura no cambió de bucket ni de parser", () => {
    const src = leer("src/app/api/reclamos/ia/leer-factura/route.ts");
    expect(src).toContain("FACTURA_BUCKET");
    expect(src).toContain("parsearRespuestaLector");
    expect(src).toContain("PROMPT_LECTOR");
  });
});

describe("La caja de la factura, en el teléfono", () => {
  const uploader = leer("src/app/reclamos/components/FacturaPdfUploader.tsx");

  it("acepta foto y PDF", () => {
    expect(uploader).toMatch(/accept=\{?["'{][^\n]*image\/\*/);
    expect(uploader).toContain("application/pdf");
  });

  it("ya no rechaza lo que no es PDF", () => {
    expect(uploader).not.toContain("Ese archivo no es un PDF.");
  });

  it("el PUT sube el archivo con SU tipo, no con uno fijo", () => {
    expect(uploader).not.toMatch(/"Content-Type":\s*"application\/pdf"/);
    expect(uploader).toMatch(/"Content-Type":\s*[^"\n]*tipoDe|"Content-Type":\s*file\.type/);
  });
});
