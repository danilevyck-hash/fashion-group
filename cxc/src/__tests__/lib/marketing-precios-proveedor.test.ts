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
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ARCHIVO_MIGRACION_FOTOS,
  paresDeFotos,
} from "@/lib/marketing/fotos-pares";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Doble mínimo de Supabase: se guarda el payload REAL que recibe .update(),
//    que es lo único que este candado necesita ver.
const ultimoUpdate: { payload: Record<string, unknown> | null } = {
  payload: null,
};
vi.mock("@/lib/supabase-server", () => {
  const fila = {
    id: "n1",
    producto: "Paneles",
    precio: 65,
    nota: null,
    foto_paths: ["notas-proveedor/changalo/paneles.jpg"],
    orden: 0,
    created_at: "",
  };
  const cadena = {
    update(payload: Record<string, unknown>) {
      ultimoUpdate.payload = payload;
      return cadena;
    },
    eq: () => cadena,
    select: () => cadena,
    single: async () => ({ data: fila, error: null }),
  };
  return { supabaseServer: { from: () => cadena }, HAS_SERVICE_ROLE: false };
});
vi.mock("@/lib/marketing/storage", () => ({
  firmarPath: async (p: string) => `https://firmada/${p}`,
  esPathStorage: () => true,
}));

import { traeFotoPaths } from "@/lib/marketing/notas-proveedor";
import { updateNotaProveedor } from "@/lib/marketing/notas-proveedor-server";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

const PAGINA = "src/app/marketing/mobiliario/page.tsx";
const AYUDA = "src/components/marketing/PreciosProveedorAyuda.tsx";
const RUTA_NOTAS = "src/app/api/marketing/mobiliario/notas-proveedor/route.ts";
const RUTA_NOTA_ID =
  "src/app/api/marketing/mobiliario/notas-proveedor/[id]/route.ts";
