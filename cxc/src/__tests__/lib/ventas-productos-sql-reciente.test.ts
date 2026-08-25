// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de la MIGRACIÓN 20260825160000 — lo que el SQL no puede perder.
//
// El SQL no se renderiza, así que acá sí hay un barrido de texto. 🩸 SE BORRAN
// LOS COMENTARIOS PRIMERO: este archivo tiene 80 líneas de encabezado que
// nombran `id::text`, `NC` y `switch_top_descripciones`, y un barrido crudo
// "encontraría" todo eso en la prosa y pasaría con la función vacía.
//
// 🔴 LO QUE ESTE ARCHIVO EXISTE PARA CAZAR:
//   · que la migración REEMPLACE la función viva (deja de ser aditiva y ya no
//     hay adónde caer si algo sale mal);
//   · que el desempate del nombre deje de ser determinista (dos corridas de la
//     misma consulta devuelven nombres distintos y nadie se entera);
//   · que "más reciente" se acote al período (el nombre cambiaría según la
//     ventana y la columna «vs año ant.» dejaría de cruzar);
//   · que un signo o un filtro se muevan (la venta total se movería con ellos).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const RAIZ = path.join(__dirname, "../../..");
const RUTA = path.join(RAIZ, "supabase/migrations/20260825160000_productos_descripcion_reciente.sql");
const CRUDO = readFileSync(RUTA, "utf8");

/** El SQL SIN comentarios: `-- …` hasta el fin de línea. */
const SQL = CRUDO.replace(/--[^\n]*/g, "");

/** El cuerpo de una función, desde su CREATE hasta el `$fn$;` que la cierra. */
function cuerpo(nombre: string): string {
  const i = SQL.indexOf(`CREATE OR REPLACE FUNCTION ${nombre}(`);
  expect(i, `no está ${nombre}`).toBeGreaterThan(-1);
  const j = SQL.indexOf("$fn$;", i);
  expect(j, `${nombre} no cierra`).toBeGreaterThan(i);
  return SQL.slice(i, j);
}

describe("el barrido mira SQL, no prosa", () => {
  it("los comentarios se borraron de verdad", () => {
    expect(CRUDO).toContain("manda lo mas reciente");   // está en el encabezado
    expect(SQL).not.toContain("manda lo mas reciente"); // y no en el SQL
  });
});

describe("la migración es ADITIVA: no toca lo que ya está vivo", () => {
  for (const viva of ["switch_top_descripciones", "switch_articulos_por_descripcion"]) {
    it(`no redefine ${viva}`, () => {
      expect(SQL).not.toContain(`CREATE OR REPLACE FUNCTION ${viva}(`);
    });
  }
  it("no borra ni cambia nada", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/\bALTER TABLE\b/i);
    expect(SQL).not.toMatch(/\bDELETE\b|\bUPDATE\b|\bINSERT\b/i);
  });
  it("crea las dos funciones nuevas y les da permiso", () => {
    for (const fn of ["switch_top_descripciones_reciente", "switch_articulos_por_descripcion_reciente"]) {
      expect(SQL).toContain(`CREATE OR REPLACE FUNCTION ${fn}(`);
      expect(SQL).toContain(`GRANT EXECUTE ON FUNCTION ${fn}`);
    }
  });
  it("las dos son STABLE: no escriben", () => {
    expect(SQL.match(/LANGUAGE sql STABLE/g) ?? []).toHaveLength(2);
  });
});

describe("🔴 el desempate del nombre es DETERMINISTA", () => {
  for (const fn of ["switch_top_descripciones_reciente", "switch_articulos_por_descripcion_reciente"]) {
    it(`${fn} desempata por id::text`, () => {
      const c = cuerpo(fn);
      // Cada DISTINCT ON que resuelve el nombre ordena por fecha DESC y CIERRA
      // con el id. Sin ese cierre, dos filas del mismo día empatan y gana
      // cualquiera. `id::text` y no `id`: min(uuid) sólo existe desde PG14.
      expect(c).toMatch(/ORDER BY[^;]*fecha DESC, id::text ASC/);
    });
  }
});

