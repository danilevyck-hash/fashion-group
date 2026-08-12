// ============================================================================
// CANDADO — Marketing por MARCA y por PERÍODO.
//
// Sucede a `marketing-proveedores-periodos.test.ts`: el "proveedor" desapareció
// como unidad, así que su candado se mudó acá entero y se le sumó lo nuevo.
//
// Lo que este archivo defiende, en orden de qué tan caro sale romperlo:
//
//  1. NINGÚN MONTO SE MUEVE. Con los datos reales del 11-ago-2026 la partición
//     por marca da exactamente los mismos números que la pantalla de hoy:
//     Tommy abierto $58.365,00 · Calvin abierto $34.460,00 · Karl $0 ·
//     Reebok $0 · Joybees $1.540,00 · Multifashion $8.061,63 ·
//     titular $102.426,63 · cerrado "mid 2026" $62.381,57 (59 facturas).
//  2. LA DEGRADACIÓN SIN LA DDL, EN LAS DOS DIRECCIONES. Los 121 sellos que
//     existen hoy dicen 'pvh'/'reebok'/'joybees'. Si el sello de una marca se
//     buscara SOLO por su código, los 59 documentos ya reportados se leerían
//     como "período actual" y Tommy mostraría $102.904,43 en vez de $58.365,00.
//     Y al revés: con la migración corrida, el sello por CÓDIGO tiene que
//     ganarle al viejo.
//  3. EL PERÍODO CERRADO SE PARTE POR MARCA. "mid 2026" tiene que salir como
//     DOS chips —Tommy y Calvin— que sumen 62.381,57 exacto, y el nombre sale
//     del BLOQUE, no de `periodo.proveedor_key` (que dice 'pvh').
//  4. CERRAR UNA MARCA NO TOCA A OTRA. Es la promesa central del modelo y la
//     más fácil de romper sin que se note. Y desde el 11-ago-2026 (Daniel:
//     *"que sea por separado mejor no?"*) el cierre conjunto NO EXISTE: cada
//     marca cierra sola, pero el mapeo HISTÓRICO 'pvh' de TH/CK/KL se queda —
//     es lo que sostiene la fila cerrada "mid 2026" y el fallback legacy.
//  5. LOS DOS PAPELES DEL GASTO SON DISTINTOS. Comprobante lo lleva TODO gasto
//     (impulsadoras incluidas); la foto de instalación solo se espera de los
//     gastos CON cliente. Confundirlos es el aviso que suena para siempre.
//  6. LAS DOS DESAGREGACIONES SUMAN EL TITULAR.
//  7. MULTIFASHION NO TIENE PERÍODO, y una marca sin bloque no se esconde.
// ============================================================================
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  MARCAS_BLOQUE,
  SIN_BLOQUE,
  bloqueDeCodigo,
  claveLegacyDeMarca,
  clavesDeSello,
  indiceBloquePorMarcaId,
  nombreDeBloque,
} from "@/lib/marketing/bloques";
import {
  agregarPorBloques,
  claveCliente,
  periodoLegacyDeFactura,
  type EntradaBloques,
} from "@/lib/marketing/resumen-bloques";

// --- Catálogo de marcas, tal cual producción (11-ago-2026) ------------------
const TH = "1673d8a7-582c-4568-8608-34c88b4b6ec6";
const CK = "6dc27cc7-c061-440e-9dc9-915198852a47";
const KL = "53c19d96-2a71-4e9d-abf2-72f671dfe25e";
const RBK = "38a304bc-0712-4cbf-bda9-af5b3b70922e";
const J = "4ae69377-2426-45fe-8a18-d7466c5e9781";
const OTR = "e640c2bd-8f43-481e-b4fd-764197de7d48";

const MARCAS = [
  { id: TH, nombre: "Tommy Hilfiger", codigo: "TH", empresa_codigo: "fashion_wear" },
  { id: CK, nombre: "Calvin Klein", codigo: "CK", empresa_codigo: "vistana" },
  { id: KL, nombre: "Karl Lagerfeld", codigo: "KL", empresa_codigo: "active_wear" },
  { id: RBK, nombre: "Reebok", codigo: "RBK", empresa_codigo: "active_shoes" },
  { id: J, nombre: "Joybees", codigo: "J", empresa_codigo: "joystep" },
  { id: OTR, nombre: "Otros", codigo: "OTR", empresa_codigo: null },
];

function correr(p: Partial<EntradaBloques>) {
  return agregarPorBloques({
    facturas: [],
    facturaMarcas: [],
    entregas: [],
    marcas: MARCAS,
    proyectos: [],
    proyectosMultifashion: new Set<string>(),
    ...p,
  });
}
const bloqueDe = (r: ReturnType<typeof correr>, k: string) =>
  r.bloques.find((b) => b.key === k)!;

