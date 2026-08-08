// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del filtro de MARCA de "Multifashion › Productos".
//
// Lo que se congela acá:
//   1. El mapa prefijo → marca es EXPLÍCITO y por palabra completa: `THX SPORT`
//      NO es Tommy. Lo desconocido cae en "Otros", nunca en una marca inventada.
//   2. Los departamentos mal escritos que Daniel aprobó juntar se juntan — y
//      SOLO esos tres.
//   3. Las particiones SUMAN el total: si las marcas no cierran contra el
//      período, el informe no se puede cuadrar contra Switch.
//   4. Rehidratar no es recalcular: el renglón que arma el navegador es idéntico,
//      campo por campo, al que arma `agregarRanking` en el servidor.
//   5. Las notas de crédito siguen restando DENTRO de cada marca.
//
// Los 32 departamentos del fixture y sus marcas son los REALES, medidos contra
// producción el 8-ago-2026 (ventana 2025-09-01 → 2026-08-08).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  EQUIVALENCIAS_DEPARTAMENTO,
  MARCAS_POR_PREFIJO,
  ORDEN_GRUPOS,
  departamentoCanonico,
  grupoDeDepartamento,
  nombreDeGrupo,
  type GrupoMarcaId,
} from "@/lib/multifashion/marcas-grupo";
import {
  aligerar,
  aligerarComparativo,
  armarPorMarca,
  armarPorMarcaComparativo,
  indexarPorGrupo,
  mapaArticuloGrupo,
  mapaDetalles,
  particionarPorGrupo,
  rehidratar,
  rehidratarComparativo,
} from "@/lib/multifashion/productos-marca";
import { agregarRanking, type FilaArticuloDiario } from "@/lib/multifashion/productos-ranking";

// ── Los 32 departamentos REALES y la marca a la que pertenecen ───────────────
const DEPARTAMENTOS: [string, GrupoMarcaId][] = [
  ["TH MENSWEAR", "TH"],
  ["TH FOOTWEAR", "TH"],
  ["TH WOMENSWEAR", "TH"],
  ["TH ACCESSORIES", "TH"],
  ["TH KIDS", "TH"],
  ["TH TOMMY JEANS", "TH"],
  ["TH UNDERWEAR", "TH"],
  ["TH OTHER", "TH"],
  ["TH ACCESORIES", "TH"],
  ["TH SWIMWEAR", "TH"],
  ["TH LEGWEAR", "TH"],
  ["TH MEN", "TH"],
  ["TH OTHERS", "TH"],
  ["CK JEANS", "CK"],
  ["CK FOOTWEAR", "CK"],
  ["CK UNDERWEAR", "CK"],
  ["CK ACCESSORIES", "CK"],
  ["CK MENSWEAR", "CK"],
  ["CK KIDS", "CK"],
  ["CK WOMENSWEAR", "CK"],
  ["CK LEGWEAR", "CK"],
  ["CK SWIMWEAR", "CK"],
  ["CK OTHER", "CK"],
  ["KL MENSWEAR", "KL"],
  ["KL ACCESSORIES", "KL"],
  ["KL WOMENSWEAR", "KL"],
  ["KL FOOTWEAR", "KL"],
  ["RBK FOOTWEAR", "RBK"],
  ["RBK APPAREL", "RBK"],
  ["RBK HARDWARE", "RBK"],
  ["JOYBEES", "JOYBEES"],
  ["OTROS", "OTROS"],
];

