// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LOS OCHO NÚMEROS DEL HUB SE CUENTAN EN LA BASE, Y LA REGLA SIGUE SIENDO UNA
// (14-sep-2026)
//
// 🩸 QUÉ PASABA. Para escribir «182 productos a la venta · 12 sin foto» en las
// cuatro tarjetas de `/catalogos/marcas`, el navegador se bajaba el CATÁLOGO
// ENTERO de las cuatro marcas más el inventario por talla de Reebok. Medido
// contra producción el 14-sep-2026:
//
//     Tommy    477 productos   227,4 KB
//     Reebok   232 productos   107,9 KB  (+ 49,5 KB de `inventory`)
//     Calvin    83 productos    39,8 KB
//     Joybees   81 productos    38,2 KB
//     ─────────────────────────────────────
//     TOTAL                    462,8 KB
//
// Nombre, precio, color, descripción y fechas viajaban para tirarse después de
// contar. Sentry medía **24.384 ms de p95** en esa ruta.
//
// Daniel, textual (14-sep-2026): *«5. ok va»*.
//
// 🔴 EL RIESGO DEL CAMBIO, Y LO QUE ESTE CANDADO PROTEGE. Contar en la base pide
// escribir «a la venta» en SQL — y una segunda definición de la misma regla es
// exactamente cómo el hub y el catálogo terminaron diciendo 232 contra 182 en
// septiembre. La salida fue NO escribir ese SQL a mano: lo GENERA
// `lib/catalogo/contadores.ts`, cláusula por cláusula de `estaALaVenta`, y la
// migración es su salida impresa.
//
// Este archivo exige las cuatro cosas que mantienen esa unión:
//
//   1. El `.sql` del repo ES la salida del módulo, byte a byte.
//   2. El SQL tiene UNA cláusula por cada `return true` de `estaALaVenta`, marca
//      por marca — agregar una condición allá sin su `or` acá pone el build ROJO.
//   3. El camino de respaldo cuenta con `productosALaVenta`, la función de
//      verdad, y no con una copia.
//   4. `columnasParaContar` trae TODO lo que la regla lee, derivado de la misma
//      ficha: una columna de stock que no se pida se leería `undefined` y
//      caería al siguiente respaldo EN SILENCIO.
//
// Y sobre datos REALES, que es donde se prueba de verdad:
// `scripts/_verif-contadores-hub.ts` corre los dos caminos contra producción y
// compara los ocho números. Corrido el 14-sep-2026: **idénticos**
// (Reebok 178/0 · Joybees 81/0 · Tommy 453/0 · Calvin 82/0), con el CONTROL de
// «sin foto» sobre TODAS las filas —donde sí hay productos sin foto— también
// idéntico (1 · 2 · 8 · 6).
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 Y DESDE EL 22-sep-2026, EL HUB DICE TARJETAS, NO FILAS
//
// 🩸 QUÉ PASABA. El hub decía «81 productos a la venta» de Joybees y el catálogo
// público mostraba **70 tarjetas**. Los dos tenían razón: Joybees es la única
// marca con `features.agrupacionPorModelo`, y medido contra producción el
// 22-sep-2026 hay **11 modelos con dos filas cada uno** —tallas distintas del
// mismo modelo (`-KIDS`/`-JUNIOR`, `-M`/`-W`), cada una con su inventario, y dos
// pares con precio distinto ($13 los Kids, $15 los Junior)—. 81 − 11 = 70.
//
// Daniel decidió: **el hub dice 70**, que es lo que el cliente ve.
//
// 🔴 «A LA VENTA» NO SE PARTIÓ EN DOS. `a_la_venta`/`sin_foto` siguen siendo las
// FILAS vendibles, con las MISMAS cláusulas generadas de `estaALaVenta`. La
// tarjeta es un dato APARTE (`tarjetas`/`tarjetas_sin_foto`) encima de esas
// mismas filas, y su regla —qué es un modelo— tampoco se copió: el SQL se genera
// desde `KNOWN_SUFFIXES`, la MISMA constante de `groupByModel`, y el respaldo
// LLAMA a `groupByModel`.
//
// Medido con el SQL nuevo contra producción (22-sep-2026):
//   Reebok 178 filas → 178 tarjetas · Joybees 81 → **70** · Tommy 439 → 439 ·
//   Calvin 81 → 81.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { estaALaVenta, productosALaVenta } from "@/lib/catalogo/a-la-venta";
import { disponibleVendible } from "@/lib/catalogos/disponible";
import {
  CLAUSULA_SIN_FOTO,
  MARCAS_DEL_HUB,
  clausulaSufijo,
  clausulasALaVenta,
  columnasParaContar,
  contarDeFilas,
  selectDeMarca,
  sinFoto,
  sqlContadores,
  tablaDePedidos,
  type FilaContada,
  type MarcaContada,
} from "@/lib/catalogo/contadores";
import {
  ARCHIVO_MIGRACION,
  RPC_CONTADORES,
  RPC_PULSO,
  migracionContadores,
  sqlPulso,
} from "@/lib/catalogo/contadores-migracion";
import { tarjetasDeModelo } from "@/lib/catalogo/tarjetas";
import { KNOWN_SUFFIXES, groupByModel } from "@/components/catalogo/groupByModel";
import { MARCA_THEME } from "@/lib/catalogo/marcas-ui";

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");

