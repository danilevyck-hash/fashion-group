// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA PRECARGA DEL PAPEL NO PUEDE LLEGAR DESPUÉS DE QUE LA PRUEBA TERMINE
// (23-sep-2026)
//
// 🩸 EL DEFECTO. Las pantallas de Guías piden el papel de la guía SIN esperarlo
// —`void import("@/lib/guias/papel-de-la-guia")`— y eso está bien a propósito:
// en el iPhone, la hoja de compartir no se abre si hay un `await` de red entre
// el toque y la hoja, así que el módulo se deja en memoria ANTES de que el
// botón exista. Lo que estaba mal era en las PRUEBAS: esa carga (jsPDF, casi un
// megabyte) terminaba después de que la prueba cerraba su ambiente, y Vitest
// la reportaba como un error suelto:
//
//     EnvironmentTeardownError: Cannot load jspdf.node.min.js
//     after the environment was torn down
//
// 🔑 ESO PONE LA CORRIDA EN ROJO AUNQUE NINGUNA PRUEBA FALLE: con «17.498
// pruebas pasadas» y dos de estos errores, Vitest sale con código 1. En la
// máquina de GitHub pasó el 20 y el 22-sep.
//
// 🔴 LA REGLA. Toda prueba que monte una pantalla con esa precarga
// —`GuiasList`, `/guias` o `/guias/[id]`— pide el módulo de entrada, arriba.
// Así el `import` de adentro se resuelve de memoria, al instante, y no queda
// nada volando cuando la prueba termina. NO cambia nada de lo que se comprueba.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = process.cwd();
const PRECARGA = 'import "@/lib/guias/papel-de-la-guia";';

/** Las pantallas que piden el papel sin esperarlo. */
const PANTALLAS_CON_PRECARGA = [
  "@/app/guias/components/GuiasList",
  "@/app/guias/page",
  "@/app/guias/[id]/page",
];

function archivosDePrueba(): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (/\.test\.tsx?$/.test(e.name)) salida.push(p);
    }
  };
  recorrer(path.join(RAIZ, "src/__tests__"));
  return salida;
}

/** Las pantallas donde vive la precarga, para que la lista de arriba no mienta. */
const FUENTES = [
  "src/app/guias/components/GuiasList.tsx",
  "src/app/guias/[id]/page.tsx",
];

describe("🔴 el papel de la guía se pide a tiempo en las pruebas", () => {
  it("la precarga sin esperar sigue existiendo — si desaparece, este candado sobra", () => {
    const conPrecarga = FUENTES.filter((f) =>
      fs.readFileSync(path.join(RAIZ, f), "utf8")
        .includes('void import("@/lib/guias/papel-de-la-guia")'),
    );
    expect(
      conPrecarga,
      "ninguna pantalla precarga el papel: este archivo se puede borrar",
    ).toEqual(FUENTES);
  });

  it("toda prueba que monta una de esas pantallas pide el módulo de entrada", () => {
    const faltan: string[] = [];
    for (const archivo of archivosDePrueba()) {
      const texto = fs.readFileSync(archivo, "utf8");
      const monta = PANTALLAS_CON_PRECARGA.some((m) =>
        texto.includes(`from "${m}"`),
      );
      if (monta && !texto.includes(PRECARGA)) {
        faltan.push(path.relative(RAIZ, archivo));
      }
    }
    expect(
      faltan,
      `Estas pruebas montan una pantalla de Guías que precarga el papel sin ` +
        `esperarlo. Agrega arriba:  ${PRECARGA}\n  - ` + faltan.join("\n  - "),
    ).toEqual([]);
  });
});
