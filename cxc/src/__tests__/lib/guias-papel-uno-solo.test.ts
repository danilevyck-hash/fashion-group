/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 UN SOLO PAPEL, Y COMPARTIR MIRA EL APARATO (7-sep-2026)
 *
 * DOS cosas que Daniel aprobó, medidas contra lo que le pasó:
 *
 * 1. 🩸 IMPRIMIR ERA DOS CAMINOS CON DOS PAPELES. La fila de la lista mandaba
 *    el PDF de `pdf-guia.ts`; la pantalla `/guias/[id]/imprimir` hacía
 *    `window.print()` sobre el DOM — y ese DOM vive dentro de `HojaEscalada`,
 *    con un `transform: scale(…)`. Daniel imprimió desde ahí y le salió *«una
 *    foto impresa de la guía y no como estaba antes en pdf bien bonito»*.
 *    Ahora los dos botones llaman a `imprimirGuia`.
 *
 * 2. 🔴 COMPARTIR: **celular → imagen hasta 6 renglones (lo de siempre);
 *    computadora → SIEMPRE el PDF.** La imagen existe para WhatsApp, que la
 *    muestra dentro del chat; en la computadora el archivo se adjunta, se
 *    archiva y se imprime, y ahí el PDF gana siempre.
 *
 * ⚠️ Imprimir NO cambia con el aparato: el papel es el PDF en los dos mundos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { MAX_RENGLONES_PNG, formatoParaCompartir } from "@/lib/guias/compartir-formato";
import { aparatoDeQuienMira } from "@/lib/aparato";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

// ─── 1 · un solo botón de imprimir, y es el PDF ──────────────────────────────

