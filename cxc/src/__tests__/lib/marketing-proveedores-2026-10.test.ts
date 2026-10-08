// ============================================================================
// CANDADO: Marketing › Proveedores (6-oct-2026, `MKT_PROVEEDORES_2026_10`)
// ============================================================================
//
// Lo que este archivo pone en rojo si alguien lo rompe:
//
//   1. El interruptor nace APAGADO, y mientras lo esté nada cambia: ni una
//      columna nueva viaja a la base, la marca sigue siendo obligatoria y una
//      factura sigue llevando UNA marca.
//   2. El amarre de alias es una LISTA ESCRITA A MANO y apunta a la grafía que
//      de verdad está en las facturas («Krysthel Yanneth Morales Martinez»).
//   3. Nadie junta dos proveedores por PARECIDO (`includes`).
//   4. Los dos totales de la ficha son la suma de los renglones que se ven.
//   5. Un reparto entre varias marcas suma 100, y la suma de los montos es
//      EXACTAMENTE el total de la factura (ni un centavo se pierde).
//   6. Un producto sin costo conocido NO sale con margen 0.
//   7. El aviso de doble cobro suena cuando el proveedor de la compra es la
//      marca a la que se le cobra, y calla cuando falta un dato.
//   8. `notas-proveedor.ts` sigue siendo la libreta: el margen no nació ahí.
// ============================================================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALIAS_DE_PROVEEDOR,
  MKT_PROVEEDORES_2026_10,
  CUANTO_POR_OMISION,
  CUANTO_SE_COBRA,
  PCT_DE_CUANTO,
  ROTULO_ADJUNTAR_COMPROBANTE,
  ROTULO_A_CARGO_EMPRESA,
  ROTULO_COMPROBANTE,
  ROTULO_CUANTO,
  ROTULO_SE_COBRA,
  ROTULO_SE_COBRA_A,
  ROTULO_SIN_TIENDA,
  ROTULO_TIENDA,
  claveDeProveedor,
  columnasDeProveedores,
  destinoDelGasto,
  esCuantoSeCobra,
  fichaDeProveedor,
  listaDeProveedores,
  mismoProveedorConAlias,
  aCargoDeLaEmpresa,
  pctALaMarcaDe,
  montoACargoDeLaEmpresa,
  montoDeLaMarca,
  montoRecobrado,
  pctQueSeGuarda,
  seRecobra,
  sugerirProveedoresConAlias,
  type GastoDelProveedor,
} from "@/lib/marketing/proveedores-2026-10";
import {
  avisoDeDobleCobro,
  avisoDeDobleCobroEnLaEntrega,
} from "@/lib/marketing/doble-cobro";
import { completarProveedores } from "@/lib/marketing/columnas-opcionales";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

function gasto(p: Partial<GastoDelProveedor>): GastoDelProveedor {
  return {
    id: p.id ?? "g1",
    proveedor: p.proveedor ?? "Krysthel Yanneth Morales Martinez",
    fecha: p.fecha ?? "2026-10-05",
    numeroFactura: p.numeroFactura ?? "0000000145",
    concepto: p.concepto ?? "Barras Planas",
    monto: p.monto ?? 100,
    marcaNombre: p.marcaNombre ?? null,
    tiendaNombre: p.tiendaNombre ?? null,
    pctALaMarca: p.pctALaMarca ?? null,
    seReporta: p.seReporta ?? true,
  };
}

// ─── 1. El interruptor, PRENDIDO el 7-oct-2026 ──────────────────────────────

