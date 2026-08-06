// ─────────────────────────────────────────────────────────────────────────────
// Tommy: los bultos NO son todos de 12.
//
// Daniel: *"hay aveces que los bultos son de 8 y otros de 12, la mayorria son
// de 12"*, con su ejemplo: `FM0FM05637YBS` es de 8. Hasta el 6-ago-2026
// `tommy-bulto.ts` devolvía 12 FIJO, así que el cliente pedía "1 bulto"
// creyendo que recibía 12 pares y el pedido salía a Switch con 12 piezas
// cuando eran 8 — plata mal contada en las dos puntas.
//
// ⚠️ NO SE PUEDE DEDUCIR. Medido contra producción ese día, las cuatro fuentes
// que podían tenerlo están vacías: `cantidadPorCaja` en 0.0000 en los 650
// artículos, `talla`/`color` vacíos en los 650, `/apiarticulos/tallacolor`
// devuelve `[]`, y `packing_lists` tiene 0 filas. Por eso se guarda por estilo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  getBultoSize,
  normalizarBultoPzas,
  BULTO_TOMMY_DEFAULT,
  BULTO_TOMMY_MAX,
} from "@/lib/tommy-bulto";
import { sinColumna, errorDeColumnaFaltante, leerConColumnaOpcional } from "@/lib/catalogo/cols-opcionales";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

describe("🔴 el tamaño del bulto sale del estilo, no de la marca", () => {
  it("sin marcar → 12, que es como se comportaba antes", () => {
    expect(getBultoSize()).toBe(12);
    expect(getBultoSize("sneakers")).toBe(12);
    expect(getBultoSize("sneakers", null)).toBe(12);
    expect(getBultoSize("sneakers", undefined)).toBe(12);
    expect(BULTO_TOMMY_DEFAULT).toBe(12);
  });

  it("marcado en 8 → 8 (el caso de FM0FM05637YBS)", () => {
    expect(getBultoSize("sneakers", 8)).toBe(8);
  });

  it("la categoría NO decide: en Tommy todo es calzado", () => {
    for (const c of ["sneakers", "flip_flops", "sandals", "boots", "slippers", "shoes"]) {
      expect(getBultoSize(c, 8)).toBe(8);
      expect(getBultoSize(c)).toBe(12);
    }
  });
});

describe("🔴 un bulto de 0 piezas NO puede entrar — dividiría el pedido por cero", () => {
  it("null, vacío y 0 caen al default", () => {
    for (const v of [null, undefined, "", 0, "0", "0.0000"]) {
      expect(normalizarBultoPzas(v)).toBeNull();
      expect(getBultoSize("sneakers", normalizarBultoPzas(v))).toBe(12);
    }
  });

  it("⚠️ los valores que un Number() del llamador convertiría en 0", () => {
    // Es la trampa que ya costó el divisor del depurador: con la conversión
    // afuera, `null`/`""`/`[]` llegan como 0 y se leen como un número válido.
    for (const v of [[], {}, "abc", NaN, Infinity, -Infinity]) {
      expect(normalizarBultoPzas(v as unknown)).toBeNull();
    }
  });

  it("negativos, decimales y fuera de rango se rechazan", () => {
    for (const v of [-1, -8, 0.5, 8.5, "8.5", BULTO_TOMMY_MAX + 1, 1000]) {
      expect(normalizarBultoPzas(v)).toBeNull();
    }
  });

  it("los bordes del CHECK de la base sí pasan", () => {
    expect(normalizarBultoPzas(1)).toBe(1);
    expect(normalizarBultoPzas(BULTO_TOMMY_MAX)).toBe(BULTO_TOMMY_MAX);
    expect(normalizarBultoPzas("12")).toBe(12);
    expect(normalizarBultoPzas("8.0000")).toBe(8);
  });

  it("el CHECK de la migración cubre el mismo rango que el código", () => {
    const sql = leer("supabase/migrations/20260806120000_tommy_bulto_pzas.sql");
    expect(sql).toContain("bulto_pzas >= 1");
    expect(sql).toContain(`bulto_pzas <= ${BULTO_TOMMY_MAX}`);
    expect(sql).toContain("bulto_pzas IS NULL OR");  // NULL sigue siendo válido
  });
});

