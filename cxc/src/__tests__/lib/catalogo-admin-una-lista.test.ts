/**
 * CANDADO — «Administrar» el catálogo: UNA lista, UN cuadro para subir fotos,
 * y las columnas que quedaron sin lectores NO se borran (6-sep-2026).
 *
 * ─── LO QUE DANIEL APROBÓ, punto por punto ──────────────────────────────────
 *  1. Se van las DOS pestañas. Una sola lista con su buscador, y «Faltan foto»
 *     pasa a ser un chip más. (Se entraba a una pestaña vacía: Reebok tiene 0
 *     sin foto, así que lo primero que se veía eran dos cajas de arrastre.)
 *  2. Se van las CINCO tarjetas de arriba: repetían, en inglés, los mismos
 *     números que los chips de abajo. Queda UNA fila de chips con el número
 *     adentro y en español.
 *  3. Se retiran de la pantalla la ETIQUETA y el NOMBRE editado a mano — 0 usos
 *     en 1.120 productos. ⚠️ El BULTO se queda: Daniel, textual, *«pero bulto
 *     sí se usa»* (51 productos de Tommy), y en Calvin también aunque hoy sean
 *     0 de 94 — *«algunos productos de Calvin vienen de a 8 piezas, pero
 *     actualmente ninguno en existencia viene de 8, pero lo queremos para
 *     cuando venga»*.
 *  4. UN SOLO CUADRO para subir: el ZIP del portal y las fotos sueltas, y la
 *     lista SUMA en vez de reemplazar. Daniel: *«toco el mismo cuadro y
 *     selecciono una foto y después al volver a tocarlo selecciono otra foto
 *     sin que se me borre la anterior»* y *«se suben solas»*.
 *  5. «Excel sin foto» se apaga cuando no hay nada que bajar.
 *  6. Se retira «Importar Excel» de Joybees (0 usos, sin deshacer, y el precio
 *     lo devuelve el cron de esa tarde).
 *  7. Los tocables a 44 px — se usa en iPad.
 *  8. Textos.
 *
 * ─── MEDIDO CONTRA PRODUCCIÓN EL 6-sep-2026 ─────────────────────────────────
 *   1.120 productos (Tommy 552 · Reebok 391 · Calvin 94 · Joybees 83)
 *   1.103 con foto · 25 escondidos a mano · 51 con bulto a mano (todos Tommy)
 *   0 con etiqueta · 0 con nombre editado a mano · 0 líneas de pedido con
 *   preventa (`is_preorder`, 0 de 316).
 *
 * 🩸 El barrido borra los COMENTARIOS antes de mirar: si no, el comentario que
 * explica que la etiqueta se fue haría fallar al candado — o, peor, lo haría
 * pasar solo.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MARCA_THEME, getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import {
  CHIP_ESCONDIDOS, CHIP_SIN_FOTO, CHIP_TODOS, PREFIJO_CATEGORIA,
  categoriasDeLaMarca, chipValido, chipsDelCatalogo, pasaElChip,
} from "@/lib/catalogos/admin-chips";
import {
  agregarFotos, asignarProducto, claveDeArchivo, emparejar, esZip, indicePorSku,
  marcarEstado, quitarDeLaCola, resumenCola, separarPorTipo, siguienteParaSubir,
} from "@/lib/catalogos/admin-fotos-cola";
import { coincideBusqueda, ordenarParaTrabajar } from "@/lib/catalogos/admin-lista";

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");
const ADMIN = "app/catalogos/admin/[marca]";
const MIGRACIONES = path.join(RAIZ, "supabase", "migrations");

const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
const codigo = (rel: string) => sinComentarios(leer(rel));

const shell = codigo(`${ADMIN}/AdminCatalogoClient.tsx`);
const subir = codigo(`${ADMIN}/SubirFotos.tsx`);
const fila = codigo(`${ADMIN}/ProductoFila.tsx`);
const upload = codigo(`${ADMIN}/photoUpload.ts`);
/** Los cuatro archivos de la pantalla, juntos: los barridos miran los cuatro. */
const PANTALLA = [shell, subir, fila, upload];

