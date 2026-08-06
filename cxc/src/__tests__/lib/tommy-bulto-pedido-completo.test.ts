// ─────────────────────────────────────────────────────────────────────────────
// El bulto del estilo tiene que llegar HASTA EL FINAL: total, PDF, correo y
// el payload a Switch.
//
// 🩸 EL BUG (6-ago-2026, TOM-003). Daniel marcó `FM0FM05537YBS` en 8 piezas, el
// catálogo mostró 8, agregó 1 bulto… y el pedido se guardó en **$456 (12 × $38)**
// y salió a Switch con **`cantidad: "12.0000"`**. Debía ser $304 y 8.
//
// ⚠️ LA LECCIÓN, Y ES LA PARTE QUE IMPORTA: yo ya había "arreglado" esto. Arreglé
// `enviar-switch-route` y di el tema por cerrado sin buscar los otros llamadores.
// `enviarPedidoSwitch` se llama desde TRES lugares y el que Daniel usa —el
// checkout interno— no era ese. Además la misma consulta `select("id, category")`
// estaba escrita seis veces.
//
// Por eso el arreglo no fue tocar seis archivos: fue (a) un helper único que lee
// categoría y piezas JUNTAS, y (b) hacer el mapa OBLIGATORIO en el motor de
// envío, para que el compilador —no yo— encuentre a los que falten.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";
import { calculateTommyOrderTotal } from "@/lib/tommy-order-total";
import { computeStockLineas } from "@/lib/catalogo/confirmar-pedido";
import { getBultoSize } from "@/lib/tommy-bulto";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

/** Doble de Supabase: `.from(t).select(c).in(col, ids)`. */
function dbFalso(filas: unknown, error: { message?: string } | null = null, verCols?: (c: string) => void) {
  return {
    from: () => ({
      select: (cols: string) => {
        verCols?.(cols);
        const falta = cols.includes("bulto_pzas") && error?.message?.includes("bulto_pzas");
        return { in: async () => (falta ? { data: null, error } : { data: filas, error: null }) };
      },
    }),
  };
}

describe("🔴 el caso REAL de TOM-003", () => {
  const PRECIO = 38, BULTO = 8, BULTOS_PEDIDOS = 1;

  it("1 bulto de un estilo de 8 son 8 piezas, no 12", () => {
    expect(getBultoSize("sneakers", BULTO)).toBe(8);
  });

  it("el total es $304, no los $456 que se guardaron", () => {
    const total = calculateTommyOrderTotal([
      { quantity: BULTOS_PEDIDOS, unit_price: PRECIO, category: "sneakers", bulto_pzas: BULTO },
    ]);
    expect(total).toBe(304);
    // La cifra que se guardó con el bug, para que quede escrito qué se rompió.
    expect(calculateTommyOrderTotal([{ quantity: 1, unit_price: PRECIO }])).toBe(456);
  });

  it("sin marcar sigue siendo 12 — no cambia nada para el resto del catálogo", () => {
    expect(calculateTommyOrderTotal([{ quantity: 1, unit_price: 10, bulto_pzas: null }])).toBe(120);
  });
});

describe("🔴 categoría y piezas se leen JUNTAS, nunca una sin la otra", () => {
  it("devuelve los dos mapas de una sola consulta", async () => {
    const r = await leerCategoriaYBulto(
      dbFalso([{ id: "p1", category: "sneakers", bulto_pzas: 8 }, { id: "p2", category: "boots", bulto_pzas: null }]) as never,
      "tommy_products", ["p1", "p2"],
    );
    expect(r.categoryByProduct.get("p1")).toBe("sneakers");
    expect(r.bultoPzasByProduct.get("p1")).toBe(8);
    expect(r.bultoPzasByProduct.get("p2")).toBeNull();
  });

  it("⚠️ pre-migración: relee sin la columna en vez de tumbar el pedido", async () => {
    const pedidas: string[] = [];
    const r = await leerCategoriaYBulto(
      dbFalso([{ id: "p1", category: "sneakers" }], { message: 'column "bulto_pzas" does not exist' }, (c) => pedidas.push(c)) as never,
      "tommy_products", ["p1"],
    );
    expect(pedidas).toEqual(["id, category, bulto_pzas", "id, category"]);
    expect(r.categoryByProduct.get("p1")).toBe("sneakers");
    expect(r.bultoPzasByProduct.get("p1") ?? null).toBeNull(); // → el default
  });

  it("otro error NO se reintenta: devuelve vacío y todo cae al default", async () => {
    const r = await leerCategoriaYBulto(
      dbFalso(null, { message: "permission denied" }) as never, "tommy_products", ["p1"],
    );
    expect(r.categoryByProduct.size).toBe(0);
  });

  it("sin productos no consulta nada", async () => {
    let consulto = false;
    const r = await leerCategoriaYBulto(dbFalso([], null, () => { consulto = true; }) as never, "t", []);
    expect(consulto).toBe(false);
    expect(r.bultoPzasByProduct.size).toBe(0);
  });
});

