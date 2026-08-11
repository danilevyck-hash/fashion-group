// ============================================================================
// Candado de Marketing › Mobiliario — UNA SOLA TABLA + el "?" del proveedor
// ============================================================================
//
// Daniel, textual: *"quiero productos tal cual como esta, solo que con las
// fotos de notas proveedor. y con ? global que muestre los precios reales que
// son los que estan en nota proveedor. y despues eliminar notas proveedor. el
// ? global es solo para saber el precio real de cada articulo, todo en un solo
// ?, y que ese precio que aparece en ? no se calcule en ningun lado, es solo
// nota personal"*.
//
// Lo que nadie puede deshacer sin poner el build en ROJO:
//
//   1. LOS PRECIOS DEL PROVEEDOR NO ENTRAN EN NINGÚN CÁLCULO. Son OTROS
//      precios que los de la tabla (proveedor $65 contra inventario $130 en
//      Paneles): si alguno se colara en "Valor", el total de la pantalla
//      pasaría a ser una mezcla de dos cosas distintas y se vería igual de
//      creíble. El "?" no suma, no promedia y no le pasa nada a la página; y
//      `metricas` sigue saliendo solo de `productos` y `entregas`.
//   2. UN SOLO "?", ARRIBA. No uno por fila.
//   3. LA TABLA `mk_mobiliario_notas_proveedor` NO SE BORRA. Sacar el bloque
//      de la pantalla es reversible; borrar la tabla no, y encima es de donde
//      el "?" saca los precios.
//   4. LA COLUMNA DE FOTO SIGUE EN LA TABLA DE PRODUCTOS, en las DOS vistas
//      (tarjetas hasta lg, tabla desde lg).
//   5. EL BACKFILL DE FOTOS ES IDEMPOTENTE Y NO ADIVINA. Pares explícitos, y
//      la vista previa tiene que decir exactamente lo que el UPDATE va a
//      hacer — si difirieran, la vista previa estaría mintiendo.
//   6. SOLO ADMIN, EN EL SERVIDOR.
//
// Verificado por mutación:
//   * meter un `.reduce(` de precios en el "?" rompe 1;
//   * pasarle los precios del proveedor a la página (props/callback) rompe 1;
//   * volver a montar el bloque de "Notas del proveedor" rompe 1;
//   * poner un "?" por fila rompe 1;
//   * sacarle el `foto_path IS NULL` al UPDATE rompe 1;
//   * cambiar un par en el PASO 2 y no en el PASO 1 rompe 3;
//   * un DROP TABLE de la tabla del proveedor en cualquier migración rompe 1;
//   * cambiar `["admin"]` por `["admin","secretaria"]` en la ruta rompe 1;
//   * quitar `<FotoProducto` de la tabla o de las tarjetas rompe 1.
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ARCHIVO_MIGRACION_FOTOS,
  paresDeFotos,
} from "@/lib/marketing/fotos-pares";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

const PAGINA = "src/app/marketing/mobiliario/page.tsx";
const AYUDA = "src/components/marketing/PreciosProveedorAyuda.tsx";
const RUTA_NOTAS = "src/app/api/marketing/mobiliario/notas-proveedor/route.ts";