// ============================================================================
describe("el mapa marca → bloque es EXACTO, y cada marca es su propio bloque", () => {
  it("las 5 marcas caen en su propio bloque", () => {
    expect(bloqueDeCodigo("TH")).toBe("TH");
    expect(bloqueDeCodigo("CK")).toBe("CK");
    expect(bloqueDeCodigo("KL")).toBe("KL");
    expect(bloqueDeCodigo("RBK")).toBe("RBK");
    expect(bloqueDeCodigo("J")).toBe("J");
  });

  it("«Otros» NO se le asigna a nadie — nadie sabe a qué empresa se le reporta", () => {
    expect(bloqueDeCodigo("OTR")).toBe(SIN_BLOQUE);
  });

  it("NADA de prefijos: THX no es Tommy, JOY no es Joybees, CKX no es Calvin", () => {
    expect(bloqueDeCodigo("THX")).toBe(SIN_BLOQUE);
    expect(bloqueDeCodigo("JOY")).toBe(SIN_BLOQUE);
    expect(bloqueDeCodigo("CKX")).toBe(SIN_BLOQUE);
    expect(bloqueDeCodigo("T")).toBe(SIN_BLOQUE);
    expect(bloqueDeCodigo("RB")).toBe(SIN_BLOQUE);
  });

  it("tolera espacios y minúsculas, porque el código lo tipea una persona", () => {
    expect(bloqueDeCodigo(" th ")).toBe("TH");
    expect(bloqueDeCodigo("rbk")).toBe("RBK");
  });

  it("un código vacío, nulo o desconocido nunca inventa un bloque", () => {
    expect(bloqueDeCodigo(null)).toBe(SIN_BLOQUE);
    expect(bloqueDeCodigo("")).toBe(SIN_BLOQUE);
    expect(bloqueDeCodigo("ZZZ")).toBe(SIN_BLOQUE);
  });

  it("el índice por marca_id coincide con el índice por código", () => {
    const idx = indiceBloquePorMarcaId(MARCAS);
    expect(idx.get(TH)).toBe("TH");
    expect(idx.get(RBK)).toBe("RBK");
    expect(idx.get(OTR)).toBe(SIN_BLOQUE);
  });

  it("el nombre del bloque sale del CATÁLOGO, no de la constante", () => {
    // `French Connection` se renombró a `Karl Lagerfeld` el 11-ago-2026: si el
    // nombre saliera de la constante, la pantalla seguiría diciendo el viejo.
    const r = correr({
      marcas: MARCAS.map((m) => (m.id === KL ? { ...m, nombre: "Karl L. 2027" } : m)),
    });
    expect(bloqueDe(r, "KL").nombre).toBe("Karl L. 2027");
  });

  it("🔴 el mapeo HISTÓRICO se queda: TH/CK/KL siguen resolviendo a 'pvh'", () => {
    // El cierre conjunto se retiró, pero esto es OTRA cosa: la clave con la
    // que ya están escritos los sellos y la fila cerrada "mid 2026"
    // ($62.381,57 ya reportados). Quitarla movería esa plata en pantalla.
    expect(claveLegacyDeMarca("TH")).toBe("pvh");
    expect(claveLegacyDeMarca("CK")).toBe("pvh");
    expect(claveLegacyDeMarca("KL")).toBe("pvh");
    expect(claveLegacyDeMarca("RBK")).toBe("reebok");
    expect(claveLegacyDeMarca("J")).toBe("joybees");
    expect(claveLegacyDeMarca("OTR")).toBeNull();
  });

  it("el bloque ya NO publica ningún campo de grupo de cierre", () => {
    // Daniel (11-ago-2026): *"que sea por separado mejor no?"* — cada marca
    // cierra sola. Que el payload vuelva a traer el grupo es el primer paso
    // para que alguien redibuje la cabecera.
    const r = correr({});
    const th = bloqueDe(r, "TH") as unknown as Record<string, unknown>;
    expect("grupoCierre" in th).toBe(false);
    expect("grupoEtiqueta" in th).toBe(false);
    expect("esCabezaDeGrupo" in th).toBe(false);
  });
});

