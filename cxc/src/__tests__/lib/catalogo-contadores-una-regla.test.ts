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
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { estaALaVenta, productosALaVenta } from "@/lib/catalogo/a-la-venta";
import { disponibleVendible } from "@/lib/catalogos/disponible";
import {
  CLAUSULA_SIN_FOTO,
  MARCAS_DEL_HUB,
  clausulasALaVenta,
  columnasParaContar,
  contarDeFilas,
  selectDeMarca,
  sinFoto,
  sqlContadores,
} from "@/lib/catalogo/contadores";
import {
  ARCHIVO_MIGRACION,
  RPC_CONTADORES,
  migracionContadores,
} from "@/lib/catalogo/contadores-migracion";

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

  it("la migración es ADITIVA: crea una función y no toca ni una fila", () => {
    const sql = migracionContadores().toLowerCase();
    expect(sql).toContain(`create or replace function public.${RPC_CONTADORES}()`);
    for (const peligro of ["drop table", "delete from", "update ", "insert into", "alter table"]) {
      expect(sql).not.toContain(peligro);
    }
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
    expect(contarDeFilas(filas)).toEqual({
      aLaVenta: esperados.length,
      sinFoto: esperados.filter(sinFoto).length,
    });
    expect(contarDeFilas(filas)).toEqual({ aLaVenta: 4, sinFoto: 2 });
  });

  it("el respaldo de Reebok entra por el mismo `fallback` del catálogo", () => {
    const filas = [{ id: "r1", image_url: "u" }];
    expect(contarDeFilas(filas)).toEqual({ aLaVenta: 0, sinFoto: 0 });
    expect(contarDeFilas(filas, { r1: 12 })).toEqual({ aLaVenta: 1, sinFoto: 0 });
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
    expect(FUENTE_RUTA).toContain("contarDeFilas(filas, stock)");
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

  it("la pantalla NO cambió: los mismos dos números y los mismos rótulos", () => {
    expect(FUENTE_HUB).toContain("producto{c.aLaVenta === 1 ? \"\" : \"s\"} a la venta");
    expect(FUENTE_HUB).toContain("{c.sinFoto} sin foto");
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
