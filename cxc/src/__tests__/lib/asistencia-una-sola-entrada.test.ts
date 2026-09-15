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
 * LA ÚNICA puerta: el módulo que aplica `ignoreDuplicates` sobre
 * `(dispositivo, evento_id)`.
 *
 * ⚠️ CAMBIÓ DE DIRECCIÓN EL 14-sep-2026, Y NO SE AFLOJÓ — SE APRETÓ. Hasta hoy
 * la puerta era `api/asistencia/ingest/route.ts`, que hacía el upsert adentro.
 * Con el reloj del teléfono hay una segunda FUENTE de marcaciones
 * (`/api/marcacion`), así que el upsert se mudó a un módulo y las DOS fuentes
 * lo llaman: antes la forma de escribir vivía dentro de un archivo y cualquier
 * fuente nueva podía escribir a su manera; ahora hay UNA función y este
 * candado exige que siga siendo una sola.
 *
 * Agregar un archivo a esta lista NO es una formalidad: significa aceptar otra
 * forma de escribir y, con ella, otra llave anti-duplicado. Si vas a hacerlo,
 * primero medí qué pasa con un día que YA trajo el reloj.
 */
const PUERTA_UNICA = ["src/lib/asistencia/guardar-marcaciones.ts"];

/**
 * Los módulos que arman el `evento_id` con el que se deduplica: UNO por
 * FUENTE de marcaciones.
 *
 * ⚠️ CAMBIÓ DE DIRECCIÓN EL 14-sep-2026 (de uno a dos), con su porqué. Era UNO
 * solo porque había una sola fuente. Daniel aprobó el reloj del teléfono, y su
 * regla fue que *«la marca cae en la MISMA tabla que los relojes físicos, con
 * su origen anotado»* — una fuente nueva NECESITA acuñar su propio
 * identificador, porque el `serialNo` del aparato Hikvision no existe del lado
 * del teléfono.
 *
 * 🔑 POR QUÉ ESTO NO ES EL DEFECTO DE AGOSTO. Lo que reventó entonces fueron
 * DOS llaves distintas para EL MISMO punch (el reloj mandaba `serialNo`, el
 * Excel un hash de la fila, y el índice único no los reconocía como iguales).
 * Acá son dos APARATOS distintos: un punch del reloj de la tienda y una marca
 * del teléfono son dos hechos distintos, y el `dispositivo` los separa. Daniel
 * lo decidió así, textual: *«el sistema junta todo»* — la primera del día es
 * la entrada y la última la salida, venga de donde venga.
 *
 * Lo que este candado sigue exigiendo, y es lo que de verdad protegía: que
 * dentro de CADA fuente el identificador sea estable, para que reenviar lo
 * mismo no lo guarde dos veces (el repaso nocturno del reloj, y el reenvío de
 * una marca que esperó señal).
 */
const ACUÑA_EVENTO_ID = [
  "src/app/api/marcacion/route.ts",
  "src/lib/asistencia/ingest.ts",
];

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

  it("🔑 CONTROL: la puerta única deduplica por `(dispositivo, evento_id)` e ignora repetidos", () => {
    // Es la mitad que no se puede perder: si alguien le saca el `onConflict` o
    // el `ignoreDuplicates`, el repaso nocturno del reloj —y el reenvío de una
    // marca que esperó señal— empiezan a duplicar horas en silencio.
    const puerta = ARCHIVOS.find((a) => a.ruta === PUERTA_UNICA[0]);
    expect(puerta, "no está el módulo que escribe").toBeTruthy();
    expect(puerta!.codigo).toMatch(/onConflict:\s*["'`]dispositivo,evento_id["'`]/);
    expect(puerta!.codigo).toMatch(/ignoreDuplicates:\s*true/);
  });

  it("🔑 CONTROL: ninguna fuente escribe marcaciones sin pasar por esa función", () => {
    // El defecto de agosto empezó por una pantalla que escribía por su cuenta.
    // Las dos fuentes vivas —el agente del reloj y el reloj del teléfono— tienen
    // que NOMBRAR a `guardarMarcaciones`, no armar su propio upsert.
    for (const fuente of [
      "src/app/api/asistencia/ingest/route.ts",
      "src/app/api/marcacion/route.ts",
    ]) {
      const a = ARCHIVOS.find((x) => x.ruta === fuente);
      expect(a, fuente).toBeTruthy();
      expect(a!.codigo, fuente).toContain("guardarMarcaciones");
    }
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