describe("🔴 'más reciente' es GLOBAL, no del período", () => {
  it("la fila que da el nombre no se filtra por fecha", () => {
    for (const fn of ["switch_top_descripciones_reciente", "switch_articulos_por_descripcion_reciente"]) {
      const c = cuerpo(fn);
      // El bloque que va del cuerpo (`AS $fn$`) hasta el primer ORDER BY es el
      // que elige la fila más nueva. Si ahí apareciera p_desde/p_hasta, el
      // nombre pasaría a depender de la ventana elegida. Se arranca DESPUÉS de
      // la firma, que sí nombra los dos parámetros.
      const desdeElCuerpo = c.slice(c.indexOf("AS $fn$"));
      const eleccion = desdeElCuerpo.slice(0, desdeElCuerpo.search(/ORDER BY[^;]*fecha DESC/));
      expect(eleccion).not.toContain("p_desde");
      expect(eleccion).not.toContain("p_hasta");
    }
  });
});

describe("🔴 los signos y los filtros son los de la función viva", () => {
  const c = cuerpo("switch_top_descripciones_reciente");
  for (const col of ["cantidad_total", "venta_total", "costo_total"]) {
    it(`${col} resta cuando el tipo es NC`, () => {
      expect(c).toMatch(new RegExp(`CASE WHEN tipo = 'NC' THEN -${col}\\s+ELSE\\s+${col}\\s+END`));
    });
  }
  it("sólo 'NC' resta: no aparece ningún otro tipo firmado", () => {
    expect(c.match(/THEN -/g) ?? []).toHaveLength(3);
  });
  it("el único filtro de salida sigue siendo venta <> 0", () => {
    expect(c).toContain("WHERE a.venta <> 0");
  });
  it("el margen es (venta - costo) / venta y es null con venta <= 0", () => {
    expect(c).toMatch(/CASE WHEN a\.venta > 0 THEN \(a\.venta - a\.costo\) \/ a\.venta ELSE NULL END/);
  });
});

describe("🔴 la etiqueta del grupo ES el nombre reciente del código", () => {
  it("el grupo se rotula con r.descripcion, y sólo cae al texto propio sin código", () => {
    const c = cuerpo("switch_top_descripciones_reciente");
    expect(c).toMatch(
      /COALESCE\(\s*CASE WHEN d\.codigo IS NOT NULL THEN r\.descripcion END,\s*d\.descripcion,\s*'\(sin descripcion\)',?\s*\)\s*AS descripcion/,
    );
  });
  it("y ese rótulo es POR EL QUE SE AGRUPA", () => {
    const c = cuerpo("switch_top_descripciones_reciente");
    expect(c).toMatch(/FROM base\s*\n\s*GROUP BY descripcion/);
  });
});

describe("la identidad es el CÓDIGO", () => {
  it("se junta por código, nunca normalizando el texto", () => {
    const c = cuerpo("switch_top_descripciones_reciente");
    expect(c).toContain("ON r.codigo = d.codigo");
    // Nada de lower/trim/replace/unaccent sobre la descripción: `Outlet Duty
    // Free N2` y `N3` se parecen muchísimo y son dos cosas distintas.
    expect(c).not.toMatch(/\blower\s*\(/i);
    expect(c).not.toMatch(/\bunaccent\s*\(/i);
    expect(c).not.toMatch(/\bregexp_replace\s*\(/i);
  });
});

describe("las fechas se filtran sargables (nunca EXTRACT)", () => {
  it("BETWEEN contra la columna pelada", () => {
    expect(SQL).toMatch(/d\.fecha BETWEEN p_desde AND p_hasta/);
    expect(SQL).not.toMatch(/EXTRACT\s*\(/i);
  });
});