const SERVER_NOTAS = "src/lib/marketing/notas-proveedor-server.ts";

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
    expect(src).toMatch(/e\.target\s*[!=]==\s*e\.currentTarget/);
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

  it("las 4 rutas que usa el ? exigen admin (editar y borrar también)", () => {
    for (const ruta of [RUTA_NOTAS, RUTA_NOTA_ID]) {
      const src = soloCodigo(leer(ruta));
      expect(src, ruta).toMatch(/requireRole\(req,\s*\["admin"\]\)/);
      expect(src, ruta).not.toContain("secretaria");
      expect(src, ruta).not.toMatch(/requireAdmin\s*\(/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Se puede EDITAR, AGREGAR y BORRAR — sin que vuelva la tabla vieja
//    y sin que las fotos se vayan por el desagüe
// ─────────────────────────────────────────────────────────────────────────────
describe("editar los precios del proveedor desde el ?", () => {
  it("editar, agregar y borrar están adentro del ?", () => {
    const src = leer(AYUDA);
    expect(src).toContain("+ Agregar precio");
    expect(src).toMatch(/Editar el precio de/);
    expect(src).toMatch(/¿Borrar el precio de/);
    // Guardar usa PUT si ya existe y POST si es nuevo.
    expect(soloCodigo(src)).toMatch(/edicion\.id \? "PUT" : "POST"/);
    expect(soloCodigo(src)).toMatch(/method: "DELETE"/);
  });

  it("reusa las rutas que YA existían: no se inventaron endpoints nuevos", () => {
    const src = soloCodigo(leer(AYUDA));
    const rutas = src.match(/\/api\/marketing\/[a-z0-9/\-${}.[\]]*/gi) ?? [];
    expect(rutas.length).toBeGreaterThan(0);
    for (const r of rutas) {
      expect(r).toContain("/api/marketing/mobiliario/notas-proveedor");
    }
  });

  it("NO vuelve la tabla de Notas del proveedor a la pantalla", () => {
    const pagina = soloCodigo(leer(PAGINA));
    expect(pagina).not.toContain("NotasProveedorMobiliario");
    expect(pagina).not.toContain("Notas del proveedor");
    // Y el "?" sigue siendo lo único que monta la página, una sola vez.
    expect((pagina.match(/<PreciosProveedorAyuda/g) ?? []).length).toBe(1);
  });

  it("nada de modales anidados: la confirmación de borrado es EN LÍNEA", () => {
    const src = soloCodigo(leer(AYUDA));
    // ConfirmDeleteModal monta ModalOverlay (z-50) y quedaría DEBAJO de este
    // cuadro (z-[70]), además de enganchar su propio Escape en `document`.
    expect(src).not.toContain("ConfirmDeleteModal");
    expect(src).not.toContain("ConfirmModal");
    expect(src).not.toContain("ModalOverlay");
    // Un solo createPortal en todo el componente.
    expect((src.match(/createPortal\(/g) ?? []).length).toBe(1);
  });

  it("Escape va en escalera: no cierra los dos de una", () => {
    const src = soloCodigo(leer(AYUDA));
    const escalera = src.slice(
      src.indexOf("const alEscape"),
      src.indexOf("useEffect", src.indexOf("const alEscape")),
    );
    expect(escalera.length).toBeGreaterThan(100);
    // El borrado se deshace ANTES que la edición, y la edición antes que la
    // ventana. Si el orden se invirtiera, un Escape sobre la confirmación
    // cerraría la ventana entera.
    const iBorrado = escalera.indexOf("confirmarBorrado");
    const iEdicion = escalera.indexOf("edicion !== null");
    const iCierre = escalera.indexOf("cerrarTodo()");
    expect(iBorrado).toBeGreaterThan(-1);
    expect(iBorrado).toBeLessThan(iEdicion);
    expect(iEdicion).toBeLessThan(iCierre);
    // Con cambios sin guardar no cierra nada.
    expect(escalera).toMatch(/hayCambios/);
    // Y con una escritura en vuelo tampoco.
    expect(escalera).toMatch(/if \(ocupado\) return/);
  });

  it("el clic afuera respeta la MISMA escalera que el Escape", () => {
    const src = soloCodigo(leer(AYUDA));
    const fuera = src.slice(
      src.indexOf("onMouseDown={(e)"),
      src.indexOf("onMouseDown={(e)") + 600,
    );
    expect(fuera).toMatch(/confirmarBorrado !== null\) return/);
    expect(fuera).toMatch(/edicion !== null\) return/);
    expect(fuera).toMatch(/ocupado/);
  });

  it("los blancos táctiles nuevos llegan a 44 px", () => {
    const src = leer(AYUDA);
    // Editar, Guardar, Cancelar, Borrar, Sí borrar, + Agregar, Entendido y
    // los 3 campos del formulario.
    const botones = src.match(/<button[\s\S]{0,700}?<\/button>/g) ?? [];
    expect(botones.length).toBeGreaterThanOrEqual(7);
    for (const b of botones) {
      expect(b, b.slice(0, 90)).toContain("min-h-[44px]");
    }
    const inputs = src.match(/<input[\s\S]{0,700}?\/>/g) ?? [];
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    for (const i of inputs) {
      expect(i, i.slice(0, 90)).toContain("min-h-[44px]");
    }
  });

  it("editar un precio NO puede borrar las fotos del renglón", () => {
    // 🔴 La trampa: `validarNotaProveedor` convierte un `fotoPaths` ausente en
    //    `[]`, y `[]` guardado significa "sin fotos". Como el "?" no edita
    //    fotos, un PUT ingenuo le vaciaría `foto_paths` — que es de donde
    //    salieron las fotos que hoy se ven en la tabla de Productos.
    const ayuda = soloCodigo(leer(AYUDA));
    expect(ayuda).not.toMatch(/fotoPaths/);
    expect(ayuda).not.toMatch(/foto_paths/);

    // La ruta traduce "no vino el campo" a "no las toques".
    const ruta = soloCodigo(leer(RUTA_NOTA_ID));
    expect(ruta).toMatch(/traeFotoPaths\(body\)/);
    expect(ruta).toMatch(/conservarFotos/);

    // Y el servidor deja `foto_paths` FUERA del update cuando se conserva.
    const server = soloCodigo(leer(SERVER_NOTAS));
    expect(server).toMatch(/conservarFotos/);
    expect(server).toMatch(/if \(!conservarFotos\) cambios\.foto_paths/);
  });

  it("un cuerpo que SÍ manda fotoPaths las sigue escribiendo", () => {
    // El caso contrario importa igual: si conservar fuera incondicional, el
    // componente viejo (única puerta para subir fotos) no podría cambiarlas.
    const server = soloCodigo(leer(SERVER_NOTAS));
    expect(server).toMatch(/conservarFotos: boolean = false/);
  });

  it("el ? dice dónde se cambia la foto", () => {
    expect(leer(AYUDA)).toMatch(
      /La foto de cada mueble se cambia con .Editar. en la tabla de/,
    );
  });

  // ── El candado que de verdad protege las fotos: COMPORTAMIENTO ──────────
  it("traeFotoPaths distingue 'no hablaron de fotos' de 'no hay fotos'", () => {
    // Ausente → no tocar.
    expect(traeFotoPaths({ producto: "Paneles", precio: "65" })).toBe(false);
    expect(traeFotoPaths({ fotoPaths: undefined })).toBe(false);
    expect(traeFotoPaths({ fotoPaths: null })).toBe(false);
    expect(traeFotoPaths(null)).toBe(false);
    expect(traeFotoPaths(undefined)).toBe(false);
    // Presente → esas son las fotos, INCLUIDO el vacío explícito.
    expect(traeFotoPaths({ fotoPaths: [] })).toBe(true);
    expect(traeFotoPaths({ fotoPaths: ["a.jpg"] })).toBe(true);
  });

  it("editar el precio SIN mencionar fotos no manda foto_paths al UPDATE", async () => {
    ultimoUpdate.payload = null;
    await updateNotaProveedor(
      "n1",
      { producto: "Paneles", precio: 70, nota: null, fotoPaths: [] },
      true, // conservarFotos: el cuerpo no habló de fotos
    );
    expect(ultimoUpdate.payload).not.toBeNull();
    // Lo que importa: la columna NO viaja, así que la base conserva su valor.
    expect(ultimoUpdate.payload).not.toHaveProperty("foto_paths");
    expect(ultimoUpdate.payload).toMatchObject({
      producto: "Paneles",
      precio: 70,
    });
  });

  it("cuando SÍ se mandan fotos, se escriben (el componente viejo sigue pudiendo)", async () => {
    ultimoUpdate.payload = null;
    await updateNotaProveedor("n1", {
      producto: "Paneles",
      precio: 65,
      nota: null,
      fotoPaths: ["nueva.jpg"],
    });
    expect(ultimoUpdate.payload).toHaveProperty("foto_paths", ["nueva.jpg"]);
  });

  it("editar sigue sin sumar nada", () => {
    const src = soloCodigo(leer(AYUDA));
    expect(src).not.toMatch(/\.reduce\s*\(/);
    expect(src).not.toMatch(/\bn\.precio\s*[*+\-/]/);
    expect(src).not.toMatch(/[*+\-/]\s*n\.precio\b/);
    // El precio viaja como TEXTO tal cual se escribió: quien lo convierte a
    // número es la validación compartida con el servidor, no este archivo.
    expect(src).toMatch(/precio: edicion\.precio/);
    expect(src).not.toMatch(/Number\(edicion\.precio\)/);
  });
});
