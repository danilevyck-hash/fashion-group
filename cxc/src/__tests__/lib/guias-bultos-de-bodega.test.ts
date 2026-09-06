// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LOS BULTOS QUE BODEGA CUENTA AL DESPACHAR — y el rastro que queda.
//
// Daniel, 5-sep-2026: *«porque bodega si al despachar cuentan más bultos de lo
// que puso la secretaria, quiero que lo pueda cambiar en caso de algún error»*
// y, sobre dejar constancia: *«¿queda registro?»* → sí.
//
// 🔴 LO QUE NO CAMBIA: los bultos de una guía **YA DESPACHADA** siguen sin
// tocarse — *«es lo que el transportista firmó»*. Se abre la ventana ANTERIOR a
// la firma, y nada más.
//
// 🔴 Y SE ESCRIBE POR COLUMNA, NUNCA POR `items` DEL PUT: `items` es un
// reemplazo completo (borra e inserta) que le rotaría el id a cada renglón en
// pleno despacho y tiraría el trabajo de atar clientes. Es el mismo camino que
// `items_guia_transp` desde el 17-ago-2026.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  bultosDespuesDeCorregir,
  bultosTecleados,
  correccionesDeBultos,
  puedeCorregirBultos,
  quienCorrige,
  textoCorreccionEnVivo,
  textoCorreccionGuardada,
} from "@/lib/guias/bultos-correccion";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

describe("🔴 solo mientras la guía está PENDIENTE y solo quien despacha", () => {
  it("guía pendiente + permiso = se cuenta", () => {
    expect(puedeCorregirBultos(false, true)).toBe(true);
  });

  it("🔴 guía ya despachada = NO, aunque tenga permiso", () => {
    expect(puedeCorregirBultos(true, true)).toBe(false);
  });

  it("sin permiso de despachar = NO (vendedor mira sin tocar)", () => {
    expect(puedeCorregirBultos(false, false)).toBe(false);
    expect(puedeCorregirBultos(true, false)).toBe(false);
  });
});

describe("solo viaja lo que CAMBIÓ", () => {
  const items = [
    { id: "a", bultos: 7 },
    { id: "b", bultos: 3 },
  ];

  it("un renglón que no se tocó no se manda", () => {
    expect(correccionesDeBultos(items, [7, 3])).toEqual([]);
  });

  it("solo el que cambió, con su id", () => {
    expect(correccionesDeBultos(items, [8, 3])).toEqual([{ id: "a", bultos: 8 }]);
  });

  it("bajar también cuenta", () => {
    expect(correccionesDeBultos(items, [7, 1])).toEqual([{ id: "b", bultos: 1 }]);
  });

  it("🔴 un renglón SIN id no viaja: no se puede escribir una columna sin línea", () => {
    expect(correccionesDeBultos([{ bultos: 4 }], [9])).toEqual([]);
  });

  it("lo tecleado es entero ≥ 0", () => {
    expect(bultosTecleados("8")).toBe(8);
    expect(bultosTecleados("")).toBe(0);
    expect(bultosTecleados("-3")).toBe(0);
    expect(bultosTecleados("abc")).toBe(0);
  });
});

describe("🔴 el total que el servidor cuenta mira los bultos YA corregidos", () => {
  const items = [{ id: "a", bultos: 0 }];

  it("subir de 0 a 5 deja despachar — era el freno de «0 bultos»", () => {
    expect(bultosDespuesDeCorregir(items, [{ id: "a", bultos: 5 }])).toBe(5);
  });

  it("sin correcciones cuenta lo de siempre", () => {
    expect(bultosDespuesDeCorregir([{ id: "a", bultos: 7 }], [])).toBe(7);
  });

  it("una corrección de OTRA guía no mueve el total", () => {
    expect(bultosDespuesDeCorregir([{ id: "a", bultos: 7 }], [{ id: "z", bultos: 99 }])).toBe(7);
  });
});

describe("🔴 queda registro — Daniel: «¿queda registro?»", () => {
  it("en vivo: «↑ 7 → 8, bodega»", () => {
    expect(textoCorreccionEnVivo(7, 8, "bodega")).toBe("↑ 7 → 8, bodega");
  });

  it("bajar dice ↓", () => {
    expect(textoCorreccionEnVivo(8, 7, "bodega")).toBe("↓ 8 → 7, bodega");
  });

  it("🔴 sin cambio no dice nada: mirar la caja no es corregir", () => {
    expect(textoCorreccionEnVivo(7, 7, "bodega")).toBe("");
  });

  it("cada rol se nombra en palabras", () => {
    expect(quienCorrige("bodega")).toBe("bodega");
    expect(quienCorrige("secretaria")).toBe("secretaría");
    expect(quienCorrige("admin")).toBe("administración");
    expect(quienCorrige("")).toBe("quien despacha");
  });

  it("después: «Bultos corregidos por Bodega: 7 → 8»", () => {
    expect(
      textoCorreccionGuardada({ bultos: 8, bultos_original: 7, bultos_corregido_por: "Bodega" }),
    ).toBe("Bultos corregidos por Bodega: 7 → 8");
  });

  it("🔴 sin el dato NO se afirma nada (la migración está pendiente)", () => {
    expect(textoCorreccionGuardada({ bultos: 8 })).toBeNull();
    expect(textoCorreccionGuardada({ bultos: 8, bultos_original: null })).toBeNull();
  });

  it("un original igual al actual tampoco dice nada", () => {
    expect(textoCorreccionGuardada({ bultos: 7, bultos_original: 7, bultos_corregido_por: "x" })).toBeNull();
  });
});