// ============================================================================
describe("1 — producción 11-ago-2026: ningún monto se mueve", () => {
  const PROY = [
    { id: "p-jer", tienda: "Jerusalem Pasocanoa", tienda_codigo: "D-80" },
    { id: "p-mf", tienda: "Multifashion", tienda_codigo: "D-108" },
    { id: "p-fro", tienda: "La Frontera Duty Free", tienda_codigo: "D-70" },
  ];
  const base = {
    proyectos: PROY,
    proyectosMultifashion: new Set(["p-mf"]),
  };

  it("una factura legacy fuera de Multifashion va al período CERRADO de su marca", () => {
    const r = correr({
      ...base,
      facturas: [{ id: "f1", proyecto_id: "p-jer", total: 1000, grupo_legacy: true }],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
    });
    expect(bloqueDe(r, "TH").facturas.total).toBe(0);
    expect(r.cerrados).toHaveLength(1);
    expect(r.cerrados[0].nombre).toBe("Gastos Tommy y Calvin");
    expect(r.cerrados[0].bloqueKey).toBe("TH");
    expect(r.cerrados[0].bloqueNombre).toBe("Tommy Hilfiger");
    expect(r.cerrados[0].total).toBe(1000);
    expect(r.resumen.total).toBe(0);
  });

  it("una factura legacy DENTRO de Multifashion NO va a ningún archivo de marca", () => {
    const r = correr({
      ...base,
      facturas: [{ id: "f1", proyecto_id: "p-mf", total: 4264.8, grupo_legacy: true }],
      facturaMarcas: [{ factura_id: "f1", marca_id: OTR, porcentaje: 100 }],
    });
    expect(r.cerrados).toHaveLength(0);
    expect(bloqueDe(r, "multifashion").facturas.total).toBe(4264.8);
    expect(bloqueDe(r, "TH").total).toBe(0);
  });

  it("una factura NO legacy va al período abierto de su marca", () => {
    const r = correr({
      ...base,
      facturas: [{ id: "f1", proyecto_id: "p-jer", total: 9000, grupo_legacy: false }],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
    });
    expect(bloqueDe(r, "TH").facturas.total).toBe(9000);
    expect(r.cerrados).toHaveLength(0);
  });

  it("los muebles NUNCA caen en el archivo legacy — `grupo_legacy` no existe para entregas", () => {
    const r = correr({
      ...base,
      entregas: [
        { id: "e1", proyecto_id: "p-jer", total: 40565, total_por_marca: { [TH]: 40565 } },
      ],
    });
    expect(bloqueDe(r, "TH").muebles.total).toBe(40565);
    expect(r.cerrados).toHaveLength(0);
  });

  it("lo que era UN bloque PVH ahora son TRES, y suman lo mismo: 92.825,00", () => {
    // Las cifras son las medidas en producción: Tommy $58.365,00, Calvin
    // $34.460,00 y Karl en cero.
    const r = correr({
      ...base,
      facturas: [
        { id: "f1", proyecto_id: "p-jer", total: 17800 },
        { id: "f2", proyecto_id: "p-jer", total: 4800 },
      ],
      facturaMarcas: [
        { factura_id: "f1", marca_id: TH, porcentaje: 100 },
        { factura_id: "f2", marca_id: CK, porcentaje: 100 },
      ],
      entregas: [
        {
          id: "e1",
          proyecto_id: "p-jer",
          total: 70225,
          total_por_marca: { [TH]: 40565, [CK]: 29660 },
        },
      ],
    });
    expect(bloqueDe(r, "TH").total).toBe(58365);
    expect(bloqueDe(r, "CK").total).toBe(34460);
    expect(bloqueDe(r, "KL").total).toBe(0);
    expect(
      bloqueDe(r, "TH").total + bloqueDe(r, "CK").total + bloqueDe(r, "KL").total,
    ).toBe(92825);
  });

  it("Karl tiene su propio bloque en cuanto tenga un gasto", () => {
    const r = correr({
      ...base,
      facturas: [{ id: "f3", proyecto_id: "p-jer", total: 500 }],
      facturaMarcas: [{ factura_id: "f3", marca_id: KL, porcentaje: 100 }],
    });
    expect(bloqueDe(r, "KL").total).toBe(500);
    expect(bloqueDe(r, "TH").total).toBe(0);
    expect(bloqueDe(r, "CK").total).toBe(0);
  });

  it("Joybees queda SOLA en su bloque — se cierra aparte", () => {
    const r = correr({
      ...base,
      entregas: [
        { id: "e1", proyecto_id: "p-fro", total: 1540, total_por_marca: { [J]: 1540 } },
      ],
    });
    expect(bloqueDe(r, "J").total).toBe(1540);
    expect(bloqueDe(r, "TH").total).toBe(0);
  });

  it("una marca sin gasto sigue teniendo su bloque (Reebok y Karl hoy están en $0)", () => {
    const r = correr(base);
    for (const k of ["KL", "RBK"]) {
      const b = bloqueDe(r, k);
      expect(b).toBeTruthy();
      expect(b.total).toBe(0);
      expect(b.periodoAbierto).not.toBeNull();
    }
  });

  it("los bloques salen en el orden del mapa, no por tamaño", () => {
    const r = correr({
      ...base,
      entregas: [
        { id: "e1", proyecto_id: "p-fro", total: 90000, total_por_marca: { [J]: 90000 } },
      ],
    });
    expect(r.bloques.map((b) => b.key)).toEqual([
      "TH",
      "CK",
      "KL",
      "RBK",
      "J",
      "multifashion",
    ]);
  });
});

