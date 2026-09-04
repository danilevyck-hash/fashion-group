// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — mover la suma a Postgres NO PUEDE CAMBIAR UN CENTAVO.
//
// "Multifashion › Productos" dejó de bajarse 20.483 filas crudas y sumarlas en
// JavaScript: ahora se las pide YA AGRUPADAS a
// `multifashion_articulo_diario_agrupado_v1`. Esta pantalla es de plata y ya se
// corrigió una vez por un error de signos, así que lo que se prueba acá no es
// "la traducción compila" sino **la EQUIVALENCIA**: agregar las filas agrupadas
// tiene que dar exactamente lo mismo que agregar las filas crudas, en los cuatro
// agregadores que la ruta usa.
//
// `agruparComoPostgres()` es la simulación FIEL de lo que hace el SQL (misma
// llave, mismas sumas sin firmar, mismo orden por MIN(id)). Si alguien cambia la
// llave del GROUP BY en la migración y no acá, este archivo deja de cubrirlo —
// por eso la simulación está escrita al lado del SQL que copia, con el mismo
// orden de columnas y un comentario que lo dice.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  RPC_MARCAS,
  RPC_PERIODO,
  esFuncionAusente,
  marcasDesdeRpc,
  periodoDesdeRpc,
} from "@/lib/multifashion/productos-lectura";
import {
  agregarRanking,
  type FilaArticuloDiario,
} from "@/lib/multifashion/productos-ranking";
import { agregarProductos, type FilaMarca } from "@/lib/multifashion/productos";
import {
  armarPorMarca,
  armarPorMarcaComparativo,
  mapaArticuloGrupo,
} from "@/lib/multifashion/productos-marca";

// ── La simulación del SQL ────────────────────────────────────────────────────
// Copia exacta de la migración 20260809140000:
//   GROUP BY articulo_id, codigo, descripcion, tipo
//   SUM(cantidad_total), SUM(venta_total), SUM(costo_total)  ← MAGNITUDES
//   COUNT(*) AS n · MIN(id::text) AS orden · ORDER BY orden
interface FilaCruda extends FilaArticuloDiario {
  id: string;
}

/** Separador y centinela de NULL de la llave de agrupación (bytes de control). */
const SEP = "\u0001";
const NULO = "\u0002";

function agruparComoPostgres(filas: readonly FilaCruda[]): { n: number; f: unknown[] } {
  interface G {
    a: number; c: string | null; d: string | null; t: string | null;
    q: number; v: number; k: number; n: number; orden: string;
  }
  const g = new Map<string, G>();
  for (const f of filas) {
    // NULL agrupa con NULL, igual que GROUP BY en Postgres. El separador y el
    // centinela de NULL son bytes de control: no pueden aparecer en un texto de
    // Switch, así que dos llaves distintas nunca colisionan en una sola cadena.
    const llave = [f.articulo_id, f.codigo ?? NULO, f.descripcion ?? NULO, f.tipo ?? NULO].join(SEP);
    const num = (x: number | string | null) => Number(x ?? 0);
    const prev = g.get(llave);
    if (prev) {
      prev.q += num(f.cantidad_total);
      prev.v += num(f.venta_total);
      prev.k += num(f.costo_total);
      prev.n += 1;
      if (f.id < prev.orden) prev.orden = f.id;
    } else {
      g.set(llave, {
        a: f.articulo_id, c: f.codigo, d: f.descripcion, t: f.tipo,
        q: num(f.cantidad_total), v: num(f.venta_total), k: num(f.costo_total),
        n: 1, orden: f.id,
      });
    }
  }
  const ordenados = [...g.values()].sort((x, y) => (x.orden < y.orden ? -1 : x.orden > y.orden ? 1 : 0));
  return {
    n: filas.length,
    f: ordenados.map(x => ({ a: x.a, c: x.c, d: x.d, t: x.t, q: x.q, v: x.v, k: x.k })),
  };
}

const sinId = (f: FilaCruda): FilaArticuloDiario => {
  const { id: _id, ...resto } = f;
  return resto;
};