const FUENTE_MODULO = leer("src/lib/catalogo/contadores.ts");
const FUENTE_RUTA = leer("src/app/api/catalogo/contadores/route.ts");
const FUENTE_HUB = leer("src/app/catalogos/marcas/page.tsx");
const FUENTE_A_LA_VENTA = leer("src/lib/catalogo/a-la-venta.ts");

/** El archivo SIN comentarios: lo que de verdad corre. Los barridos de «esto ya
 *  no se hace» miran acá — si no, el propio post-mortem que explica el cambio
 *  haría fallar al candado que lo protege. */
function soloCodigo(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}
const HUB_CODIGO = soloCodigo(FUENTE_HUB);
const RUTA_CODIGO = soloCodigo(FUENTE_RUTA);

describe("la migración es la SALIDA del módulo, no un archivo escrito a mano", () => {
  it("el .sql del repo coincide byte a byte con lo que genera el módulo", () => {
    const enDisco = leer(`supabase/migrations/${ARCHIVO_MIGRACION}`);
    // Si esto falla: NO se edita el .sql. Se cambia `contadores.ts` y se corre
    //   npx tsx scripts/_generar-migracion-contadores.ts
    expect(enDisco).toBe(migracionContadores());
  });

  it("la migración es ADITIVA sobre los datos: no toca ni una fila", () => {
    const sql = migracionContadores().toLowerCase();
    expect(sql).toContain(`create or replace function public.${RPC_CONTADORES}()`);
    expect(sql).toContain(`create or replace function public.${RPC_PULSO}(dias int)`);
    for (const peligro of ["drop table", "delete from", "update ", "insert into", "alter table"]) {
      expect(sql).not.toContain(peligro);
    }
  });

  it("lo ÚNICO que se borra es la versión vieja de la propia función", () => {
    // 🔴 Postgres no deja cambiarle el tipo de retorno a una función con
    // `create or replace`, y la función pasó de 3 columnas a 5. El `drop` es
    // obligatorio — pero tiene que ser ÉSE y ningún otro.
    const sql = migracionContadores();
    const drops = (sql.match(/^\s*drop\b.*$/gim) ?? []).map((l) => l.trim());
    expect(drops).toEqual([`drop function if exists public.${RPC_CONTADORES}();`]);
  });

  it("la función es de solo lectura y no se le abre a cualquiera", () => {
    const sql = migracionContadores();
    expect(sql).toContain("stable");
    expect(sql).toContain(`revoke all on function public.${RPC_CONTADORES}() from public;`);
    expect(sql).toContain(`grant execute on function public.${RPC_CONTADORES}() to service_role;`);
  });
});