// ============================================================================
describe("2 — degradación sin la DDL, en las DOS direcciones", () => {
  const PROY = [{ id: "p1", tienda: "Jerusalem", tienda_codigo: "D-80" }];
  const facturas = [
    { id: "f-viejo", proyecto_id: "p1", total: 44539.43 },
    { id: "f-nuevo", proyecto_id: "p1", total: 17800 },
  ];
  const facturaMarcas = [
    { factura_id: "f-viejo", marca_id: TH, porcentaje: 100 },
    { factura_id: "f-nuevo", marca_id: TH, porcentaje: 100 },
  ];

  // Producción HOY: períodos y sellos con la clave VIEJA por proveedor.
  const periodosViejos = [
    {
      id: "per-cerrado",
      proveedor_key: "pvh",
      nombre: "mid 2026",
      estado: "cerrado",
      cerrado_en: "2026-08-12",
    },
    { id: "per-abierto", proveedor_key: "pvh", nombre: "Período 2026", estado: "abierto" },
  ];

  it("🔴 el sello VIEJO ('pvh') se reconoce: la plata ya reportada NO vuelve al período actual", () => {
    const r = correr({
      proyectos: PROY,
      facturas,
      facturaMarcas,
      periodos: periodosViejos,
      sellos: [
        {
          periodo_id: "per-cerrado",
          proveedor_key: "pvh",
          tipo: "factura",
          documento_id: "f-viejo",
        },
      ],
    });
    // Si `clavesDeSello` solo preguntara por 'TH', esto daría 62.339,43.
    expect(bloqueDe(r, "TH").facturas.total).toBe(17800);
    expect(r.cerrados).toHaveLength(1);
    expect(r.cerrados[0].total).toBe(44539.43);
    // Y el chip dice TOMMY, no 'pvh': el nombre sale del bloque.
    expect(r.cerrados[0].bloqueKey).toBe("TH");
    expect(r.cerrados[0].bloqueNombre).toBe("Tommy Hilfiger");
  });

  it("🔴 sin período propio, la marca muestra el período VIEJO en vez de quedarse sin ninguno", () => {
    const r = correr({ proyectos: PROY, periodos: periodosViejos });
    expect(bloqueDe(r, "TH").periodoAbierto).toEqual({
      id: "per-abierto",
      nombre: "Período 2026",
    });
    expect(bloqueDe(r, "CK").periodoAbierto).toEqual({
      id: "per-abierto",
      nombre: "Período 2026",
    });
  });

  it("🔴 la dirección contraria: con la migración corrida, el sello por CÓDIGO manda", () => {
    const periodos = [
      ...periodosViejos,
      { id: "per-th", proveedor_key: "TH", nombre: "Período 2026", estado: "abierto" },
      {
        id: "per-th-cerrado",
        proveedor_key: "TH",
        nombre: "mid 2026",
        estado: "cerrado",
        cerrado_en: "2026-08-12",
      },
    ];
    const r = correr({
      proyectos: PROY,
      facturas,
      facturaMarcas,
      periodos,
      sellos: [
        // el sello VIEJO manda al abierto; el NUEVO, al cerrado. Gana el nuevo.
        {
          periodo_id: "per-abierto",
          proveedor_key: "pvh",
          tipo: "factura",
          documento_id: "f-viejo",
        },
        {
          periodo_id: "per-th-cerrado",
          proveedor_key: "TH",
          tipo: "factura",
          documento_id: "f-viejo",
        },
      ],
    });
    expect(bloqueDe(r, "TH").facturas.total).toBe(17800);
    expect(r.cerrados[0].total).toBe(44539.43);
    // y el período abierto que se muestra es el PROPIO de la marca
    expect(bloqueDe(r, "TH").periodoAbierto).toEqual({
      id: "per-th",
      nombre: "Período 2026",
    });
  });

  it("`clavesDeSello` pregunta primero por el código y después por la clave vieja", () => {
    expect(clavesDeSello("TH")).toEqual(["TH", "pvh"]);
    expect(clavesDeSello("CK")).toEqual(["CK", "pvh"]);
    expect(clavesDeSello("KL")).toEqual(["KL", "pvh"]);
    expect(clavesDeSello("RBK")).toEqual(["RBK", "reebok"]);
    expect(clavesDeSello("J")).toEqual(["J", "joybees"]);
    expect(clavesDeSello("OTR")).toEqual([]);
  });

  it("sin ninguna tabla de período, el fallback `grupo_legacy` da lo mismo", () => {
    const conSellos = correr({
      proyectos: PROY,
      facturas: [
        { id: "f-viejo", proyecto_id: "p1", total: 44539.43, grupo_legacy: true },
        { id: "f-nuevo", proyecto_id: "p1", total: 17800, grupo_legacy: false },
      ],
      facturaMarcas,
      periodos: periodosViejos,
      sellos: [
        {
          periodo_id: "per-cerrado",
          proveedor_key: "pvh",
          tipo: "factura",
          documento_id: "f-viejo",
        },
      ],
    });
    const sinTablas = correr({
      proyectos: PROY,
      facturas: [
        { id: "f-viejo", proyecto_id: "p1", total: 44539.43, grupo_legacy: true },
        { id: "f-nuevo", proyecto_id: "p1", total: 17800, grupo_legacy: false },
      ],
      facturaMarcas,
    });
    expect(sinTablas.resumen.total).toBe(conSellos.resumen.total);
    expect(bloqueDe(sinTablas, "TH").total).toBe(bloqueDe(conSellos, "TH").total);
    expect(sinTablas.cerrados[0].total).toBe(conSellos.cerrados[0].total);
    // y el fallback solo alcanza a las marcas del grupo que SÍ tenía archivo
    expect(sinTablas.cerrados.map((c) => c.bloqueKey)).toEqual(["TH"]);
  });

  it("el fallback legacy solo aplica cuando NO hay tablas de período", () => {
    expect(
      periodoLegacyDeFactura({ id: "f", proyecto_id: "p", total: 1, grupo_legacy: true }, false),
    ).toBe(true);
    expect(
      periodoLegacyDeFactura({ id: "f", proyecto_id: "p", total: 1, grupo_legacy: true }, true),
    ).toBe(false);
    expect(
      periodoLegacyDeFactura({ id: "f", proyecto_id: "p", total: 1, grupo_legacy: false }, false),
    ).toBe(false);
  });

  it("un documento SIN sello va al abierto, nunca al cerrado", () => {
    const r = correr({
      proyectos: PROY,
      periodos: periodosViejos,
      facturas: [{ id: "f1", proyecto_id: "p1", total: 500, grupo_legacy: true }],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
    });
    // `grupo_legacy` es true, pero con las tablas creadas manda el SELLO.
    expect(bloqueDe(r, "TH").facturas.total).toBe(500);
    expect(r.cerrados).toHaveLength(0);
  });

  it("`conPeriodos` dice de dónde salió la respuesta", () => {
    expect(correr({}).conPeriodos).toBe(false);
    expect(correr({ periodos: periodosViejos }).conPeriodos).toBe(true);
  });
});