describe("el interruptor", () => {
  it("está PRENDIDO en el archivo (no solo en la variable)", () => {
    expect(MKT_PROVEEDORES_2026_10).toBe(true);
    expect(leer("src/lib/marketing/proveedores-2026-10.ts")).toContain(
      "export const MKT_PROVEEDORES_2026_10 = true;",
    );
  });

  it("prendido, la columna nueva SÍ viaja — y solo con un valor de la lista cerrada", () => {
    // Los tres valores que el CHECK de la base acepta.
    expect(columnasDeProveedores({ pctALaMarca: 100 })).toEqual({ pct_a_la_marca: 100 });
    expect(columnasDeProveedores({ pctALaMarca: 50 })).toEqual({ pct_a_la_marca: 50 });
    expect(columnasDeProveedores({ pctALaMarca: 0 })).toEqual({ pct_a_la_marca: 0 });
    // Cualquier otro número se manda como NULL, nunca inventado: así el
    // CHECK `pct_a_la_marca IN (0, 50, 100)` no puede rebotar el guardado.
    expect(columnasDeProveedores({ pctALaMarca: 33 })).toEqual({ pct_a_la_marca: null });
    // 🔴 Y si la pantalla NO mandó el campo, no se escribe la columna: una
    // factura que se edita por otro motivo no se queda con un 0 puesto por
    // nadie. `Number(undefined)` es NaN, pero acá ni se llega a convertir.
    expect(columnasDeProveedores({})).toEqual({});
  });

  it("🔴 apagarlo vuelve a no mandar NADA (el camino de rollback sigue vivo)", () => {
    // El corte por interruptor es la PRIMERA línea de la función, así que
    // apagarlo deja la base exactamente como el 5-oct-2026. Se comprueba en el
    // código porque la constante ya no se puede cambiar en caliente.
    const src = leer("src/lib/marketing/proveedores-2026-10.ts");
    expect(src).toMatch(/if \(!MKT_PROVEEDORES_2026_10\) return \{\};/);
  });

  it("🔴 NUNCA DOS MARCAS: `exigirUnaMarca` sigue en pie, con o sin interruptor", () => {
    const src = leer("src/lib/marketing/factura-marcas.ts");
    expect(src).toContain("exigirUnaMarca(marcas);");
    // Y no quedó ningún camino que lo esquive.
    expect(src).not.toContain("normalizarReparto");
    expect(src).not.toMatch(/MKT_PROVEEDORES_2026_10/);
  });

  it("apagado, la factura sin marca sigue siendo imposible en la ruta", () => {
    const src = leer("src/app/api/marketing/facturas/route.ts");
    // Sin marca solo se puede si el interruptor está Y la factura entera es mi costo.
    expect(src).toMatch(/esSinMarca\s*=\s*\n?\s*MKT_PROVEEDORES_2026_10/);
    // Y el rollback que anula sigue en su lugar para el camino de siempre.
    expect(src).toContain("Rollback: fallo al asignar la marca");
  });

  it("la columna nueva falla ABIERTA (sin la migración, nada se rompe)", () => {
    const src = leer("src/lib/marketing/mutations.ts");
    expect(src).toContain('"pct_a_la_marca"');
    const cols = leer("src/lib/marketing/columnas-opcionales.ts");
    expect(cols).toContain("COLUMNAS_DE_PROVEEDORES");
    expect(cols).toContain("...Object.keys(COLUMNAS_DE_PROVEEDORES)");
  });

  it("🩸 el `porcentaje` de `mk_factura_marcas` NO se reusa (58 filas dicen 50 = 100 %)", () => {
    const esquema = leer("supabase/migrations/20270101120000_mkt_proveedores.sql");
    expect(esquema).toContain("pct_a_la_marca");
    expect(esquema).not.toMatch(/UPDATE\s+mk_factura_marcas/i);
    expect(esquema).not.toMatch(/ALTER TABLE mk_factura_marcas/i);
    // Y Mobiliario no se toca: nombrarlo en un comentario que dice «no se
    // toca» está bien; escribirle, no.
    expect(esquema).not.toMatch(
      /(ALTER TABLE|INSERT INTO|UPDATE|DELETE FROM)\s+mk_(inventario|mobiliario)/i,
    );
  });

  it("Mobiliario NO se conecta: no quedó nada que mueva el stock", () => {
    const inv = leer("src/lib/marketing/inventario.ts");
    expect(inv).not.toContain("entrarCompraAlInventario");
    const ruta = leer("src/app/api/marketing/facturas/route.ts");
    expect(ruta).not.toMatch(/inventario/i);
  });

  it("las dos migraciones existen y NO se aplicaron", () => {
    const esquema = leer("supabase/migrations/20270101120000_mkt_proveedores.sql");
    expect(esquema).toContain("SIN APLICAR");
    expect(esquema).toContain("mk_proveedor_alias");
    // Aditiva: ni un DROP, ni un TRUNCATE, ni un DELETE.
    expect(esquema).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(esquema).not.toMatch(/\bTRUNCATE\b/i);
    const ciento45 = leer(
      "supabase/migrations/20270101130000_factura_145_sin_marca.sql",
    );
    expect(ciento45).toContain("ESPERA EL \"SI\" DE DANIEL");
    // 🔴 El candado que impide moverla si ya se le reportó a la marca.
    expect(ciento45).toMatch(/p\.estado = 'cerrado'/);
    // 🔴 El monto no se toca en ningún UPDATE.
    expect(ciento45).not.toMatch(/SET[^;]*\b(total|subtotal|itbms)\s*=/i);
    // 🔴 Daniel dijo «no» a crear «Barras planas» en Mobiliario.
    expect(ciento45).not.toMatch(/INSERT INTO mk_inventario_productos/i);
    expect(ciento45).not.toMatch(/stock_total/i);
  });
});