describe("UNA cláusula de SQL por cada cláusula de `estaALaVenta`", () => {
  // Las cláusulas de la regla en TypeScript: cada `return true` es una.
  const returnsDeLaRegla = (FUENTE_A_LA_VENTA.match(/return true;/g) ?? []).length;

  it("`estaALaVenta` sigue teniendo tres cláusulas", () => {
    // Disponible > 0 · regalía (Joybees) · pre-orden `proximamente` (Reebok).
    expect(returnsDeLaRegla).toBe(3);
  });

  it("cada marca trae las cláusulas que su tabla puede tener, y ninguna más", () => {
    for (const marca of MARCAS_DEL_HUB) {
      const cs = clausulasALaVenta(marca);
      // `is_regalia` SOLO existe en `joybees_products` (medido contra
      // `information_schema.columns` el 14-sep-2026). Nombrarla en las otras
      // tres reventaría la consulta; omitirla en Joybees perdería productos.
      const esperadas = marca === "joybees" ? returnsDeLaRegla : returnsDeLaRegla - 1;
      expect(cs.length, `cláusulas de ${marca}`).toBe(esperadas);
      expect(cs[0]).toContain("greatest(0, coalesce(");
      expect(cs[cs.length - 1]).toBe("p.badge = 'proximamente'");
      expect(cs.some((c) => c.includes("is_regalia"))).toBe(marca === "joybees");
    }
  });

  it("el orden del `coalesce` es el orden en que `disponibleVendible` prueba", () => {
    // La regla en TS: gana la PRIMERA que no sea nula — disponibilidad,
    // después existencia, después stock, y al final el respaldo de Reebok.
    expect(disponibleVendible({ disponibilidad: 3, existencia: 99, stock: 99 })).toBe(3);
    expect(disponibleVendible({ disponibilidad: null, existencia: 7, stock: 99 })).toBe(7);
    expect(disponibleVendible({ disponibilidad: null, existencia: null, stock: 5 })).toBe(5);
    expect(disponibleVendible({}, 4)).toBe(4);

    expect(clausulasALaVenta("tommy")[0]).toBe(
      "greatest(0, coalesce(p.disponibilidad, p.existencia, p.stock, 0)) > 0",
    );
    // Reebok NO tiene `stock` en `products`: su respaldo es la suma de
    // `inventory`, que es el MISMO `fallback` que recibe `disponibleVendible`.
    expect(clausulasALaVenta("reebok")[0]).toBe(
      "greatest(0, coalesce(p.disponibilidad, p.existencia, inv.piezas, 0)) > 0",
    );
    expect(selectDeMarca("reebok")).toContain("sum(i.quantity) as piezas");
  });

  it("`greatest(0, …) > 0` es el espejo de `Math.max(0, …) > 0`: un negativo NO se vende", () => {
    expect(estaALaVenta({ disponibilidad: -5 })).toBe(false);
    expect(estaALaVenta({ disponibilidad: 0 })).toBe(false);
    expect(estaALaVenta({ disponibilidad: 1 })).toBe(true);
    expect(clausulasALaVenta("calvin")[0]).toMatch(/^greatest\(0, coalesce\(.+, 0\)\) > 0$/);
  });

  it("«sin foto» dice lo mismo de los dos lados: nulo, vacío o solo espacios", () => {
    expect(sinFoto({ image_url: null })).toBe(true);
    expect(sinFoto({ image_url: "" })).toBe(true);
    expect(sinFoto({ image_url: "   " })).toBe(true);
    expect(sinFoto({ image_url: "https://x/y.jpg" })).toBe(false);
    // `coalesce` cubre el nulo y `btrim` los espacios — las mismas tres formas.
    expect(CLAUSULA_SIN_FOTO).toBe("coalesce(btrim(p.image_url), '') = ''");
    expect(sqlContadores()).toContain(`count(*) filter (where ${CLAUSULA_SIN_FOTO})`);
  });

  it("solo se cuenta lo que la pantalla ya filtraba: `active = true`", () => {
    for (const marca of MARCAS_DEL_HUB) {
      expect(selectDeMarca(marca)).toContain("where p.active is true");
    }
  });
});