describe("el mapa de marcas es explícito, no una heurística de texto", () => {
  it("los 32 departamentos reales caen en su marca", () => {
    for (const [nombre, esperado] of DEPARTAMENTOS) {
      expect(`${nombre} → ${grupoDeDepartamento(nombre).id}`).toBe(`${nombre} → ${esperado}`);
    }
  });

  it("son 5 marcas reales y nada más", () => {
    expect(MARCAS_POR_PREFIJO.map(m => m.id)).toEqual(["TH", "CK", "KL", "RBK", "JOYBEES"]);
    expect(MARCAS_POR_PREFIJO.map(m => m.nombre)).toEqual([
      "Tommy Hilfiger",
      "Calvin Klein",
      "Karl Lagerfeld",
      "Reebok",
      "Joybees",
    ]);
  });

  it("compara la PRIMERA PALABRA completa: `THX SPORT` no es Tommy", () => {
    // Si acá se usara `startsWith`, THX/CKX/KLM entrarían como si fueran la marca.
    expect(grupoDeDepartamento("THX SPORT").id).toBe("OTROS");
    expect(grupoDeDepartamento("CKX DENIM").id).toBe("OTROS");
    expect(grupoDeDepartamento("RBKX").id).toBe("OTROS");
    expect(grupoDeDepartamento("THMENSWEAR").id).toBe("OTROS");
  });

  it("un nombre nuevo de mañana cae en Otros, no rompe ni inventa marca", () => {
    for (const desconocido of ["ZARA WOMEN", "NIKE FOOTWEAR", "MARCA NUEVA 2027", "x"]) {
      const g = grupoDeDepartamento(desconocido);
      expect(g.id).toBe("OTROS");
      expect(g.nombre).toBe("Otros");
    }
  });

  it("vacío, nulo y espacios también son Otros", () => {
    expect(grupoDeDepartamento("").id).toBe("OTROS");
    expect(grupoDeDepartamento(null).id).toBe("OTROS");
    expect(grupoDeDepartamento(undefined).id).toBe("OTROS");
    expect(grupoDeDepartamento("   ").id).toBe("OTROS");
  });

  it("no le afectan los espacios de sobra ni las minúsculas", () => {
    expect(grupoDeDepartamento("  TH   MENSWEAR ").id).toBe("TH");
    expect(grupoDeDepartamento("th menswear").id).toBe("TH");
  });

  it("`nombreDeGrupo` cubre los 6 ids y ORDEN_GRUPOS los tiene todos", () => {
    expect([...ORDEN_GRUPOS].sort()).toEqual(["CK", "JOYBEES", "KL", "OTROS", "RBK", "TH"]);
    expect(ORDEN_GRUPOS.map(nombreDeGrupo)).toEqual([
      "Tommy Hilfiger",
      "Calvin Klein",
      "Karl Lagerfeld",
      "Reebok",
      "Joybees",
      "Otros",
    ]);
  });
});

describe("departamentos mal escritos: lista explícita, no parecido de textos", () => {
  it("son EXACTAMENTE las tres que aprobó Daniel", () => {
    expect(EQUIVALENCIAS_DEPARTAMENTO).toEqual([
      { de: "TH ACCESORIES", a: "TH ACCESSORIES" },
      { de: "TH MEN", a: "TH MENSWEAR" },
      { de: "TH OTHERS", a: "TH OTHER" },
    ]);
  });

  it("las dos escrituras terminan en la MISMA clave", () => {
    expect(departamentoCanonico("TH ACCESORIES")).toBe(departamentoCanonico("TH ACCESSORIES"));
    expect(departamentoCanonico("TH MEN")).toBe(departamentoCanonico("TH MENSWEAR"));
    expect(departamentoCanonico("TH OTHERS")).toBe(departamentoCanonico("TH OTHER"));
  });

  it("dos departamentos PARECIDOS que no están en la lista NO se juntan", () => {
    // Es el riesgo del algoritmo de parecido: `TH KIDS` y `TH KID` se parecen
    // tanto como `TH MEN` y `TH MENSWEAR`, y fusionarlos no dejaría rastro.
    expect(departamentoCanonico("TH KID")).not.toBe(departamentoCanonico("TH KIDS"));
    expect(departamentoCanonico("CK MEN")).not.toBe(departamentoCanonico("CK MENSWEAR"));
    expect(departamentoCanonico("TH WOMENSWEAR")).toBe("TH WOMENSWEAR");
  });

  it("juntarlos no cambia de marca ni saca del mapa", () => {
    expect(grupoDeDepartamento("TH ACCESORIES").id).toBe("TH");
    expect(grupoDeDepartamento("TH MEN").id).toBe("TH");
  });
});

