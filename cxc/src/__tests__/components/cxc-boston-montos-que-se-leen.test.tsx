// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EN LA PESTAÑA DE BOSTON NINGÚN MONTO SE ENCIMA A OTRO (20-sep-2026).
//
// 🩸 QUÉ VEÍA DANIEL. **269 de 408 filas (66 %)** dibujaban el monto rojo de
// 121d+ ENCIMA del negro del Total: ilegible. La causa no era el dato sino el
// ancho — la fila metía **DOS botones** («Cobrar» y «Documentos») en la misma
// celda `col-span-2` donde la cartera del grupo mete uno. Medido a 1280 px de
// ventana (menos los 224 de la barra lateral), esa celda da ~164 px y los dos
// botones más el monto pedían ~226: los 62 px que sobraban se derramaban sobre
// la columna de al lado.
//
// EL ARREGLO, el que Daniel dejó a elección: «Documentos» sale de la fila y lo
// abre **tocar la fila**, exactamente como en la cartera del grupo. Y la celda
// del total lleva `flex-wrap`, que es el candado de verdad: a cualquier ancho en
// el que no entren, el botón baja de renglón en vez de derramarse.
//
// 🔴 TODO ADENTRO DE LA PESTAÑA DE BOSTON. Ni una fila suya toca el grupo: este
// cambio es de DIBUJO, no de datos — no se toca ninguna lectura, ninguna ruta ni
// ninguna lista de empresas. Los candados de aislamiento
// (`cxc-boston-fuera-de-toda-superficie`) siguen mandando.
//
// ⚠️ LAS TARJETAS DEL CELULAR NO SE TOCARON: ahí los dos botones van uno al lado
// del otro a ancho completo (`flex-1`) y nunca se encimaron.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const plano = (rel: string) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

const BOSTON = "src/components/cxc/BostonTab.tsx";
const GRUPO = "src/app/cxc/components/ClientRow.tsx";

const src = plano(BOSTON);

/** La vista de tabla (escritorio e iPad acostado), aislada del resto. */
function vistaTabla(texto: string): string {
  const desde = texto.indexOf('data-vista="tabla"');
  expect(desde, "no está la vista de tabla de Boston").toBeGreaterThan(-1);
  const hasta = texto.indexOf("<BostonDocumentosDrawer", desde);
  return texto.slice(desde, hasta > -1 ? hasta : undefined);
}

/** La vista de tarjetas (iPhone y iPad parado). */
function vistaTarjetas(texto: string): string {
  const desde = texto.indexOf('data-vista="tarjetas"');
  const hasta = texto.indexOf('data-vista="tabla"', desde);
  return texto.slice(desde, hasta);
}

describe("🔴 1 · la fila de la tabla lleva UN botón, no dos", () => {
  const tabla = vistaTabla(src);

  it("🩸 «Documentos» salió de la fila", () => {
    expect(tabla, "volvió el segundo botón a la fila").not.toContain(">\n                  Documentos\n");
    expect(tabla).not.toMatch(/<button[\s\S]{0,400}Documentos\s*<\/button>/);
  });

  it("y queda solo «Cobrar», como en la cartera del grupo", () => {
    const botones = tabla.match(/<button/g) ?? [];
    expect(botones).toHaveLength(1);
    expect(tabla).toContain("Cobrar");
  });

  it("🔴 tocar la FILA abre los documentos", () => {
    expect(tabla).toMatch(/onClick=\{\(\) => setDocumentosDe\(c\)\}/);
    expect(tabla).toContain("cursor-pointer");
  });

  it("…y «Cobrar» no dispara además la fila", () => {
    expect(tabla).toContain("e.stopPropagation(); setCobrarA(c);");
  });
});

describe("🔴 2 · el monto no puede encimarse a ningún ancho", () => {
  const tabla = vistaTabla(src);

  it("la celda del total envuelve en vez de derramarse", () => {
    expect(tabla).toMatch(/col-span-2[^"]*flex flex-wrap items-center justify-end/);
  });

  it("⚠️ la grilla sigue siendo la MISMA del grupo (4/2/2/2/2)", () => {
    // Si la grilla cambiara, la tira de totales de arriba dejaría de quedar
    // parada sobre sus columnas — que es la razón por la que es esta grilla.
    const encabezado = src.slice(src.indexOf('data-vista="tabla"'));
    for (const clase of ["col-span-4", "col-span-2"]) {
      expect(encabezado).toContain(clase);
    }
    expect(encabezado).not.toContain("col-span-3");
    expect(encabezado).not.toContain("col-span-1");
  });

  it("los tres tramos y el total siguen en su columna, con su color", () => {
    const tabla2 = vistaTabla(src);
    expect(tabla2).toContain("AGING.current.text");
    expect(tabla2).toContain("AGING.watch.text");
    expect(tabla2).toContain("AGING.overdue.text");
    expect(tabla2).toContain("fmt(c.total)");
  });
});

describe("⚠️ 3 · lo que NO se tocó", () => {
  it("las tarjetas del celular conservan sus DOS botones", () => {
    const tarjetas = vistaTarjetas(src);
    expect(tarjetas).toContain("Cobrar");
    expect(tarjetas).toContain("Documentos");
    // Van a ancho completo, uno al lado del otro: ahí nunca se encimaron.
    expect(tarjetas).toContain("flex-1");
  });

  it("🔴 ni una fila de Boston toca el grupo: esto es DIBUJO, no datos", () => {
    // La pestaña sigue leyendo su propia ruta y nada más.
    expect(src).toContain("/api/cxc/boston");
    for (const delGrupo of [
      "fetchEstadoCuentaData", "clientes_master", "B2B_EMPRESA_KEYS", "empresasConCxc",
    ]) {
      expect(src, `Boston se asomó al grupo por «${delGrupo}»`).not.toContain(delGrupo);
    }
  });

  it("el cajón de documentos y la hoja «Cobrar» siguen montados", () => {
    expect(src).toContain("<BostonDocumentosDrawer");
    expect(src).toContain("<BostonHojaCobrar");
    expect(src).toContain("onVerDocumentos");
  });

  it("🔑 y la fila del GRUPO sigue con su botón único, sin cambios", () => {
    const grupo = plano(GRUPO);
    expect((grupo.match(/<button/g) ?? [])).toHaveLength(1);
    expect(grupo).toContain("Cobrar");
  });
});