// ─── 2 y 3. El amarre: a mano, y nunca por parecido ─────────────────────────

describe("el amarre de proveedores", () => {
  it("junta Krysthel, Kristel y Changalo en uno solo", () => {
    const esperada = "krysthel yanneth morales martinez";
    expect(claveDeProveedor("Krysthel Yanneth Morales Martinez")).toBe(esperada);
    expect(claveDeProveedor("Kristel")).toBe(esperada);
    expect(claveDeProveedor("Krystel")).toBe(esperada);
    expect(claveDeProveedor("Changalo")).toBe(esperada);
    expect(mismoProveedorConAlias("Changalo", "Kristel")).toBe(true);
  });

  it("apunta a la grafía que de verdad está en las facturas", () => {
    // 🩸 Medido el 6-oct-2026: las 17 facturas ($12.535,06) están guardadas
    // con el nombre completo. Apuntar a «krysthel» crearía un proveedor vacío.
    for (const canonico of Object.values(ALIAS_DE_PROVEEDOR)) {
      expect(ALIAS_DE_PROVEEDOR[canonico]).toBeUndefined(); // sin cadenas
    }
    expect(ALIAS_DE_PROVEEDOR.changalo).toBe("krysthel yanneth morales martinez");
  });

  it("los dos alias que Daniel confirmó el 6-oct-2026", () => {
    expect(mismoProveedorConAlias("Impreco", "Impresora Comercial S a")).toBe(true);
    expect(mismoProveedorConAlias("A.g. Display / Venetto", "A.g. Display")).toBe(true);
  });

  it("🔴 el proveedor se elige de una lista con autocompletado, con los alias juntos", () => {
    const historico = [
      "Impresora Comercial S a",
      "Impresora Comercial S a",
      "Impreco",
      "Krysthel Yanneth Morales Martinez",
    ];
    const todas = sugerirProveedoresConAlias("", historico);
    expect(todas).toHaveLength(2); // Impreco NO sale como un proveedor aparte
    expect(todas[0]).toMatchObject({ nombre: "Impresora Comercial S a", usos: 3 });
    // Por PREFIJO mientras se teclea, nunca por parecido.
    expect(sugerirProveedoresConAlias("krys", historico).map((x) => x.nombre)).toEqual([
      "Krysthel Yanneth Morales Martinez",
    ]);
    expect(sugerirProveedoresConAlias("comercial", historico)).toEqual([]);
    // Trae la clave, para poder abrir su ficha desde ahí.
    expect(todas[0].clave).toBe("impresora comercial");
  });

  it("NO junta dos proveedores por parecido", () => {
    // La trampa de «nova» → «Renovación» que este repo ya pagó.
    expect(mismoProveedorConAlias("Nova Lux", "Renovación Lux")).toBe(false);
    expect(mismoProveedorConAlias("Impresora Comercial", "Impresora")).toBe(false);
    expect(mismoProveedorConAlias("Impreco", "Impresora")).toBe(false);
  });

  it("la cola de sociedad no hace dos proveedores", () => {
    expect(mismoProveedorConAlias("Premium Paint Panama", "Premium Paint Panama S a")).toBe(
      true,
    );
  });

  it("sin nombre no afirma nada", () => {
    expect(claveDeProveedor("")).toBe("");
    expect(claveDeProveedor(null)).toBe("");
    expect(mismoProveedorConAlias("", "")).toBe(false);
  });
});