// ── Fixture de filas: 3 marcas, una NC, un artículo sin diccionario ──────────
const dicc = [
  { articulo_id: 1, marca_nombre: "TH MENSWEAR" },
  { articulo_id: 2, marca_nombre: "TH ACCESORIES" }, // mal escrito, misma marca
  { articulo_id: 3, marca_nombre: "KL FOOTWEAR" },
  { articulo_id: 4, marca_nombre: "RBK FOOTWEAR" },
  { articulo_id: 5, marca_nombre: "ZARA KIDS" }, // desconocida → Otros
  // el 6 NO está en el diccionario
];

const fila = (
  articulo_id: number,
  codigo: string,
  descripcion: string,
  tipo: string,
  cantidad_total: number,
  venta_total: number,
  costo_total: number,
): FilaArticuloDiario => ({ articulo_id, codigo, descripcion, tipo, cantidad_total, venta_total, costo_total });

const FILAS: FilaArticuloDiario[] = [
  fila(1, "TH-001", "Men-T-Shirts S/S", "FA", 10, 1000, 600),
  fila(1, "TH-001", "Men-T-Shirts S/S", "NC", 2, 200, 120), // devolución: RESTA
  fila(2, "TH-002", "Men-Belts", "FA", 5, 500, 300),
  fila(3, "KL-001", "Women-Shoes", "FA", 4, 400, 320), // margen flojo
  fila(4, "RBK-001", "Men-Shoes", "FA", 3, 300, 255),
  fila(5, "ZR-001", "Kids-Tees", "FA", 1, 50, 20),
  fila(6, "SD-001", "Men-Shoes", "FA", 2, 100, 40), // sin entrada en el diccionario
];

describe("las particiones cierran contra el total", () => {
  const mapa = mapaArticuloGrupo(dicc);
  const global = agregarRanking(FILAS, "categoria");
  const pm = armarPorMarca(FILAS, mapa);

  it("la suma de las marcas da EXACTAMENTE el total del período", () => {
    const suma = (f: (t: (typeof pm.grupos)[number]["totales"]) => number) =>
      Math.round(pm.grupos.reduce((a, g) => a + f(g.totales), 0) * 10000) / 10000;
    expect(suma(t => t.venta)).toBe(global.totales.venta);
    expect(suma(t => t.costo)).toBe(global.totales.costo);
    expect(suma(t => t.utilidad)).toBe(global.totales.utilidad);
    expect(suma(t => t.unidades)).toBe(global.totales.unidades);
  });

  it("las notas de crédito RESTAN dentro de la marca, no solo en el total", () => {
    const th = pm.grupos.find(g => g.id === "TH");
    // TH: 1000 − 200 (NC) + 500 = 1300 de venta, 8 − 2 + 5 = 13 unidades.
    expect(th?.totales.venta).toBe(1300);
    expect(th?.totales.unidades).toBe(13);
    // Sumar a ciegas daría 1700: exactamente 2 × la NC de más (CLAUDE.md).
    expect(th?.totales.venta).not.toBe(1700);
  });

  it("un artículo sin entrada en el diccionario cae en Otros y SIGUE SUMANDO", () => {
    const otros = pm.grupos.find(g => g.id === "OTROS");
    // ZARA KIDS (desconocida) 50 + el artículo 6 (sin diccionario) 100.
    expect(otros?.totales.venta).toBe(150);
  });

  it("el margen de cada marca sale del agregado de SUS filas", () => {
    const kl = pm.grupos.find(g => g.id === "KL");
    expect(kl?.totales.margen).toBeCloseTo((400 - 320) / 400, 10);
    const rbk = pm.grupos.find(g => g.id === "RBK");
    expect(rbk?.totales.margen).toBeCloseTo((300 - 255) / 300, 10);
  });

  it("los grupos salen en ORDEN FIJO, no en el orden en que llegaron las filas", () => {
    const alReves = armarPorMarca([...FILAS].reverse(), mapa);
    expect(alReves.grupos.map(g => g.id)).toEqual(pm.grupos.map(g => g.id));
    expect(pm.grupos.map(g => g.id)).toEqual(["TH", "KL", "RBK", "OTROS"]);
  });

  it("una marca que vendió y devolvió TODO no aparece", () => {
    const netoCero: FilaArticuloDiario[] = [
      fila(3, "KL-001", "Women-Shoes", "FA", 2, 200, 100),
      fila(3, "KL-001", "Women-Shoes", "NC", 2, 200, 100),
    ];
    expect(armarPorMarca(netoCero, mapa).grupos.map(g => g.id)).toEqual([]);
  });

  it("sin diccionario, TODO cae en Otros y el total no se mueve", () => {
    const sinDicc = armarPorMarca(FILAS, new Map());
    expect(sinDicc.grupos.map(g => g.id)).toEqual(["OTROS"]);
    expect(sinDicc.grupos[0].totales.venta).toBe(global.totales.venta);
  });

  it("particionarPorGrupo no pierde ni duplica filas", () => {
    const p = particionarPorGrupo(FILAS, mapa);
    expect([...p.values()].reduce((a, f) => a + f.length, 0)).toBe(FILAS.length);
  });
});