// ── Un período de prueba con TODAS las trampas que tiene el dato real ────────
// · notas de crédito (que RESTAN, y llegan en positivo);
// · el mismo código con DOS descripciones (69 de 3.941 en la ventana real);
// · descripciones que solo difieren en corridas de espacios;
// · un grupo que vende y devuelve TODO (cero neto, se descarta);
// · una fila sin código y otra sin descripción;
// · varias fechas del mismo artículo (que es justo lo que la RPC colapsa).
const CRUDAS: FilaCruda[] = [
  { id: "01", articulo_id: 1, codigo: "TH-1", descripcion: "Men-Polos S/S", tipo: "FA", cantidad_total: 3, venta_total: "120.50", costo_total: "70.00" },
  { id: "02", articulo_id: 1, codigo: "TH-1", descripcion: "Men-Polos S/S", tipo: "FA", cantidad_total: 2, venta_total: "80.00", costo_total: "44.25" },
  { id: "03", articulo_id: 1, codigo: "TH-1", descripcion: "Men-Polos S/S", tipo: "NC", cantidad_total: 1, venta_total: "40.00", costo_total: "22.10" },
  // Mismo código, OTRA descripción, y aparece DESPUÉS: la segunda línea de la
  // tabla tiene que seguir siendo la de la fila 01.
  { id: "04", articulo_id: 1, codigo: "TH-1", descripcion: "Men-Polo S/S", tipo: "FA", cantidad_total: 1, venta_total: "39.99", costo_total: "20.00" },
  // Espacios de más: el código los colapsa, el SQL no. Tiene que dar igual.
  { id: "05", articulo_id: 2, codigo: "CK-9", descripcion: "Women-Bags  Mini", tipo: "FA", cantidad_total: 4, venta_total: "200.00", costo_total: "133.33" },
  { id: "06", articulo_id: 2, codigo: "CK-9", descripcion: "Women-Bags Mini", tipo: "FA", cantidad_total: 1, venta_total: "50.00", costo_total: "33.30" },
  // Cero neto: vendido y devuelto dentro del período.
  { id: "07", articulo_id: 3, codigo: "KL-7", descripcion: "Men-Belts", tipo: "FA", cantidad_total: 2, venta_total: "60.00", costo_total: "30.00" },
  { id: "08", articulo_id: 3, codigo: "KL-7", descripcion: "Men-Belts", tipo: "NC", cantidad_total: 2, venta_total: "60.00", costo_total: "30.00" },
  // Sin código y sin descripción.
  { id: "09", articulo_id: 4, codigo: null, descripcion: "Women-Socks", tipo: "FA", cantidad_total: 5, venta_total: "25.00", costo_total: "12.50" },
  { id: "10", articulo_id: 5, codigo: "RBK-2", descripcion: null, tipo: "FA", cantidad_total: 1, venta_total: "70.00", costo_total: "55.00" },
  // Un artículo que el diccionario de marcas no conoce → "Otros".
  { id: "11", articulo_id: 99, codigo: "ZZ-0", descripcion: "Men-Polos S/S", tipo: "FA", cantidad_total: 2, venta_total: "10.65", costo_total: "4.40" },
];

const DICCIONARIO: FilaMarca[] = [
  { articulo_id: 1, marca_id: 3, marca_nombre: "TH MENSWEAR" },
  { articulo_id: 2, marca_id: 5, marca_nombre: "CK JEANS" },
  { articulo_id: 3, marca_id: 7, marca_nombre: "KL ACCESSORIES" },
  { articulo_id: 4, marca_id: 9, marca_nombre: "TH ACCESORIES" },
  { articulo_id: 5, marca_id: 2, marca_nombre: "RBK FOOTWEAR" },
];

const crudas = CRUDAS.map(sinId);
const agrupadas = periodoDesdeRpc(agruparComoPostgres(CRUDAS), "test").filas;