describe("🔴 el camino del DINERO: el pedido a Switch usa el bulto del estilo", () => {
  const envio = leer("src/lib/catalogo/switch-envio.ts");
  const route = leer("src/lib/catalogo/enviar-switch-route.ts");

  it("switch-envio recibe las piezas por producto y las usa", () => {
    expect(envio).toContain("bultoPzasByProduct");
    expect(envio).toContain("p.bultoPzasByProduct.get(item.product_id)");
  });

  it("el route arma el mapa con el helper compartido", () => {
    // El detalle del fallback pre-migración vive ahora en `bulto-productos.ts`
    // y lo cubre `tommy-bulto-pedido-completo.test.ts`.
    expect(route).toContain("leerCategoriaYBulto");
    expect(route).toContain("bultoPzasByProduct");
  });
});

describe("🔴 el sync no puede borrar lo marcado a mano", () => {
  const sync = leer("src/lib/switch-api/sync-catalogo-tommy.ts");

  it("cuando Switch no trae el dato, la columna NO entra en el payload", () => {
    // `cantidadPorCaja` viene en 0 en los 650 artículos. Devolver
    // `{ bulto_pzas: null }` borraría lo marcado en CADA corrida (2×/día) y,
    // pre-migración, tumbaría el cron del catálogo.
    expect(sync).toContain("return n === null ? {} : { bulto_pzas: n }");
  });

  it("cuando Switch SÍ lo trae, Switch manda", () => {
    expect(sync).toContain("bultoDeSwitch(a)");
    expect(sync).toContain("normalizarBultoPzas(a.cantidadPorCaja)");
  });

  it("vale para el alta y para la actualización", () => {
    const insert = /insertFields:[\s\S]*?\},/.exec(sync)?.[0] ?? "";
    const update = /updateFields:[\s\S]*?\n        \},/.exec(sync)?.[0] ?? "";
    expect(insert).toContain("bultoDeSwitch(a)");
    expect(update).toContain("bultoDeSwitch(a)");
  });
});

describe("🔴 solo Tommy lo marca a mano", () => {
  const marcas = leer("src/lib/catalogo/marcas.ts");
  const route = leer("src/app/api/catalogo/[marca]/products/route.ts");

  it("la bandera está SOLO en Tommy", () => {
    // Reebok ramifica por categoría y Joybees es fijo: dejarlo editable ahí
    // abriría una forma de contradecir una regla que no tiene excepciones.
    expect((marcas.match(/bultoEditable: true/g) ?? []).length).toBe(1);
    const tommy = marcas.slice(marcas.indexOf('productsTable: "tommy_products"'));
    expect(tommy).toContain("bultoEditable: true");
  });

  it("el servidor lo hace cumplir, no la pantalla", () => {
    expect(route).toContain("cfg.products.bultoEditable");
    expect(route).toContain('campos.push("bulto_pzas")');
  });

  it("un valor inválido se RECHAZA, no se guarda un 0", () => {
    expect(route).toContain("normalizarBultoPzas(v)");
    expect(route).toContain("Piezas por bulto inválidas");
  });

  it("vaciar el campo vuelve al default, no a un error", () => {
    expect(route).toContain('if (v === null || v === "")');
    expect(route).toContain("updates.bulto_pzas = null");
  });
});

