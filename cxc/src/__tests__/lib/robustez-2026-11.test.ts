// Candados de los arreglos de ROBUSTEZ (24-nov-2026): cosas que andaban hoy y
// se romperían solas con el tiempo (listas que crecen, tope de 1.000 filas,
// errores de supabase que no se miraban, el reloj UTC). Ninguno cambia un
// resultado visible: si uno de estos falla, volvió el problema.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: {
    from: () => ({
      select: () => ({
        in: (_c: string, v: string[]) =>
          Promise.resolve(
            v.length > 200
              ? { data: null, error: { message: "Bad Request" } }
              : { data: null, error: { message: "permiso denegado" } },
          ),
      }),
    }),
  },
}));

import { inEnTandas, TANDA_IN } from "@/lib/supabase-paginado";
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";
import { fetchReebokCategoryMap } from "@/lib/reebok-category-lookup";
import { mesActualISO, mesAnteriorISO } from "@/lib/marketing/meses";

const src = (ruta: string) => readFileSync(resolve(process.cwd(), "src", ruta), "utf8");
const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

/** Una tabla falsa que, como la base real, rechaza un `.in()` demasiado largo. */
function dbQueRechazaListasLargas(filasPorId: (id: string) => Record<string, unknown>) {
  const tandas: number[] = [];
  const db = {
    from: () => ({
      select: () => ({
        in: (_col: string, v: string[]) => {
          tandas.push(v.length);
          if (v.length > 600) return Promise.resolve({ data: null, error: { message: "Bad Request" } });
          return Promise.resolve({ data: v.map(filasPorId), error: null });
        },
      }),
    }),
  };
  return { db, tandas };
}

describe("1 · `.in()` con listas largas va en tandas", () => {
  it("650 ids → tandas de 200 como mucho, y todas las filas", async () => {
    const vistos: number[] = [];
    const r = await inEnTandas<{ id: string }>(ids(650), async (t) => {
      vistos.push(t.length);
      return { data: t.map((id) => ({ id })), error: null };
    });
    expect(TANDA_IN).toBe(200);
    expect(vistos).toEqual([200, 200, 200, 50]);
    expect(r.data).toHaveLength(650);
  });

  it("un error corta y se PROPAGA — nunca filas a medias", async () => {
    let n = 0;
    const r = await inEnTandas(ids(650), async (t) => {
      n += 1;
      return n === 2 ? { data: null, error: { message: "Bad Request" } } : { data: t, error: null };
    });
    expect(r).toEqual({ data: null, error: { message: "Bad Request" } });
  });

  it("💸 el bulto de 700 productos (Tommy) se lee entero, no cae al default", async () => {
    const { db, tandas } = dbQueRechazaListasLargas((id) => ({ id, category: "footwear", bulto_pzas: 8 }));
    const m = await leerCategoriaYBulto(db as never, "tommy_products", ids(700));
    expect(Math.max(...tandas)).toBeLessThanOrEqual(200);
    expect(m.bultoPzasByProduct.size).toBe(700);
    expect(m.bultoPzasByProduct.get("id-699")).toBe(8);
  });

  it("💸 la categoría de Reebok ya no ignora el error (antes todo caía a 6 en silencio)", async () => {
    await expect(fetchReebokCategoryMap(ids(3))).rejects.toThrow(/permiso denegado/);
  });

  it.each([
    "lib/guias/etiquetas-server.ts",
    "lib/catalogo/switch-lock.ts",
    "app/api/catalogo/[marca]/pedidos-export/route.ts",
    "lib/reebok-category-lookup.ts",
    "lib/catalogo/bulto-productos.ts",
    "app/clientes/[codigo]/page.tsx",
  ])("%s usa `inEnTandas`", (ruta) => {
    expect(src(ruta)).toContain("inEnTandas");
  });

  it("los renglones de Etiquetas no convierten un error en «ninguna guía»", () => {
    const s = src("lib/guias/etiquetas-server.ts");
    const f = s.slice(s.indexOf("async function guiasDeLosRenglones"), s.indexOf("async function guiasDeLosRenglones") + 1500);
    expect(f).not.toMatch(/if \(rErr \|\| !renglones\) return salida/);
  });
});