// ============================================================================
describe("3 — el período cerrado se parte POR MARCA", () => {
  const PROY = [{ id: "p1", tienda: "Jerusalem", tienda_codigo: "D-80" }];
  const periodos = [
    {
      id: "mid",
      proveedor_key: "pvh",
      nombre: "mid 2026",
      estado: "cerrado",
      cerrado_en: "2026-08-12",
    },
    { id: "abierto", proveedor_key: "pvh", nombre: "Período 2026", estado: "abierto" },
  ];

  it("«mid 2026» sale como DOS chips que suman 62.381,57 EXACTO", () => {
    const r = correr({
      proyectos: PROY,
      periodos,
      facturas: [
        { id: "f-th", proyecto_id: "p1", total: 44539.43 },
        { id: "f-ck", proyecto_id: "p1", total: 17842.14 },
      ],
      facturaMarcas: [
        { factura_id: "f-th", marca_id: TH, porcentaje: 100 },
        { factura_id: "f-ck", marca_id: CK, porcentaje: 100 },
      ],
      sellos: [
        { periodo_id: "mid", proveedor_key: "pvh", tipo: "factura", documento_id: "f-th" },
        { periodo_id: "mid", proveedor_key: "pvh", tipo: "factura", documento_id: "f-ck" },
      ],
    });
    expect(r.cerrados).toHaveLength(2);
    const porMarca = Object.fromEntries(r.cerrados.map((c) => [c.bloqueKey, c.total]));
    expect(porMarca.TH).toBe(44539.43);
    expect(porMarca.CK).toBe(17842.14);
    expect(Number(r.cerrados.reduce((s, c) => s + c.total, 0).toFixed(2))).toBe(62381.57);
    // los dos chips dicen el mismo período y su nombre de marca
    expect(r.cerrados.map((c) => c.nombre)).toEqual(["mid 2026", "mid 2026"]);
    expect(r.cerrados.map((c) => c.bloqueNombre).sort()).toEqual([
      "Calvin Klein",
      "Tommy Hilfiger",
    ]);
    // 🔴 y NO dicen 'pvh', que es lo que guarda la columna
    expect(r.cerrados.some((c) => /pvh/i.test(c.bloqueNombre))).toBe(false);
  });

  it("una MISMA factura repartida entre dos marcas se parte en los dos chips", () => {
    const r = correr({
      proyectos: PROY,
      periodos,
      facturas: [{ id: "f1", proyecto_id: "p1", total: 1000 }],
      facturaMarcas: [
        { factura_id: "f1", marca_id: TH, porcentaje: 60 },
        { factura_id: "f1", marca_id: CK, porcentaje: 40 },
      ],
      sellos: [
        { periodo_id: "mid", proveedor_key: "pvh", tipo: "factura", documento_id: "f1" },
      ],
    });
    const porMarca = Object.fromEntries(r.cerrados.map((c) => [c.bloqueKey, c.total]));
    expect(porMarca.TH).toBe(600);
    expect(porMarca.CK).toBe(400);
    expect(r.cerrados.reduce((s, c) => s + c.total, 0)).toBe(1000);
  });
});

// ============================================================================
describe("4 — cerrar una marca NO toca a otra", () => {
  const PROY = [{ id: "p1", tienda: "Jerusalem", tienda_codigo: "D-80" }];
  const periodos = [
    {
      id: "per-th-cerrado",
      proveedor_key: "TH",
      nombre: "2025",
      estado: "cerrado",
      cerrado_en: "2026-01-01",
    },
    { id: "per-th-abierto", proveedor_key: "TH", nombre: "2026", estado: "abierto" },
    { id: "per-ck-abierto", proveedor_key: "CK", nombre: "2026", estado: "abierto" },
    { id: "per-rbk-abierto", proveedor_key: "RBK", nombre: "Temporada 1", estado: "abierto" },
  ];

  it("un proyecto con Tommy y Reebok: cerrado Tommy, Reebok sigue VIVO", () => {
    const r = correr({
      proyectos: PROY,
      periodos,
      facturas: [
        { id: "f-th", proyecto_id: "p1", total: 1000 },
        { id: "f-rbk", proyecto_id: "p1", total: 700 },
      ],
      facturaMarcas: [
        { factura_id: "f-th", marca_id: TH, porcentaje: 100 },
        { factura_id: "f-rbk", marca_id: RBK, porcentaje: 100 },
      ],
      sellos: [
        {
          periodo_id: "per-th-cerrado",
          proveedor_key: "TH",
          tipo: "factura",
          documento_id: "f-th",
        },
        {
          periodo_id: "per-rbk-abierto",
          proveedor_key: "RBK",
          tipo: "factura",
          documento_id: "f-rbk",
        },
      ],
    });
    expect(bloqueDe(r, "TH").facturas.total).toBe(0);
    expect(bloqueDe(r, "RBK").facturas.total).toBe(700);
    expect(r.cerrados.map((c) => c.total)).toEqual([1000]);
    // 🔑 el proyecto sigue contando para LAS DOS: no se cerró el proyecto.
    expect(bloqueDe(r, "TH").proyectos).toBe(1);
    expect(bloqueDe(r, "RBK").proyectos).toBe(1);
  });

  it("cerrar Tommy no se lleva a Calvin, aunque compartan la clave vieja 'pvh'", () => {
    const r = correr({
      proyectos: PROY,
      periodos,
      facturas: [
        { id: "f-th", proyecto_id: "p1", total: 1000 },
        { id: "f-ck", proyecto_id: "p1", total: 800 },
      ],
      facturaMarcas: [
        { factura_id: "f-th", marca_id: TH, porcentaje: 100 },
        { factura_id: "f-ck", marca_id: CK, porcentaje: 100 },
      ],
      sellos: [
        {
          periodo_id: "per-th-cerrado",
          proveedor_key: "TH",
          tipo: "factura",
          documento_id: "f-th",
        },
      ],
    });
    expect(bloqueDe(r, "TH").total).toBe(0);
    expect(bloqueDe(r, "CK").total).toBe(800);
  });

  it("una MISMA entrega repartida entre dos marcas se sella por separado", () => {
    const r = correr({
      proyectos: PROY,
      periodos,
      entregas: [
        {
          id: "e1",
          proyecto_id: "p1",
          total: 900,
          total_por_marca: { [TH]: 600, [RBK]: 300 },
        },
      ],
      sellos: [
        {
          periodo_id: "per-th-cerrado",
          proveedor_key: "TH",
          tipo: "entrega",
          documento_id: "e1",
        },
      ],
    });
    expect(bloqueDe(r, "TH").muebles.total).toBe(0);
    expect(bloqueDe(r, "RBK").muebles.total).toBe(300);
    expect(r.cerrados[0].muebles.total).toBe(600);
  });
});