describe("la RPC agrupada da EXACTAMENTE los mismos números que las filas crudas", () => {
  it("por categoría: totales y renglones idénticos, campo por campo", () => {
    expect(agregarRanking(agrupadas, "categoria")).toEqual(agregarRanking(crudas, "categoria"));
  });

  it("por código: totales y renglones idénticos, incluida la 2ª línea", () => {
    expect(agregarRanking(agrupadas, "codigo")).toEqual(agregarRanking(crudas, "codigo"));
  });

  it("el agrupador por departamento (agregarProductos) es idéntico", () => {
    expect(agregarProductos(agrupadas, DICCIONARIO, 50)).toEqual(
      agregarProductos(crudas, DICCIONARIO, 50),
    );
  });

  it("las particiones por marca son idénticas (y las NC siguen restando adentro)", () => {
    const mapa = mapaArticuloGrupo(DICCIONARIO);
    expect(armarPorMarca(agrupadas, mapa)).toEqual(armarPorMarca(crudas, mapa));
    expect(armarPorMarcaComparativo(agrupadas, mapa)).toEqual(
      armarPorMarcaComparativo(crudas, mapa),
    );
  });

  it("las 6 marcas siguen sumando el total, sin filtrar (diferencia $0,00)", () => {
    const mapa = mapaArticuloGrupo(DICCIONARIO);
    const pm = armarPorMarca(agrupadas, mapa);
    const suma = pm.grupos.reduce((s, g) => s + g.totales.venta, 0);
    expect(Math.round(suma * 100) / 100).toBe(agregarRanking(agrupadas, "categoria").totales.venta);
  });

  it("🩸 las notas de crédito RESTAN — la RPC manda magnitudes, no firma", () => {
    const total = agregarRanking(agrupadas, "categoria").totales.venta;
    // Sumar a ciegas da el DOBLE de las NC de más: ésa es la firma del bug.
    const aCiegas = agrupadas.reduce((s, f) => s + Number(f.venta_total ?? 0), 0);
    const nc = crudas
      .filter(f => f.tipo === "NC")
      .reduce((s, f) => s + Number(f.venta_total ?? 0), 0);
    expect(nc).toBeGreaterThan(0);
    expect(Math.round((aCiegas - total) * 100) / 100).toBe(Math.round(nc * 200) / 100);
    // Y `tipo` viaja en las filas agrupadas: sin él no habría con qué restar.
    expect(agrupadas.some(f => f.tipo === "NC")).toBe(true);
  });

  it("un grupo en cero neto se sigue descartando por los dos caminos", () => {
    const claves = agregarRanking(agrupadas, "codigo").filas.map(f => f.clave);
    expect(claves).not.toContain("KL-7");
    expect(claves).toEqual(agregarRanking(crudas, "codigo").filas.map(f => f.clave));
  });

  it("el margen sigue pudiendo ser null (—), no 0%", () => {
    const solaNc: FilaCruda[] = [
      { id: "a", articulo_id: 1, codigo: "X", descripcion: "D", tipo: "NC", cantidad_total: 1, venta_total: "10.00", costo_total: "5.00" },
    ];
    const g = periodoDesdeRpc(agruparComoPostgres(solaNc), "t").filas;
    expect(agregarRanking(g, "codigo").filas[0].margen).toBeNull();
    expect(agregarRanking(g, "codigo")).toEqual(agregarRanking(solaNc.map(sinId), "codigo"));
  });
});

