/* ─────────────────────────────────────────────────────────────────────────────
 * EL CANDADO: las marcaciones entran por UNA sola puerta.
 *
 * ── 🩸 QUÉ PASÓ (y por qué este test vale más que el borrado) ────────────────
 *
 * Hasta el 6-ago-2026 había DOS vías de entrada a `asistencia_marcaciones`:
 *
 *   · el agente del reloj  → dispositivo "reloj cboston", evento_id = serialNo
 *                            del aparato;
 *   · la pantalla de Excel → dispositivo "RELOJ_FG",      evento_id = un hash
 *                            del contenido de la fila.
 *
 * El anti-duplicado es el índice único `(dispositivo, evento_id)`. Con dos
 * llaves distintas para el MISMO punch, ese índice no los reconoce como iguales
 * y los guarda los dos. No es teoría: las 134 marcaciones subidas por Excel
 * quedaron TODAS duplicadas contra las del reloj y hubo que borrarlas a mano.
 * Con las horas contadas dos veces, el almuerzo de alguien se medía en 4 horas
 * y el descuento salía de un número inventado.
 *
 * Borrar la pantalla no impide que vuelva. Esto sí: si alguien agrega un
 * segundo camino de escritura —una ruta de importación, un script de backfill,
 * un cron que "recupera" días— el build se pone en rojo ACÁ, con el nombre del
 * archivo nuevo, antes de que llegue a producción.
 *
 * Mismo criterio que `cron-calendario.test.ts`, que protege la sesión única de
 * Switch: el candado no es la disciplina, es el test.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");

/**
 * LA ÚNICA puerta. Es la ruta que recibe al agente que corre en la oficina, y
 * la que aplica `ignoreDuplicates` sobre `(dispositivo, evento_id)`.
 *
 * Agregar un archivo a esta lista NO es una formalidad: significa aceptar otra
 * fuente de marcaciones y, con ella, otra llave anti-duplicado. Si vas a
 * hacerlo, primero medí qué pasa con un día que YA trajo el reloj.
 */
const PUERTA_UNICA = ["src/app/api/asistencia/ingest/route.ts"];

/** El único módulo que arma el `evento_id` con el que se deduplica. */
const ACUÑA_EVENTO_ID = ["src/lib/asistencia/ingest.ts"];

function archivosDeCodigo(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Los tests hablan DE las marcaciones sin escribirlas; no son una vía.
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      out.push(...archivosDeCodigo(p));
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const relativo = (p: string) => path.relative(RAIZ, p).split(path.sep).join("/");

/** Quita comentarios: un `// ver asistencia_marcaciones` no es una escritura. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Las cadenas que arrancan en `.from("asistencia_marcaciones")` y llegan hasta
 * el fin de su sentencia. Es lo que permite distinguir un `.select()` de lectura
 * de un `.upsert()` de escritura dentro del mismo archivo.
 */
function cadenasSobreMarcaciones(codigo: string): string[] {
  const out: string[] = [];
  const re = /from\(\s*["'`]asistencia_marcaciones["'`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) {
    const fin = codigo.indexOf(";", m.index);
    out.push(codigo.slice(m.index, fin === -1 ? codigo.length : fin));
  }
  return out;
}

const ARCHIVOS = archivosDeCodigo(SRC).map((p) => ({
  ruta: relativo(p),
  codigo: sinComentarios(fs.readFileSync(p, "utf8")),
}));

describe("asistencia: una sola vía de entrada de marcaciones", () => {
  it("solo un archivo escribe en asistencia_marcaciones", () => {
    // Se mira la CADENA, no el archivo entero: varias rutas LEEN marcaciones y
    // además escriben en otras tablas (horarios, personas). Contar eso como
    // "vía de entrada" sería un candado que grita por todo y que alguien
    // terminaría desactivando — que es la única forma de que un candado falle.
    const escriben = ARCHIVOS.filter((a) =>
      cadenasSobreMarcaciones(a.codigo).some((c) => /\.(upsert|insert|update|delete)\s*\(/.test(c)),
    ).map((a) => a.ruta);

    // El mensaje nombra el archivo nuevo: quien rompa esto tiene que leer el
    // porqué de arriba, no adivinar qué se le pide.
    expect(escriben.sort()).toEqual(PUERTA_UNICA);
  });

  it("solo un módulo acuña el evento_id con el que se deduplica", () => {
    const acuñan = ARCHIVOS.filter((a) => /\bevento_id\s*:/.test(a.codigo)).map((a) => a.ruta);
    expect(acuñan.sort()).toEqual(ACUÑA_EVENTO_ID);
  });

  it("nadie inventa un `dispositivo` desde la app: lo dice el aparato", () => {
    // 🔑 ESTE es el caso exacto que reventó. La pantalla de Excel traía
    // `{ key: "RELOJ_FG" }` y lo mandaba como dispositivo; el agente manda
    // "reloj cboston". Dos nombres para el mismo reloj = el anti-duplicado
    // ciego. El `dispositivo` SIEMPRE viene de afuera (el body del ingest o el
    // renglón de `asistencia_dispositivos`), nunca de un literal en el código.
    const inventan = ARCHIVOS.filter((a) =>
      /\bdispositivo\s*[:=]\s*["'`][^"'`]+["'`]/.test(a.codigo),
    ).map((a) => a.ruta);
    expect(inventan).toEqual([]);
  });

  it("no quedó nada del importador de Excel", () => {
    for (const muerto of [
      "src/app/api/asistencia/importar/route.ts",
      "src/lib/asistencia/importar-excel.ts",
      "src/app/asistencia/CargarTab.tsx",
    ]) {
      expect(fs.existsSync(path.join(RAIZ, muerto))).toBe(false);
    }
    // Y ninguna pantalla ofrece subirlo: un cartel que promete una vía que no
    // existe manda a la gente a buscar una pestaña fantasma.
    const ofrecen = ARCHIVOS.filter((a) => /Cargar Excel|asistencia\/importar/.test(a.codigo));
    expect(ofrecen.map((a) => a.ruta)).toEqual([]);
  });
});