describe("🔴 el mapa es OBLIGATORIO — que lo cace el compilador, no un usuario", () => {
  it("switch-envio lo exige y lo usa", () => {
    const envio = leer("src/lib/catalogo/switch-envio.ts");
    expect(envio).toContain("bultoPzasByProduct: Map<string, number | null>;"); // sin `?`
    // Ya no multiplica: lee las piezas de la línea resuelta.
    expect(envio).toContain("resolverLineas(p.items");
    expect(envio).toContain("resuelta?.piezas");
  });

  it("los TRES llamadores lo pasan", () => {
    // El bug fue que dos de los tres no lo pasaban.
    for (const f of [
      "src/lib/catalogo/enviar-switch-route.ts",
      "src/app/api/catalogo/checkout/route.ts",
      "src/app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route.ts",
    ]) {
      const src = leer(f);
      expect(src, f).toContain("bultoPzasByProduct");
      expect(src, f).toContain("leerCategoriaYBulto");
    }
  });

  it("⚠️ nadie vuelve a leer solo la categoría para calcular el bulto", () => {
    // `select("id, category")` a secas es exactamente la forma del bug.
    for (const f of [
      "src/lib/catalogo/enviar-switch-route.ts",
      "src/app/api/catalogo/checkout/route.ts",
      "src/app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route.ts",
      "src/app/api/catalogo/[marca]/orders/[id]/pdf/route.ts",
      "src/app/api/catalogo/[marca]/orders/[id]/route.ts",
      "src/app/api/catalogo/[marca]/send-order/route.ts",
    ]) {
      expect(leer(f), `${f} lee la categoría sin las piezas`).not.toContain('select("id, category")');
    }
  });
});

describe("🔴 el número correcto llega al total, al PDF y al correo", () => {
  it("el total del pedido se recalcula con el bulto del estilo", () => {
    const route = leer("src/app/api/catalogo/[marca]/orders/[id]/route.ts");
    expect(route).toContain("bulto_pzas: i.bulto_pzas");
    // 🩸 Antes solo enriquecía si la marca tenía `categoryLookup` — y Tommy lo
    // tiene en null, así que sus items llegaban pelados a todos lados.
    expect(route).not.toContain("if (cfg.categoryLookup) {");
  });

  it("el checkout guarda el total con el bulto correcto", () => {
    const co = leer("src/app/api/catalogo/checkout/route.ts");
    expect(co).toContain("resumirDesdeItems(items");
    expect(co).toContain("bultoPzasByProduct,");
  });

  it("el PDF y el correo reciben las piezas del estilo", () => {
    expect(leer("src/lib/catalogo/order-pdf-core.ts")).toContain("resolverLineas(sectionItems");
    expect(leer("src/lib/catalogo/order-email.ts")).toContain("resolverLineas([item]");
    expect(leer("src/app/api/catalogo/[marca]/orders/[id]/pdf/route.ts")).toContain("bultoPzasByProduct.get");
    expect(leer("src/app/api/catalogo/[marca]/send-order/route.ts")).toContain("bultoPzasByProduct.get");
  });

  it("el aviso de stock cuenta las piezas del estilo", () => {
    // "1 bulto · 8 pzas" tiene que decir 8, no 12.
    const lineas = computeStockLineas(
      [{ product_id: "p1", name: "X", sku: "FM0FM05537YBS", quantity: 1, category: "sneakers", bulto_pzas: 8 }],
      new Map([["p1", 5]]),
      (item) => getBultoSize(item.category, item.bulto_pzas),
    );
    expect(lineas[0].pedido_pzas).toBe(8);
    expect(lineas[0].bulto_pzas).toBe(8);
  });

  it("getBulto recibe el ITEM entero, no solo la categoría", () => {
    const cp = leer("src/lib/catalogo/confirmar-pedido.ts");
    expect(cp).toContain("getBulto: (item: PedidoItemStock) => number");
    expect(cp).toContain("bultoSize: () => getBulto(it)");
  });
});
