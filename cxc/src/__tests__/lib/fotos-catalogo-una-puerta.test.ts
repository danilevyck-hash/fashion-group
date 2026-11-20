/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LA FOTO DEL CATÁLOGO ENTRA POR UNA SOLA PUERTA (19-nov-2026)
 *
 * Daniel: «arregla lo de que la foto no suba por otro camino. Todo tiene que
 * ir en orden.» Toda escritura al bucket `product-images` pasa por
 * `guardarFotoConMiniaturas` (lib/catalogo/miniaturas.ts), que guarda la foto
 * con sus miniaturas de 600 y 160 px. Y ninguna pantalla vuelve a pedirle a
 * Supabase que transforme una foto (`/render/image`, se cobra por foto).
 *
 * La ÚNICA excepción es el ZIP del B2B: el navegador sube cada variante con un
 * token firmado (`variantes/firmar`), porque el ZIP no cabe en una función.
 * Esas fotos reciben sus miniaturas en `guardarFotoElegida`, que es lo único
 * que pone una variante en `image_url`; aquí se exige que siga así.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = process.cwd();
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

function archivos(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const CODIGO = archivos(path.join(RAIZ, "src"))
  .map((abs) => path.relative(RAIZ, abs).split(path.sep).join("/"))
  .filter((rel) => !rel.startsWith("src/__tests__/"))
  .map((rel) => ({ rel, src: sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8")) }));

const PUERTA = "src/lib/catalogo/miniaturas.ts";
const FIRMAR = "src/app/api/catalogo/[marca]/products/variantes/firmar/route.ts";

/** ¿Este literal o identificador nombra el bucket de fotos, en ESTE archivo? */
function esBucketDeFotos(arg: string, src: string): boolean {
  const a = arg.trim();
  if (/^["'`]product-images["'`]$/.test(a)) return true;
  if (!/^[A-Za-z_$][\w$]*$/.test(a)) return false;
  if (a === "BUCKET_FOTOS") return true;
  if (new RegExp(`\\b${a}\\s*=\\s*["'\`]product-images["'\`]`).test(src)) return true;
  // `BUCKET` importado de variantes-server es el bucket de fotos.
  return new RegExp(`import\\s*{[^}]*\\b${a}\\b[^}]*}\\s*from\\s*["'][^"']*variantes-server["']`).test(src);
}

describe("🔴 fotos del catálogo: una sola puerta", () => {
  it("nadie escribe en product-images sin pasar por guardarFotoConMiniaturas", () => {
    const culpables: string[] = [];
    const escribe = /\.from\(\s*([^)]+?)\s*\)\s*\.(upload|update|copy|move|createSignedUploadUrl|uploadToSignedUrl)\(/g;
    const enVariable = /=\s*[\w.]*storage\s*\.from\(\s*([^)]+?)\s*\)\s*;/g;
    for (const f of CODIGO) {
      if (f.rel === PUERTA) continue;
      for (const m of f.src.matchAll(escribe)) {
        if (!esBucketDeFotos(m[1], f.src)) continue;
        if (f.rel === FIRMAR && m[2] === "createSignedUploadUrl") continue;
        culpables.push(`${f.rel} → .${m[2]}()`);
      }
      // Un client del bucket guardado en variable (`const b = ….from(BUCKET);`).
      for (const m of f.src.matchAll(enVariable)) {
        if (esBucketDeFotos(m[1], f.src)) culpables.push(`${f.rel} → client del bucket en variable`);
      }
    }
    expect(
      culpables,
      `\nSubida de fotos fuera de la puerta:\n${culpables.join("\n")}\n` +
        `Usa guardarFotoConMiniaturas (lib/catalogo/miniaturas.ts).\n`,
    ).toEqual([]);
  });

  it("la subida de administración usa la puerta", () => {
    const src = CODIGO.find((f) => f.rel === "src/app/api/catalogo/[marca]/upload/route.ts")!.src;
    expect(src).toContain("guardarFotoConMiniaturas(");
    expect(src).not.toMatch(/\.upload\(/);
  });

  it("la foto del ZIP (subida firmada) recibe sus miniaturas antes de ponerse en el producto", () => {
    const src = CODIGO.find((f) => f.rel === "src/lib/catalogos/variantes-server.ts")!.src;
    const cuerpo = src.slice(src.indexOf("export async function guardarFotoElegida"));
    expect(cuerpo.indexOf("guardarFotoConMiniaturas(")).toBeGreaterThan(0);
    expect(cuerpo.indexOf("guardarFotoConMiniaturas(")).toBeLessThan(cuerpo.indexOf(".update("));
  });

  it("ninguna llamada a render/image en src/", () => {
    const culpables = CODIGO.filter((f) => /render\/image/.test(f.src)).map((f) => f.rel);
    expect(culpables, `\nVolvió el transform de Supabase en: ${culpables.join(", ")}\n`).toEqual([]);
  });
});