/** El código sin comentarios: un comentario que diga "reduce" no es código. */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Los precios del proveedor no se calculan en ningún lado
// ─────────────────────────────────────────────────────────────────────────────
describe("los precios del proveedor son nota personal: no entran en ningún cálculo", () => {
  it('el "?" no suma, no promedia y no agrega nada', () => {
    const src = soloCodigo(leer(AYUDA));
    expect(src).not.toMatch(/\.reduce\s*\(/);
    expect(src).not.toMatch(/\btotal\b\s*[+*]?=/i);
    expect(src).not.toMatch(/promedio|suma[rn]?\s*\(|acumul/i);
    // Ni siquiera aritmética sobre el precio: solo se formatea y se muestra.
    expect(src).not.toMatch(/\bn\.precio\s*[*+\-/]/);
    expect(src).not.toMatch(/[*+\-/]\s*n\.precio\b/);
  });

  it('el "?" no le devuelve NADA a la página: no hay por dónde colarse a un total', () => {
    const src = soloCodigo(leer(AYUDA));
    // Sin props de entrada ni callbacks de salida: es un botón autónomo.
    expect(src).toMatch(/export default function PreciosProveedorAyuda\(\)/);
    expect(src).not.toMatch(/onPrecios|onCargad|onTotal|props\./);
    // Y la página lo monta sin pasarle ni recibirle nada.
    expect(leer(PAGINA)).toContain("<PreciosProveedorAyuda />");
  });

  it("las métricas de la pantalla siguen saliendo solo de productos y entregas", () => {
    const src = leer(PAGINA);
    const metricas = src.slice(
      src.indexOf("const metricas = useMemo("),
      src.indexOf("}, [productos, entregas]);") + 30,
    );
    expect(metricas.length).toBeGreaterThan(100);
    expect(metricas).not.toMatch(/nota|proveedor/i);
    expect(metricas).toContain("}, [productos, entregas]);");
  });

  it("la página no importa nada de las notas del proveedor", () => {
    const src = soloCodigo(leer(PAGINA));
    expect(src).not.toMatch(/from "@\/lib\/marketing\/notas-proveedor/);
    expect(src).not.toMatch(/notas-proveedor/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Un solo "?", y el bloque viejo ya no está en pantalla
// ─────────────────────────────────────────────────────────────────────────────
describe('un solo "?" arriba, y "Notas del proveedor" fuera de la pantalla', () => {
  it("el bloque de Notas del proveedor ya no se monta", () => {
    const src = soloCodigo(leer(PAGINA));
    expect(src).not.toContain("<NotasProveedorMobiliario");
    expect(src).not.toContain("NotasProveedorMobiliario");
  });

  it('hay UN solo "?" y está junto a "+ Agregar producto", no en las filas', () => {
    const src = soloCodigo(leer(PAGINA));
    const usos = src.match(/<PreciosProveedorAyuda/g) ?? [];
    expect(usos).toHaveLength(1);
    // Junto al botón de agregar, y NO adentro del `productos.map(` de ninguna
    // de las dos vistas (un "?" por fila es exactamente lo que se descartó).
    const bloqueAgregar = src.slice(
      src.indexOf("<PreciosProveedorAyuda"),
      src.indexOf("<PreciosProveedorAyuda") + 400,
    );
    expect(bloqueAgregar).toContain("+ Agregar producto");
    expect(src.indexOf("<PreciosProveedorAyuda")).toBeLessThan(
      src.indexOf("productos.map("),
    );
  });

  it('el "?" dice en pantalla que no se calcula', () => {
    const src = leer(AYUDA);
    expect(src).toContain("Precios del proveedor");
    expect(src).toContain(
      "Nota personal. No se suma ni entra en ningún cálculo.",
    );
  });

  it("cierra con Escape y con clic afuera, y se alcanza con teclado", () => {
    const src = soloCodigo(leer(AYUDA));
    expect(src).toMatch(/e\.key === "Escape"/);
    expect(src).toMatch(/e\.target === e\.currentTarget/);
    expect(src).toContain("createPortal");
    expect(src).toContain("inset-0");
    expect(src).toContain("useBodyScrollLock");
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    // Regla de la casa para iOS: nada de autoFocus ni de slide-up.
    expect(src).not.toContain("autoFocus");
    expect(src).not.toMatch(/animate-|slide-up|translate-y-full/);
    // El botón del "?" es un <button> de verdad (tabulable), no un div.
    expect(src).toMatch(/<button[\s\S]{0,400}aria-haspopup="dialog"/);
  });

  it("el blanco táctil del ? llega a 44 px", () => {
    const src = leer(AYUDA);
    const boton = src.slice(src.indexOf('aria-haspopup="dialog"'));
    expect(boton).toContain("min-h-[44px]");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. La columna de foto sigue en la tabla de Productos, en las DOS vistas
// ─────────────────────────────────────────────────────────────────────────────
describe("la foto se ve en Productos", () => {
  it("está en la tabla (≥lg) y en las tarjetas (<lg)", () => {
    const src = soloCodigo(leer(PAGINA));
    const usos = src.match(/<FotoProducto\b/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(2);
    // La columna va PRIMERO en la tabla: antes que "Producto".
    expect(src.indexOf('aria-label="Foto"')).toBeLessThan(
      src.indexOf(">Producto<"),
    );
  });

  it("sin foto se ve un recuadro del mismo tamaño, no un hueco", () => {
    const src = leer(PAGINA);
    const comp = src.slice(src.indexOf("function FotoProducto("));
    expect(comp).toMatch(/h-11 w-11/);
    // El caso sin foto tiene el MISMO alto/ancho que el caso con foto.
    expect((comp.match(/h-11 w-11/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. El backfill de fotos: explícito, idempotente y sin mentir en la previa
// ─────────────────────────────────────────────────────────────────────────────
describe("backfill de fotos", () => {
  it("la vista previa y el UPDATE tienen exactamente los mismos pares", () => {
    // `paresDeFotos()` revienta si difieren. Que devuelva algo ya lo prueba.
    const pares = paresDeFotos(raiz);
    expect(pares.length).toBeGreaterThan(0);
  });

  it("los 6 pares medidos contra producción están declarados", () => {
    const pares = paresDeFotos(raiz);
    expect(pares).toEqual([
      { productoInventario: "Paneles", productoNota: "Paneles" },
      { productoInventario: "Tablas", productoNota: "Tablas" },
      {
        productoInventario: "Conjunto soporte",
        productoNota: "Conjunto soporte tabla",
      },
      { productoInventario: "Norte colgador", productoNota: "Norte colgador" },
      { productoInventario: "Barra plana", productoNota: "Barra plana" },
      { productoInventario: "Barra flauta", productoNota: "Flauta" },
    ]);
  });

  it("es idempotente: nunca pisa una foto ya puesta", () => {
    const sql = leer(ARCHIVO_MIGRACION_FOTOS);
    const update = sql.slice(sql.indexOf("UPDATE mk_inventario_productos"));
    expect(update).toMatch(/p\.foto_path IS NULL/);
  });

  it("no borra ni vacía nada", () => {
    const sql = leer(ARCHIVO_MIGRACION_FOTOS)
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM/i);
    // Y no toca la tabla del proveedor más que para LEERLA.
    expect(sql).not.toMatch(
      /UPDATE\s+mk_mobiliario_notas_proveedor|INSERT\s+INTO\s+mk_mobiliario_notas_proveedor/i,
    );
  });

  it("no parea por parecido: nada de LIKE ni ILIKE ni similarity", () => {
    // Solo las líneas de CÓDIGO: los comentarios del archivo explican
    // justamente que NO se usa LIKE, y contarlos daría un rojo falso.
    const sql = leer(ARCHIVO_MIGRACION_FOTOS)
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/\bI?LIKE\b|similarity|levenshtein|SIMILAR TO/i);
  });

  it("toma la PRIMERA foto del arreglo, explícitamente", () => {
    expect(leer(ARCHIVO_MIGRACION_FOTOS)).toMatch(/foto_paths\[1\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. La tabla del proveedor no se borra — en NINGUNA migración
// ─────────────────────────────────────────────────────────────────────────────
describe("mk_mobiliario_notas_proveedor sigue existiendo", () => {
  it("ninguna migración la dropea", () => {
    const dir = join(raiz, "supabase", "migrations");
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".sql")) continue;
      const sql = readFileSync(join(dir, f), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      expect(
        sql,
        `${f} no puede borrar mk_mobiliario_notas_proveedor`,
      ).not.toMatch(/DROP\s+TABLE[^;]*mk_mobiliario_notas_proveedor/i);
    }
  });

  it('el "?" la lee de la ruta que ya existía', () => {
    expect(leer(AYUDA)).toContain("/api/marketing/mobiliario/notas-proveedor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Solo admin, en el servidor
// ─────────────────────────────────────────────────────────────────────────────
describe("los costos del proveedor son solo de admin", () => {
  it("la ruta que alimenta el ? exige admin", () => {
    // Solo CÓDIGO: los comentarios de la ruta citan el guard y nombran a la
    // secretaria para explicar por qué NO entra — contarlos daría rojo falso.
    const src = soloCodigo(leer(RUTA_NOTAS));
    expect(src).toMatch(/requireRole\(req,\s*\["admin"\]\)/);
    expect(src).not.toContain("secretaria");
    expect(src).not.toMatch(/requireAdmin\s*\(/);
  });

  it("la pantalla tampoco lo muestra a la secretaria", () => {
    const src = soloCodigo(leer(PAGINA));
    expect(src).toMatch(/role === "admin" && <PreciosProveedorAyuda \/>/);
  });
});