describe("2, 3, 10 · lecturas paginadas contra el COUNT", () => {
  it.each([
    "lib/switch-api/sync-catalogo.ts",
    "lib/catalogos/variantes-limpieza.ts",
    "app/api/guias/route.ts",
    "app/api/catalogo/[marca]/orders/route.ts",
    "app/api/productos/cargar/descripciones/route.ts",
    "lib/guias/pedido-detalle-server.ts",
  ])("%s usa `leerTodoPaginado`", (ruta) => {
    expect(src(ruta)).toContain("leerTodoPaginado");
  });

  it("🩸 la limpieza de fotos ya no lee los SKU con un select pelado (tope de 1.000 → borraba fotos vivas)", () => {
    expect(src("lib/catalogos/variantes-limpieza.ts")).not.toMatch(/\.select\("sku"\)\s*;/);
  });

  it("la frescura de líneas de pedido ya no confía en `.limit(50000)`", () => {
    const s = src("lib/guias/pedido-detalle-server.ts");
    const f = s.slice(s.indexOf("export async function bajarLineasQueFaltan"), s.indexOf("export async function bajarLineasQueFaltan") + 1500);
    expect(f).not.toContain(".limit(50000)");
  });
});

describe("4, 5 · guías: nada vacío, nada pisado, nada despachado se edita", () => {
  it("si fallan los renglones al crear, se deshace la cabecera", () => {
    const s = src("app/api/guias/route.ts");
    const i = s.indexOf('from("guia_items").insert(rows)');
    expect(s.slice(i, i + 600)).toContain('.from("guia_transporte").delete().eq("id", guia.id)');
  });

  it("el PUT rechaza una Completada SIN mirar el `estado` del cuerpo", () => {
    const s = src("app/api/guias/[id]/route.ts");
    expect(s).toContain("if (guiaYaDespachada(previous.estado))");
    expect(s).not.toContain('previous?.estado === "Completada" && estado !== "Completada"');
  });

  it("la escritura del PUT lleva el estado leído y contesta 409 si no escribe", () => {
    const s = src("app/api/guias/[id]/route.ts");
    expect(s).toContain('base.eq("estado", previous.estado)');
    expect(s).toMatch(/escritas\.length === 0\)[\s\S]{0,200}status: 409/);
  });

  it("el PUT mira el `.error` del borrado y del giro de orden (supabase no lanza)", () => {
    const s = src("app/api/guias/[id]/route.ts");
    expect(s).toContain("if (delErr) return");
    expect(s).toContain('r.status === "rejected" || r.value.error');
  });

  it("el PATCH tampoco toca una Completada, venga o no `estado`", () => {
    const s = src("app/api/guias/[id]/route.ts");
    const i = s.indexOf("export async function PATCH");
    expect(s.slice(i)).toMatch(/\.update\(update\)\s*\.eq\("id", params\.id\)\s*\.neq\("estado", "Completada"\)/);
  });
});

describe("6 · Pedidos: el paso lleva la guarda de estado", () => {
  it("el cambio de estado escribe con `.eq(\"estado\", …)` y contesta 409", () => {
    const s = src("app/api/guias/pedidos/route.ts");
    const i = s.indexOf("const cols = columnasDelPaso(desde, estado, quienFirma, ahora, bultosNuevos)");
    const f = s.slice(i, i + 1800);
    expect(f).toContain('base.eq("estado", estadoLeido)');
    expect(f).toContain("return yaMovido()");
    expect(f).not.toContain("upsert(fila");
  });
});

describe("8, 9 · fechas de Panamá, no del reloj UTC", () => {
  it("el año del N.° de reclamo sale de `hoyPanama()`", () => {
    const s = src("app/api/reclamos/route.ts");
    expect(s).toContain("hoyPanama()");
    expect(s).not.toContain("new Date().getFullYear()");
  });

  it("el 1-dic a las 10 p. m. UTC−5… es todavía noviembre en Panamá", () => {
    // 2026-12-01T03:00Z = 30-nov 10:00 p. m. en Panamá.
    const t = new Date("2026-12-01T03:00:00Z");
    expect(mesActualISO(t)).toBe("2026-11-01");
    expect(mesAnteriorISO(t)).toBe("2026-10-01");
  });

  it("enero: el mes anterior es diciembre del año anterior", () => {
    const t = new Date("2027-01-15T15:00:00Z");
    expect(mesActualISO(t)).toBe("2027-01-01");
    expect(mesAnteriorISO(t)).toBe("2026-12-01");
  });
});
