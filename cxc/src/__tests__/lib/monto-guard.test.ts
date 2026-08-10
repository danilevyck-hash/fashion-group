/**
 * Candado del guard de montos imposibles.
 *
 * ⚠️ EL TEST QUE MÁS IMPORTA ES `los picos históricos REALES pasan todos`.
 * El riesgo de este guard NO es dejar pasar una fila mala: es BLOQUEAR una
 * buena. Con estas tablas se calculan el margen y las comisiones, así que un
 * mes fuerte legítimo rechazado cuesta más que la fila corrupta que se cuela.
 * Los números de abajo salieron de producción el 30-jul-2026 con
 * `scripts/_diag-calibrar-guard-montos.mjs` (solo lectura) — no son inventados.
 */

import { describe, it, expect } from "vitest";
import {
  GUARDS,
  MONTO_FACTOR,
  umbralMonto,
  esMontoImposible,
  columnasImposibles,
  particionarFilas,
  clavesPorAvisar,
  techoHistoria,
  campoSkip,
  fmtMonto,
  type FamiliaMonto,
} from "@/lib/switch-api/monto-guard";

/** La fila que originó todo: Confecciones Boston, 14-jul-2026. */
const LA_FILA_MALA = 1_000_000_049.22;

const FAMILIAS = Object.keys(GUARDS) as FamiliaMonto[];

// ─────────────────────────────────────────────────────────────────────────────
// 1. FALSO POSITIVO — lo único que no se puede romper
// ─────────────────────────────────────────────────────────────────────────────

