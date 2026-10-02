/**
 * 🔴 NOMBRES NORMALES DE ERP (1-oct-2026).
 *
 * Daniel: «no los raros que inventas, no se ve profesional». El glosario y la
 * regla viven en `docs/nombres-erp.md`. Este candado barre los `.tsx` de
 * `src/app` y `src/components` (sin comentarios) y falla si vuelve alguna de
 * las palabras prohibidas INEQUÍVOCAS. El voseo lo cuida `nada-de-voseo.test.ts`.
 *
 * Si un texto prohibido tiene una razón real para quedarse, va en EXCEPCIONES
 * con el archivo y el porqué; nunca se borra la palabra de la lista.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = process.cwd();

const PROHIBIDAS: [RegExp, string][] = [
  [/\bMandar\b/, "Enviar"],
  [/\b[Aa]tar cliente\b/, "Vincular cliente"],
  [/\b[Ss]in atar\b/, "Sin vincular"],
  [/\bAnotar (un )?abono\b/, "Registrar abono"],
  [/\bRebotado\b/, "Devuelto"],
  [/Quiénes deben/, "Saldos"],
  [/Solo los que deben/, "Solo con saldo"],
  [/No deben nada/, "Sin saldo"],
  [/Elegir algunos|Dejar de elegir/, "Seleccionar · Cancelar selección"],
  [/Pierde plata/, "Pérdida"],
  [/\bMejor no\b/, "Cancelar"],
  [/Nada por aquí/, "Sin registros"],
  [
    /Cuentas por Cobrar|Caja Menuda|Vista General|Nuevo Usuario|Guías de Despacho|Asistencia y Planilla|Estado de Cuenta|Guardar Cambios/,
    "mayúscula solo en la primera palabra",
  ],
];

/** archivo relativo a la raíz → por qué se queda. Hoy, ninguno. */
const EXCEPCIONES: Record<string, string> = {};

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

/** Borra comentarios de bloque, de JSX y de línea (sin comerse «https://»). */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, "")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("🔴 nombres normales de ERP: sin palabras prohibidas en pantalla", () => {
  const todos = [...archivos(path.join(RAIZ, "src/app")), ...archivos(path.join(RAIZ, "src/components"))];

  it("barre una cantidad razonable de pantallas", () => {
    expect(todos.length).toBeGreaterThan(300);
  });

  it("ningún .tsx usa una palabra prohibida", () => {
    const hallazgos: string[] = [];
    for (const f of todos) {
      const rel = path.relative(RAIZ, f);
      if (EXCEPCIONES[rel]) continue;
      sinComentarios(fs.readFileSync(f, "utf8"))
        .split("\n")
        .forEach((linea, i) => {
          for (const [re, cambio] of PROHIBIDAS) {
            const m = linea.match(re);
            if (m) hallazgos.push(`${rel}:${i + 1} «${m[0]}» → ${cambio}`);
          }
        });
    }
    expect(hallazgos, `\nVer docs/nombres-erp.md:\n${hallazgos.join("\n")}\n`).toEqual([]);
  });
});