// ============================================================================
describe("5 — los dos papeles del gasto son DISTINTOS", () => {
  const PROY = [{ id: "p1", tienda: "Jerusalem", tienda_codigo: "D-80" }];
  const conGasto = (extra: Partial<EntradaBloques> = {}) =>
    correr({
      proyectos: PROY,
      facturas: [
        { id: "f-cliente", proyecto_id: "p1", total: 1000 },
        // pago de impulsadora: gasto SUELTO, sin cliente
        { id: "f-imp", proyecto_id: null, total: 800, impulsadora_id: "i1" },
      ],
      facturaMarcas: [
        { factura_id: "f-cliente", marca_id: TH, porcentaje: 100 },
        { factura_id: "f-imp", marca_id: TH, porcentaje: 100 },
      ],
      ...extra,
    });

  it("sin ningún adjunto: los DOS gastos van «sin comprobante», solo UNO «sin foto»", () => {
    const th = bloqueDe(conGasto(), "TH");
    expect(th.sinComprobante).toBe(2);
    // 🔴 el pago de impulsadora NO espera foto: no tiene cliente.
    expect(th.sinFoto).toBe(1);
  });

  it("EL COMPROBANTE LO LLEVA TODO GASTO, impulsadoras incluidas", () => {
    // Daniel, textual: *"pero impulsadora tambien necesita comprobante, pero no
    // foto. aunq el comprobante sea una foto."*
    const th = bloqueDe(
      conGasto({
        adjuntos: [
          { tipo: "pdf_factura", factura_id: "f-cliente", proyecto_id: null },
          { tipo: "foto_factura", factura_id: "f-imp", proyecto_id: null },
        ],
      }),
      "TH",
    );
    expect(th.sinComprobante).toBe(0);
    // el comprobante NO apaga el aviso de foto: son papeles distintos
    expect(th.sinFoto).toBe(1);
  });

  it("la FOTO DE INSTALACIÓN del gasto apaga su aviso", () => {
    const th = bloqueDe(
      conGasto({
        adjuntos: [{ tipo: "foto_instalacion", factura_id: "f-cliente", proyecto_id: null }],
      }),
      "TH",
    );
    expect(th.sinFoto).toBe(0);
    // y no cuenta como comprobante
    expect(th.sinComprobante).toBe(2);
  });

  it("las 60 fotos VIEJAS (del proyecto) también apagan el aviso — no se migran", () => {
    const th = bloqueDe(
      conGasto({
        adjuntos: [{ tipo: "foto_proyecto", factura_id: null, proyecto_id: "p1" }],
      }),
      "TH",
    );
    expect(th.sinFoto).toBe(0);
  });

  it("una foto de instalación en un gasto SIN cliente no rompe nada (subirla se puede)", () => {
    // Subir fotos está permitido en TODO gasto — un evento de impulsadora tiene
    // fotos. Lo que la regla dice es que NO SE LAS RECLAMA, no que no se puedan.
    const th = bloqueDe(
      conGasto({
        adjuntos: [{ tipo: "foto_instalacion", factura_id: "f-imp", proyecto_id: null }],
      }),
      "TH",
    );
    expect(th.sinFoto).toBe(1); // sigue faltando la del gasto CON cliente
    expect(th.sinComprobante).toBe(2);
  });

  it("⚠️ las ENTREGAS de mobiliario NO cuentan: su comprobante se GENERA", () => {
    const r = correr({
      proyectos: PROY,
      entregas: [
        { id: "e1", proyecto_id: "p1", total: 500, total_por_marca: { [TH]: 500 } },
      ],
    });
    expect(bloqueDe(r, "TH").muebles.count).toBe(1);
    expect(bloqueDe(r, "TH").sinComprobante).toBe(0);
    expect(bloqueDe(r, "TH").sinFoto).toBe(0);
  });

  it("lo YA REPORTADO (período cerrado) no vuelve a pedir comprobante ni foto", () => {
    const r = correr({
      proyectos: PROY,
      periodos: [
        {
          id: "mid",
          proveedor_key: "TH",
          nombre: "mid 2026",
          estado: "cerrado",
          cerrado_en: "2026-08-12",
        },
        { id: "ab", proveedor_key: "TH", nombre: "2026", estado: "abierto" },
      ],
      facturas: [{ id: "f1", proyecto_id: "p1", total: 1000 }],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
      sellos: [
        { periodo_id: "mid", proveedor_key: "TH", tipo: "factura", documento_id: "f1" },
      ],
    });
    expect(bloqueDe(r, "TH").sinComprobante).toBe(0);
    expect(bloqueDe(r, "TH").sinFoto).toBe(0);
  });

  it("una factura repartida entre DOS marcas se cuenta UNA vez en cada bloque", () => {
    const r = correr({
      proyectos: PROY,
      facturas: [{ id: "f1", proyecto_id: "p1", total: 1000 }],
      facturaMarcas: [
        { factura_id: "f1", marca_id: TH, porcentaje: 50 },
        { factura_id: "f1", marca_id: CK, porcentaje: 50 },
      ],
    });
    expect(bloqueDe(r, "TH").sinComprobante).toBe(1);
    expect(bloqueDe(r, "CK").sinComprobante).toBe(1);
  });
});

