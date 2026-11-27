// Candado de `MODAL_CABE_2026_11` (27-nov-2026): todo modal u hoja tiene alto
// máximo, para que en una ventana chica (1366×768, 1280×720, el teléfono) se
// vean la cabecera y el pie con los botones. Si aparece un `fixed inset-0` o
// un `<ModalOverlay>` sin alto máximo cerca, el build se pone rojo.
//
// Se acepta como alto máximo: una clase `max-h-…`, las constantes de
// `lib/ui/modal-cabe-2026-11.ts` (`PANEL_CABE…`), o un elemento que YA ocupa
// toda la pantalla (`inset-0` con su propio scroll, un aviso de una línea). Esos
// últimos se marcan con el comentario `modal-cabe: <por qué>` en las líneas
// cercanas, para que quede escrito por qué no lo necesitan.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MODAL_CABE_2026_11 } from "@/lib/ui/modal-cabe-2026-11";

const RAIZ = join(__dirname, "..", "..");
const VENTANA = 18; // líneas que se miran después del overlay

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" ? [] : archivos(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

const ALTO = /max-h-|PANEL_CABE|modal-cabe:/;

export function overlaysSinAlto(texto: string): number[] {
  const lineas = texto.split("\n");
  const malas: number[] = [];
  lineas.forEach((l, i) => {
    if (!/fixed inset-0|<ModalOverlay\b/.test(l)) return;
    const cerca = lineas.slice(Math.max(0, i - 5), i + VENTANA).join("\n");
    if (!ALTO.test(cerca)) malas.push(i + 1);
  });
  return malas;
}

describe("el modal cabe en la pantalla", () => {
  it("el interruptor está prendido", () => {
    expect(MODAL_CABE_2026_11).toBe(true);
  });

  it("detecta un modal sin alto máximo", () => {
    expect(overlaysSinAlto(`<div className="fixed inset-0 z-50">\n<div className="bg-white p-6">hola</div>\n</div>`)).toEqual([1]);
    expect(overlaysSinAlto(`<div className="fixed inset-0 z-50">\n<div className="bg-white max-h-[90vh] overflow-y-auto">hola</div>\n</div>`)).toEqual([]);
  });

  it("ningún modal u hoja del sistema queda sin alto máximo", () => {
    const sin = archivos(RAIZ).flatMap((f) =>
      overlaysSinAlto(readFileSync(f, "utf8")).map((n) => `${relative(RAIZ, f)}:${n}`),
    );
    expect(sin).toEqual([]);
  });
});
