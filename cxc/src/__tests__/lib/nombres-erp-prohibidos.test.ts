/**
 * 🔴 NOMBRES NORMALES DE ERP (1-oct-2026).
 *
 * Daniel: «no los raros que inventas, no se ve profesional». El glosario y la
 * regla viven en `docs/nombres-erp.md`. Este candado barre:
 *   · los `.tsx` de `src/app` y `src/components`, línea por línea (sin comentarios);
 *   · los `.ts`/`.tsx` de `src/lib` y los `.ts` de `src/app` y `src/components`
 *     (rutas de API, ayudantes), pero SOLO los literales de texto (lo que va entre
 *     comillas): ni comentarios ni identificadores (`onListo`, `sync-status`).
 * Falla si vuelve alguna de las palabras prohibidas INEQUÍVOCAS. El voseo lo
 * cuida `nada-de-voseo.test.ts`.
 *
 * 1-oct-2026, Daniel: nombres normales de ERP — se suman los avisos «Listo, …»,
 * «Elige …», los tramos «Por vencer / Vencido…», «sincronización», las
 * preguntas como rótulo y los títulos del ⓘ en forma de frase.
 *
 * Si un texto prohibido tiene una razón real para quedarse, va en EXCEPCIONES
 * con el archivo, el patrón y el porqué; nunca se borra la palabra de la lista.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import { glosario } from "../../../scripts/revisar-nombres";
import path from "path";

const RAIZ = process.cwd();

/**
 * 🔴 6-oct-2026: la lista ya NO vive aquí. Se lee de la tabla «Palabras
 * prohibidas en textos visibles» de `docs/nombres-erp.md`, que es la ÚNICA
 * fuente (`scripts/revisar-nombres.ts` › `glosario()`). Agregar una fila
 * «mal → bien» en el documento alcanza para que este candado la haga cumplir:
 * no se toca código. Daniel, 6-oct-2026: «¿cómo hago para que apliques nombres
 * como ERP profesional sin tener que decírtelo cada vez?».
 */
const PROHIBIDAS: [RegExp, string][] = glosario();

/**
 * archivo relativo a la raíz → qué patrón se tolera ahí y por qué.
 * `patron` acota la excepción: los demás prohibidos siguen valiendo en ese archivo.
 */
const EXCEPCIONES: Record<string, { patron: RegExp; porque: string }> = {
  "src/app/api/cron/switch-reconciliacion/route.ts": { patron: /No pude/, porque: "error interno del cron" },
  // Mensajes técnicos que no ve nadie en una pantalla: `console.*`, errores
  // internos que quedan en `switch_sync_log` y el resumen de caída que NO va a
  // Telegram (CLAUDE.md › Crons). Los 🔧 SISTEMA que sí llegan ya dicen «actualización».
  "src/lib/switch-api/": { patron: /a medias|No pude|sincronizado|\bsync\b/, porque: "errores internos del sync y el resumen de caída que no se envía" },
  "src/lib/acs-resumen-diario.ts": { patron: /\bsync\b/, porque: "console.error interno" },
  "src/lib/multifashion/venta-hoy.ts": { patron: /\bsync\b/, porque: "console.error interno" },
  "src/lib/grupo-resumen-mensual.ts": { patron: /a medias|\bsync\b/, porque: "error interno del cron, no es texto de pantalla" },
};

function archivos(dir: string, ext: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : archivos(p, ext);
    return ext.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Borra comentarios de bloque, de JSX y de línea (sin comerse «https://»). */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, "")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Los literales de texto de una línea, sin las comillas («"Listo, guardado"» → «Listo, guardado»). */
function literales(linea: string): string[] {
  return (linea.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []).map((l) => l.slice(1, -1));
}

function hallazgosEn(rel: string, src: string, soloLiterales: boolean): string[] {
  const out: string[] = [];
  // Una clave que termina en «/» vale para toda la carpeta.
  const exc = Object.entries(EXCEPCIONES).find(([k]) => rel === k || (k.endsWith("/") && rel.startsWith(k)))?.[1];
  sinComentarios(src)
    .split("\n")
    .forEach((linea, i) => {
      const trozos = soloLiterales ? literales(linea) : [linea];
      for (const trozo of trozos)
        for (const [re, cambio] of PROHIBIDAS) {
          const m = trozo.match(re);
          if (!m) continue;
          if (exc && exc.patron.test(m[0])) continue;
          out.push(`${rel}:${i + 1} «${m[0].trim()}» → ${cambio}`);
        }
    });
  return out;
}

describe("🔴 nombres normales de ERP: sin palabras prohibidas en pantalla", () => {
  const pantallas = [...archivos(path.join(RAIZ, "src/app"), /\.tsx$/), ...archivos(path.join(RAIZ, "src/components"), /\.tsx$/)];
  const lib = [
    ...archivos(path.join(RAIZ, "src/lib"), /\.tsx?$/),
    ...archivos(path.join(RAIZ, "src/app"), /\.ts$/),
    ...archivos(path.join(RAIZ, "src/components"), /\.ts$/),
  ];

  it("barre una cantidad razonable de pantallas y de src/lib", () => {
    expect(pantallas.length).toBeGreaterThan(300);
    expect(lib.length).toBeGreaterThan(300);
  });

  it("ningún .tsx de pantalla usa una palabra prohibida", () => {
    const hallazgos = pantallas.flatMap((f) => hallazgosEn(path.relative(RAIZ, f), fs.readFileSync(f, "utf8"), false));
    expect(hallazgos, `\nVer docs/nombres-erp.md:\n${hallazgos.join("\n")}\n`).toEqual([]);
  });

  it("ningún texto entre comillas de src/lib (ni de los .ts de app y components) usa una palabra prohibida", () => {
    const hallazgos = lib.flatMap((f) => hallazgosEn(path.relative(RAIZ, f), fs.readFileSync(f, "utf8"), true));
    expect(hallazgos, `\nVer docs/nombres-erp.md:\n${hallazgos.join("\n")}\n`).toEqual([]);
  });

  it("el barrido de src/lib mira el texto y no los identificadores", () => {
    expect(hallazgosEn("x.ts", `onListo, showToast("x"); fetch("/api/sync-status")`, true)).toEqual([]);
    expect(hallazgosEn("x.ts", `const t = "Listo, guardado";`, true)).toHaveLength(1);
    expect(hallazgosEn("x.ts", `// Listo, guardado (comentario)`, true)).toEqual([]);
  });

  it("toda excepción apunta a un archivo que existe", () => {
    for (const rel of Object.keys(EXCEPCIONES)) expect(fs.existsSync(path.join(RAIZ, rel)), rel).toBe(true);
  });
});