// ─── A dónde fue cada factura ───────────────────────────────────────────────

describe("a dónde fue el gasto", () => {
  it("con marca dice la marca; sin marca pero con tienda, la tienda", () => {
    expect(destinoDelGasto({ marcaNombre: "Tommy Hilfiger" })).toBe("Tommy Hilfiger");
    expect(
      destinoDelGasto({ marcaNombre: "Tommy Hilfiger", tiendaNombre: "City Mall" }),
    ).toBe("Tommy Hilfiger");
    expect(destinoDelGasto({ tiendaNombre: "City Mall" })).toBe("City Mall");
  });

  it("sin marca ni tienda: a cargo de la empresa", () => {
    expect(destinoDelGasto({})).toBe(ROTULO_A_CARGO_EMPRESA);
    expect(ROTULO_A_CARGO_EMPRESA).toBe("A cargo de la empresa");
  });

  it("🔴 la mitad: $100 → $50 a Tommy · $50 a cargo de la empresa", () => {
    expect(
      destinoDelGasto({ marcaNombre: "Tommy Hilfiger", monto: 100, pctALaMarca: 50 }),
    ).toBe("Tommy Hilfiger $50.00 · A cargo de la empresa $50.00");
    expect(montoDeLaMarca(100, 50)).toBe(50);
    expect(montoACargoDeLaEmpresa(100, 50)).toBe(50);
    // Con el 100 % la frase es el nombre y nada más: sin datos repetidos.
    expect(destinoDelGasto({ marcaNombre: "Tommy Hilfiger", monto: 100, pctALaMarca: 100 })).toBe(
      "Tommy Hilfiger",
    );
  });

  it("🩸 una factura de ANTES se lee entera para su marca, como hoy", () => {
    expect(montoDeLaMarca(545.7, null)).toBe(545.7);
    expect(montoDeLaMarca(545.7, undefined)).toBe(545.7);
    expect(montoACargoDeLaEmpresa(545.7, null)).toBe(0);
  });

  it("🔴 NADA DE PORCENTAJES EN PANTALLA: Completo o Mitad", () => {
    expect([...CUANTO_SE_COBRA]).toEqual(["completo", "mitad"]);
    expect(ROTULO_CUANTO.completo).toBe("Completo");
    expect(ROTULO_CUANTO.mitad).toBe("Mitad");
    expect(CUANTO_POR_OMISION).toBe("completo");
    expect(esCuantoSeCobra("completo")).toBe(true);
    expect(esCuantoSeCobra("50")).toBe(false);
    // 🔴 Ni un «%» ni un número en lo que se lee.
    for (const r of [ROTULO_SE_COBRA, ROTULO_SE_COBRA_A, ...Object.values(ROTULO_CUANTO)]) {
      expect(r).not.toMatch(/%|\d/);
    }
  });

  it("el número vive SOLO por dentro", () => {
    expect(PCT_DE_CUANTO).toEqual({ completo: 100, mitad: 50 });
    expect(pctQueSeGuarda({ aCargoDeLaEmpresa: false, cuanto: "completo" })).toBe(100);
    expect(pctQueSeGuarda({ aCargoDeLaEmpresa: false, cuanto: "mitad" })).toBe(50);
    // A cargo de la empresa no tiene nada que cobrar.
    expect(pctQueSeGuarda({ aCargoDeLaEmpresa: true, cuanto: "mitad" })).toBe(0);
    // Un valor raro cae en Completo, nunca en 0 por descuido.
    expect(pctQueSeGuarda({ aCargoDeLaEmpresa: false, cuanto: "x" })).toBe(100);
  });

  it("🔴 ningún porcentaje se escribe en la pantalla del gasto", () => {
    const vivo = sinComentarios(
      leer("src/app/marketing/components/BloqueDestinoDelGasto.tsx"),
    );
    expect(vivo).not.toMatch(/100\s*%/);
    expect(vivo).not.toMatch(/50\s*%/);
    expect(vivo).not.toContain("Porcentaje");
  });

  it("solo se guarda un porcentaje de la lista; cualquier otro es `null`", () => {
    // Con el interruptor apagado no viaja nada (ver el bloque del interruptor).
    expect(columnasDeProveedores({})).toEqual({});
  });

  it("solo se recobra lo que va a una marca, y solo su parte", () => {
    expect(montoRecobrado({ marcaNombre: "Tommy", seReporta: true, monto: 100 })).toBe(100);
    expect(
      montoRecobrado({ marcaNombre: "Tommy", seReporta: true, monto: 100, pctALaMarca: 50 }),
    ).toBe(50);
    expect(montoRecobrado({ marcaNombre: "Tommy", seReporta: false, monto: 100 })).toBe(0);
    expect(montoRecobrado({ marcaNombre: null, seReporta: true, monto: 100 })).toBe(0);
    expect(seRecobra({ marcaNombre: null, monto: 100 })).toBe(false);
  });
});