// ─────────────────────────────────────────────────────────────────────────────
// 1 · UNA sola lista, sin pestañas
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 se entraba a una pestaña vacía: ahora hay UNA lista", () => {
  it("no quedan pestañas en la pantalla", () => {
    expect(shell).not.toContain('useUrlState<Tab>("tab"');
    expect(shell).not.toMatch(/type Tab = /);
    expect(shell).not.toContain("Catálogo completo");
    expect(shell).not.toContain("Faltan foto");
  });

  it("el chip elegido vive en la URL, y es `replace` (mismo nivel)", () => {
    expect(shell).toContain('useUrlState("ver", "todos")');
    // Sin `{ history: "push" }`: un filtro no puede llenar el historial.
    expect(shell).not.toMatch(/useUrlState\("ver"[^)]*push/);
  });

  it("un `?ver=` viejo o inventado cae en «Todos», nunca en una lista vacía", () => {
    const chips = chipsDelCatalogo([{ image_url: "x" }], [], () => null);
    expect(chipValido("escondidos", chips)).toBe(CHIP_TODOS);
    expect(chipValido(null, chips)).toBe(CHIP_TODOS);
    expect(chipValido("sin-foto", chips)).toBe(CHIP_SIN_FOTO);
  });

  it("los dos componentes de la pantalla vieja ya no existen", () => {
    for (const f of ["ProductosTarjetas.tsx", "ProductosBatch.tsx", "BulkPhotoUpload.tsx", "ZipB2BUpload.tsx"]) {
      expect(fs.existsSync(path.join(SRC, ADMIN, f)), `${f} volvió`).toBe(false);
    }
  });

  it("CONTROL — la lista se sigue dibujando y sigue ordenada", () => {
    expect(shell).toContain("ordenarParaTrabajar");
    expect(shell).toContain("<ProductoFila");
    const ordenados = ordenarParaTrabajar([
      { sku: "B", name: "Zapato", stock: 0 },
      { sku: "A", name: "Zapato", stock: 5 },
      { sku: "C", name: "Abrigo", stock: 0 },
    ]);
    // Con existencia primero; después por nombre; el código desempata.
    expect(ordenados.map((p) => p.sku)).toEqual(["A", "C", "B"]);
  });

  it("CONTROL — el buscador sigue mirando nombre Y código", () => {
    const p = { sku: "GH8228", name: "Club C 85", stock: 1 };
    expect(coincideBusqueda(p, "gh82")).toBe(true);
    expect(coincideBusqueda(p, "club")).toBe(true);
    expect(coincideBusqueda(p, "nada")).toBe(false);
    expect(coincideBusqueda(p, "  ")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Los chips: se CALCULAN y salen del mapa por marca
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 una sola fila de chips, con el número adentro", () => {
  const CATS = [
    { value: "footwear", label: "Calzado" },
    { value: "apparel", label: "Ropa" },
    { value: "accessories", label: "Accesorios" },
  ];
  const catDe = (p: { category?: string }) => p.category ?? null;
  const CATALOGO = [
    { image_url: "a.jpg", category: "footwear" },
    { image_url: "b.jpg", category: "footwear" },
    { image_url: null, category: "apparel" },
    { image_url: "c.jpg", category: "accessories" },
    { image_url: "d.jpg", category: "footwear", oculto_manual: true },
  ];

  it("los números se calculan sobre lo VISIBLE, nunca se escriben a mano", () => {
    const chips = chipsDelCatalogo(CATALOGO, CATS, catDe);
    expect(chips.map((c) => `${c.label} ${c.count}`)).toEqual([
      "Todos 4", "Calzado 2", "Ropa 1", "Accesorios 1", "Sin foto 1", "Escondidos 1",
    ]);
  });

  it("«Sin foto» sale aunque valga 0; «Escondidos» solo si hay alguno", () => {
    const chips = chipsDelCatalogo([{ image_url: "a.jpg" }], [], catDe);
    expect(chips.map((c) => c.key)).toEqual([CHIP_TODOS, CHIP_SIN_FOTO]);
    expect(chips.find((c) => c.key === CHIP_SIN_FOTO)!.count).toBe(0);
  });

  it("las cinco tarjetas de resumen se fueron del tema y de la pantalla", () => {
    for (const t of Object.values(MARCA_THEME)) {
      expect((t.admin as Record<string, unknown>).metrics).toBeUndefined();
      expect((t.admin as Record<string, unknown>).fotoTabBadge).toBeUndefined();
    }
    expect(shell).not.toContain("theme.admin.metrics");
    expect(shell).not.toContain("function Metric");
  });

  it("🔴 los nombres de categoría salen del mapa por marca, no de la pantalla", () => {
    // Reebok ya los tiene en español; Tommy y Calvin en el vocabulario de
    // Switch a propósito (`tommy-nombres.ts`), y eso no se decide desde acá.
    expect(shell).toContain("categoriasDeLaMarca(theme.filtros.categoryOptions)");
    expect(categoriasDeLaMarca(getMarcaTheme("reebok")!.filtros.categoryOptions).map((o) => o.label))
      .toEqual(["Calzado", "Ropa", "Accesorios"]);
    // Ninguna traducción escrita a mano en la pantalla ni en el módulo puro.
    const chipsSrc = codigo("lib/catalogos/admin-chips.ts");
    for (const fuente of [shell, chipsSrc]) {
      for (const palabra of ["Calzado", "Footwear", "Apparel", "Accessories", "Sneakers"]) {
        expect(fuente, `«${palabra}» escrito a mano`).not.toContain(`"${palabra}"`);
      }
    }
  });

  it("Joybees clasifica por el NOMBRE, y esa es la única excepción escrita", () => {
    const j = getMarcaTheme("joybees")!;
    expect(j.filtros.categoryOptions).toEqual([]); // no tiene columna de categoría
    expect(j.admin.categorias!.map((o) => o.label)).toEqual(["Clogs", "Sandalias", "Flips"]);
    expect(j.admin.categoriaDe!({ id: "1", sku: "X", name: "Kids Clog", image_url: null })).toBe("Clogs");
    for (const otra of ["reebok", "tommy", "calvin"] as const) {
      expect(getMarcaTheme(otra)!.admin.categorias, otra).toBeUndefined();
      expect(getMarcaTheme(otra)!.admin.categoriaDe, otra).toBeUndefined();
    }
  });

  it("los chips llevan blanco táctil de 44 px", () => {
    expect(shell).toContain("inline-flex min-h-[44px] items-center gap-1.5 px-3 rounded-lg text-xs font-medium");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · ESCONDER SIGUE SIENDO ESCONDER
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 nada de esto puede volver a mostrar un producto escondido", () => {
  const catDe = (p: { category?: string }) => p.category ?? null;
  const escondido = { image_url: null, category: "footwear", oculto_manual: true };

  it("un escondido NO entra en «Todos», ni en su categoría, ni en «Sin foto»", () => {
    expect(pasaElChip(escondido, CHIP_TODOS, catDe)).toBe(false);
    expect(pasaElChip(escondido, `${PREFIJO_CATEGORIA}footwear`, catDe)).toBe(false);
    // 🔑 Este es el que importa: un escondido sin foto colado en la cola de
    // fotos termina con alguien subiéndole una y devolviéndolo al catálogo.
    expect(pasaElChip(escondido, CHIP_SIN_FOTO, catDe)).toBe(false);
    expect(pasaElChip(escondido, CHIP_ESCONDIDOS, catDe)).toBe(true);
  });

  it("la fila manda el toggle tal cual, sin tocar `active` ni la visibilidad", () => {
    expect(fila).toContain("toggleProductOculto(marca, { id: product.id, sku: product.sku || \"\" }, !escondido)");
    for (const fuente of PANTALLA) {
      expect(fuente).not.toMatch(/active:\s*true/);
      expect(fuente).not.toMatch(/oculto_manual:\s*false/);
    }
  });

  it("🔴 la pantalla nunca escribe `foto_manual`: quien lo respeta es el servidor", () => {
    for (const fuente of PANTALLA) expect(fuente).not.toContain("foto_manual");
    // Y el ZIP sigue yendo por el único camino que respeta la foto elegida.
    expect(subir).toContain("procesarZipB2B");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · La etiqueta, el nombre a mano, keep_visible y la preventa
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 se retiran de la PANTALLA; las COLUMNAS no se dropean", () => {
  it("la etiqueta y el nombre editable no viven más en la pantalla", () => {
    for (const fuente of PANTALLA) {
      expect(fuente).not.toContain("updateProductBadge");
      expect(fuente).not.toContain("editProductName");
      expect(fuente).not.toContain("nombre_manual");
      expect(fuente).not.toContain("proximamente");
      expect(fuente).not.toContain("Sin etiqueta");
    }
    // El `badge` no se lee ni se escribe desde acá.
    for (const fuente of PANTALLA) expect(fuente).not.toMatch(/\bbadge\b/);
  });

  it("`keep_visible` y `is_preorder` tampoco asoman por esta pantalla", () => {
    for (const fuente of PANTALLA) {
      expect(fuente).not.toContain("keep_visible");
      expect(fuente).not.toContain("is_preorder");
    }
  });

  it("las palancas se fueron del tema en las CUATRO marcas", () => {
    for (const [nombre, t] of Object.entries(MARCA_THEME)) {
      const admin = t.admin as Record<string, unknown>;
      for (const campo of ["badgeEditable", "nombreEditable", "importarTab", "productosStyle"]) {
        expect(admin[campo], `${nombre}.admin.${campo}`).toBeUndefined();
      }
    }
  });

  const sqls = fs
    .readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => [f, fs.readFileSync(path.join(MIGRACIONES, f), "utf8")] as const);

  it("el barrido encuentra migraciones (si diera 0, pasaría sin mirar nada)", () => {
    expect(sqls.length).toBeGreaterThan(20);
  });

  it("🔴 NINGUNA migración puede borrar las columnas que quedaron sin lectores", () => {
    // Patrón `mayor_lineas` / `cxc_favorites`: apagar la escritura se deshace
    // en un minuto; borrar la columna, no. Y el sync SIGUE respetando
    // `nombre_manual` y `badge` (la visibilidad del catálogo público los mira).
    for (const [f, raw] of sqls) {
      const sql = raw.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
      for (const col of ["badge", "nombre_manual", "keep_visible", "is_preorder", "bulto_pzas", "oculto_manual", "foto_manual"]) {
        expect(sql, `${f} no puede dropear la columna ${col}`).not.toMatch(
          new RegExp(`DROP\\s+COLUMN\\s+(IF\\s+EXISTS\\s+)?"?${col}"?`, "i"),
        );
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · UN SOLO CUADRO: suma, no reemplaza, y sube solo
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el cuadro único de subir fotos", () => {
  const P = [
    { id: "p1", sku: "GH8228", name: "Club C", image_url: null },
    { id: "p2", sku: "FW0FW05821", name: "Slipper", image_url: "ya.jpg" },
  ];
  const f = (name: string, size = 100_000, lastModified = 1) => ({ name, size, lastModified });
  const ok = () => null;

  it("acepta el ZIP y las fotos por el MISMO cuadro", () => {
    expect(shell).toContain("<SubirFotos");
    // Un solo <input type="file"> en el componente: si volvieran a ser dos
    // cajas, este número sube.
    expect((subir.match(/type="file"/g) ?? []).length).toBe(1);
    const { zips, fotos } = separarPorTipo([f("banco.ZIP"), f("GH8228.jpg")]);
    expect(zips.map((x) => x.name)).toEqual(["banco.ZIP"]);
    expect(fotos.map((x) => x.name)).toEqual(["GH8228.jpg"]);
    expect(esZip(f("x.zip"))).toBe(true);
    expect(esZip(f("x.jpg"))).toBe(false);
  });

  it("🩸 LA LISTA SUMA: volver a elegir no borra lo anterior", () => {
    const uno = agregarFotos([], [f("GH8228.jpg")], P, ok);
    const dos = agregarFotos(uno, [f("FW0FW05821.jpg", 200_000, 2)], P, ok);
    expect(dos.map((i) => i.archivo.name)).toEqual(["GH8228.jpg", "FW0FW05821.jpg"]);
    // Y no muta la cola que recibió (regla de la casa).
    expect(uno).toHaveLength(1);
  });

  it("el MISMO archivo dos veces no entra dos veces", () => {
    const uno = agregarFotos([], [f("GH8228.jpg")], P, ok);
    const dos = agregarFotos(uno, [f("GH8228.jpg")], P, ok);
    expect(dos).toHaveLength(1);
    expect(claveDeArchivo(f("a.jpg", 1, 2))).not.toBe(claveDeArchivo(f("a.jpg", 1, 3)));
  });

  it("🔴 la que no coincide con ningún código NO se descarta: se queda y se elige", () => {
    const cola = agregarFotos([], [f("foto-rara.jpg")], P, ok);
    expect(cola[0].estado).toBe("pendiente");
    expect(cola[0].motivo).toContain("elige el producto");
    const elegida = asignarProducto(cola, cola[0].clave, P[0]);
    expect(elegida[0].estado).toBe("esperando");
    expect(elegida[0].productoId).toBe("p1");
    expect(subir).toContain("asignarProducto");
  });

  it("dos fotos al MISMO código no se pisan solas", () => {
    const cola = agregarFotos([], [f("GH8228.jpg"), f("GH8228 (1).jpg", 200_000, 2)], P, ok);
    expect(cola[0].estado).toBe("esperando");
    expect(cola[1].estado).toBe("pendiente");
  });

  it("el pareo tolera los sufijos del explorador de archivos", () => {
    const idx = indicePorSku(P);
    for (const n of ["GH8228.jpg", "gh8228.png", "GH8228 (2).jpg", "GH8228-1.jpg", "GH 8228.jpg"]) {
      expect(emparejar(n, idx)?.id, n).toBe("p1");
    }
    expect(emparejar("nada.jpg", idx)).toBeNull();
  });

  it("la que ya tenía foto se marca como reemplazo, y el archivo inválido no sube", () => {
    const cola = agregarFotos([], [f("FW0FW05821.jpg")], P, ok);
    expect(cola[0].reemplaza).toBe(true);
    const mala = agregarFotos([], [f("GH8228.jpg")], P, () => "La imagen es muy pequeña.");
    expect(mala[0].estado).toBe("error");
    expect(mala[0].productoId).toBeNull();
  });

  it("🔴 SE SUBEN SOLAS: no hay botón de subir ni de guardar", () => {
    expect(subir).not.toMatch(/Subir \$\{/);
    expect(subir).not.toContain("handleUpload");
    expect(subir).not.toMatch(/>\s*Guardar/);
    // La fila de subida se arma sola desde el estado «esperando».
    expect(subir).toContain("siguienteParaSubir(cola)");
    expect(subir).toContain("uploadProductPhoto(");
  });

  it("una que falla no frena a las demás", () => {
    let cola = agregarFotos([], [f("GH8228.jpg"), f("FW0FW05821.jpg", 200_000, 2)], P, ok);
    cola = marcarEstado(cola, cola[0].clave, "error", "No se pudo subir.");
    expect(siguienteParaSubir(cola)!.sku).toBe("FW0FW05821");
    expect(resumenCola(cola)).toMatchObject({ total: 2, conError: 1, esperando: 1 });
  });

  it("se puede quitar UNA sin perder las demás", () => {
    const cola = agregarFotos([], [f("GH8228.jpg"), f("FW0FW05821.jpg", 200_000, 2)], P, ok);
    expect(quitarDeLaCola(cola, cola[0].clave).map((i) => i.sku)).toEqual(["FW0FW05821"]);
  });

  it("🔴 arrastrar una foto ENCIMA de la fila la sube a ESE producto", () => {
    expect(fila).toContain("onDrop=");
    expect(fila).toContain("e.dataTransfer.files?.[0]");
    expect(fila).toContain("subirFoto(f)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Excel apagado en 0 · «Importar Excel» retirado
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 lo que no tiene nada que hacer, no se ofrece", () => {
  it("«Excel sin foto» se apaga cuando no hay ninguno, y dice por qué", () => {
    expect(shell).toContain("disabled={sinFoto.length === 0}");
    expect(shell).toContain("Todos los productos tienen foto");
    // Y sale de la MISMA cola de siempre, no de una lista nueva.
    expect(shell).toContain("colaSinFoto(vivos)");
  });

  it("«Importar Excel» ya no existe en la pantalla", () => {
    for (const fuente of PANTALLA) {
      expect(fuente).not.toContain("ImportarTab");
      expect(fuente).not.toContain("validateCsvImport");
      expect(fuente).not.toContain("Descargar plantilla");
      expect(fuente).not.toMatch(/\$\{theme\.api\}\/import/);
      expect(fuente).not.toContain("tab=importar");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Las 4 marcas iguales · el bulto es la excepción escrita
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 las cuatro marcas se administran igual", () => {
  it("la pantalla no pregunta por el nombre de la marca en ningún lado", () => {
    for (const fuente of PANTALLA) {
      for (const m of ["reebok", "joybees", "tommy", "calvin"]) {
        expect(fuente, `${m} cableado`).not.toMatch(new RegExp(`marca\\s*===\\s*"${m}"`));
      }
    }
  });

  it("⚠️ el BULTO se queda, y en Tommy y Calvin — se pregunta al tema", () => {
    expect(fila).toContain("theme.admin.bultoEditable");
    expect(fila).toContain("BultoSelector");
    expect(getMarcaTheme("tommy")!.admin.bultoEditable).toBe(true);
    expect(getMarcaTheme("calvin")!.admin.bultoEditable).toBe(true);
    expect(getMarcaTheme("reebok")!.admin.bultoEditable).toBeFalsy();
    expect(getMarcaTheme("joybees")!.admin.bultoEditable).toBeFalsy();
  });

  it("CONTROL — las cuatro marcas siguen teniendo su admin completo", () => {
    for (const [nombre, t] of Object.entries(MARCA_THEME)) {
      expect(t.admin.productsUrl, nombre).toContain("/products");
      expect(typeof t.admin.excelSinFoto, nombre).toBe("function");
      expect(t.admin.syncModulo, nombre).toContain("catalogo-");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 · Tocables y textos
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 44 px y textos que se leen", () => {
  it("ningún TOCABLE de la pantalla se queda sin blanco táctil", () => {
    // Se miran solo los <button> y los <input> visibles — un <span> de resumen
    // no se toca. La clase de cada uno tiene que declarar los 44 px.
    const chicos: string[] = [];
    // Los atributos van ANTES de los hijos, así que el primer `className=` que
    // aparece después de abrir la etiqueta es el del propio control.
    const claseDe = (trozo: string): string => {
      const m = /className=(?:"([^"]*)"|\{`([\s\S]*?)`)/.exec(trozo);
      return m ? (m[1] ?? m[2] ?? "") : "";
    };
    for (const [nombre, fuente] of [["shell", shell], ["SubirFotos", subir], ["ProductoFila", fila]] as const) {
      for (const m of fuente.matchAll(/<(button|input)\b/g)) {
        const cls = claseDe(fuente.slice(m.index!, m.index! + 1200));
        if (cls === "hidden") continue; // el selector de archivo, que no se ve
        if (!cls.includes("min-h-[44px]")) chicos.push(`${nombre}: <${m[1]}> ${cls.slice(0, 70)}`);
      }
    }
    expect(chicos, "tocables por debajo de 44 px").toEqual([]);
  });

  it("no vuelven las palabras del inventario viejo", () => {
    for (const fuente of PANTALLA) {
      for (const mala of ["Importacion", "Accion", "imagenes", "batch", "masivo", "Subir fotos en batch"]) {
        expect(fuente, `«${mala}»`).not.toContain(mala);
      }
    }
  });

  it("«Esconder» se dice igual en el chip y en la fila", () => {
    expect(fila).toContain('"Mostrar" : "Esconder"');
    expect(codigo("lib/catalogos/admin-chips.ts")).toContain('label: "Escondidos"');
  });

  it("nada de voseo en lo nuevo (lo cubre además el candado global)", () => {
    for (const fuente of [...PANTALLA, codigo("lib/catalogos/admin-chips.ts"),
                          codigo("lib/catalogos/admin-fotos-cola.ts"),
                          codigo("lib/catalogos/admin-lista.ts")]) {
      for (const v of ["elegí", "tocá", "mirá", "tenés", "podés", "acá "]) {
        expect(fuente.toLowerCase(), `voseo «${v}»`).not.toContain(v);
      }
    }
  });
});
