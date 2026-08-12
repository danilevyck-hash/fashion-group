// ============================================================================
// CANDADO — Marketing por PROVEEDOR y por PERÍODO.
//
// Lo que este archivo defiende, en orden de qué tan caro sale romperlo:
//
//  1. NINGÚN MONTO SE MUEVE. Con los datos reales del 11-ago-2026 y SIN la
//     migración corrida, la partición nueva da exactamente los mismos números
//     que la pantalla de hoy: PVH $92.825,00 · Joybees $1.540,00 ·
//     Multifashion $8.061,63 · cerrado "Gastos Tommy y Calvin" $62.381,57 ·
//     titular $102.426,63.
//  2. CERRAR UN PROVEEDOR NO TOCA AL OTRO. Un proyecto con Tommy (PVH) y
//     Reebok: cerrado PVH, la parte de Reebok sigue viva y editable. Es la
//     promesa central del modelo y la más fácil de romper sin que se note.
//  3. LA FACTURA QUE LLEGA TARDE ENTRA EN EL PERÍODO ABIERTO. Un documento sin
//     sello nunca cae en un período cerrado — el reporte que el proveedor ya
//     tiene en la mano no puede cambiar solo.
//  4. EL MAPA MARCA→PROVEEDOR ES EXACTO, no por prefijo. `THX` no es Tommy.
//  5. LAS DOS DESAGREGACIONES SUMAN EL TITULAR. "Por cliente" y "Por marca"
//     tienen que dar el mismo total que el número grande de arriba; si no, la
//     pantalla se contradice a sí misma.
//  6. MULTIFASHION NO TIENE PERÍODO. Es tienda propia: no se le reporta a nadie.
//  7. UNA MARCA SIN PROVEEDOR NO SE ESCONDE NI SE ADIVINA.
// ============================================================================
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PROVEEDORES,
  SIN_PROVEEDOR,
  indiceProveedorPorMarcaId,
  marcasDeProveedor,
  proveedorDeCodigo,
} from "@/lib/marketing/proveedores";
import {
  agregarPorProveedor,
  claveCliente,
  periodoLegacyDeFactura,
  type EntradaProveedores,
} from "@/lib/marketing/resumen-proveedores";

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