describe("rehidratar no es recalcular: el renglón es idéntico al del servidor", () => {
  const mapa = mapaArticuloGrupo(dicc);
  const pm = armarPorMarca(FILAS, mapa);
  const idxCat = indexarPorGrupo(pm.categorias);
  const idxCod = indexarPorGrupo(pm.codigos);
  const detalles = mapaDetalles(agregarRanking(FILAS, "codigo").filas);

  for (const id of ["TH", "KL", "RBK", "OTROS"] as GrupoMarcaId[]) {
    it(`${id}: por categoría, campo por campo`, () => {
      const suyas = FILAS.filter(f => (mapa.get(f.articulo_id) ?? "OTROS") === id);
      const esperado = agregarRanking(suyas, "categoria").filas;
      expect(rehidratar(idxCat.get(id) ?? [])).toEqual(esperado);
    });

    it(`${id}: por artículo, con la descripción reusada del arreglo completo`, () => {
      const suyas = FILAS.filter(f => (mapa.get(f.articulo_id) ?? "OTROS") === id);
      const esperado = agregarRanking(suyas, "codigo").filas;
      expect(rehidratar(idxCod.get(id) ?? [], detalles)).toEqual(esperado);
    });
  }

  it("el margen `null` sobrevive el viaje (venta no positiva → '—')", () => {
    const devuelto: FilaArticuloDiario[] = [
      fila(1, "TH-001", "Men-T-Shirts S/S", "FA", 1, 100, 60),
      fila(1, "TH-001", "Men-T-Shirts S/S", "NC", 3, 300, 180),
    ];
    const p = armarPorMarca(devuelto, mapa);
    const filas = rehidratar(indexarPorGrupo(p.categorias).get("TH") ?? []);
    expect(filas[0].venta).toBe(-200);
    expect(filas[0].margen).toBeNull();
    expect(filas).toEqual(agregarRanking(devuelto, "categoria").filas);
  });

  it("el comparativo viaja aliviado y vuelve igual que `aliviar`", () => {
    const comp = armarPorMarcaComparativo(FILAS, mapa);
    const suyas = FILAS.filter(f => (mapa.get(f.articulo_id) ?? "OTROS") === "TH");
    const esperado = agregarRanking(suyas, "categoria").filas.map(f => ({
      clave: f.clave,
      unidades: f.unidades,
      venta: f.venta,
      utilidad: f.utilidad,
    }));
    expect(rehidratarComparativo(indexarPorGrupo(comp.categorias).get("TH") ?? [])).toEqual(esperado);
  });

  it("aligerar/rehidratar es ida y vuelta sin pérdida", () => {
    const filas = agregarRanking(FILAS, "codigo").filas;
    const ida = aligerar("TH", filas);
    expect(rehidratar(ida, mapaDetalles(filas))).toEqual(filas);
    const idaComp = aligerarComparativo("TH", filas);
    expect(rehidratarComparativo(idaComp)).toEqual(
      filas.map(f => ({ clave: f.clave, unidades: f.unidades, venta: f.venta, utilidad: f.utilidad })),
    );
  });
});