describe("periodoDesdeRpc", () => {
  it("`n` es el conteo de filas CRUDAS, no de grupos", () => {
    const r = periodoDesdeRpc(agruparComoPostgres(CRUDAS), "t");
    expect(r.filasCrudas).toBe(CRUDAS.length);
    expect(r.filas.length).toBeLessThan(CRUDAS.length);
  });

  it("🩸 NO reordena: la traducción entrega las filas EN EL ORDEN QUE LLEGARON", () => {
    // El orden es un dato, no una casualidad: la RPC ya viene ordenada por
    // MIN(id) y reordenar acá "por prolijo" cambiaría la 2ª línea de la tabla.
    const entrada = agruparComoPostgres(CRUDAS);
    const esperado = (entrada.f as Array<{ a: number; c: string | null; v: number }>).map(
      x => `${x.a}|${x.c}|${x.v}`,
    );
    expect(agrupadas.map(f => `${f.articulo_id}|${f.codigo}|${f.venta_total}`)).toEqual(esperado);
  });

  it("🩸 con el grupo MÁS CHICO primero, la 2ª línea sigue siendo la suya", () => {
    // Ordenar por venta (el orden "natural" de un informe) daría la otra
    // descripción: por eso el criterio es MIN(id), no el monto.
    const dosDesc: FilaCruda[] = [
      { id: "01", articulo_id: 7, codigo: "X-1", descripcion: "PRIMERA", tipo: "FA", cantidad_total: 1, venta_total: "1.00", costo_total: "0.50" },
      { id: "02", articulo_id: 7, codigo: "X-1", descripcion: "SEGUNDA", tipo: "FA", cantidad_total: 9, venta_total: "999.00", costo_total: "500.00" },
    ];
    const g = periodoDesdeRpc(agruparComoPostgres(dosDesc), "t").filas;
    expect(g[0].descripcion).toBe("PRIMERA");
    expect(agregarRanking(g, "codigo").filas[0].detalle).toBe("PRIMERA");
    expect(agregarRanking(g, "codigo")).toEqual(agregarRanking(dosDesc.map(sinId), "codigo"));
    expect(agregarProductos(g, [], 50).articulos[0].descripcion).toBe("PRIMERA");
  });

  it("conserva el orden que manda la RPC (MIN(id)) — de ahí sale la 2ª línea", () => {
    // La descripción del código TH-1 es la de la fila 01, no la de la 04.
    expect(agregarRanking(agrupadas, "codigo").filas.find(f => f.clave === "TH-1")?.detalle).toBe(
      "Men-Polos S/S",
    );
    // Y si el orden se invirtiera, cambiaría: por eso el ORDER BY no es adorno.
    const alReves = [...agrupadas].reverse();
    expect(agregarRanking(alReves, "codigo").filas.find(f => f.clave === "TH-1")?.detalle).toBe(
      "Men-Polo S/S",
    );
  });

  it("los nulos llegan como null, no como cadena vacía", () => {
    const f = agrupadas.find(x => x.articulo_id === 4);
    expect(f?.codigo).toBeNull();
    expect(agrupadas.find(x => x.articulo_id === 5)?.descripcion).toBeNull();
  });

  it("revienta si la forma no es { n, f: [] } — cero filas y 'no entendí' no son lo mismo", () => {
    expect(() => periodoDesdeRpc(null, "X")).toThrow(/X/);
    expect(() => periodoDesdeRpc([], "X")).toThrow();
    expect(() => periodoDesdeRpc({ totales: {}, dias: [] }, "X")).toThrow();
  });

  it("un período vacío es un período vacío, no un error", () => {
    expect(periodoDesdeRpc({ n: 0, f: [] }, "X")).toEqual({ filasCrudas: 0, filas: [] });
  });
});

describe("marcasDesdeRpc", () => {
  it("traduce a la forma de switch_articulo_marca", () => {
    expect(marcasDesdeRpc([{ a: 7, m: 3, n: "TH MENSWEAR" }, { a: 8, m: null, n: null }], "X")).toEqual([
      { articulo_id: 7, marca_id: 3, marca_nombre: "TH MENSWEAR" },
      { articulo_id: 8, marca_id: null, marca_nombre: null },
    ]);
  });

  it("revienta si no es un arreglo", () => {
    expect(() => marcasDesdeRpc({ a: 1 }, "X")).toThrow(/X/);
  });
});

describe("esFuncionAusente — estrecho a propósito", () => {
  it("reconoce 'la migración todavía no se corrió'", () => {
    expect(esFuncionAusente({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(esFuncionAusente({ code: "42883", message: "function ... does not exist" })).toBe(true);
    expect(esFuncionAusente({ message: "Could not find the function public.x" })).toBe(true);
  });

  it("🩸 NO se traga un error de verdad — caerse al camino lento lo escondería", () => {
    expect(esFuncionAusente({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(esFuncionAusente({ code: "42501", message: "permission denied for function" })).toBe(false);
    expect(esFuncionAusente({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(esFuncionAusente({ message: "fetch failed" })).toBe(false);
    expect(esFuncionAusente(null)).toBe(false);
  });

  it("🩸 un 'does not exist' de TABLA no es 'no existe la función' (3-sep-2026)", () => {
    // Hasta hoy este bloque nunca le pasó un error de tabla, y el helper
    // matcheaba cualquier "does not exist": un `relation … does not exist`
    // caía al camino paginado (48 consultas) en vez de propagarse.
    expect(esFuncionAusente({ code: "42P01", message: 'relation "switch_articulo_info" does not exist' })).toBe(false);
    expect(esFuncionAusente({ code: "PGRST205", message: "Could not find the table 'public.x' in the schema cache" })).toBe(false);
    expect(esFuncionAusente({ code: "42703", message: "column x.y does not exist" })).toBe(false);
  });
});

describe("los nombres de las RPC son los de la migración", () => {
  it("no se renombran sin tocar el SQL", () => {
    expect(RPC_PERIODO).toBe("multifashion_articulo_diario_agrupado_v1");
    expect(RPC_MARCAS).toBe("multifashion_articulo_marca_v1");
  });
});