describe("candado estático — el servidor", () => {
  const ruta = leer("src/app/api/guias/[id]/route.ts");

  it("🔴 escribe UNA columna de UNA línea, acotada a ESTA guía", () => {
    expect(ruta).toContain("items_bultos");
    // El `.eq("guia_id", id)` no es cosmético: sin él, el id de cualquier línea
    // del sistema bastaría para escribirle encima desde acá.
    const bloque = ruta.slice(
      ruta.indexOf("BULTOS CORREGIDOS POR BODEGA"),
      ruta.indexOf("N° DE GUÍA DEL TRANSPORTISTA, UNO POR LÍNEA"),
    );
    expect(bloque).toContain('.update({ bultos: c.bultos })');
    // 🔴 LAS DOS escrituras (la del rastro y la de respaldo sin DDL) van
    // acotadas. Dejar una suelta basta para escribirle a la línea de otra guía.
    const updates = bloque.match(/from\("guia_items"\)\.update\(/g) ?? [];
    const acotadas = bloque.match(/\.eq\("id", c\.id\)\.eq\("guia_id", id\)/g) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    expect(acotadas.length).toBe(updates.length);
  });

  it("🔴 NO se mete por `items`: eso borra e inserta los renglones", () => {
    const bloque = ruta.slice(
      ruta.indexOf("BULTOS CORREGIDOS POR BODEGA"),
      ruta.indexOf("N° DE GUÍA DEL TRANSPORTISTA, UNO POR LÍNEA"),
    );
    expect(bloque.length).toBeGreaterThan(0);
    expect(bloque).not.toContain("insert(");
    expect(bloque).not.toContain("delete()");
  });

  it("🔴 se mira `previous.estado`, no el del cuerpo: ese pedido ES el despacho", () => {
    // El guard tiene que estar EN LA CONDICIÓN de la corrección, no en
    // cualquier otro `if` del archivo.
    expect(ruta).toContain(
      'if (correccionesBultos.length > 0 && previous?.estado !== "Completada") {',
    );
  });

  it("valida el id como UUID antes de tocar nada", () => {
    expect(ruta).toContain("UUID_RE.test(f.id)");
  });

  it("⚠️ si la DDL no corrió, el número se guarda IGUAL", () => {
    // Perder la corrección por no poder guardar el rastro sería el peor de los
    // dos males: el rastro es útil, el número es la mercancía.
    expect(ruta).toContain("ddlLista = false");
    expect(ruta).toContain("bultos_original");
  });

  it("y queda en la bitácora", () => {
    expect(ruta).toContain("correccionesHechas");
    expect(ruta).toContain("changes.bultos");
  });

  it("el original es el de la PRIMERA corrección y no se pisa", () => {
    expect(ruta).toContain("antes.bultos_original ?? de");
  });
});

describe("candado estático — la pantalla y el papel", () => {
  it("la caja vive en la lista de envíos, al lado de la del N° del transportista", () => {
    const lista = leer("src/app/guias/components/ListaEnvios.tsx");
    expect(lista).toContain('id={`despacho-bultos-${idx}`}');
    expect(lista).toContain("const puedeContar = editable && Boolean(setBultos)");
    expect(lista).toContain("textoCorreccionEnVivo");
    expect(lista).toContain("textoCorreccionGuardada");
  });

  it("la página de la guía le pasa el estado y el rol", () => {
    const pagina = leer("src/app/guias/[id]/page.tsx");
    expect(pagina).toContain("bultosPorLinea={s.bultosPorLinea}");
    expect(pagina).toContain("setBultos={s.setBultos}");
    expect(pagina).toContain("editable={!s.despachada && puedeDespachar}");
  });

  it("🔴 en el papel, el PDF y el Excel sale el número FINAL, sin el rastro", () => {
    for (const p of [
      "src/app/guias/components/PrintDocument.tsx",
      "src/lib/guias/pdf-guia.ts",
      "src/app/guias/components/excel-guias.ts",
      "src/lib/guias/png-guia.ts",
    ]) {
      const src = leer(p);
      expect(src).not.toContain("bultos_original");
      expect(src).not.toContain("textoCorreccionGuardada");
    }
  });

  it("la migración del rastro existe y es ADITIVA (nunca un DROP)", () => {
    const mig = leer("supabase/migrations/20261004120000_guias_bultos_corregidos.sql");
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS bultos_original");
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS bultos_corregido_por");
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS bultos_corregido_en");
    expect(mig).not.toMatch(/DROP|DELETE|TRUNCATE/i);
  });
});