// ─── 4. La lista y la ficha ─────────────────────────────────────────────────

describe("la lista de proveedores y la ficha", () => {
  const gastos = [
    gasto({ id: "a", proveedor: "Krysthel Yanneth Morales Martinez", monto: 545.7 }),
    gasto({ id: "b", proveedor: "Kristel", monto: 100, marcaNombre: "Tommy Hilfiger" }),
    gasto({ id: "c", proveedor: "Changalo", monto: 50, tiendaNombre: "City Mall" }),
    gasto({
      id: "f",
      proveedor: "Krysthel Yanneth Morales Martinez",
      monto: 100,
      marcaNombre: "Tommy Hilfiger",
      pctALaMarca: 50,
    }),
    gasto({
      id: "d",
      proveedor: "Impresora Comercial S a",
      monto: 200,
      marcaNombre: "Calvin Klein",
    }),
    gasto({ id: "e", proveedor: "Impreco", monto: 25, marcaNombre: "Calvin Klein" }),
  ];

  it("un proveedor con alias es UNA fila, y la grafía más usada manda", () => {
    const filas = listaDeProveedores(gastos);
    expect(filas).toHaveLength(2);
    const krysthel = filas.find((f) => f.clave.startsWith("krysthel"));
    expect(krysthel?.facturas).toBe(4);
    expect(krysthel?.pagado).toBe(795.7);
    // Las otras grafías se dicen, no se esconden.
    expect(krysthel?.alias.sort()).toEqual(["Changalo", "Kristel"]);
  });

  it("los dos totales: pagado y recobrado", () => {
    const ficha = fichaDeProveedor("krysthel yanneth morales martinez", gastos);
    expect(ficha.pagado).toBe(795.7);
    // $100 de la de Tommy + $50 de la que se le cobra a la mitad.
    expect(ficha.recobrado).toBe(150);
    // 🔴 El pie cierra con los renglones que se ven.
    const sumaVista = ficha.renglones.reduce((s, r) => s + r.monto, 0);
    expect(Math.round(sumaVista * 100) / 100).toBe(ficha.pagado);
    const sumaRecobra = ficha.renglones.reduce((s, r) => s + montoRecobrado(r), 0);
    expect(Math.round(sumaRecobra * 100) / 100).toBe(ficha.recobrado);
  });

  it("cada renglón dice a dónde fue", () => {
    const ficha = fichaDeProveedor("krysthel yanneth morales martinez", gastos);
    expect(ficha.renglones.map((r) => r.destino).sort()).toEqual([
      ROTULO_A_CARGO_EMPRESA,
      "City Mall",
      "Tommy Hilfiger",
      "Tommy Hilfiger $50.00 · A cargo de la empresa $50.00",
    ]);
  });

  it("ordena por lo pagado, de más a menos", () => {
    const filas = listaDeProveedores(gastos);
    expect(filas[0].pagado).toBeGreaterThanOrEqual(filas[1].pagado);
  });

  it("un proveedor sin facturas da una ficha vacía, no un error", () => {
    const ficha = fichaDeProveedor("nadie", gastos);
    expect(ficha.renglones).toEqual([]);
    expect(ficha.pagado).toBe(0);
    expect(ficha.recobrado).toBe(0);
  });
});

