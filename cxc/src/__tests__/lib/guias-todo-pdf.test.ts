/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EN GUÍAS, TODO ES PDF (9-sep-2026)
 *
 * Daniel, textual: *«en guía, quiero todo PDF, quita lo de PNG que lo enredó»*.
 *
 * Hasta hoy «Compartir» decidía solo: **imagen** en el celular con 6 renglones o
 * menos, **PDF** de ahí para arriba y siempre en computadora. Eran dos
 * documentos con dos formas para la misma guía, y cuál salía dependía del
 * aparato y del largo — cosas que quien toca el botón no ve.
 *
 * ⚠️ LO QUE NO CAMBIA, y por eso se vigila acá mismo:
 *
 *   · 🩸 **Ni un `await` entre el clic y la hoja de compartir.** Safari en iOS
 *     solo la abre DENTRO del gesto del toque; un `await` de red hace que deje
 *     de contarlo como gesto y la bloquea sin decir por qué. Es la razón por la
 *     que la imagen existía, y sigue valiendo para el PDF.
 *   · **Imprimir ya mandaba el PDF** en los tres botones del módulo.
 *   · El bloque `@media print` de `HojaEscalada` cubre el Ctrl+P y se queda.
 *
 * 🔴 `png-guia.ts` NO SE BORRA: queda sin lectores, con su nota fechada y sin
 * arrastrar jsPDF.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { formatoParaCompartir, MAX_RENGLONES_PNG } from "@/lib/guias/compartir-formato";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

/** Las tres pantallas desde las que se comparte o se imprime una guía. */
const PANTALLAS = [
  "src/app/guias/components/GuiasList.tsx",
  "src/app/guias/[id]/page.tsx",
  "src/app/guias/components/GuiaDetail.tsx",
];

/** Todos los archivos del módulo Guías (código y rutas). */
function archivosDeGuias(): string[] {
  const out: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) recorrer(rel);
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
  };
  for (const d of ["src/app/guias", "src/lib/guias", "src/app/api/guias"]) recorrer(d);
  return out;
}

/** El código sin comentarios: las historias nombran al PNG a propósito. */
function codigo(rel: string): string {
  return leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 · COMPARTIR DA PDF, SIEMPRE
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1. «Compartir» manda PDF en los dos aparatos", () => {
  it("con cualquier cantidad de renglones y en cualquier aparato", () => {
    for (const aparato of ["celular", "computadora"] as const) {
      for (const n of [0, 1, 2, 3, 5, 6, 7, 17, 100, -1, NaN]) {
        expect(formatoParaCompartir(n, aparato), `${n} renglones en ${aparato}`).toBe("pdf");
      }
    }
    // Y sin decir el aparato, lo mismo: no queda ningún camino a la imagen.
    for (const n of [1, 6, 7]) expect(formatoParaCompartir(n)).toBe("pdf");
  });

  it("🔴 ni un solo caso devuelve «png» — se barren 0..40 renglones", () => {
    const conImagen = [];
    for (let n = 0; n <= 40; n++) {
      for (const aparato of ["celular", "computadora"] as const) {
        if (formatoParaCompartir(n, aparato) === "png") conImagen.push(`${n}/${aparato}`);
      }
    }
    expect(conImagen, `volvió la imagen en: ${conImagen.join(", ")}`).toEqual([]);
  });

  it("el que arma el archivo construye el PDF y nada más", () => {
    const papel = leer("src/lib/guias/papel-de-la-guia.ts");
    const armado = /function archivoParaCompartir\(g: Guia\): File \{[\s\S]*?\n\}/.exec(papel)?.[0] ?? "";
    expect(armado.length).toBeGreaterThan(0);
    expect(armado).toContain("construirPdfGuia(g)");
    expect(armado).toContain('type: "application/pdf"');
    expect(armado).not.toContain("Png");
  });

  it("🩸 y lo arma SIN un solo `await`: iOS pierde el gesto del toque", () => {
    const papel = leer("src/lib/guias/papel-de-la-guia.ts");
    const armado = /function archivoParaCompartir\(g: Guia\): File \{[\s\S]*?\n\}/.exec(papel)?.[0] ?? "";
    expect(armado).not.toContain("await ");
    expect(armado).not.toContain("import(");
    expect(armado).not.toContain("fetch(");
    // El que abre la hoja tiene UN solo `await`, el de compartir.
    const compartir = /export async function compartirGuia[\s\S]*?\n\}/.exec(papel)?.[0] ?? "";
    expect((compartir.match(/await /g) ?? []).length).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · LA IMAGEN QUEDA RETIRADA, NO BORRADA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 2. `png-guia.ts` se queda, sin lectores", () => {
  it("el archivo sigue existiendo y dice desde cuándo está retirado", () => {
    const png = leer("src/lib/guias/png-guia.ts");
    expect(png).toContain("construirPngGuia");
    expect(png).toContain("RETIRADO EL 9-SEP-2026");
  });

  it("🔴 NADIE en el módulo lo importa ni lo llama", () => {
    const lectores = archivosDeGuias().filter(
      (f) => f !== "src/lib/guias/png-guia.ts" && /png-guia|construirPngGuia|precargarFirmasGuia\(/.test(codigo(f)),
    );
    expect(lectores, `volvieron los lectores de la imagen: ${lectores.join(", ")}`).toEqual([]);
  });

  it("las tres pantallas dejaron de precargar firmas", () => {
    for (const p of PANTALLAS) {
      expect(codigo(p), p).not.toContain("precargarFirmasGuia(");
    }
  });

  it("⚠️ y sigue SIN arrastrar jsPDF (CONTROL: eso nunca se aflojó)", () => {
    const png = leer("src/lib/guias/png-guia.ts");
    expect(png).not.toContain("jspdf");
    expect(png).not.toContain("./pdf-guia");
  });

  it("⚠️ la medición que fijó el corte se conserva", () => {
    // El 6 no era un número al azar: 94% de las 222 guías vivas tenía 6
    // renglones o menos. Se conserva para que quien lea la historia la entienda.
    expect(MAX_RENGLONES_PNG).toBe(6);
    expect(leer("src/lib/guias/compartir-formato.ts")).toContain("94%");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · LO QUE NO SE TOCÓ
// ═════════════════════════════════════════════════════════════════════════════

describe("⚠️ 3. imprimir y el Ctrl+P siguen igual", () => {
  it("los tres botones de imprimir del módulo llaman a `imprimirGuia`", () => {
    for (const p of PANTALLAS) expect(leer(p), p).toContain("imprimirGuia");
  });

  it("y ese camino arma el PDF de siempre con su `autoPrint`", () => {
    const papel = leer("src/lib/guias/papel-de-la-guia.ts");
    const fn = /export function imprimirGuia\(g: Guia\)[\s\S]*?\n\}/.exec(papel)?.[0] ?? "";
    expect(fn).toContain("construirPdfGuia(g)");
    expect(fn).toContain("doc.autoPrint()");
  });

  it("el bloque @media print de HojaEscalada se queda", () => {
    const hoja = leer("src/app/guias/components/HojaEscalada.tsx");
    expect(hoja).toContain("@media print");
    expect(hoja).toMatch(/transform:\s*none\s*!important/);
  });

  it("el botón se sigue llamando «Compartir» y no pregunta nada", () => {
    for (const p of PANTALLAS) {
      const src = leer(p);
      expect(src).toContain("Compartir");
      expect(src).not.toMatch(/Compartir como (imagen|PDF)/i);
    }
  });
});
