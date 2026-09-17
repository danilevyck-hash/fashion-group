// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — LAS CATEGORÍAS DEL CATÁLOGO REEBOK SE ADMINISTRAN (17-sep-2026).
//
// 🩸 El mapa `rubro de Switch → categoría del catálogo` vivía en el código, y no
// en un lugar: en DOS listas espejo que había que acordarse de tocar juntas
// (`CATEGORIA_POR_RUBRO` y `REEBOK_CATEGORY_ESPERADAS`). El 2-sep-2026 HEADWEAR
// entró en una sola y cada archivo con gorras avisaba «valor inesperado» sobre
// un dato bueno. El 17-sep el despacho de ropa trajo cuatro rubros nuevos
// —T-SHIRTS, TOPS, BRA, JACKETS— y el aviso solo podía ofrecer «Copiar las
// categorías»: no había pantalla a la que llevar a nadie.
//
// Daniel, preguntado si quería volverlo administrable: **«sí»**.
//
// Lo que este candado protege, en orden de lo que cuesta si se rompe:
//
//   1. 🔴 **FALLA ABIERTA.** Sin tabla, sin migración o con la base callada se
//      usan las SEIS reglas del código y el catálogo clasifica igual que ayer.
//      Si esto se rompe, los productos con la marca vacía caen al cajón neutro
//      y el bulto pasa de 12 a 6: es plata.
//   2. 🔴 **LAS CATEGORÍAS SIGUEN CERRADAS EN EL CÓDIGO.** Tres, y ninguna más.
//   3. 🔴 **LA MARCA MANDA PRIMERO.** Ninguna fila de la tabla mueve ese orden.
//   4. 🔴 **UNA SOLA FUENTE.** La lista del Depurador se DERIVA; nadie la
//      escribe a mano en un segundo archivo.
//   5. 🔴 **SOFT DELETE FIRMADO Y ÚNICO ENTRE ACTIVAS**, en la migración.
//
// 📏 MEDIDO CONTRA PRODUCCIÓN el 17-sep-2026 (`scripts/_medir-categorias-reebok.mjs`,
// solo lectura): los **1.763 artículos** de `active_shoes` en
// `switch_articulo_info` dan la MISMA categoría con el mapa del código y con la
// semilla de la migración — **0 diferencias**.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CATEGORIAS_REEBOK,
  ROTULO_CATEGORIA,
  MAX_LARGO_RUBRO,
  MIGRACION_RUBROS_REEBOK,
  RUBROS_ROLES_ESCRITURA,
  RUBROS_ROLES_LECTURA,
  RUTA_CATEGORIAS_REEBOK,
  TABLA_RUBROS_REEBOK,
  enlaceParaAgregar,
  esCategoriaReebok,
  mapaDeRubros,
  puedeEditarRubros,
  rubrosParaElAviso,
  rubrosPedidosEnLaUrl,
  validarRubroNuevo,
  yaEstaElRubro,
} from "@/lib/catalogos/reebok-rubros";
import {
  CATEGORIA_POR_RUBRO_BASE,
  categoriaReebok,
  clasificacionDeArticulo,
  rubrosQueElCatalogoConoce,
  type CategoriaReebok,
} from "@/lib/reebok-clasificacion";
import { REEBOK_CATEGORY_ESPERADAS, valoresInesperados, type ReebokItem } from "@/lib/depurador/reebok";
import { TABLAS_PERSONAS } from "@/lib/backup/tablas";

const raiz = path.join(__dirname, "..", "..", "..");
const leer = (rel: string): string => fs.readFileSync(path.join(raiz, rel), "utf8");

const SQL = leer(`supabase/migrations/${MIGRACION_RUBROS_REEBOK}_reebok_rubro_categoria.sql`);