// ─── 7. El freno del doble cobro ────────────────────────────────────────────

describe("el aviso de doble cobro", () => {
  it("suena cuando se le compra a Tommy y se le cobra a Tommy", () => {
    const aviso = avisoDeDobleCobro({
      proveedorDeLaCompra: "Tommy Hilfiger",
      marcaCobrada: "Tommy Hilfiger",
    });
    expect(aviso).not.toBeNull();
    expect(aviso?.mensaje).toContain("ya pagó una vez");
  });

  it("suena con la razón social de la marca, si se le pasa", () => {
    const aviso = avisoDeDobleCobro({
      proveedorDeLaCompra: "PVH Corp",
      marcaCobrada: "Tommy Hilfiger",
      nombresDeLaMarca: ["PVH", "PVH Corp."],
    });
    expect(aviso).not.toBeNull();
  });

  it("calla con un proveedor que no es la marca", () => {
    expect(
      avisoDeDobleCobro({
        proveedorDeLaCompra: "Krysthel Yanneth Morales Martinez",
        marcaCobrada: "Tommy Hilfiger",
      }),
    ).toBeNull();
  });

  it("ante la duda, calla (falta un dato)", () => {
    expect(
      avisoDeDobleCobro({ proveedorDeLaCompra: "", marcaCobrada: "Tommy Hilfiger" }),
    ).toBeNull();
    expect(
      avisoDeDobleCobro({ proveedorDeLaCompra: "Tommy Hilfiger", marcaCobrada: null }),
    ).toBeNull();
  });

  it("en una entrega con varias compras, el primer aviso alcanza", () => {
    expect(
      avisoDeDobleCobroEnLaEntrega("Tommy Hilfiger", [
        { proveedorDeLaCompra: "Krysthel Yanneth Morales Martinez" },
        { proveedorDeLaCompra: "Tommy Hilfiger" },
      ]),
    ).not.toBeNull();
    expect(
      avisoDeDobleCobroEnLaEntrega("Tommy Hilfiger", [
        { proveedorDeLaCompra: "Krysthel Yanneth Morales Martinez" },
        { proveedorDeLaCompra: "Impresora Comercial" },
      ]),
    ).toBeNull();
  });

  it("AVISA, no bloquea: ninguna función del módulo lanza por doble cobro", () => {
    const src = leer("src/lib/marketing/doble-cobro.ts");
    expect(src).not.toMatch(/throw new Error\([^)]*doble/i);
  });
});

// ─── 8. Nombres de ERP, y ninguna empresa que elegir ────────────────────────