describe("el respaldo cuenta con la regla de verdad, no con una copia", () => {
  it("`contarDeFilas` da lo mismo que filtrar a mano con `productosALaVenta`", () => {
    const filas = [
      { id: "a", image_url: "u", disponibilidad: 5 },                       // se vende
      { id: "b", image_url: null, disponibilidad: 0, existencia: 9 },       // NO (disponibilidad manda)
      { id: "c", image_url: "  ", disponibilidad: 2 },                      // se vende, sin foto
      { id: "d", image_url: "u", disponibilidad: 0, is_regalia: true },     // regalía
      { id: "e", image_url: "", disponibilidad: 0, badge: "proximamente" }, // pre-orden, sin foto
      { id: "f", image_url: "u", disponibilidad: 0, badge: "oferta" },      // NO
    ];
    const esperados = productosALaVenta(filas);
    // Reebok no agrupa: fila = tarjeta, así que los cuatro números van de a pares.
    expect(contarDeFilas("reebok", filas)).toEqual({
      aLaVenta: esperados.length,
      sinFoto: esperados.filter(sinFoto).length,
      tarjetas: esperados.length,
      tarjetasSinFoto: esperados.filter(sinFoto).length,
    });
    expect(contarDeFilas("reebok", filas)).toEqual({
      aLaVenta: 4, sinFoto: 2, tarjetas: 4, tarjetasSinFoto: 2,
    });
  });

  it("el respaldo de Reebok entra por el mismo `fallback` del catálogo", () => {
    const filas = [{ id: "r1", image_url: "u" }];
    expect(contarDeFilas("reebok", filas).aLaVenta).toBe(0);
    expect(contarDeFilas("reebok", filas, { r1: 12 }).aLaVenta).toBe(1);
  });

  it("`contarDeFilas` no tiene ninguna condición propia", () => {
    const cuerpo = FUENTE_MODULO.slice(FUENTE_MODULO.indexOf("export function contarDeFilas"));
    const fin = cuerpo.indexOf("\n}");
    const solo = cuerpo.slice(0, fin);
    expect(solo).toContain("productosALaVenta(filas, stockPorProducto)");
    // Ni existencias, ni badges, ni regalías escritas otra vez acá.
    for (const palabra of ["disponibilidad", "existencia", "is_regalia", "proximamente"]) {
      expect(solo, `«${palabra}» no se vuelve a escribir en contarDeFilas`).not.toContain(palabra);
    }
  });
});

describe("`columnasParaContar` trae todo lo que la regla lee", () => {
  it("por marca, lo que su tabla tiene y nada que no exista", () => {
    for (const marca of MARCAS_DEL_HUB) {
      const cols = columnasParaContar(marca).split(",");
      expect(cols).toContain("id");
      expect(cols).toContain("image_url");
      expect(cols).toContain("badge");
      expect(cols).toContain("disponibilidad");
      expect(cols).toContain("existencia");
      // 🔴 `products` (Reebok) NO tiene `stock` ni `is_regalia`: pedirlas sería
      // un 400 de PostgREST y la tarjeta se quedaría sin número.
      expect(cols.includes("stock"), `stock en ${marca}`).toBe(marca !== "reebok");
      expect(cols.includes("is_regalia"), `is_regalia en ${marca}`).toBe(marca === "joybees");
    }
  });

  it("las columnas pedidas son las MISMAS que nombra el SQL de esa marca", () => {
    for (const marca of MARCAS_DEL_HUB) {
      const sql = selectDeMarca(marca);
      for (const col of columnasParaContar(marca).split(",")) {
        if (col === "id") continue; // el id solo se usa para pegar el inventario
        expect(sql, `${marca} · ${col}`).toContain(`p.${col}`);
      }
    }
  });
});

