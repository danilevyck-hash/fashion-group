// ─────────────────────────────────────────────────────────────────────────────
// EN RECLAMOS SE DICE «COBRADO», NUNCA «PAGADO» (24-sep-2026).
//
// Daniel, textual: *«solo hay creado y cobrado, ¿por qué veo pagado?»*.
//
// 🔑 El sistema ya le daba la razón a medias: la portada dice «Cobrado 2026», la
// lista de una empresa dice «Cobrados», y el papel que sale al proveedor dejó de
// imprimir la palabra el 20-sep-2026 —justo porque «Pagado» se le lee al revés a
// un proveedor extranjero—. Lo único que seguía diciendo «pagado» era el botón
// que más se toca (14 cobros, 9 en septiembre) y el chip de arriba del reclamo.
//
// 🔴 LO QUE ESTE BARRIDO SOSTIENE: ninguna PANTALLA del módulo escribe «pagado».
// El único texto con esa palabra que se permite es la cadena exacta `"Pagado"`,
// que NO es un rótulo: es el VALOR del estado en la base (`ESTADO_PAGADO`), el
// que viaja en el PATCH y con el que se compara `esPendiente`. Eso no se toca.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { ESTADO_PAGADO } from "@/lib/reclamos/pendientes";
import {
  CHIP_COBRADO,
  COMPROBANTE_OBLIGATORIO,
  FALTA_COMPROBANTE,
  LISTO_COBRADO,
  MARCAR_COBRADO,
  NO_SE_PUDO_COBRAR,
  cobradoEl,
} from "@/lib/reclamos/rotulos";

const RAIZ = process.cwd();

/** Los dos árboles del módulo: la pantalla y sus reglas. */
const CARPETAS = ["src/app/reclamos", "src/lib/reclamos"];

function archivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...archivos(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Fuera los comentarios: la historia del módulo SÍ puede nombrar «pagado». */
function sinComentarios(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
}

/**
 * Todo lo que se puede LEER en una pantalla: las cadenas y el texto suelto de
 * JSX. Deja afuera los identificadores (`ESTADO_PAGADO`, `esPagado`), que son
 * nombres de código y no palabras que nadie ve.
 */
function textosVisibles(src: string): string[] {
  const out: string[] = [];
  for (const re of [/"([^"\n]*)"/g, /'([^'\n]*)'/g, /`([^`]*)`/g]) {
    for (const m of src.matchAll(re)) out.push(m[1]);
  }
  // Texto suelto entre etiquetas JSX: `>Marcar como pagado<`.
  for (const m of src.matchAll(/>([^<>{}]+)</g)) out.push(m[1]);
  return out;
}

describe("🔴 Ninguna pantalla de Reclamos dice «pagado»", () => {
  const encontrados: { archivo: string; texto: string }[] = [];
  for (const carpeta of CARPETAS) {
    for (const rel of archivos(carpeta)) {
      const src = sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
      for (const t of textosVisibles(src)) {
        if (!/pagad[oa]/i.test(t)) continue;
        // El VALOR del estado en la base, solo. Cualquier frase se rechaza.
        if (t.trim() === ESTADO_PAGADO) continue;
        encontrados.push({ archivo: rel, texto: t.trim() });
      }
    }
  }

  it("barrido: ni un rótulo, ni un aviso, ni un texto de ayuda con la palabra", () => {
    expect(
      encontrados.map((e) => `${e.archivo}: «${e.texto}»`).join("\n"),
    ).toBe("");
  });

  it("⚠️ CONTROL: el barrido mira de verdad esas carpetas", () => {
    const total = CARPETAS.flatMap(archivos).length;
    expect(total).toBeGreaterThan(30);
  });
});

describe("Los rótulos viven en UN solo lugar", () => {
  it("y dicen cobrado", () => {
    expect(MARCAR_COBRADO).toBe("Marcar como cobrado");
    expect(CHIP_COBRADO).toBe("Cobrado");
    expect(LISTO_COBRADO).toBe("Listo, cobrado");
    expect(NO_SE_PUDO_COBRAR).toBe("No se pudo marcar como cobrado.");
    expect(COMPROBANTE_OBLIGATORIO).toContain("marcar cobrado");
    expect(FALTA_COMPROBANTE).toContain("marcar cobrado");
  });

  it("«cobrado el …» no inventa una fecha cuando no la hay", () => {
    expect(cobradoEl("2026-09-17")).toBe("cobrado el 17 sept 2026");
    expect(cobradoEl(null)).toBe("cobrado");
    expect(cobradoEl("")).toBe("cobrado");
  });

  it("las tres pantallas los leen del módulo, no los escriben a mano", () => {
    const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
    expect(leer("src/app/reclamos/components/ReclamoDetail.tsx")).toContain("MARCAR_COBRADO");
    expect(leer("src/app/reclamos/components/ReclamoDetail.tsx")).toContain("CHIP_COBRADO");
    expect(leer("src/app/reclamos/components/SettlementModal.tsx")).toContain("MARCAR_COBRADO");
    expect(leer("src/app/reclamos/ReclamosClient.tsx")).toContain("NO_SE_PUDO_COBRAR");
  });
});

describe("⚠️ LO QUE NO CAMBIÓ: el estado de la base", () => {
  it("sigue siendo `Pagado`", () => {
    expect(ESTADO_PAGADO).toBe("Pagado");
  });

  it("y la pantalla lo sigue mandando con ese valor exacto", () => {
    const src = fs.readFileSync(path.join(RAIZ, "src/app/reclamos/ReclamosClient.tsx"), "utf8");
    expect(src).toContain('if (e === "Pagado") { setSettleOpen(true); return; }');
  });
});