describe("los picos históricos REALES pasan todos (falso positivo = el peor fallo)", () => {
  /**
   * Récords medidos en producción, tabla por tabla y columna por columna.
   * Incluye los negativos: una nota de crédito da magnitud grande y legítima.
   */
  const PICOS_REALES: Array<{ familia: FamiliaMonto; que: string; fila: Record<string, unknown> }> = [
    // switch_costo_diario — el día más caro del grupo (active_wear, 13-may-2026)
    { familia: "costo_diario", que: "active_wear 13-may-2026, el día más caro jamás registrado", fila: { venta_total: 181_650.0, costo_total: 141_707.12, utilidad_total: 46_501.37 } },
    { familia: "costo_diario", que: "día dominado por notas de crédito (todo negativo)", fila: { venta_total: -7_426.58, costo_total: -3_808.04, utilidad_total: -14_826.82 } },

    // switch_articulo_diario
    { familia: "articulo_diario", que: "el artículo×día más grande", fila: { venta_total: 88_592.0, costo_total: 66_790.7 } },

    // switch_facturas — la factura más grande jamás emitida
    { familia: "factura", que: "active_shoes 11-000000142 (29-nov-2023), la factura récord", fila: { subtotal: 91_464.0, subtotal_descuento: 91_464.0, impuesto: 6_402.48, total: 97_866.48, saldo: 78_914.64, descuento: 1_247.7 } },
    { familia: "factura", que: "fashion_wear 11-000001880, la 2ª más grande", fila: { subtotal: 79_061.23, total: 79_061.23, saldo: 0, impuesto: 0, descuento: 0, subtotal_descuento: 79_061.23 } },

    // switch_estadocuenta — documento abierto récord
    { familia: "cxc", que: "el documento de cartera con más total", fila: { total: 151_630.66, saldo: 78_914.64, debito: 78_914.64, credito: 72_985.4, saldo_original: 78_914.64, total_original: 151_630.66 } },
    { familia: "cxc", que: "documento con crédito/saldo negativos (NC aplicada)", fila: { total: 0, saldo: 0, debito: 0, credito: 72_985.4, saldo_original: -72_985.4, total_original: -72_985.4 } },

    // switch_factura_utilidad — costo y utilidad récord, en ambos signos
    { familia: "utilidad", que: "active_wear 11-000000307, el costo récord", fila: { subtotal_con_descuento: 73_752.0, costo: 57_547.38, utilidad: 16_204.62 } },
    { familia: "utilidad", que: "active_wear 13-000000098, la NC más grande (todo negativo)", fila: { subtotal_con_descuento: -73_752.0, costo: -50_041.2, utilidad: -23_710.8 } },
    { familia: "utilidad", que: "active_wear 11-000000315, la utilidad récord", fila: { subtotal_con_descuento: 73_752.0, costo: 50_041.2, utilidad: 23_710.8 } },

    // switch_recibos — el cobro más grande de la historia
    { familia: "recibo", que: "fashion_wear · City Mall Paso Canoa · 28-feb-2023, el cobro récord", fila: { total: 266_923.96 } },
    { familia: "recibo", que: "el 2º cobro más grande (30-may-2024)", fila: { total: 230_186.72 } },
    { familia: "recibo", que: "cobro grande reciente (22-jul-2026)", fila: { total: 187_651.51 } },

    // switch_proveedor_estadocuenta — ⚠️ LAS 3 FILAS SOBRE EL MILLÓN SON REALES
    { familia: "proveedor", que: "fashion_wear · American Fashion Wear, SA — $2,07M REALES", fila: { saldo_total: 2_074_195.21, comprado_ytd: 0, pagado_ytd: 0, ultimo_pago_monto: 0 } },
    { familia: "proveedor", que: "fashion_shoes · American Fashion Wear, SA — $1,23M REALES", fila: { saldo_total: 1_233_330.25 } },
    { familia: "proveedor", que: "vistana · American Designer Fashion — $1,03M REALES", fila: { saldo_total: 1_035_616.02 } },
    { familia: "proveedor", que: "saldo a favor (negativo)", fila: { saldo_total: -5_290.04 } },

    // products / joybees_products / tommy_products
    { familia: "producto", que: "el precio más alto del catálogo (tommy, $64)", fila: { price: 64.0 } },
    { familia: "producto", que: "Reebok CLUB C REVENGE VINTAGE ($58)", fila: { price: 58.0 } },
    { familia: "producto", que: "producto de $0 (existe en el catálogo)", fila: { price: 0 } },

    // switch_articulo_info — la venta unitaria más cara de la historia FG
    { familia: "articulo_info", que: "CLICHE600 (vistana), el precio unitario récord ($850)", fila: { precio_etiqueta: 850.0, costo_api: 850.0 } },
    { familia: "articulo_info", que: "31KAE22003001 medido en vivo (9-ago-2026)", fila: { precio_etiqueta: 23.0, costo_api: 16.94 } },
    { familia: "articulo_info", que: "artículo sin precio cargado", fila: { precio_etiqueta: 0, costo_api: 0 } },
  ];

  it.each(PICOS_REALES)("$familia — $que", ({ familia, fila }) => {
    // Sin historia: el caso más estricto posible (el umbral cae al piso).
    const umbralPiso = umbralMonto(familia, []);
    expect(columnasImposibles(familia, fila, umbralPiso)).toEqual([]);
  });

  it("y pasan TAMBIÉN cuando la historia está vacía en TODAS las familias", () => {
    for (const { familia, fila } of PICOS_REALES) {
      const malas = columnasImposibles(familia, fila, umbralMonto(familia, []));
      expect(malas, `${familia}: ${JSON.stringify(fila)}`).toEqual([]);
    }
  });

  it("cada piso deja al menos 7× de aire sobre el récord real de su tabla", () => {
    for (const familia of FAMILIAS) {
      const { piso, record } = GUARDS[familia];
      expect(piso / record, `${familia}: piso ${piso} contra récord ${record}`).toBeGreaterThanOrEqual(7);
    }
  });

  it("el piso de proveedores NO es el de las demás — $1M habría rechazado 3 filas buenas", () => {
    // Este es el error concreto que el registro por-familia evita.
    const conPisoAjeno = 1_000_000;
    for (const saldo of [2_074_195.21, 1_233_330.25, 1_035_616.02]) {
      expect(esMontoImposible(saldo, conPisoAjeno)).toBe(true); // lo que HABRÍA pasado
      expect(esMontoImposible(saldo, umbralMonto("proveedor", []))).toBe(false); // lo que pasa
    }
  });

  it("un mes REALMENTE fuerte —10× el récord de siempre— tampoco se bloquea", () => {
    // 10× la factura récord del grupo sigue siendo legítimo, no imposible.
    expect(esMontoImposible(97_866.48 * 10, umbralMonto("factura", []))).toBe(false);
    expect(esMontoImposible(266_923.96 * 7, umbralMonto("recibo", []))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LO IMPOSIBLE SÍ SE RECHAZA
// ─────────────────────────────────────────────────────────────────────────────

describe("la cifra imposible se rechaza en TODAS las familias", () => {
  it.each(FAMILIAS)("%s rechaza $1.000.000.049,22", (familia) => {
    expect(esMontoImposible(LA_FILA_MALA, umbralMonto(familia, []))).toBe(true);
  });

  it.each(FAMILIAS)("%s rechaza la magnitud NEGATIVA de la misma cifra", (familia) => {
    expect(esMontoImposible(-LA_FILA_MALA, umbralMonto(familia, []))).toBe(true);
  });

  it("rechaza el otro caso real: subTotal 4.460.999.999.999,55 (active_shoes)", () => {
    expect(esMontoImposible(4_460_999_999_999.55, umbralMonto("factura", []))).toBe(true);
  });

  it("NaN e Infinity son imposibles; null/undefined NO (son 'sin dato')", () => {
    const u = umbralMonto("factura", []);
    expect(esMontoImposible(NaN, u)).toBe(true);
    expect(esMontoImposible(Infinity, u)).toBe(true);
    expect(esMontoImposible("no-es-un-numero", u)).toBe(true);
    expect(esMontoImposible(null, u)).toBe(false);
    expect(esMontoImposible(undefined, u)).toBe(false);
  });

  it("el borde exacto NO se rechaza (> umbral, no >=)", () => {
    const u = umbralMonto("factura", []);
    expect(esMontoImposible(u, u)).toBe(false);
    expect(esMontoImposible(u + 0.01, u)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SIMETRÍA — la fila entera, no una columna
// ─────────────────────────────────────────────────────────────────────────────

describe("simetría: se mira la fila ENTERA (el defecto de los 2 guards viejos)", () => {
  it("el guard viejo de costo diario dejaba pasar la VENTA — ahora no", () => {
    const umbral = umbralMonto("costo_diario", []);
    // Costo sano, venta corrupta: el guard viejo lo escribía tal cual.
    const malas = columnasImposibles("costo_diario", { venta_total: LA_FILA_MALA, costo_total: 493.0, utilidad_total: 0 }, umbral);
    expect(malas).toEqual([{ columna: "venta_total", valor: LA_FILA_MALA }]);
  });

  it("y la UTILIDAD del mismo día también se mira", () => {
    const umbral = umbralMonto("costo_diario", []);
    const malas = columnasImposibles("costo_diario", { venta_total: 100, costo_total: 50, utilidad_total: -LA_FILA_MALA }, umbral);
    expect(malas.map((m) => m.columna)).toEqual(["utilidad_total"]);
  });

  it("el guard de artículos dejaba pasar la venta — ahora no", () => {
    const umbral = umbralMonto("articulo_diario", []);
    const malas = columnasImposibles("articulo_diario", { venta_total: LA_FILA_MALA, costo_total: 10 }, umbral);
    expect(malas.map((m) => m.columna)).toEqual(["venta_total"]);
  });

  it("en switch_facturas se miran las 6 columnas de plata, no solo el total", () => {
    const umbral = umbralMonto("factura", []);
    for (const columna of GUARDS.factura.columnas) {
      const malas = columnasImposibles("factura", { [columna]: LA_FILA_MALA }, umbral);
      expect(malas.map((m) => m.columna), `columna ${columna}`).toEqual([columna]);
    }
  });

  it("en la cartera se miran las 6 columnas, no solo el saldo", () => {
    const umbral = umbralMonto("cxc", []);
    for (const columna of GUARDS.cxc.columnas) {
      expect(columnasImposibles("cxc", { [columna]: LA_FILA_MALA }, umbral).map((m) => m.columna)).toEqual([columna]);
    }
  });

  it("en utilidad se miran subtotal, costo Y utilidad", () => {
    const umbral = umbralMonto("utilidad", []);
    for (const columna of GUARDS.utilidad.columnas) {
      expect(columnasImposibles("utilidad", { [columna]: LA_FILA_MALA }, umbral).map((m) => m.columna)).toEqual([columna]);
    }
  });

  it("una columna ausente de la fila no se inventa", () => {
    expect(columnasImposibles("factura", { total: 100 }, umbralMonto("factura", []))).toEqual([]);
  });

  it("varias columnas malas se reportan todas", () => {
    const malas = columnasImposibles("costo_diario", { venta_total: LA_FILA_MALA, costo_total: LA_FILA_MALA, utilidad_total: 0 }, umbralMonto("costo_diario", []));
    expect(malas.map((m) => m.columna)).toEqual(["venta_total", "costo_total"]);
  });

  it("el ANCLAJE siempre es una de las columnas guardadas de su familia", () => {
    for (const familia of FAMILIAS) {
      expect(GUARDS[familia].columnas, familia).toContain(GUARDS[familia].anclaje);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. UMBRAL RELATIVO Y ANTI-ENVENENAMIENTO
// ─────────────────────────────────────────────────────────────────────────────

describe("umbral relativo al histórico", () => {
  it("sin historia devuelve el piso de la familia", () => {
    for (const familia of FAMILIAS) {
      expect(umbralMonto(familia, [])).toBe(GUARDS[familia].piso);
    }
  });

  it("una empresa chica no sube del piso", () => {
    expect(umbralMonto("factura", [210.37, 3_245.23, 32_148.8])).toBe(GUARDS.factura.piso);
  });

  it("una empresa grande SUBE el umbral: 20× su récord", () => {
    const u = umbralMonto("factura", [1_900.8, 40_648.06, 97_866.48]);
    expect(u).toBeCloseTo(MONTO_FACTOR * 97_866.48, 6);
    expect(u).toBeGreaterThan(GUARDS.factura.piso);
  });

  it("la magnitud manda: un histórico solo negativo calibra igual", () => {
    expect(umbralMonto("factura", [-97_866.48])).toBeCloseTo(MONTO_FACTOR * 97_866.48, 6);
  });

  it("NaN/Infinity en la historia se ignoran, no la envenenan", () => {
    expect(umbralMonto("factura", [NaN, Infinity, 97_866.48])).toBeCloseTo(MONTO_FACTOR * 97_866.48, 6);
  });

  it("ANTI-ENVENENAMIENTO: una fila absurda ya guardada NO levanta el umbral sobre sí misma", () => {
    for (const familia of FAMILIAS) {
      const conVeneno = umbralMonto(familia, [GUARDS[familia].record, LA_FILA_MALA * 100]);
      expect(esMontoImposible(LA_FILA_MALA * 100, conVeneno), familia).toBe(true);
    }
  });

  it("el techo de historia es 10× el piso, en todas las familias", () => {
    for (const familia of FAMILIAS) {
      expect(techoHistoria(familia)).toBe(GUARDS[familia].piso * 10);
      expect(umbralMonto(familia, [techoHistoria(familia)])).toBe(GUARDS[familia].piso);
      expect(umbralMonto(familia, [techoHistoria(familia) - 1])).toBeGreaterThan(GUARDS[familia].piso);
    }
  });

  it("las 3 filas REALES de proveedores sí cuentan como historia (están bajo el techo)", () => {
    // Si contaran como veneno, el guard se calibraría por debajo de la realidad.
    expect(umbralMonto("proveedor", [2_074_195.21])).toBeCloseTo(MONTO_FACTOR * 2_074_195.21, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. UNA FILA MALA NO TUMBA LAS DEMÁS
// ─────────────────────────────────────────────────────────────────────────────

describe("una fila mala no tumba el sync", () => {
  const umbral = umbralMonto("factura", []);
  const filas = [
    { secuencial: "A", total: 100 },
    { secuencial: "B", total: LA_FILA_MALA },
    { secuencial: "C", total: 97_866.48 },
    { secuencial: "D", total: -LA_FILA_MALA },
    { secuencial: "E", total: 0 },
  ];

  it("las buenas salen enteras y las malas aparte", () => {
    const { buenas, rechazadas } = particionarFilas("factura", filas, umbral, (f) => f.secuencial);
    expect(buenas.map((f) => f.secuencial)).toEqual(["A", "C", "E"]);
    expect(rechazadas.map((r) => r.clave)).toEqual(["B", "D"]);
  });

  it("el rechazo dice QUÉ columna y con QUÉ valor", () => {
    const { rechazadas } = particionarFilas("factura", filas, umbral, (f) => f.secuencial);
    expect(rechazadas[0].columnas).toEqual([{ columna: "total", valor: LA_FILA_MALA }]);
    expect(rechazadas[0].fila).toBe(filas[1]);
  });

  it("con TODAS las filas buenas no hay rechazos ni copias raras", () => {
    const buenasSolas = [{ secuencial: "A", total: 1 }];
    const p = particionarFilas("factura", buenasSolas, umbral, (f) => f.secuencial);
    expect(p.rechazadas).toEqual([]);
    expect(p.buenas).toEqual(buenasSolas);
  });

  it("con un lote vacío no revienta", () => {
    expect(particionarFilas("factura", [], umbral, () => "x")).toEqual({ buenas: [], rechazadas: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. EL AVISO NO SE REPITE EN LOOP
// ─────────────────────────────────────────────────────────────────────────────

describe("anti-loop del aviso", () => {
  it("una fila ya avisada no vuelve a avisar", () => {
    expect(clavesPorAvisar(["2026-07-14"], ["2026-07-14"])).toEqual([]);
  });

  it("una fila nueva sí avisa aunque otra ya se haya avisado", () => {
    expect(clavesPorAvisar(["2026-07-14", "2026-07-20"], ["2026-07-14"])).toEqual(["2026-07-20"]);
  });

  it("sin avisos previos, avisa por todas", () => {
    expect(clavesPorAvisar(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("no repite una clave duplicada dentro de la MISMA corrida", () => {
    expect(clavesPorAvisar(["a", "a", "b"], [])).toEqual(["a", "b"]);
  });

  it("conserva el orden de entrada", () => {
    expect(clavesPorAvisar(["z", "a", "m"], [])).toEqual(["z", "a", "m"]);
  });

  it("el MISMO dato malo llegando 7 días seguidos avisa UNA vez", () => {
    const malaDeSiempre = ["2026-07-14"];
    const yaAvisadas: string[] = [];
    let avisos = 0;
    for (let dia = 0; dia < 7; dia++) {
      const nuevas = clavesPorAvisar(malaDeSiempre, yaAvisadas);
      if (nuevas.length > 0) avisos++;
      yaAvisadas.push(...nuevas);
    }
    expect(avisos).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. HIGIENE DEL REGISTRO
// ─────────────────────────────────────────────────────────────────────────────

describe("registro", () => {
  it("cada familia tiene su marca de skip propia (el anti-loop no se cruza)", () => {
    const marcas = FAMILIAS.map(campoSkip);
    expect(new Set(marcas).size).toBe(FAMILIAS.length);
  });

  it("ninguna familia queda sin columnas ni sin texto para Daniel", () => {
    for (const familia of FAMILIAS) {
      expect(GUARDS[familia].columnas.length, familia).toBeGreaterThan(0);
      expect(GUARDS[familia].que.length, familia).toBeGreaterThan(3);
      expect(GUARDS[familia].tabla, familia).toBeTruthy();
    }
  });

  it("las 6 tablas que pidió Daniel están cubiertas", () => {
    const tablas = FAMILIAS.map((f) => GUARDS[f].tabla);
    for (const t of [
      "switch_facturas",
      "switch_estadocuenta",
      "switch_factura_utilidad",
      "switch_recibos",
      "switch_proveedor_estadocuenta",
      "products",
    ]) {
      expect(tablas).toContain(t);
    }
  });

  it("switch_facturas.total y switch_estadocuenta.saldo están entre las columnas vigiladas", () => {
    expect(GUARDS.factura.columnas).toContain("total");
    expect(GUARDS.cxc.columnas).toContain("saldo");
    expect(GUARDS.utilidad.columnas).toContain("costo");
    expect(GUARDS.utilidad.columnas).toContain("utilidad");
    expect(GUARDS.recibo.columnas).toContain("total");
    expect(GUARDS.proveedor.columnas).toContain("saldo_total");
    expect(GUARDS.producto.columnas).toContain("price");
  });

  it("el formato de plata es el de siempre", () => {
    expect(fmtMonto(LA_FILA_MALA)).toBe("$1,000,000,049.22");
    expect(fmtMonto(0)).toBe("$0.00");
  });
});