describe("la ruta responde poco, y falla ABIERTA", () => {
  it("intenta la función de la base y, si no está, cuenta por filas", () => {
    expect(FUENTE_RUTA).toContain("supabaseServer.rpc(RPC_CONTADORES)");
    expect(FUENTE_RUTA).toContain("contarDeFilas(marca, filas, stock)");
    // Ante CUALQUIER error de la RPC se sigue de largo: nada de 500 ni de
    // pantalla en blanco mientras la migración no esté aplicada.
    expect(FUENTE_RUTA).toContain("if (error || !Array.isArray(data)) return null;");
  });

  it("pide los MISMOS roles que la pantalla del hub", () => {
    expect(FUENTE_RUTA).toContain("requireRole(req, catalogoRoles())");
  });

  it("no reimplementa la regla: la importa", () => {
    for (const palabra of ["proximamente", "is_regalia", "btrim", "greatest"]) {
      expect(RUTA_CODIGO, `«${palabra}» no se escribe en la ruta`).not.toContain(palabra);
    }
  });

  it("lee paginado: `db-max-rows` corta en 1.000 sin decir nada", () => {
    expect(FUENTE_RUTA).toContain("leerTodoPaginado");
  });
});

describe("el hub pide UNA sola vez y no cuenta nada", () => {
  it("una sola petición, a la ruta de contadores", () => {
    expect(HUB_CODIGO).toContain('fetch("/api/catalogo/contadores"');
    expect((HUB_CODIGO.match(/fetch\(/g) ?? []).length).toBe(1);
  });

  it("ya no se baja el catálogo ni el inventario para contar", () => {
    expect(HUB_CODIGO).not.toContain("products?active=true");
    expect(HUB_CODIGO).not.toContain("/api/catalogo/reebok/inventory");
    expect(HUB_CODIGO).not.toContain("estaALaVenta");
    expect(HUB_CODIGO).not.toContain("stockMap");
    // Las dos direcciones que el hub ya no guarda por marca.
    expect(HUB_CODIGO).not.toContain("productsUrl");
    expect(HUB_CODIGO).not.toContain("inventoryUrl");
  });

  it("la pantalla dice TARJETAS con el rótulo de siempre", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: volver a `c.aLaVenta` haría que el hub dijera 81
    // de Joybees mientras el catálogo muestra 70. El rótulo no cambió.
    expect(FUENTE_HUB).toContain("producto{c.tarjetas === 1 ? \"\" : \"s\"} a la venta");
    expect(FUENTE_HUB).toContain("{c.tarjetasSinFoto} sin foto");
    expect(HUB_CODIGO).not.toContain("c.aLaVenta");
    expect(HUB_CODIGO).not.toContain("c.sinFoto");
    expect(FUENTE_HUB).toContain("Cargando…");
    expect(FUENTE_HUB).toContain("Contadores no disponibles");
  });
});