// ============================================================================
describe("6 — las dos desagregaciones suman el titular", () => {
  const entrada = {
    proyectos: [
      { id: "p1", tienda: "Jerusalem", tienda_codigo: "D-80" },
      { id: "p2", tienda: "Multifashion", tienda_codigo: "D-108" },
    ],
    proyectosMultifashion: new Set(["p2"]),
    facturas: [
      { id: "f1", proyecto_id: "p1", total: 1000 },
      { id: "f2", proyecto_id: "p2", total: 250 },
      { id: "f3", proyecto_id: null, total: 800, impulsadora_id: "i1" },
    ],
    facturaMarcas: [
      { factura_id: "f1", marca_id: TH, porcentaje: 100 },
      { factura_id: "f2", marca_id: CK, porcentaje: 100 },
      { factura_id: "f3", marca_id: TH, porcentaje: 100 },
    ],
    entregas: [
      { id: "e1", proyecto_id: "p1", total: 400, total_por_marca: { [J]: 400 } },
    ],
  };

  it("Σ «Por cliente» = el número grande de arriba", () => {
    const r = correr(entrada);
    const suma = r.porCliente.reduce((s, f) => s + f.total, 0);
    expect(Number(suma.toFixed(2))).toBe(r.resumen.total);
  });

  it("Σ «Por marca» = el número grande de arriba", () => {
    const r = correr(entrada);
    const suma = Object.values(r.porMarca).reduce((s, v) => s + v, 0);
    expect(Number(suma.toFixed(2))).toBe(r.resumen.total);
  });

  it("un gasto SIN proyecto aparece en «Por cliente» — si no, la columna no cuadra", () => {
    const r = correr(entrada);
    const fila = r.porCliente.find((f) => f.cliente === "Impulsadoras y gastos sueltos");
    expect(fila).toBeTruthy();
    expect(fila!.porBloque.TH).toBe(800);
  });

  it("la plata ya reportada NO entra en el titular ni en las desagregaciones", () => {
    const r = correr({
      ...entrada,
      facturas: [
        ...entrada.facturas,
        { id: "f9", proyecto_id: "p1", total: 5000, grupo_legacy: true },
      ],
      facturaMarcas: [
        ...entrada.facturaMarcas,
        { factura_id: "f9", marca_id: TH, porcentaje: 100 },
      ],
    });
    expect(r.cerrados[0].total).toBe(5000);
    const suma = r.porCliente.reduce((s, f) => s + f.total, 0);
    expect(Number(suma.toFixed(2))).toBe(r.resumen.total);
    expect(r.resumen.total).not.toBe(0);
  });

  it("el cliente se identifica por CÓDIGO, y el texto libre es el respaldo", () => {
    expect(claveCliente({ id: "x", tienda: "City Mall", tienda_codigo: "D-25" })).toBe("D-25");
    expect(claveCliente({ id: "a", tienda: "City  Mall ", tienda_codigo: null })).toBe(
      claveCliente({ id: "b", tienda: "city mall", tienda_codigo: null }),
    );
  });
});

// ============================================================================
describe("7 — Multifashion sin período, y la marca sin bloque no se esconde", () => {
  it("Multifashion NO tiene período: es tienda propia, no se le reporta a nadie", () => {
    const r = correr({
      proyectos: [{ id: "p1", tienda: "Multifashion", tienda_codigo: "D-108" }],
      proyectosMultifashion: new Set(["p1"]),
      facturas: [{ id: "f1", proyecto_id: "p1", total: 100 }],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
      periodos: [{ id: "abierto", proveedor_key: "TH", nombre: "2026", estado: "abierto" }],
    });
    const mf = bloqueDe(r, "multifashion");
    expect(mf.periodoAbierto).toBeNull();
    // aunque la factura sea de Tommy, la plata NO se le reporta a Tommy
    expect(bloqueDe(r, "TH").facturas.total).toBe(0);
    expect(mf.facturas.total).toBe(100);
  });

  it("una marca sin bloque cae en uno VISIBLE, sin período y sin botón de cerrar", () => {
    const r = correr({
      proyectos: [{ id: "p1", tienda: "Tienda X", tienda_codigo: "D-9" }],
      facturas: [{ id: "f1", proyecto_id: "p1", total: 333 }],
      facturaMarcas: [{ factura_id: "f1", marca_id: OTR, porcentaje: 100 }],
    });
    const sb = bloqueDe(r, SIN_BLOQUE);
    expect(sb).toBeTruthy();
    expect(sb.total).toBe(333);
    expect(sb.periodoAbierto).toBeNull();
    expect(sb.nombre).toBe("Sin marca asignada");
    // 🔴 y NO se la regala a ninguna marca
    for (const m of MARCAS_BLOQUE) expect(bloqueDe(r, m.key).total).toBe(0);
  });

  it("sin nada adentro, el bloque «sin marca» no se dibuja (sería ruido)", () => {
    expect(correr({}).bloques.find((b) => b.key === SIN_BLOQUE)).toBeUndefined();
  });
});