describe("🔴 1. hay UN solo papel, salga de donde salga", () => {
  it("la pantalla de imprimir llama a `imprimirGuia`, no a window.print()", () => {
    const detalle = leer("src/app/guias/components/GuiaDetail.tsx");
    expect(detalle).toContain("imprimirGuia(guia)");
    // ⚠️ La palabra `window.print()` sigue en el comentario que cuenta esta
    // historia: se mira la LLAMADA, no la palabra.
    expect(detalle).not.toMatch(/onClick=\{\s*\(\)\s*=>\s*window\.print\(\)/);
  });

  it("🩸 no queda NINGÚN window.print() en todo el módulo Guías", () => {
    const usos = barrerGuias(/(?<!`)window\.print\(\)/);
    expect(
      usos,
      `imprimir la PANTALLA sale escalado (HojaEscalada): ${usos.join(", ")}`,
    ).toEqual([]);
  });

  it("los tres botones de imprimir del módulo son el MISMO camino", () => {
    for (const p of [
      "src/app/guias/components/GuiasList.tsx",
      "src/app/guias/[id]/page.tsx",
      "src/app/guias/components/GuiaDetail.tsx",
    ]) {
      expect(leer(p), p).toContain("imprimirGuia");
    }
  });

  it("y ese camino sigue armando el PDF de siempre (CONTROL)", () => {
    const papel = leer("src/lib/guias/papel-de-la-guia.ts");
    const fn = /export function imprimirGuia\(g: Guia\)[\s\S]*?\n\}/.exec(papel)?.[0] ?? "";
    expect(fn).toContain("construirPdfGuia(g)");
    expect(fn).toContain("doc.autoPrint()");
    expect(fn).not.toContain("Png");
  });

  it("⚠️ el bloque @media print de HojaEscalada NO se tocó: cubre el Ctrl+P", () => {
    const hoja = leer("src/app/guias/components/HojaEscalada.tsx");
    expect(hoja).toContain("@media print");
    expect(hoja).toMatch(/transform:\s*none\s*!important/);
  });
});

/** Barre el módulo Guías (código y rutas) buscando un patrón. */
function barrerGuias(re: RegExp): string[] {
  const encontrados: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) recorrer(rel);
      else if (/\.tsx?$/.test(e.name) && re.test(leer(rel))) encontrados.push(rel);
    }
  };
  for (const d of ["src/app/guias", "src/lib/guias", "src/app/api/guias"]) recorrer(d);
  return encontrados;
}

// ─── 2 · compartir mira el aparato ───────────────────────────────────────────

describe("🔄 2. compartir: PDF EN LOS DOS APARATOS (9-sep-2026)", () => {
  // 🔄 CAMBIA DE DIRECCIÓN, NO SE BORRA. Este bloque exigía «PNG en el celular,
  // PDF en la computadora». Daniel: *«en guía, quiero todo PDF, quita lo de PNG
  // que lo enredó»* — eran dos documentos para la misma guía y cuál salía
  // dependía del aparato y del largo, que es justo lo que quien toca el botón
  // no ve. La mitad que ya era cierta (computadora → PDF) se conserva como
  // CONTROL, y la que cambió quedó escrita al revés con su motivo.
  it("🔴 en el CELULAR ya NO sale imagen: PDF con uno o con seis renglones", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) expect(formatoParaCompartir(n, "celular")).toBe("pdf");
    for (const n of [7, 8, 17]) expect(formatoParaCompartir(n, "celular")).toBe("pdf");
    // La constante se conserva retirada, con la medición que la fijó.
    expect(MAX_RENGLONES_PNG).toBe(6);
  });

  it("🔴 en la COMPUTADORA es SIEMPRE el PDF (CONTROL: eso no cambió)", () => {
    for (const n of [1, 2, 6, 7, 100]) expect(formatoParaCompartir(n, "computadora")).toBe("pdf");
  });

  it("sin decir el aparato, también PDF", () => {
    expect(formatoParaCompartir(3)).toBe("pdf");
    expect(formatoParaCompartir(9)).toBe("pdf");
  });

  it("una guía sin renglones cae en PDF, en los dos mundos", () => {
    for (const a of ["celular", "computadora"] as const) {
      expect(formatoParaCompartir(0, a)).toBe("pdf");
      expect(formatoParaCompartir(-1, a)).toBe("pdf");
      expect(formatoParaCompartir(NaN, a)).toBe("pdf");
    }
  });

  it("🔄 el que comparte YA NO pregunta por el aparato: hay un solo formato", () => {
    // 🔄 Decía «PREGUNTA por el aparato — no se quedó con el corte pelado», y
    // era la regla mientras había dos formatos. Con uno solo, dejar la pregunta
    // escrita es leer un camino que no existe.
    const papel = leer("src/lib/guias/papel-de-la-guia.ts");
    const armado = /function archivoParaCompartir\(g: Guia\): File \{[\s\S]*?\n\}/.exec(papel)?.[0] ?? "";
    expect(armado).not.toContain("aparatoDeQuienMira()");
    expect(armado).toContain("construirPdfGuia(g)");
    expect(armado).not.toContain("Png");
    // 🩸 Y SIGUE SIN UN SOLO `await` (CONTROL): iOS solo deja abrir la hoja de
    // compartir dentro del gesto del toque.
    expect(armado).not.toContain("await ");
  });
});

// ─── 3 · cómo se reconoce el aparato ─────────────────────────────────────────

describe("🔴 3. el aparato se reconoce por el DEDO, no por el nombre", () => {
  const original = globalThis.window;

  afterEach(() => {
    if (original) globalThis.window = original;
    vi.unstubAllGlobals();
  });

  const conPuntero = (coarse: boolean, ua = "Mozilla/5.0") => {
    vi.stubGlobal("window", {
      matchMedia: (q: string) => ({ matches: q.includes("coarse") ? coarse : !coarse }),
    });
    vi.stubGlobal("navigator", { userAgent: ua, maxTouchPoints: coarse ? 5 : 0 });
  };

  it("puntero grueso (un dedo) → celular", () => {
    conPuntero(true);
    expect(aparatoDeQuienMira()).toBe("celular");
  });

  it("puntero fino (un mouse) → computadora, aunque la pantalla sea táctil", () => {
    conPuntero(false, "Mozilla/5.0 (Windows NT 10.0) Touch");
    expect(aparatoDeQuienMira()).toBe("computadora");
  });

  it("🩸 el iPad se anuncia como «Macintosh»: sin matchMedia, lo salva el plan B", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh)", maxTouchPoints: 5 });
    expect(aparatoDeQuienMira()).toBe("celular");
  });

  it("una Mac de verdad (sin pantalla táctil) es computadora", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh)", maxTouchPoints: 0 });
    expect(aparatoDeQuienMira()).toBe("computadora");
  });
});