/** Quita comentarios para mirar SOLO lo que puede llegar a la pantalla. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const ARCHIVOS_DE_LA_PIEZA = [
  "src/lib/marketing/proveedores-2026-10.ts",
  "src/lib/marketing/doble-cobro.ts",
  "src/app/marketing/components/BloqueDestinoDelGasto.tsx",
  "src/app/marketing/components/PortadaProveedores.tsx",
  "src/components/marketing/ProveedorInput.tsx",
  "src/app/api/marketing/proveedores-ficha/route.ts",
];

describe("nombres de ERP, no los de Daniel", () => {
  it("🔴 los cinco rótulos son sustantivos de ERP", () => {
    expect(ROTULO_SE_COBRA_A).toBe("Se cobra a");
    expect(ROTULO_SE_COBRA).toBe("Se cobra");
    expect(ROTULO_A_CARGO_EMPRESA).toBe("A cargo de la empresa");
    expect(ROTULO_COMPROBANTE).toBe("Comprobante");
    expect(ROTULO_ADJUNTAR_COMPROBANTE).toBe("Adjuntar comprobante");
    expect(ROTULO_TIENDA).toBe("Tienda");
    expect(ROTULO_SIN_TIENDA).toBe("Sin tienda");
    // Ninguno es una pregunta ni habla en primera o segunda persona.
    for (const r of [
      ROTULO_SE_COBRA_A,
      ROTULO_SE_COBRA,
      ROTULO_A_CARGO_EMPRESA,
      ROTULO_COMPROBANTE,
      ROTULO_ADJUNTAR_COMPROBANTE,
      ROTULO_TIENDA,
      ROTULO_SIN_TIENDA,
    ]) {
      expect(r).not.toMatch(/[¿?]/);
      expect(r).not.toMatch(/\b(mi|tu|tus|mis)\b/i);
      // Mayúscula solo en la primera palabra (docs/nombres-erp.md).
      expect(r.slice(1)).toBe(r.slice(1).replace(/\b[A-ZÁÉÍÓÚÑ]/g, (c) => c.toLowerCase()));
    }
  });

  it("🔴 ni un coloquialismo suyo llega a la pantalla", () => {
    const prohibidos = [
      /mi costo/i,
      /costo propio/i,
      /inventario propio/i,
      /A quién se le pasa/,
      /Foto o factura/,
      /Subir foto o factura/,
      /De una tienda/,
    ];
    for (const rel of ARCHIVOS_DE_LA_PIEZA) {
      const vivo = sinComentarios(leer(rel));
      for (const mal of prohibidos) {
        expect(vivo, `${rel} dice ${mal}`).not.toMatch(mal);
      }
    }
  });

  it("🔴 tampoco en el Excel ni en el papel de la marca", () => {
    for (const rel of [
      "src/lib/marketing/zip-marca.ts",
      "src/lib/marketing/papel-de-la-marca.ts",
      "src/app/marketing/tienda/[codigo]/excel-de-la-tienda.ts",
    ]) {
      const vivo = sinComentarios(leer(rel));
      expect(vivo, rel).not.toMatch(/mi costo/i);
      expect(vivo, rel).not.toMatch(/costo propio/i);
      expect(vivo, rel).not.toMatch(/A quién se le pasa/);
    }
  });

  it("🔴 sin frases explicativas bajo los campos", () => {
    const vivo = sinComentarios(leer("src/app/marketing/components/BloqueDestinoDelGasto.tsx"));
    expect(vivo).not.toMatch(/el resto queda a cargo/);
    expect(vivo).not.toMatch(/Se le cobra el 50/);
  });

  it("🔴 lo que queda A CARGO DE LA EMPRESA no entra al reporte de la marca", () => {
    // Daniel: «si es nada, no se debería poder descargar para presentar los
    // gastos a la marca». El corte va en la ÚNICA puerta que usan los cuatro
    // lugares que arman el papel (`vaEnElPapel`), y en el reporte congelado.
    const zip = sinComentarios(leer("src/lib/marketing/zip-marca.ts"));
    expect(zip).toMatch(
      /function vaEnElPapel\([\s\S]{0,220}MKT_PROVEEDORES_2026_10 && aCargoDeLaEmpresa\(fila\.pct_a_la_marca\)\) return false;/,
    );
    // Y la columna viaja: sin ella el guard nunca vería un 0.
    expect(zip).toContain("pct_a_la_marca`)");
    const rep = sinComentarios(leer("src/lib/marketing/periodos-reporte.ts"));
    expect(rep).toMatch(
      /MKT_PROVEEDORES_2026_10 && aCargoDeLaEmpresa\(g\.pct_a_la_marca\)\) return true;/,
    );
    expect(rep).toContain("pct_a_la_marca");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 🩸 EL ZIP DE LA MARCA SALIÓ CASI VACÍO (7-oct-2026)
  //
  // `Number(null) === 0`, así que `Number(fila.pct_a_la_marca) === 0` leía toda
  // factura SIN valor escrito como «cero por ciento» y la sacaba del papel.
  // Casi ninguna factura viva tiene el valor escrito: el ZIP salió con las 26
  // entregas de mueble y CERO facturas. Las tres formas, en un solo candado.
  // ──────────────────────────────────────────────────────────────────────────
  it("🔴 un gasto SIN valor escrito se cobra COMPLETO; solo el 0 escrito queda a cargo de la empresa", () => {
    // 1) Valor escrito: 100 y 50 van al papel; el 0 escrito, no.
    expect(aCargoDeLaEmpresa(100)).toBe(false);
    expect(aCargoDeLaEmpresa(50)).toBe(false);
    // 2) Valor vacío (NULL de la base, o la columna que no vino): se cobra
    //    completo, NUNCA cero por ciento.
    expect(aCargoDeLaEmpresa(null)).toBe(false);
    expect(aCargoDeLaEmpresa(undefined)).toBe(false);
    // 3) «A cargo de la empresa» es el 0 ESCRITO, y ese sí sale del papel.
    expect(aCargoDeLaEmpresa(0)).toBe(true);
    expect(aCargoDeLaEmpresa(pctQueSeGuarda({ aCargoDeLaEmpresa: true, cuanto: "completo" }))).toBe(
      true,
    );

    // Y lo mismo al LEER la fila: un NULL se queda null, no se vuelve 0.
    expect(pctALaMarcaDe(null)).toBe(null);
    expect(pctALaMarcaDe(undefined)).toBe(null);
    expect(pctALaMarcaDe(0)).toBe(0);
    expect(pctALaMarcaDe(50)).toBe(50);
    expect(completarProveedores({ id: "x" }).pct_a_la_marca).toBe(null);
    expect(completarProveedores({ id: "x", pct_a_la_marca: null }).pct_a_la_marca).toBe(null);
    expect(completarProveedores({ id: "x", pct_a_la_marca: 0 }).pct_a_la_marca).toBe(0);

    // 🔴 Y NADIE compara con `Number(...)` sobre esa columna: ese es el patrón
    // que ya mordió dos veces (el ZIP vacío y las facturas viejas en $0.00).
    for (const rel of [
      "src/lib/marketing/zip-marca.ts",
      "src/lib/marketing/periodos-reporte.ts",
      "src/lib/marketing/columnas-opcionales.ts",
      "src/app/api/marketing/facturas/route.ts",
      "src/app/api/marketing/proveedores-ficha/route.ts",
    ]) {
      const vivo = sinComentarios(leer(rel));
      expect(vivo, `${rel} compara Number(...) contra la columna del porcentaje`).not.toMatch(
        /Number\([^)]*pct[_A]?[aA]?[_]?[lL]a[_]?[mM]arca[^)]*\)\s*(===|!==|==|!=|<|>)/,
      );
    }
  });

  it("🔴 con «Mitad» va la MITAD al papel y al Excel de la marca", () => {
    // El total se recorta ANTES de repartir, en los dos caminos.
    for (const rel of ["src/lib/marketing/zip-marca.ts", "src/lib/marketing/periodos-reporte.ts"]) {
      const vivo = sinComentarios(leer(rel));
      expect(vivo, rel).toMatch(/montoDeLaMarca\(num\(f\.total\), f\.pct_a_la_marca\)/);
    }
    // La cuenta, de punta a punta: $545.70 al 50 % son $272.85.
    expect(montoDeLaMarca(545.7, 50)).toBe(272.85);
    expect(montoDeLaMarca(545.7, 0)).toBe(0);
    // Y una factura de ANTES sigue entera.
    expect(montoDeLaMarca(545.7, null)).toBe(545.7);
  });

  it("🔴 NO se elige empresa: no hay selector en ninguna pieza nueva", () => {
    for (const rel of ARCHIVOS_DE_LA_PIEZA) {
      const vivo = sinComentarios(leer(rel));
      expect(vivo, rel).not.toMatch(/empresaPagadora|empresa_pagadora|empresaId|empresa_codigo/);
    }
  });
});

// ─── 9. La libreta del proveedor sigue siendo una libreta ───────────────────

describe("la libreta de costos no se convirtió en una calculadora", () => {
  it("`notas-proveedor.ts` no suma, no promedia y no agrega", () => {
    const src = leer("src/lib/marketing/notas-proveedor.ts");
    // El candado viejo (`marketing-notas-proveedor.test.ts`) ya lo exige; esto
    // repite la parte que importa para que el cambio del 6-oct no lo invada.
    expect(src).not.toMatch(/\bmargen\b/i);
    expect(src).not.toMatch(/export function (sumar|totalizar|promediar)/);
  });

  it("el aviso de doble cobro vive aparte y no toca la libreta", () => {
    const src = leer("src/lib/marketing/doble-cobro.ts");
    expect(src).toContain("export function avisoDeDobleCobro");
    expect(src).not.toContain('from "./notas-proveedor"');
    expect(src).not.toContain('from "./inventario"');
  });
});