// ============================================================================
describe("barrido estático — una sola fuente de verdad", () => {
  const raiz = path.resolve(__dirname, "../../..");
  const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf-8");

  it("`resumen-bloques` REUSA la matemática de `resumen-inicio`, no la copia", () => {
    const src = leer("src/lib/marketing/resumen-bloques.ts");
    expect(src).toMatch(/from "\.\/resumen-inicio"/);
    expect(src).toMatch(/porcionEntregaParaMarca/);
    expect(src).toMatch(/marcasDeEntrega/);
  });

  it("nadie escribe un segundo mapa marca→bloque a mano", () => {
    const archivos = [
      "src/app/api/marketing/inicio/route.ts",
      "src/lib/marketing/resumen-bloques.ts",
      "src/app/api/marketing/proyectos-lista/route.ts",
    ];
    for (const f of archivos) {
      const src = leer(f);
      // los códigos de marca solo pueden aparecer en bloques.ts
      expect(src).not.toMatch(/["']RBK["']/);
      expect(src).not.toMatch(/["']TH["']\s*[,:]/);
    }
  });

  it("el mapa no usa startsWith en ninguna forma", () => {
    expect(leer("src/lib/marketing/bloques.ts")).not.toMatch(/\.startsWith\(/);
  });

  it("🔴 el sello se busca SIEMPRE con `clavesDeSello`, nunca con la clave sola", () => {
    // Es lo único que sostiene los números antes de que corra la migración.
    for (const f of [
      "src/lib/marketing/resumen-bloques.ts",
      "src/lib/marketing/periodos-io.ts",
      "src/lib/marketing/periodos-reporte.ts",
    ]) {
      expect(leer(f)).toMatch(/clavesDeSello/);
    }
  });

  it("el «proveedor» ya no existe como unidad en el módulo", () => {
    expect(fs.existsSync(path.join(raiz, "src/lib/marketing/proveedores.ts"))).toBe(false);
    expect(
      fs.existsSync(path.join(raiz, "src/lib/marketing/resumen-proveedores.ts")),
    ).toBe(false);
  });

  it("la migración por marca es ADITIVA: no borra tablas ni filas", () => {
    const sql = leer("supabase/migrations/20260811180000_marketing_periodos_por_marca.sql");
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/UPDATE\s+mk_facturas/i);
  });

  it("la migración se PARA sola si un monto se movió", () => {
    const sql = leer("supabase/migrations/20260811180000_marketing_periodos_por_marca.sql");
    expect(sql).toMatch(/RAISE EXCEPTION/);
    expect(sql).toMatch(/62381\.57/);
  });

  it("las 5 marcas están declaradas, y TODAS cierran solas — no hay grupos de cierre", () => {
    expect(MARCAS_BLOQUE.map((m) => m.key)).toEqual(["TH", "CK", "KL", "RBK", "J"]);
    // Daniel (11-ago-2026): *"que sea por separado mejor no?"* — el concepto de
    // grupo de cierre no puede volver al módulo. Lo único que se conserva es el
    // mapeo legacy 'pvh' (CLAVE_LEGACY), que es histórico, no un grupo.
    const src = leer("src/lib/marketing/bloques.ts");
    expect(src).not.toMatch(/GRUPOS_CIERRE/);
    expect(src).not.toMatch(/esCabezaDeGrupo/);
    expect(src).not.toMatch(/grupoCierreDeMarca|grupoCierrePorKey/);
    expect(src).toMatch(/CLAVE_LEGACY_POR_MARCA/);
  });

  it("⛔ el atajo de cierre conjunto no existe: ni cabecera, ni botón, ni ruta", () => {
    // Los comentarios SÍ pueden nombrarlo — explicar por qué se fue es lo que
    // evita que alguien lo reponga sin querer.
    const sinComentarios = (src: string) =>
      src
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
    const inicio = sinComentarios(leer("src/app/marketing/components/InicioMarketing.tsx"));
    expect(inicio).not.toMatch(/Cerrar las tres/);
    expect(inicio).not.toMatch(/se cierran juntas/);
    expect(inicio).not.toMatch(/cerrandoGrupo|hermanosDeGrupo/);
    const modal = sinComentarios(leer("src/app/marketing/components/CerrarPeriodoModal.tsx"));
    expect(modal).not.toMatch(/cerrar-grupo/);
    expect(modal).not.toMatch(/Cerrar las tres/);
    expect(
      fs.existsSync(
        path.join(raiz, "src/app/api/marketing/periodos/cerrar-grupo/route.ts"),
      ),
    ).toBe(false);
  });

  it("el nombre de un bucket no se confunde con el de una marca", () => {
    expect(nombreDeBloque("multifashion")).toBe("Multifashion");
    expect(nombreDeBloque(SIN_BLOQUE)).toBe("Sin marca asignada");
    expect(nombreDeBloque("TH")).toBe("Tommy Hilfiger");
  });
});