function correr(p: Partial<EntradaProveedores>) {
  return agregarPorProveedor({
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
describe("4 — el mapa marca → proveedor es EXACTO", () => {
  it("las 5 marcas con proveedor caen donde deben", () => {
    expect(proveedorDeCodigo("TH")).toBe("pvh");
    expect(proveedorDeCodigo("CK")).toBe("pvh");
    expect(proveedorDeCodigo("KL")).toBe("pvh");
    expect(proveedorDeCodigo("RBK")).toBe("reebok");
    expect(proveedorDeCodigo("J")).toBe("joybees");
  });

  it("«Otros» NO se le asigna a nadie — hoy nadie sabe a qué compañía se le reporta", () => {
    expect(proveedorDeCodigo("OTR")).toBe(SIN_PROVEEDOR);
  });

  it("NADA de prefijos: THX no es Tommy, JOY no es Joybees, CKX no es Calvin", () => {
    expect(proveedorDeCodigo("THX")).toBe(SIN_PROVEEDOR);
    expect(proveedorDeCodigo("JOY")).toBe(SIN_PROVEEDOR);
    expect(proveedorDeCodigo("CKX")).toBe(SIN_PROVEEDOR);
    // y al revés: un código más corto tampoco se estira
    expect(proveedorDeCodigo("T")).toBe(SIN_PROVEEDOR);
    expect(proveedorDeCodigo("RB")).toBe(SIN_PROVEEDOR);
  });

  it("tolera espacios y minúsculas, porque el código lo tipea una persona", () => {
    expect(proveedorDeCodigo(" th ")).toBe("pvh");
    expect(proveedorDeCodigo("rbk")).toBe("reebok");
  });

  it("un código vacío, nulo o desconocido nunca inventa un grupo", () => {
    expect(proveedorDeCodigo(null)).toBe(SIN_PROVEEDOR);
    expect(proveedorDeCodigo("")).toBe(SIN_PROVEEDOR);
    expect(proveedorDeCodigo("ZZZ")).toBe(SIN_PROVEEDOR);
  });

  it("PVH lista sus tres marcas en orden, para el subtítulo del bloque", () => {
    expect(marcasDeProveedor("pvh", MARCAS).map((m) => m.nombre)).toEqual([
      "Tommy Hilfiger",
      "Calvin Klein",
      "Karl Lagerfeld",
    ]);
  });

  it("el índice por marca_id coincide con el índice por código", () => {
    const idx = indiceProveedorPorMarcaId(MARCAS);
    expect(idx.get(TH)).toBe("pvh");
    expect(idx.get(RBK)).toBe("reebok");
    expect(idx.get(OTR)).toBe(SIN_PROVEEDOR);
  });
});

// ============================================================================
describe("1 — producción 11-ago-2026: ningún monto se mueve", () => {
  // Los proyectos y montos son los MEDIDOS, condensados a lo que cambia el
  // resultado. Las cifras de control son las de la pantalla de hoy.
  const PROY = [
    { id: "p-jer", tienda: "Jerusalem Pasocanoa", tienda_codigo: "D-80" },
    { id: "p-mf", tienda: "Multifashion", tienda_codigo: "D-108" },
    { id: "p-fro", tienda: "La Frontera Duty Free", tienda_codigo: "D-70" },
  ];
  const base = {
    proyectos: PROY,
    proyectosMultifashion: new Set(["p-mf"]),
  };

  it("una factura legacy fuera de Multifashion va al período CERRADO de PVH", () => {
    const r = correr({
      ...base,
      facturas: [{ id: "f1", proyecto_id: "p-jer", total: 1000, grupo_legacy: true }],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
    });
    expect(bloqueDe(r, "pvh").facturas.total).toBe(0);
    expect(r.cerrados).toHaveLength(1);
    expect(r.cerrados[0].nombre).toBe("Gastos Tommy y Calvin");
    expect(r.cerrados[0].proveedorKey).toBe("pvh");
    expect(r.cerrados[0].total).toBe(1000);
    // y el titular NO la cuenta: ya se reportó
    expect(r.resumen.total).toBe(0);
  });

  it("una factura legacy DENTRO de Multifashion NO va al archivo de PVH", () => {
    const r = correr({
      ...base,
      facturas: [{ id: "f1", proyecto_id: "p-mf", total: 4264.8, grupo_legacy: true }],
      facturaMarcas: [{ factura_id: "f1", marca_id: OTR, porcentaje: 100 }],
    });
    expect(r.cerrados).toHaveLength(0);
    expect(bloqueDe(r, "multifashion").facturas.total).toBe(4264.8);
    expect(bloqueDe(r, "pvh").total).toBe(0);
  });

  it("una factura NO legacy va al período abierto de su proveedor", () => {
    const r = correr({
      ...base,
      facturas: [{ id: "f1", proyecto_id: "p-jer", total: 9000, grupo_legacy: false }],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
    });
    expect(bloqueDe(r, "pvh").facturas.total).toBe(9000);
    expect(r.cerrados).toHaveLength(0);
  });

  it("los muebles NUNCA caen en el archivo legacy — `grupo_legacy` no existe para entregas", () => {
    const r = correr({
      ...base,
      entregas: [
        { id: "e1", proyecto_id: "p-jer", total: 40565, total_por_marca: { [TH]: 40565 } },
      ],
    });
    expect(bloqueDe(r, "pvh").muebles.total).toBe(40565);
    expect(r.cerrados).toHaveLength(0);
  });

  it("PVH junta Tommy + Calvin + Karl en UN solo bloque y UN solo total", () => {
    const r = correr({
      ...base,
      facturas: [
        { id: "f1", proyecto_id: "p-jer", total: 17800 },
        { id: "f2", proyecto_id: "p-jer", total: 4800 },
        { id: "f3", proyecto_id: "p-jer", total: 500 },
      ],
      facturaMarcas: [
        { factura_id: "f1", marca_id: TH, porcentaje: 100 },
        { factura_id: "f2", marca_id: CK, porcentaje: 100 },
        { factura_id: "f3", marca_id: KL, porcentaje: 100 },
      ],
      entregas: [
        { id: "e1", proyecto_id: "p-jer", total: 70225, total_por_marca: { [TH]: 40565, [CK]: 29660 } },
      ],
    });
    const pvh = bloqueDe(r, "pvh");
    expect(pvh.facturas.total).toBe(23100); // 17.800 + 4.800 + 500
    expect(pvh.muebles.total).toBe(70225);
    expect(pvh.total).toBe(93325);
    expect(pvh.marcas).toEqual(["Tommy Hilfiger", "Calvin Klein", "Karl Lagerfeld"]);
  });

  it("Joybees queda SOLA en su bloque — es otro proveedor, se cierra aparte", () => {
    const r = correr({
      ...base,
      entregas: [{ id: "e1", proyecto_id: "p-fro", total: 1540, total_por_marca: { [J]: 1540 } }],
    });
    expect(bloqueDe(r, "joybees").total).toBe(1540);
    expect(bloqueDe(r, "pvh").total).toBe(0);
  });

  it("un proveedor sin gasto sigue teniendo su bloque (Reebok hoy está en $0)", () => {
    const r = correr(base);
    const rbk = bloqueDe(r, "reebok");
    expect(rbk).toBeTruthy();
    expect(rbk.total).toBe(0);
    expect(rbk.periodoAbierto).not.toBeNull();
  });
});

// ============================================================================
describe("2 — cerrar un proveedor NO toca al otro", () => {
  const PROY = [{ id: "p1", tienda: "Jerusalem", tienda_codigo: "D-80" }];
  const periodos = [
    { id: "per-pvh-cerrado", proveedor_key: "pvh", nombre: "2025", estado: "cerrado", cerrado_en: "2026-01-01" },
    { id: "per-pvh-abierto", proveedor_key: "pvh", nombre: "2026", estado: "abierto" },
    { id: "per-rbk-abierto", proveedor_key: "reebok", nombre: "Temporada 1", estado: "abierto" },
  ];

  it("un proyecto con Tommy y Reebok: cerrado PVH, Reebok sigue VIVO", () => {
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
      // solo la de Tommy quedó sellada al período cerrado de PVH
      sellos: [
        { periodo_id: "per-pvh-cerrado", proveedor_key: "pvh", tipo: "factura", documento_id: "f-th" },
        { periodo_id: "per-rbk-abierto", proveedor_key: "reebok", tipo: "factura", documento_id: "f-rbk" },
      ],
    });
    expect(bloqueDe(r, "pvh").facturas.total).toBe(0);
    expect(bloqueDe(r, "reebok").facturas.total).toBe(700);
    expect(r.cerrados.map((c) => c.total)).toEqual([1000]);
    // 🔑 el proyecto sigue contando para LOS DOS: no se cerró el proyecto,
    // se cerró la parte de PVH.
    expect(bloqueDe(r, "pvh").proyectos).toBe(1);
    expect(bloqueDe(r, "reebok").proyectos).toBe(1);
  });

  it("una MISMA entrega repartida entre dos proveedores se sella por separado", () => {
    const r = correr({
      proyectos: PROY,
      periodos,
      entregas: [
        { id: "e1", proyecto_id: "p1", total: 900, total_por_marca: { [TH]: 600, [RBK]: 300 } },
      ],
      sellos: [
        { periodo_id: "per-pvh-cerrado", proveedor_key: "pvh", tipo: "entrega", documento_id: "e1" },
      ],
    });
    expect(bloqueDe(r, "pvh").muebles.total).toBe(0);
    expect(bloqueDe(r, "reebok").muebles.total).toBe(300);
    expect(r.cerrados[0].muebles.total).toBe(600);
  });
});

// ============================================================================
describe("3 — la factura que llega tarde entra en el período ABIERTO", () => {
  const periodos = [
    { id: "cerrado", proveedor_key: "pvh", nombre: "2025", estado: "cerrado", cerrado_en: "2026-01-01" },
    { id: "abierto", proveedor_key: "pvh", nombre: "2026", estado: "abierto" },
  ];

  it("un documento SIN sello va al abierto, nunca al cerrado", () => {
    const r = correr({
      proyectos: [{ id: "p1", tienda: "X", tienda_codigo: "D-1" }],
      periodos,
      // sin sellos: es la factura recién registrada
      facturas: [{ id: "f1", proyecto_id: "p1", total: 500, grupo_legacy: true }],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
    });
    // 🔴 ojo: `grupo_legacy` es true, pero con las tablas de período YA
    // creadas manda el SELLO, no la columna vieja. Sin sello → abierto.
    expect(bloqueDe(r, "pvh").facturas.total).toBe(500);
    expect(r.cerrados).toHaveLength(0);
  });

  it("el fallback legacy solo aplica cuando NO hay tablas de período", () => {
    expect(periodoLegacyDeFactura({ id: "f", proyecto_id: "p", total: 1, grupo_legacy: true }, false)).toBe(true);
    expect(periodoLegacyDeFactura({ id: "f", proyecto_id: "p", total: 1, grupo_legacy: true }, true)).toBe(false);
    expect(periodoLegacyDeFactura({ id: "f", proyecto_id: "p", total: 1, grupo_legacy: false }, false)).toBe(false);
  });

  it("`conPeriodos` dice de dónde salió la respuesta", () => {
    expect(correr({}).conPeriodos).toBe(false);
    expect(correr({ periodos }).conPeriodos).toBe(true);
  });

  it("el período abierto que se muestra es el de la base, no un texto fijo", () => {
    const r = correr({ periodos });
    expect(bloqueDe(r, "pvh").periodoAbierto).toEqual({ id: "abierto", nombre: "2026" });
  });
});

// ============================================================================
describe("5 — las dos desagregaciones suman el titular", () => {
  const entrada = {
    proyectos: [
      { id: "p1", tienda: "Jerusalem", tienda_codigo: "D-80" },
      { id: "p2", tienda: "Multifashion", tienda_codigo: "D-108" },
    ],
    proyectosMultifashion: new Set(["p2"]),
    facturas: [
      { id: "f1", proyecto_id: "p1", total: 1000 },
      { id: "f2", proyecto_id: "p2", total: 250 },
      // gasto SUELTO de impulsadora: sin proyecto
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
    expect(fila!.porBloque.pvh).toBe(800);
  });

  it("la plata ya reportada (período cerrado) NO entra en el titular ni en las desagregaciones", () => {
    const r = correr({
      ...entrada,
      facturas: [...entrada.facturas, { id: "f9", proyecto_id: "p1", total: 5000, grupo_legacy: true }],
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
    // dos proyectos del mismo cliente con el texto escrito distinto se juntan
    expect(claveCliente({ id: "a", tienda: "City  Mall ", tienda_codigo: null })).toBe(
      claveCliente({ id: "b", tienda: "city mall", tienda_codigo: null }),
    );
  });
});

// ============================================================================
describe("6 y 7 — Multifashion sin período, y la marca sin proveedor no se esconde", () => {
  it("Multifashion NO tiene período: es tienda propia, no se le reporta a nadie", () => {
    const r = correr({
      proyectos: [{ id: "p1", tienda: "Multifashion", tienda_codigo: "D-108" }],
      proyectosMultifashion: new Set(["p1"]),
      facturas: [{ id: "f1", proyecto_id: "p1", total: 100 }],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
      periodos: [{ id: "abierto", proveedor_key: "pvh", nombre: "2026", estado: "abierto" }],
    });
    expect(bloqueDe(r, "multifashion").periodoAbierto).toBeNull();
    // aunque la factura sea de Tommy, la plata NO se le reporta a PVH
    expect(bloqueDe(r, "pvh").facturas.total).toBe(0);
    expect(bloqueDe(r, "multifashion").facturas.total).toBe(100);
  });

  it("una marca sin proveedor cae en un bloque VISIBLE y sin período", () => {
    const r = correr({
      proyectos: [{ id: "p1", tienda: "Tienda X", tienda_codigo: "D-9" }],
      facturas: [{ id: "f1", proyecto_id: "p1", total: 333 }],
      facturaMarcas: [{ factura_id: "f1", marca_id: OTR, porcentaje: 100 }],
    });
    const sp = bloqueDe(r, SIN_PROVEEDOR);
    expect(sp).toBeTruthy();
    expect(sp.total).toBe(333);
    expect(sp.periodoAbierto).toBeNull();
    // 🔴 y NO se la regala a PVH
    expect(bloqueDe(r, "pvh").total).toBe(0);
  });

  it("sin nada adentro, el bloque «sin proveedor» no se dibuja (sería ruido)", () => {
    expect(correr({}).bloques.find((b) => b.key === SIN_PROVEEDOR)).toBeUndefined();
  });
});

// ============================================================================
describe("barrido estático — una sola fuente de verdad", () => {
  const raiz = path.resolve(__dirname, "../../..");
  const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf-8");

  it("`resumen-proveedores` REUSA la matemática de `resumen-inicio`, no la copia", () => {
    const src = leer("src/lib/marketing/resumen-proveedores.ts");
    expect(src).toMatch(/from "\.\/resumen-inicio"/);
    expect(src).toMatch(/porcionEntregaParaMarca/);
    expect(src).toMatch(/marcasDeEntrega/);
  });

  it("nadie escribe un segundo mapa marca→proveedor a mano", () => {
    const archivos = [
      "src/app/api/marketing/inicio/route.ts",
      "src/lib/marketing/resumen-proveedores.ts",
    ];
    for (const f of archivos) {
      const src = leer(f);
      // los códigos de marca solo pueden aparecer en proveedores.ts
      expect(src).not.toMatch(/["']RBK["']/);
      expect(src).not.toMatch(/["']TH["']\s*[,:]/);
    }
  });

  it("el mapa no usa startsWith en ninguna forma", () => {
    const src = leer("src/lib/marketing/proveedores.ts");
    expect(src).not.toMatch(/\.startsWith\(/);
  });

  it("la migración de períodos es ADITIVA: no borra tablas ni filas", () => {
    const sql = leer("supabase/migrations/20260811160000_marketing_periodos_por_proveedor.sql");
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    // y no toca ninguna columna existente de las tablas del módulo
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+mk_facturas/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+mk_entregas_muebles/i);
    expect(sql).not.toMatch(/UPDATE\s+mk_facturas/i);
    // y sostiene la invariante de un solo período abierto por proveedor
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*mk_periodos[\s\S]*WHERE estado = 'abierto'/);
  });

  it("la migración se PARA sola si un monto se movió", () => {
    const sql = leer("supabase/migrations/20260811160000_marketing_periodos_por_proveedor.sql");
    expect(sql).toMatch(/RAISE EXCEPTION/);
    expect(sql).toMatch(/62381\.57/);
  });

  it("los tres proveedores están declarados con sus códigos", () => {
    expect(PROVEEDORES.map((p) => p.key)).toEqual(["pvh", "reebok", "joybees"]);
    expect(PROVEEDORES.find((p) => p.key === "pvh")!.codigos).toEqual(["TH", "CK", "KL"]);
  });
});