describe("🔴 respaldo pre-migración (la columna puede no existir todavía)", () => {
  it("sinColumna saca solo la columna pedida", () => {
    expect(sinColumna("id,sku,bulto_pzas,price", "bulto_pzas")).toBe("id,sku,price");
    expect(sinColumna("id, sku, bulto_pzas", "bulto_pzas")).toBe("id,sku");
    // No se lleva por delante una columna con nombre parecido.
    expect(sinColumna("id,bulto_pzas_old,bulto_pzas", "bulto_pzas")).toBe("id,bulto_pzas_old");
  });

  it("⚠️ solo reintenta si el error NOMBRA la columna", async () => {
    // Reintentar ante cualquier error convertiría un problema de permisos o de
    // red en una lectura silenciosamente incompleta.
    let intentos = 0;
    await expect(
      leerConColumnaOpcional("id,bulto_pzas", "bulto_pzas", async () => {
        intentos++;
        throw new Error("permission denied for table tommy_products");
      }),
    ).rejects.toThrow(/permission denied/);
    expect(intentos).toBe(1);
  });

  it("reintenta sin la columna cuando el error es ese", async () => {
    const vistos: string[] = [];
    const r = await leerConColumnaOpcional("id,bulto_pzas", "bulto_pzas", async (cols) => {
      vistos.push(cols);
      if (cols.includes("bulto_pzas")) throw new Error('column tommy_products.bulto_pzas does not exist');
      return "ok";
    });
    expect(r).toBe("ok");
    expect(vistos).toEqual(["id,bulto_pzas", "id"]);
  });

  it("errorDeColumnaFaltante no confunde un mensaje vacío", () => {
    expect(errorDeColumnaFaltante(null, "bulto_pzas")).toBe(false);
    expect(errorDeColumnaFaltante("", "bulto_pzas")).toBe(false);
    expect(errorDeColumnaFaltante("no existe bulto_pzas", "bulto_pzas")).toBe(true);
  });

  it("el catálogo PÚBLICO no se cae sin la columna", () => {
    const pub = leer("src/app/api/catalogo/[marca]/public/route.ts");
    expect((pub.match(/leerConColumnaOpcional\(cfg\.publicCatalog\.cols, "bulto_pzas"/g) ?? []).length).toBe(2);
  });

  it("la pantalla de ADMINISTRAR tampoco", () => {
    const route = leer("src/app/api/catalogo/[marca]/products/route.ts");
    expect((route.match(/includes\("bulto_pzas"\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("🔴 lo que ve el cliente es lo que se cobra", () => {
  it("el carrito CONGELA las piezas por bulto en la línea", () => {
    // Si el estilo se re-marca de 12 a 8 mientras el cliente arma el pedido, lo
    // que ya agregó tiene que seguir cotizando como cuando lo vio.
    for (const f of [
      "src/components/catalogo/CatalogoPublicoPage.tsx",
      "src/components/catalogo/CatalogoVendedorPage.tsx",
    ]) {
      expect(leer(f)).toContain("nuevo.bulto_pzas = product.bulto_pzas ?? null");
    }
  });

  it("la tarjeta, el carrito y el checkout usan el mismo tamaño", () => {
    expect(leer("src/components/catalogo/CatalogoProductCard.tsx"))
      .toContain("theme.bulto(product.category, product.bulto_pzas)");
    expect(leer("src/components/catalogo/CatalogoStickyCartBar.tsx"))
      .toContain('theme.bulto(item.category || "footwear", item.bulto_pzas)');
    expect(leer("src/components/catalogo/CheckoutClient.tsx"))
      .toContain("cfg.bulto(i.category, i.bulto_pzas)");
  });

  it("la columna viaja en las dos listas de columnas de Tommy", () => {
    const marcas = leer("src/lib/catalogo/marcas.ts");
    const tommy = marcas.slice(marcas.indexOf('productsTable: "tommy_products"'));
    expect((tommy.match(/bulto_pzas/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("🔴 el control cabe en un iPhone", () => {
  it("la fila envuelve por debajo de sm — si no, la página se arrastra 107px", () => {
    // Medido a 390px contra Joybees, que usa el MISMO componente sin este
    // control: Joybees 0px, Tommy 107px. La alternativa —achicar los botones—
    // estaba vedada: estos deciden cuántas piezas se facturan.
    const batch = leer("src/app/catalogos/admin/[marca]/ProductosBatch.tsx");
    expect(batch).toContain('className="flex flex-wrap sm:flex-nowrap items-center gap-3"');
  });

  it("los botones respetan el blanco táctil de 44px", () => {
    const sel = leer("src/app/catalogos/admin/[marca]/BultoSelector.tsx");
    expect(sel).toContain("min-h-[44px] min-w-[44px]");
  });

  it("pre-migración el aviso dice QUÉ hacer, no vomita el error de Postgres", () => {
    const route = leer("src/app/api/catalogo/[marca]/products/route.ts");
    expect(route).toContain("Falta correr la migración 20260806120000");
    expect(route).toContain('if ("bulto_pzas" in updates)');
  });
});