describe("CONTROL — las rutas viejas siguen intactas", () => {
  it("`/api/catalogo/[marca]/products` y el `inventory` de Reebok no se tocaron", () => {
    // La ruta nueva se AGREGA; las que usan el catálogo del vendedor y la
    // pantalla de administrar tienen que seguir sirviendo lo mismo.
    const products = leer("src/app/api/catalogo/[marca]/products/route.ts");
    expect(products).toContain('searchParams.get("active") === "true"');
    const inventory = leer("src/app/api/catalogo/reebok/inventory/route.ts");
    expect(inventory).toContain("leerTodoPaginado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL HUB CUENTA TARJETAS, Y LA REGLA DE «QUÉ ES UN MODELO» TAMPOCO SE DUPLICA
// ─────────────────────────────────────────────────────────────────────────────

/** Una fila de Joybees con lo justo para agrupar y contar. */
const jb = (sku: string, name: string, foto: string | null = "u"): FilaContada => ({
  id: sku, sku, name, image_url: foto, disponibilidad: 5,
});

describe("qué marca agrupa lo dice el TEMA, y el SQL lo copia de ahí", () => {
  it("la lista de marcas que agrupan es ESPEJO de `MARCA_THEME`", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: poner `agrupaPorModelo: true` en Tommy (o
    // quitárselo a Joybees) sin tocar el tema. Serían dos definiciones de «esta
    // marca junta las tallas» y el hub contaría una vitrina que no existe.
    for (const marca of MARCAS_DEL_HUB) {
      const delTema = MARCA_THEME[marca].features.agrupacionPorModelo;
      const sql = selectDeMarca(marca);
      // La marca que agrupa es la única cuyo SQL junta por (base, nombre).
      const agrupaEnSql = sql.includes("group by s.llave");
      expect(agrupaEnSql, `${marca} agrupa en el SQL`).toBe(delTema);
      expect(columnasParaContar(marca).split(",").includes("sku"), `${marca} pide sku`)
        .toBe(delTema);
    }
  });

  it("hoy la única que agrupa es Joybees", () => {
    expect(MARCA_THEME.joybees.features.agrupacionPorModelo).toBe(true);
    for (const marca of ["reebok", "tommy", "calvin"] as MarcaContada[]) {
      expect(MARCA_THEME[marca].features.agrupacionPorModelo, marca).toBe(false);
    }
  });
});

describe("el sufijo de talla se lee de UNA lista, la de `groupByModel`", () => {
  it("el SQL nombra los MISMOS sufijos, en el MISMO orden", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: escribir los sufijos a mano en el SQL. Agregar
    // uno a `groupByModel` sin que el SQL se entere dejaría al hub contando
    // filas donde la vitrina ya junta tallas.
    const sql = clausulaSufijo("p.sku");
    const enElSql = [...sql.matchAll(/= '-([A-Z]+)'/g)].map((m) => m[1]);
    expect(enElSql).toEqual(KNOWN_SUFFIXES);
    // Y la longitud del corte sale del sufijo, no de un número escrito a mano.
    for (const sfx of KNOWN_SUFFIXES) {
      expect(sql).toContain(`right(upper(p.sku), ${sfx.length + 1}) = '-${sfx}'`);
    }
  });

  it("el orden importa: el más largo primero", () => {
    // `-JUNIOR` tiene que ganar antes de que cualquier sufijo más corto lo
    // agarre por el final. El mismo motivo que el bucle de `parseSuffix`.
    const largos = KNOWN_SUFFIXES.map((s) => s.length);
    expect([...largos].sort((a, b) => b - a)).toEqual(largos);
  });

  it("se usa `right(...)`, NUNCA `like`", () => {
    // Un `%` o un `_` dentro del sufijo sería comodín y `like` compararía otra
    // cosa. `right()` compara texto con texto.
    expect(clausulaSufijo("p.sku")).not.toContain("like");
  });
});

describe("el respaldo agrupa con `groupByModel`, no con una copia", () => {
  it("`tarjetasDeModelo` reparte exactamente lo que reparte `groupByModel`", () => {
    const filas = [
      jb("UKVCG.MTC-KIDS", "Kids Varsity Clog"),
      jb("UKVCG.MTC-JUNIOR", "Kids Varsity Clog"),
      jb("UAACG.BLK-M", "Adults Active Clog"),
      jb("UAACG.BLK-W", "Adults Active Clog"),
      jb("SINSUFIJO.001", "Otro modelo"),
    ];
    const mias = tarjetasDeModelo(filas).map((t) => t.map((f) => f.sku));
    const suyas = groupByModel(filas as never).map((g) => g.variants.map((v) => v.product.sku));
    expect(mias).toEqual(suyas);
    expect(mias).toHaveLength(3);
  });

  it("11 modelos de dos tallas convierten 81 filas en 70 tarjetas", () => {
    // Los 11 bases medidos en producción el 22-sep-2026.
    const pares = [
      ["UAACG.BLK", "M", "W"], ["UAACG.DUO", "M", "W"], ["UAACG.NVY", "M", "W"],
      ["UKTRK.BLK", "KIDS", "JUNIOR"], ["UKTRK.DRO", "KIDS", "JUNIOR"],
      ["UKVCG.BKR", "KIDS", "JUNIOR"], ["UKVCG.FPE", "KIDS", "JUNIOR"],
      ["UKVCG.LRP", "KIDS", "JUNIOR"], ["UKVCG.MTC", "KIDS", "JUNIOR"],
      ["UKVCG.OLM", "KIDS", "JUNIOR"], ["WBCLG.BLK", "M", "W"],
    ] as const;
    const filas: FilaContada[] = [];
    for (const [base, a, b] of pares) {
      filas.push(jb(`${base}-${a}`, base), jb(`${base}-${b}`, base));
    }
    for (let i = 0; i < 59; i++) filas.push(jb(`SOLO.${i}`, `Modelo ${i}`));

    const c = contarDeFilas("joybees", filas);
    expect(c.aLaVenta).toBe(81);
    expect(c.tarjetas).toBe(70);
    // 🔴 MUTACIÓN QUE SE CAZA: que `tarjetas` vuelva a ser el conteo de filas.
    expect(c.tarjetas).not.toBe(c.aLaVenta);
  });

  it("una marca que no agrupa NO pasa por `groupByModel`: fila = tarjeta", () => {
    // Los SKU de Tommy pueden terminar en `-M` sin que eso sea una talla: la
    // marca manda antes que el sufijo.
    const filas = [jb("TH-1234-M", "Polo"), jb("TH-1234-W", "Polo")];
    expect(contarDeFilas("tommy", filas).tarjetas).toBe(2);
    expect(contarDeFilas("joybees", filas).tarjetas).toBe(1);
  });

  it("un sufijo REPETIDO abre otra tarjeta — ningún stock queda escondido", () => {
    // Es el guard de `groupByModel` (#348). El SQL lo copia con `max(filas)`
    // por sufijo, no con un `count(distinct)`.
    const filas = [
      jb("UKVCG.MTC-KIDS", "Clog"),
      jb("UKVCG.MTC-KIDS", "Clog"),
      jb("UKVCG.MTC-JUNIOR", "Clog"),
    ];
    expect(contarDeFilas("joybees", filas).tarjetas).toBe(2);
    expect(selectDeMarca("joybees")).toContain("max(s.filas)::int as tarjetas");
  });

  it("una tarjeta está «sin foto» solo si NINGUNA de sus tallas tiene foto", () => {
    const conUna = [jb("A.X-KIDS", "A", null), jb("A.X-JUNIOR", "A", "u")];
    expect(contarDeFilas("joybees", conUna)).toMatchObject({
      aLaVenta: 2, sinFoto: 1, tarjetas: 1, tarjetasSinFoto: 0,
    });
    const ninguna = [jb("B.X-KIDS", "B", null), jb("B.X-JUNIOR", "B", "  ")];
    expect(contarDeFilas("joybees", ninguna)).toMatchObject({
      aLaVenta: 2, sinFoto: 2, tarjetas: 1, tarjetasSinFoto: 1,
    });
    // La misma frase, en SQL.
    expect(selectDeMarca("joybees")).toContain("bool_and(s.todas_sin_foto)");
  });

  it("agrupar es la SEGUNDA pregunta: primero qué se vende", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: agrupar antes de filtrar. Una talla sin
    // existencia no puede arrastrar a su modelo dentro del conteo.
    const filas: FilaContada[] = [
      { id: "1", sku: "Z.X-KIDS", name: "Z", image_url: "u", disponibilidad: 0 },
      { id: "2", sku: "Z.X-JUNIOR", name: "Z", image_url: "u", disponibilidad: 4 },
    ];
    expect(contarDeFilas("joybees", filas)).toMatchObject({ aLaVenta: 1, tarjetas: 1 });
  });
});

describe("EL PULSO — lo suma la base, y falla aparte de los contadores", () => {
  it("la función del pulso lee las tablas de comprobantes de las 4 marcas", () => {
    const sql = sqlPulso();
    for (const marca of MARCAS_DEL_HUB) {
      expect(sql).toContain(`from public.${tablaDePedidos(marca)} o`);
    }
  });

  it("los borrados NO cuentan, y un `deleted` en NULL sigue vivo", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: `o.deleted = false`. Ayer se borraron 5
    // comprobantes por $32.208; con un `= false` un `deleted` en NULL además
    // desaparecería de la cuenta.
    const sql = sqlPulso();
    expect((sql.match(/where o\.deleted is not true/g) ?? []).length).toBe(MARCAS_DEL_HUB.length);
    expect(sql).not.toContain("o.deleted = false");
    expect(sql).not.toContain("o.deleted is true");
  });

  it("el día es el de PANAMÁ, nunca el de la base ni el del navegador", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: `now()::date` pelado. Vercel y Supabase corren en
    // UTC: entre las 19:00 y la medianoche de Panamá el día ya cambió allá.
    const sql = sqlPulso();
    expect(sql).toContain("(now() at time zone 'America/Panama')::date");
    expect(sql).toContain("(o.created_at at time zone 'America/Panama')::date");
    expect(sql).not.toMatch(/now\(\)::date/);
    expect(FUENTE_RUTA).toContain("hoyPanama()");
    expect(RUTA_CODIGO).not.toContain("new Date().toISOString");
  });

  it("el «último» NO lleva ventana: una marca dormida sigue diciendo cuánto hace", () => {
    const sql = sqlPulso();
    // El `max(fecha)` va SIN `filter`; los otros dos SÍ lo llevan.
    expect(sql).toContain("max((o.created_at at time zone 'America/Panama')::date) as ultimo");
    expect(sql).not.toMatch(/max\(\(o\.created_at[^)]*\)\)?::date\) filter/);
  });

  it("el pulso se pide aparte y falla ABIERTO sin tumbar los contadores", () => {
    expect(FUENTE_RUTA).toContain(`supabaseServer.rpc(RPC_PULSO, { dias: DIAS_PULSO })`);
    expect(FUENTE_RUTA).toContain("pulsoPorLasFilasTodas(hoy)");
    // La respuesta lleva contadores Y pulso por los DOS caminos.
    expect((FUENTE_RUTA.match(/contadores: deLaBase, pulso, fuente: "base"/g) ?? []).length).toBe(1);
    expect((FUENTE_RUTA.match(/contadores, pulso, fuente: "filas"/g) ?? []).length).toBe(1);
  });

  it("la tarjeta sin pulso no se rompe: la línea simplemente no sale", () => {
    expect(FUENTE_HUB).toContain("{p && (");
    expect(FUENTE_HUB).toContain("textoPulso(p)");
  });
});

describe("la función vieja de la base NO puede pasar por buena", () => {
  it("una fila sin `tarjetas` manda a contar por filas", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: aceptar la respuesta de la versión de 3 columnas.
    // Mientras la migración no se aplique, tomarla por buena devolvería 81.
    expect(FUENTE_RUTA).toContain("if (tarjetas === null || tarjetasSinFoto === null) return null;");
  });
});