/** Las seis de siempre, tal como el código las tenía antes del cambio. */
const LAS_SEIS: Record<string, CategoriaReebok> = {
  SHOES: "footwear",
  APPAREL: "apparel",
  SHORTS: "apparel",
  SOCKS: "apparel",
  BAGS: "accessories",
  HEADWEAR: "accessories",
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. 🔴 FALLA ABIERTA — sin tabla, el mapa de siempre
 * ══════════════════════════════════════════════════════════════════════════ */
describe("🔴 FALLA ABIERTA: sin la tabla, el catálogo clasifica igual que ayer", () => {
  it("la red del código son EXACTAMENTE las seis reglas de siempre", () => {
    expect({ ...CATEGORIA_POR_RUBRO_BASE }).toEqual(LAS_SEIS);
  });

  it("una lista vacía devuelve la red, NUNCA un mapa vacío", () => {
    // 🩸 Un mapa vacío mandaría al cajón neutro a todo producto con la marca
    // vacía, y el cajón neutro es lo que cambia el bulto de 12 a 6.
    expect(mapaDeRubros([])).toEqual(CATEGORIA_POR_RUBRO_BASE);
    expect(mapaDeRubros(null)).toEqual(CATEGORIA_POR_RUBRO_BASE);
    expect(mapaDeRubros(undefined)).toEqual(CATEGORIA_POR_RUBRO_BASE);
  });

  it("y con filas basura tampoco se queda sin mapa", () => {
    expect(mapaDeRubros([{ rubro: "  ", categoria: "apparel" }])).toEqual(CATEGORIA_POR_RUBRO_BASE);
    expect(mapaDeRubros([{ rubro: "SHOES", categoria: "zapatos" }])).toEqual(CATEGORIA_POR_RUBRO_BASE);
  });

  it("el aviso del Depurador también cae a los seis de siempre", () => {
    expect(rubrosParaElAviso(null)).toEqual(Object.keys(LAS_SEIS));
    expect(rubrosParaElAviso([])).toEqual(Object.keys(LAS_SEIS));
  });

  it("🔴 la SEMILLA de la migración reproduce el mapa del código, línea por línea", () => {
    // Si esto falla, correr la migración CAMBIA la clasificación de los 1.763
    // artículos de producción. Es la prueba de que la tabla no estrena nada.
    const filas = [...SQL.matchAll(/\(\s*'([A-Z -]+)',\s*'(footwear|apparel|accessories)'/g)]
      .map((m) => ({ rubro: m[1], categoria: m[2] }));
    expect(filas.length).toBe(Object.keys(LAS_SEIS).length);
    expect(mapaDeRubros(filas)).toEqual(CATEGORIA_POR_RUBRO_BASE);
  });

  it("🔴 y clasificar con esa semilla da lo MISMO, rubro por rubro y con marca vacía", () => {
    const filas = Object.entries(LAS_SEIS).map(([rubro, categoria]) => ({ rubro, categoria }));
    const deLaTabla = mapaDeRubros(filas);
    for (const rubro of [...Object.keys(LAS_SEIS), "GENERAL", "OFERTA", "DISPLAY & PROMO", ""]) {
      expect(categoriaReebok(rubro, null, deLaTabla), rubro).toBe(categoriaReebok(rubro, null));
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. 🔴 LAS CATEGORÍAS NO SE INVENTAN
 * ══════════════════════════════════════════════════════════════════════════ */
describe("🔴 las categorías son TRES y siguen cerradas en el código", () => {
  it("son exactamente calzado, ropa y accesorios", () => {
    expect([...CATEGORIAS_REEBOK]).toEqual(["footwear", "apparel", "accessories"]);
    expect(Object.keys(ROTULO_CATEGORIA).sort()).toEqual([...CATEGORIAS_REEBOK].sort());
  });

  it("se leen en español, que es como Daniel las nombra", () => {
    expect(ROTULO_CATEGORIA.footwear).toBe("Calzado");
    expect(ROTULO_CATEGORIA.apparel).toBe("Ropa");
    expect(ROTULO_CATEGORIA.accessories).toBe("Accesorios");
  });

  it("🔴 el servidor RECHAZA una categoría inventada", () => {
    const r = validarRubroNuevo({ rubro: "T-SHIRTS", categoria: "ropa_interior" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Calzado, Ropa o Accesorios/);
  });

  it("🔴 y la BASE también: el CHECK enumera las tres", () => {
    expect(SQL).toMatch(/CHECK \(categoria IN \('footwear', 'apparel', 'accessories'\)\)/);
  });

  it("el cajón neutro NO es una categoría elegible", () => {
    expect(esCategoriaReebok("otros")).toBe(false);
    expect(esCategoriaReebok(null)).toBe(false);
    expect(esCategoriaReebok("")).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. 🔴 LA MARCA MANDA PRIMERO — ninguna tabla mueve ese orden
 * ══════════════════════════════════════════════════════════════════════════ */
describe("🔴 la MARCA sigue ganándole al rubro, diga lo que diga la tabla", () => {
  it("una tabla que mandara SHOES a ropa NO contradice un Department FOOTWEAR", () => {
    const traviesa = mapaDeRubros([{ rubro: "SHOES", categoria: "apparel" }]);
    expect(categoriaReebok("SHOES", "FOOTWEAR", traviesa)).toBe("footwear");
  });

  it("y el rubro solo entra cuando la marca viene vacía", () => {
    const traviesa = mapaDeRubros([{ rubro: "SHOES", categoria: "apparel" }]);
    expect(categoriaReebok("SHOES", null, traviesa)).toBe("apparel");
    expect(categoriaReebok("SHOES", "", traviesa)).toBe("apparel");
  });

  it("🔴 `null` sigue siendo «no sé», nunca «otros»", () => {
    expect(categoriaReebok("LO QUE SEA", null, mapaDeRubros([{ rubro: "SHOES", categoria: "footwear" }]))).toBeNull();
  });

  it("🔴 y un «no sé» NO pisa lo que ya está clasificado — eso es el bulto", () => {
    const c = clasificacionDeArticulo(
      { rubro: "RUBRO NUEVO", subrubro: "MALE", marca: "", ficha_at: "2026-09-17T00:00:00Z" },
      "ZIG",
      { category: "footwear", gender: "male" },
      mapaDeRubros([{ rubro: "SHOES", categoria: "footwear" }]),
    );
    expect(c.category).toBe("footwear");
  });

  it("clasificacionDeArticulo USA el mapa que se le pasa", () => {
    const conTee = mapaDeRubros([...Object.entries(LAS_SEIS).map(([rubro, categoria]) => ({ rubro, categoria })), { rubro: "T-SHIRTS", categoria: "apparel" }]);
    const ficha = { rubro: "T-SHIRTS", subrubro: "MALE", marca: "", ficha_at: "2026-09-17T00:00:00Z" };
    expect(clasificacionDeArticulo(ficha, "TEE", {}, conTee).category).toBe("apparel");
    // Sin ese mapa, el mismo artículo cae al cajón neutro: la diferencia es real.
    expect(clasificacionDeArticulo(ficha, "TEE", {}).category).toBe("otros");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. 🔴 UNA SOLA FUENTE — el espejo murió
 * ══════════════════════════════════════════════════════════════════════════ */
describe("🔴 UNA sola fuente: nadie vuelve a escribir la lista a mano", () => {
  it("REEBOK_CATEGORY_ESPERADAS se DERIVA del mapa", () => {
    expect([...REEBOK_CATEGORY_ESPERADAS]).toEqual(rubrosQueElCatalogoConoce());
  });

  it("🔴 y el archivo del Depurador NO tiene los seis valores tecleados", () => {
    // Un barrido, no una comparación: si alguien vuelve a pegar el arreglo
    // literal, el build se pone rojo aunque los valores coincidan hoy.
    const fuente = leer("src/lib/depurador/reebok.ts");
    expect(fuente).not.toMatch(/REEBOK_CATEGORY_ESPERADAS\s*=\s*\[/);
    expect(fuente).toMatch(/REEBOK_CATEGORY_ESPERADAS[^=]*=\s*rubrosQueElCatalogoConoce\(\)/);
  });

  it("agregar un rubro al mapa apaga el aviso del Depurador SIN tocar código", () => {
    const conTee = [...Object.keys(LAS_SEIS), "T-SHIRTS"];
    const tee: ReebokItem = {
      po: "PO-1", newArticle: "APPCL999", sku: "EAN9", name: "TEE", department: "APPAREL",
      category: "T-SHIRTS", ageGroup: "ADULT", colorName: "BLACK", gender: "MALE",
      sellIn: "Q3", wholesale: 10, wholesaleOff: null, talla: "M", piezas: 6,
    };
    expect(valoresInesperados([tee], conTee)).toEqual([]);
    // CONTROL: sin el rubro, el aviso salta. El test de arriba prueba algo.
    expect(valoresInesperados([tee]).some((v) => v.valor === "T-SHIRTS")).toBe(true);
  });

  it("la lista que llega de la tabla se compara NORMALIZADA", () => {
    const tee: ReebokItem = {
      po: "PO-1", newArticle: "APPCL999", sku: "EAN9", name: "TEE", department: "APPAREL",
      category: "T-SHIRTS", ageGroup: "ADULT", colorName: "BLACK", gender: "MALE",
      sellIn: "Q3", wholesale: 10, wholesaleOff: null, talla: "M", piezas: 6,
    };
    expect(valoresInesperados([tee], [...Object.keys(LAS_SEIS), " t-shirts "])).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. 🔴 EL RUBRO SE GUARDA COMO LLEGA DE SWITCH, y se compara EXACTO
 * ══════════════════════════════════════════════════════════════════════════ */
describe("🔴 el rubro se normaliza al guardar y se compara por igualdad exacta", () => {
  it("se guarda en MAYÚSCULAS y sin espacios de más", () => {
    const r = validarRubroNuevo({ rubro: "  t-shirts  ", categoria: "apparel" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.rubro).toBe("T-SHIRTS");
  });

  it("🔴 y la BASE lo exige: el CHECK pide BTRIM y UPPER", () => {
    expect(SQL).toMatch(/rubro = BTRIM\(rubro\) AND rubro = UPPER\(rubro\)/);
  });

  it("un rubro vacío se rechaza con texto para la pantalla", () => {
    const r = validarRubroNuevo({ rubro: "   ", categoria: "apparel" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Escribe el rubro/);
  });

  it("un rubro larguísimo se rechaza", () => {
    const r = validarRubroNuevo({ rubro: "X".repeat(MAX_LARGO_RUBRO + 1), categoria: "apparel" });
    expect(r.ok).toBe(false);
  });

  it("🔴 el repetido se caza por igualdad exacta normalizada, JAMÁS por parecido", () => {
    expect(yaEstaElRubro("t-shirts", ["T-SHIRTS"])).toBe(true);
    expect(yaEstaElRubro("  T-SHIRTS ", ["T-SHIRTS"])).toBe(true);
    // 🩸 «T-SHIRT» en singular es OTRO rubro: Switch lo mandaría distinto y el
    // mapa no haría match. Agruparlos por parecido sería inventar.
    expect(yaEstaElRubro("T-SHIRT", ["T-SHIRTS"])).toBe(false);
    expect(yaEstaElRubro("SHOE", ["SHOES"])).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. 🔴 SOFT DELETE FIRMADO, ÚNICO ENTRE ACTIVAS, RLS service_role
 * ══════════════════════════════════════════════════════════════════════════ */
describe("🔴 la tabla: soft delete firmado, NUNCA DELETE", () => {
  it("tiene `activo`, quién y cuándo", () => {
    expect(SQL).toMatch(/activo\s+boolean NOT NULL DEFAULT true/);
    expect(SQL).toMatch(/desactivado_por\s+text/);
    expect(SQL).toMatch(/desactivado_en\s+timestamptz/);
  });

  it("🔴 la baja se FIRMA: hay CHECK que lo exige", () => {
    expect(SQL).toMatch(/CHECK \(activo OR \(desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL\)\)/);
  });

  it("🔴 el GRANT no incluye DELETE", () => {
    const grant = SQL.match(/GRANT ([^;]+) ON reebok_rubro_categoria TO service_role/);
    expect(grant).not.toBeNull();
    expect(grant![1]).not.toMatch(/DELETE/);
  });

  it("único entre ACTIVAS, para que un rubro quitado se pueda volver a agregar", () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX[^;]*ON reebok_rubro_categoria \(rubro\)\s*\n\s*WHERE activo/);
  });

  it("RLS encendida y solo service_role", () => {
    expect(SQL).toMatch(/ALTER TABLE reebok_rubro_categoria ENABLE ROW LEVEL SECURITY/);
    expect(SQL).toMatch(/CREATE POLICY service_role_all ON reebok_rubro_categoria/);
  });

  it("🔴 el servidor quita con UPDATE firmado, y jamás con .delete()", () => {
    const fuente = leer("src/lib/catalogos/reebok-rubros-server.ts");
    expect(fuente).not.toMatch(/\.delete\(/);
    expect(fuente).toMatch(/activo: false/);
    expect(fuente).toMatch(/desactivado_por/);
    expect(fuente).toMatch(/desactivado_en/);
  });

  it("🔴 nada que no se pueda volver a conseguir queda sin copia", () => {
    expect(TABLAS_PERSONAS as readonly string[]).toContain(TABLA_RUBROS_REEBOK);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. 🔴 QUIÉN PUEDE QUÉ — escribir es SOLO admin
 * ══════════════════════════════════════════════════════════════════════════ */
describe("🔴 leer es de quien administra el catálogo; escribir es SOLO admin", () => {
  it("escribir: admin y nadie más", () => {
    expect([...RUBROS_ROLES_ESCRITURA]).toEqual(["admin"]);
    expect(puedeEditarRubros("admin")).toBe(true);
    for (const r of ["secretaria", "vendedor", "bodega", "contabilidad", "gerente_boston", "gerente_acs", null]) {
      expect(puedeEditarRubros(r), String(r)).toBe(false);
    }
  });

  it("leer: admin y secretaria — el par de la Plantilla Switch", () => {
    expect([...RUBROS_ROLES_LECTURA].sort()).toEqual(["admin", "secretaria"]);
  });

  it("🔴 la ruta usa esas listas, no una escrita a mano", () => {
    const fuente = leer("src/app/api/catalogo/reebok/rubros/route.ts");
    expect(fuente).toMatch(/requireRole\(req, \[\.\.\.RUBROS_ROLES_LECTURA\]\)/);
    expect((fuente.match(/requireRole\(req, \[\.\.\.RUBROS_ROLES_ESCRITURA\]\)/g) ?? []).length).toBe(2);
  });

  it("🔴 y la PANTALLA rebota en el servidor a quien no edita", () => {
    const fuente = leer("src/app/catalogos/admin/[marca]/categorias/page.tsx");
    expect(fuente).toMatch(/puedeEditarRubros\(role\)/);
    expect(fuente).toMatch(/redirect\("\/home"\)/);
    // Es de Reebok y de nadie más: cada marca clasifica distinto.
    expect(fuente).toMatch(/notFound\(\)/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 8. 🔴 EL BOTÓN DE PLANTILLA SWITCH LLEVA A ALGUNA PARTE
 * ══════════════════════════════════════════════════════════════════════════ */
describe("🔴 «Agregarlas al catálogo» lleva a la pantalla, con los rubros cargados", () => {
  it("el enlace apunta a la pantalla y arrastra los rubros", () => {
    expect(enlaceParaAgregar(["T-SHIRTS", "TOPS"]))
      .toBe(`${RUTA_CATEGORIAS_REEBOK}?agregar=T-SHIRTS%2CTOPS`);
  });

  it("sin rubros, lleva a la pantalla pelada", () => {
    expect(enlaceParaAgregar([])).toBe(RUTA_CATEGORIAS_REEBOK);
  });

  it("los rubros del enlace llegan normalizados y sin repetir", () => {
    expect(rubrosPedidosEnLaUrl("t-shirts,TOPS, t-shirts ,,BRA"))
      .toEqual(["T-SHIRTS", "TOPS", "BRA"]);
  });

  it("un enlace vacío o basura no rompe nada", () => {
    expect(rubrosPedidosEnLaUrl(null)).toEqual([]);
    expect(rubrosPedidosEnLaUrl("")).toEqual([]);
    expect(rubrosPedidosEnLaUrl(",,,")).toEqual([]);
  });

  it("🔴 el enlace NO escribe: la pantalla solo prepara el formulario", () => {
    const fuente = leer("src/app/catalogos/admin/[marca]/categorias/CategoriasRubroClient.tsx");
    // Lo que llega por `?agregar=` solo alimenta `rubrosPedidosEnLaUrl`; el POST
    // sale de `agregar()`, que es lo que toca una persona.
    expect(fuente).toMatch(/rubrosPedidosEnLaUrl\(searchParams\?\.get\("agregar"\)\)/);
    const dentroDelEfecto = fuente.match(/useEffect\(\(\) => \{\s*void cargar\(\);/);
    expect(dentroDelEfecto).not.toBeNull();
  });

  it("🔴 y la pantalla de Plantilla Switch ya no ofrece «Copiar»", () => {
    const fuente = leer("src/app/productos/cargar/ReebokClient.tsx");
    expect(fuente).not.toMatch(/CopiarCategorias/);
    expect(fuente).toMatch(/AgregarlasAlCatalogo/);
    expect(fuente).toMatch(/enlaceParaAgregar\(categorias\)/);
  });

  it("🔴 el aviso pregunta por los rubros de la TABLA, no por la lista del código", () => {
    const fuente = leer("src/app/productos/cargar/ReebokClient.tsx");
    expect(fuente).toMatch(/valoresInesperados\(items, rubrosDelCatalogo\)/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 9. 🔴 EL SYNC LEE LA TABLA — y falla abierto
 * ══════════════════════════════════════════════════════════════════════════ */
describe("🔴 el sync del catálogo clasifica con el mapa administrado", () => {
  it("lo lee UNA vez por corrida y se lo pasa al módulo puro", () => {
    const fuente = leer("src/lib/switch-api/sync-catalogo-reebok.ts");
    expect(fuente).toMatch(/const porRubro = await leerMapaDeRubros\(\)/);
    expect(fuente).toMatch(/clasificacionDeArticulo\([\s\S]*?porRubro,\s*\)/);
  });

  it("🔴 `leerMapaDeRubros` NO lanza: devuelve la red del código", () => {
    const fuente = leer("src/lib/catalogos/reebok-rubros-server.ts");
    expect(fuente).toMatch(/catch[\s\S]*?return CATEGORIA_POR_RUBRO_BASE/);
  });

  it("🔴 el GET falla abierto: sin tabla, 200 con los seis del código", () => {
    const fuente = leer("src/app/api/catalogo/reebok/rubros/route.ts");
    expect(fuente).toMatch(/tablaAusente[\s\S]*?rubros: rubrosParaElAviso\(null\)/);
  });
});
