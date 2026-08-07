// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — Multifashion › Productos.
//
// Fija las tres cosas que, si se rompen, dan un número EQUIVOCADO sin dar error:
//   1. las NOTAS DE CRÉDITO RESTAN (la tabla guarda magnitudes positivas);
//   2. el % es sobre el total del PERÍODO, no sobre lo que se dibuja;
//   3. la ruta LEE PAGINADO (db-max-rows = 1000 corta en silencio) y no inventa
//      la marca a partir del código del proveedor.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  agregarProductos,
  signoDeTipo,
  MARCA_DESCONOCIDA,
  TIPO_QUE_RESTA,
  type FilaArticuloDiario,
  type FilaMarca,
} from "@/lib/multifashion/productos";

const fila = (
  articulo_id: number,
  tipo: string,
  cantidad: number,
  venta: number,
  extra: Partial<FilaArticuloDiario> = {},
): FilaArticuloDiario => ({
  articulo_id,
  codigo: `COD${articulo_id}`,
  descripcion: `Desc ${articulo_id}`,
  tipo,
  cantidad_total: cantidad,
  venta_total: venta,
  ...extra,
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Las notas de crédito RESTAN
// ═════════════════════════════════════════════════════════════════════════════

describe("productos — las notas de crédito RESTAN", () => {
  it("solo NC resta; FA, CNF y cualquier otro tipo suman", () => {
    expect(TIPO_QUE_RESTA).toBe("NC");
    expect(signoDeTipo("NC")).toBe(-1);
    for (const t of ["FA", "CNF", "ND", "", null, undefined, "cualquiera"]) {
      expect(signoDeTipo(t), `tipo ${JSON.stringify(t)}`).toBe(1);
    }
  });

  it("un 'nc' con espacios y minúsculas TAMBIÉN resta", () => {
    // Si esto se rompe, una devolución se cuenta como venta y nadie lo nota:
    // el error tiene cara de detalle de formato y consecuencia de plata.
    expect(signoDeTipo(" nc ")).toBe(-1);
    expect(signoDeTipo("Nc")).toBe(-1);
  });

  it("$1.000 vendidos con $200 devueltos dan $800, NO $1.200", () => {
    const r = agregarProductos([
      fila(1, "FA", 10, 1000),
      fila(1, "NC", 2, 200),
    ]);
    expect(r.totales.venta).toBe(800);
    expect(r.totales.unidades).toBe(8);
    expect(r.articulos[0].venta).toBe(800);
  });

  it("🩸 LA FIRMA DEL ERROR: ignorar el tipo da EXACTAMENTE el doble de la NC de más", () => {
    // La regla de este repo ("Signos contables"): si la diferencia contra la
    // fuente es el doble EXACTO de las notas de crédito, el bug es éste.
    const filas = [fila(1, "FA", 10, 1000), fila(1, "NC", 2, 200)];
    const bien = agregarProductos(filas).totales.venta;
    const malSumandoTodo = 1000 + 200; // lo que daría un SUM() sin mirar `tipo`
    expect(malSumandoTodo - bien).toBe(2 * 200);
  });

  it("un artículo que quedó en cero NETO no es un renglón", () => {
    const r = agregarProductos([fila(1, "FA", 3, 300), fila(1, "NC", 3, 300)]);
    expect(r.articulos).toHaveLength(0);
    expect(r.totales.articulos).toBe(0);
  });

  it("un artículo con devolución NETA sí se muestra (es información real)", () => {
    const r = agregarProductos([fila(1, "FA", 100, 1000), fila(2, "NC", 1, 50)]);
    const negativo = r.articulos.find(a => a.articuloId === 2);
    expect(negativo?.venta).toBe(-50);
    expect(negativo?.unidades).toBe(-1);
  });

  it("los montos llegan como STRING desde PostgREST y se suman igual", () => {
    const r = agregarProductos([
      fila(1, "FA", "10" as unknown as number, "1,250.50" as unknown as number),
      fila(1, "NC", "1" as unknown as number, "250.50" as unknown as number),
    ]);
    expect(r.totales.venta).toBe(1000);
    expect(r.totales.unidades).toBe(9);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. El % es sobre el TOTAL del período
// ═════════════════════════════════════════════════════════════════════════════

describe("productos — el % es del total, no del top que se dibuja", () => {
  const muchos: FilaArticuloDiario[] = Array.from({ length: 10 }, (_, i) =>
    fila(i + 1, "FA", 1, 100),
  );

  it("con topN=3, los 3 renglones suman 30% — no 100%", () => {
    const r = agregarProductos(muchos, [], 3);
    expect(r.articulos).toHaveLength(3);
    expect(r.totales.venta).toBe(1000);
    expect(r.totales.articulos).toBe(10); // el total cuenta los 10, no los 3
    const suma = r.articulos.reduce((s, a) => s + (a.pct ?? 0), 0);
    expect(suma).toBeCloseTo(0.3, 10);
  });

  it("el % del total descuenta las devoluciones (mismo denominador que el titular)", () => {
    const r = agregarProductos([
      fila(1, "FA", 1, 800),
      fila(2, "FA", 1, 400),
      fila(2, "NC", 1, 200),
    ]);
    expect(r.totales.venta).toBe(1000);
    expect(r.articulos.find(a => a.articuloId === 1)?.pct).toBeCloseTo(0.8, 10);
    expect(r.articulos.find(a => a.articuloId === 2)?.pct).toBeCloseTo(0.2, 10);
  });

  it("total <= 0 → el % es null, no una división por cero ni un Infinity", () => {
    const r = agregarProductos([fila(1, "NC", 1, 100)]);
    expect(r.totales.venta).toBe(-100);
    expect(r.articulos[0].pct).toBeNull();
  });

  it("sin filas: todo en cero y sin renglones (no revienta)", () => {
    const r = agregarProductos([]);
    expect(r.totales).toEqual({ unidades: 0, venta: 0, articulos: 0 });
    expect(r.articulos).toEqual([]);
    expect(r.marcas).toEqual([]);
  });

  it("el orden es por monto descendente", () => {
    const r = agregarProductos([fila(1, "FA", 1, 100), fila(2, "FA", 1, 900), fila(3, "FA", 1, 500)]);
    expect(r.articulos.map(a => a.articuloId)).toEqual([2, 3, 1]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. La marca NO se inventa
// ═════════════════════════════════════════════════════════════════════════════

describe("productos — agrupador por marca", () => {
  const marcas: FilaMarca[] = [
    { articulo_id: 1, marca_id: 10, marca_nombre: "TH MENSWEAR" },
    { articulo_id: 2, marca_id: 10, marca_nombre: "TH MENSWEAR" },
    { articulo_id: 3, marca_id: 23, marca_nombre: "CK JEANS" },
  ];

  it("suma los artículos de la misma marca y cuenta cuántos son", () => {
    const r = agregarProductos(
      [fila(1, "FA", 1, 300), fila(2, "FA", 1, 200), fila(3, "FA", 1, 500)],
      marcas,
    );
    const th = r.marcas.find(m => m.marca === "TH MENSWEAR");
    expect(th).toMatchObject({ venta: 500, unidades: 2, articulos: 2, marcaId: 10 });
    expect(th?.pct).toBeCloseTo(0.5, 10);
    expect(r.marcas.find(m => m.marca === "CK JEANS")?.venta).toBe(500);
  });

  it("las NC restan también agrupando por marca", () => {
    const r = agregarProductos(
      [fila(1, "FA", 5, 500), fila(2, "NC", 1, 100)],
      marcas,
    );
    expect(r.marcas.find(m => m.marca === "TH MENSWEAR")?.venta).toBe(400);
  });

  it("un artículo sin entrada en el diccionario cae en 'Sin marca', NUNCA en una inventada", () => {
    const r = agregarProductos([fila(1, "FA", 1, 100), fila(99, "FA", 1, 400)], marcas);
    const sin = r.marcas.find(m => m.marca === MARCA_DESCONOCIDA);
    expect(sin?.venta).toBe(400);
    expect(sin?.marcaId).toBeNull();
    expect(r.sinMarca).toEqual({ articulos: 1, venta: 400 });
  });

  it("sin diccionario, TODO cae en 'Sin marca' — el total no cambia", () => {
    const filas = [fila(1, "FA", 1, 100), fila(2, "FA", 1, 400)];
    const r = agregarProductos(filas, []);
    expect(r.marcas).toHaveLength(1);
    expect(r.marcas[0].marca).toBe(MARCA_DESCONOCIDA);
    expect(r.marcas[0].venta).toBe(500);
    // El agrupador por artículo sigue intacto: la marca es aditiva.
    expect(agregarProductos(filas).totales.venta).toBe(500);
  });

  it("un nombre de marca vacío o en blanco NO crea una marca fantasma", () => {
    const r = agregarProductos(
      [fila(1, "FA", 1, 100)],
      [{ articulo_id: 1, marca_id: 7, marca_nombre: "   " }],
    );
    expect(r.marcas[0].marca).toBe(MARCA_DESCONOCIDA);
  });

  it("la suma de las marcas iguala el total del período", () => {
    const filas = [fila(1, "FA", 1, 300), fila(2, "FA", 1, 200), fila(3, "FA", 1, 500), fila(99, "FA", 1, 111)];
    const r = agregarProductos(filas, marcas);
    const suma = r.marcas.reduce((s, m) => s + m.venta, 0);
    expect(suma).toBeCloseTo(r.totales.venta, 6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Candado ESTÁTICO de la ruta — lo que no se puede escribir a mano
// ═════════════════════════════════════════════════════════════════════════════

const RUTA = path.join(process.cwd(), "src/app/api/multifashion/productos/route.ts");

describe("candado estático — /api/multifashion/productos", () => {
  const src = readFileSync(RUTA, "utf-8");

  it("lee PAGINADO y no con un .range() de tope grande", () => {
    // El mes más grande medido (dic-2025) tiene 5.321 filas y db-max-rows = 1000:
    // un `.range(0, 99999)` devolvería 1.000 filas SIN ERROR y la pestaña
    // mostraría el 19% de las ventas.
    expect(src, "la ruta debe usar leerTodoPaginado").toContain("leerTodoPaginado");
    const rangesLiterales = [...src.matchAll(/\.range\(\s*\d+\s*,\s*(\d+)\s*\)/g)];
    for (const m of rangesLiterales) {
      expect(Number(m[1]), `.range(..., ${m[1]}) es el bug del truncado silencioso`).toBeLessThan(1000);
    }
  });

  it("la agregación NO se reescribe en la ruta: vive en el módulo puro", () => {
    expect(src).toContain('from "@/lib/multifashion/productos"');
    // Si alguien vuelve a firmar el tipo a mano acá, hay dos verdades posibles.
    expect(src).not.toMatch(/tipo\s*===\s*["']NC["']/);
  });

  it("acota la ventana de gerente_acs en el SERVIDOR", () => {
    expect(src).toContain('from "@/lib/multifashion/ventana-gerente"');
    // El clamp pasó de `clampAnioMes` a `clampPeriodoProductos` cuando la ruta
    // ganó el parámetro `periodo`: acotar year/mes ya no alcanzaba, porque con
    // `periodo=12m` la ruta ni los mira. Lo que se exige sigue siendo lo mismo
    // — que el rol de la SESIÓN acote el período ANTES de tocar la base.
    expect(src).toMatch(/clampPeriodoProductos\(\s*\n?\s*auth\.role/);
  });

  it("la empresa es una CONSTANTE, no un parámetro de la URL", () => {
    expect(src).toContain('const EMPRESA = "american_classic"');
    expect(src).not.toMatch(/searchParams\.get\(["']empresa/);
  });
});

describe("candado estático — el diccionario de marcas NO se adivina", () => {
  it("ni el sync ni la agregación deducen la marca del código del proveedor", () => {
    for (const rel of [
      "src/lib/multifashion/productos.ts",
      "src/lib/switch-api/sync-articulo-marca.ts",
      "src/app/api/multifashion/productos/route.ts",
    ]) {
      const s = readFileSync(path.join(process.cwd(), rel), "utf-8");
      // Los intentos típicos de inventar la marca: cortar el código por prefijo
      // o mirar la descripción ("Men-Sneakers", que es categoría, no marca).
      expect(s, `${rel} parece derivar la marca del código`).not.toMatch(
        /codigo\.(slice|substring|substr|split|startsWith|match)/,
      );
      expect(s, `${rel} parece derivar la marca de la descripción`).not.toMatch(
        /descripcion\.(slice|substring|substr|split|startsWith|match)/,
      );
    }
  });
});
