import { describe, it, expect } from "vitest";
import {
  parseDetalleCsv,
  parseResumenCsv,
  cuadrar,
  hallazgos,
  normalizarTexto,
  parseNumero,
  parseFechaIngreso,
  fobConfiable,
  IngresosCsvError,
  COLUMNAS_DETALLE,
  COLUMNAS_RESUMEN,
} from "@/lib/switch-api/ingresos-mercancia";

// ─────────────────────────────────────────────────────────────────────────────
// Todos los textos de acá son LÍNEAS REALES del CSV que bajó Daniel a mano
// (vistana, "Descargar Detalle", 11-feb-2026 → 07-ago-2026), copiadas tal cual
// con sus dobles espacios. Inventar el formato sería probar contra mi propia
// suposición del formato, que es exactamente lo que este test tiene que impedir.
// ─────────────────────────────────────────────────────────────────────────────

const HDR_DETALLE =
  "FECHA;N.INTERNO;SUCURSAL;PROVEEDOR; CODIGO  ARTICULO ;ARTICULO;REFERENCIA;PRECIO;CANTIDAD; COSTO  FOB ; COSTO  CIF ; COSTO  PROMEDIO ; UTILIDAD  % ";

const HDR_RESUMEN = "FECHA;N.INTERNO;SUCURSAL;PROVEEDOR;CANTIDAD; COSTO  FOB ; COSTO  CIF ;TOTAL";

const L1 =
  "2026-02-11;19-000000580;PRINCIPAL; American  Designer  Fashion ;NB2568001;Men-Brief;NB2568001;24.00;60.00;15.785;15.785;15.785;34.2292";
const L2 =
  "2026-02-11;19-000000580;PRINCIPAL; American  Designer  Fashion ;NB2570001; Men-Boxer  Brief ;NB2570001;27.00;120.00;16.555;16.555;16.555;38.6852";
const L3 =
  "2026-08-07;19-000000703;PRINCIPAL; American  Designer  Fashion ;CVW213NS02001; Women-Socks  Sport ;CVW213NS02001;13.50;12.00;8.47;8.47;8.47;37.2593";

const detalleCsv = [HDR_DETALLE, L1, L2, L3].join("\n");

const resumenCsv = [
  HDR_RESUMEN,
  "2026-02-11;19-000000580;PRINCIPAL; American  Designer  Fashion ;180.00;32.34;32.34;2933.70",
  "2026-08-07;19-000000703;PRINCIPAL; American  Designer  Fashion ;12.00;8.47;8.47;101.64",
].join("\n");

describe("normalización — el reporte manda dobles espacios y hay que colapsarlos", () => {
  it("colapsa dobles espacios y recorta los bordes", () => {
    expect(normalizarTexto(" American  Designer  Fashion ")).toBe("American Designer Fashion");
    expect(normalizarTexto(" COSTO  FOB ")).toBe("COSTO FOB");
  });

  it("no toca dígitos ni guiones de un código", () => {
    expect(normalizarTexto("T1A8-32600-313")).toBe("T1A8-32600-313");
    expect(normalizarTexto("CVW211NS05004")).toBe("CVW211NS05004");
  });

  it("un valor ausente es null, NUNCA 0", () => {
    // Confundirlos mete ceros inventados en columnas de plata.
    expect(parseNumero("")).toBeNull();
    expect(parseNumero("   ")).toBeNull();
    expect(parseNumero("n/d")).toBeNull();
    expect(parseNumero("0")).toBe(0);
    expect(parseNumero("0.00")).toBe(0);
  });

  it("lee la fecha en YYYY-MM-DD y tolera DD-MM-YYYY", () => {
    expect(parseFechaIngreso("2026-02-11")).toBe("2026-02-11");
    expect(parseFechaIngreso("11-02-2026")).toBe("2026-02-11");
    expect(parseFechaIngreso("")).toBeNull();
  });
});

describe("detalle", () => {
  it("lee las 3 líneas con sus campos exactos", () => {
    const r = parseDetalleCsv("vistana", detalleCsv);
    expect(r.skips).toEqual([]);
    expect(r.filas).toHaveLength(3);
    expect(r.documentos).toBe(2);
    expect(r.unidades).toBe(192);

    expect(r.variante).toBe("fob_cif");
    expect(r.filas[0]).toEqual({
      empresa_key: "vistana",
      fecha: "2026-02-11",
      n_interno: "19-000000580",
      linea: 1,
      sucursal: "PRINCIPAL",
      proveedor: "American Designer Fashion",
      codigo_articulo: "NB2568001",
      articulo: "Men-Brief",
      referencia: "NB2568001",
      precio: 24,
      cantidad: 60,
      costo_fob: 15.785,
      costo_cif: 15.785,
      costo_sin_desglosar: null,
      costo_promedio: 15.785,
      utilidad_pct: 34.2292,
    });
    // El nombre del artículo también viene con dobles espacios.
    expect(r.filas[1].articulo).toBe("Men-Boxer Brief");
  });

  it("los costos conservan sus 3 decimales — no se redondean a centavos", () => {
    // 15.785 redondeado a 2 sería 15.79: un centavo por unidad × 60 unidades.
    const r = parseDetalleCsv("vistana", detalleCsv);
    expect(r.filas[0].costo_cif).toBe(15.785);
    expect(r.filas[1].costo_fob).toBe(16.555);
  });

  it("una línea con columnas de más o de menos NO se descarta en silencio", () => {
    const roto = [HDR_DETALLE, L1, "2026-02-11;19-000000580;PRINCIPAL", L3].join("\n");
    const r = parseDetalleCsv("vistana", roto);
    expect(r.filas).toHaveLength(2);
    expect(r.skips).toHaveLength(1);
    expect(r.skips[0].linea).toBe(3);
    expect(r.skips[0].motivo).toContain("columnas");
    expect(r.skips[0].crudo).toContain("19-000000580");
  });

  it("corta si el encabezado no trae una columna esperada, en vez de leer por posición", () => {
    // Si Switch reordena o saca una columna, leer por posición mete el precio en
    // la cantidad y nadie se entera.
    const sinCantidad = HDR_DETALLE.replace(";CANTIDAD;", ";CANTIDADES;");
    expect(() => parseDetalleCsv("vistana", [sinCantidad, L1].join("\n"))).toThrow(IngresosCsvError);
    expect(() => parseDetalleCsv("vistana", [sinCantidad, L1].join("\n"))).toThrow(/CANTIDAD/);
  });

  it("tolera CRLF y BOM", () => {
    const conBom = "﻿" + [HDR_DETALLE, L1, L2, L3].join("\r\n") + "\r\n";
    const r = parseDetalleCsv("vistana", conBom);
    expect(r.skips).toEqual([]);
    expect(r.filas).toHaveLength(3);
    expect(r.unidades).toBe(192);
  });

  it("un CSV vacío corta, no devuelve cero filas contento", () => {
    // "0 líneas" y "no pude leer nada" se ven iguales y solo uno es seguro.
    expect(() => parseDetalleCsv("vistana", "")).toThrow(IngresosCsvError);
  });

  it("las columnas esperadas son las 13 del reporte real", () => {
    expect(COLUMNAS_DETALLE).toHaveLength(13);
    expect(COLUMNAS_RESUMEN).toHaveLength(8);
  });
});

describe("cuadre detalle vs resumen", () => {
  it("cuadra cuando las unidades coinciden documento por documento", () => {
    const d = parseDetalleCsv("vistana", detalleCsv);
    const r = parseResumenCsv(resumenCsv);
    const c = cuadrar(d.filas, r.documentos);
    expect(c.ok).toBe(true);
    expect(c.diferencia).toBe(0);
    expect(c.unidadesDetalle).toBe(192);
    expect(c.unidadesResumen).toBe(192);
  });

  it("detecta un documento que está en el resumen y NO en el detalle", () => {
    const d = parseDetalleCsv("vistana", [HDR_DETALLE, L1, L2].join("\n"));
    const r = parseResumenCsv(resumenCsv);
    const c = cuadrar(d.filas, r.documentos);
    expect(c.ok).toBe(false);
    expect(c.soloEnResumen).toEqual(["19-000000703"]);
    expect(c.diferencia).toBe(-12);
  });

  it("🩸 dos errores que se COMPENSAN no pueden dar 'ok'", () => {
    // Un documento de más y otro de menos dan el mismo gran total y son DOS
    // documentos mal cargados. Por eso el cuadre es por documento, no global.
    const resumenCompensado = [
      HDR_RESUMEN,
      "2026-02-11;19-000000580;PRINCIPAL; American  Designer  Fashion ;192.00;32.34;32.34;2933.70",
      "2026-08-07;19-000000703;PRINCIPAL; American  Designer  Fashion ;0.00;8.47;8.47;0.00",
    ].join("\n");
    const d = parseDetalleCsv("vistana", detalleCsv);
    const r = parseResumenCsv(resumenCompensado);
    const c = cuadrar(d.filas, r.documentos);

    expect(c.diferencia).toBe(0); // el gran total cuadra…
    expect(c.ok).toBe(false); // …y aun así NO está bien
    expect(c.documentosDescuadrados).toHaveLength(2);
    expect(c.documentosDescuadrados.map((x) => x.n_interno).sort()).toEqual([
      "19-000000580",
      "19-000000703",
    ]);
  });
});

describe("hallazgos — se miden, no se corrigen", () => {
  it("cuenta FOB≠CIF sin tocar ningún valor", () => {
    const conFobPropio =
      "2026-03-01;19-000000600;PRINCIPAL; Proveedor  X ;AAA;Art;AAA;20.00;10.00;12.50;14.00;13.10;30.00";
    const r = parseDetalleCsv("vistana", [HDR_DETALLE, L1, conFobPropio].join("\n"));
    const h = hallazgos(r.filas);
    expect(h.fobIgualACif).toBe(1);
    expect(h.fobDistintoDeCif).toBe(1);
    // Y los valores siguen intactos: nada se "corrigió".
    expect(r.filas[0].costo_fob).toBe(15.785);
    expect(r.filas[1].costo_fob).toBe(12.5);
    expect(r.filas[1].costo_cif).toBe(14);
  });

  it("fobConfiable distingue el FOB propio del CIF repetido", () => {
    expect(fobConfiable({ costo_fob: 12.5, costo_cif: 14 })).toBe(true);
    expect(fobConfiable({ costo_fob: 15.785, costo_cif: 15.785 })).toBe(false);
    expect(fobConfiable({ costo_fob: null, costo_cif: 14 })).toBe(false);
  });

  it("🔴 una cantidad negativa se REPORTA — no se le pone signo ni se descarta", () => {
    const devolucion =
      "2026-03-01;19-000000601;PRINCIPAL; Proveedor  X ;AAA;Art;AAA;20.00;-5.00;12.50;12.50;12.50;30.00";
    const r = parseDetalleCsv("vistana", [HDR_DETALLE, L1, devolucion].join("\n"));
    const h = hallazgos(r.filas);
    expect(h.negativas).toHaveLength(1);
    expect(h.negativas[0].cantidad).toBe(-5);
    // La fila se guarda igual, con su signo tal cual vino.
    expect(r.filas[1].cantidad).toBe(-5);
    // Y entra en la suma tal como está: el cuadre contra el resumen es quien
    // dice si Switch la cuenta igual que nosotros.
    expect(r.unidades).toBe(55);
  });

  it("🔴 el MISMO artículo repetido en el MISMO documento conserva sus DOS renglones", () => {
    // Caso REAL de producción: active_wear doc 19-000000014, código RBKFHJB, dos
    // renglones de 200 y 60 unidades. Con la llave (empresa, n_interno, codigo)
    // el upsert habría pisado uno con el otro y perdido 60 unidades en silencio.
    // Por eso la llave lleva `linea` y la carga reemplaza el documento entero.
    const a =
      "2025-06-20;19-000000014;PRINCIPAL; LATIN  FITNESS  GROUP ;RBKFHJB; HOME  RED  JERSEY ;RBKFHJB;32.00;200.00;25.00;27.50;27.50;14.0625";
    const b =
      "2025-06-20;19-000000014;PRINCIPAL; LATIN  FITNESS  GROUP ;RBKFHJB; HOME  RED  JERSEY ;RBKFHJB;32.00;60.00;25.00;27.50;27.50;14.0625";
    const r = parseDetalleCsv("active_wear", [HDR_DETALLE, a, b].join("\n"));

    expect(r.filas).toHaveLength(2);
    expect(r.unidades).toBe(260); // ← 200 + 60, no 200 ni 60
    // La llave real las distingue.
    expect(r.filas.map((f) => f.linea)).toEqual([1, 2]);
    expect(r.filas.map((f) => f.cantidad)).toEqual([200, 60]);
    expect(hallazgos(r.filas).codigosRepetidosEnDocumento).toEqual([
      { n_interno: "19-000000014", codigo_articulo: "RBKFHJB", veces: 2 },
    ]);
  });

  it("la línea numera POR DOCUMENTO, no de corrido", () => {
    const r = parseDetalleCsv("vistana", detalleCsv);
    // L1 y L2 son del doc …580; L3 es del …703 y vuelve a empezar en 1.
    expect(r.filas.map((f) => [f.n_interno, f.linea])).toEqual([
      ["19-000000580", 1],
      ["19-000000580", 2],
      ["19-000000703", 1],
    ]);
  });

  it("en la muestra real de vistana NO hay códigos repetidos", () => {
    const r = parseDetalleCsv("vistana", detalleCsv);
    expect(hallazgos(r.filas).codigosRepetidosEnDocumento).toEqual([]);
  });

  it("🔴 fashion_shoes trae UNA sola columna COSTO y NO se copia a FOB ni a CIF", () => {
    // Línea REAL de fashion_shoes (12 columnas, sin desglose FOB/CIF). Meter ese
    // COSTO en `costo_fob` o en `costo_cif` sería inventar el dato que este
    // trabajo vino a buscar, y el margen saldría mal sin que nadie lo note.
    const HDR12 =
      "FECHA;N.INTERNO;SUCURSAL;PROVEEDOR; CODIGO  ARTICULO ;ARTICULO;REFERENCIA;PRECIO;CANTIDAD;COSTO; COSTO  PROMEDIO ; UTILIDAD  % ";
    const LINEA12 =
      "2023-01-29;19-000000001;PRINCIPAL; American  Fashion  Wear,  SA ;EM00986-C87; Men-Flip  Flops ;EM00986C87;24.00;94.00;15.30;15.30;36.25";

    const r = parseDetalleCsv("fashion_shoes", [HDR12, LINEA12].join("\n"));
    expect(r.variante).toBe("costo_unico");
    expect(r.skips).toEqual([]);
    expect(r.filas[0].costo_sin_desglosar).toBe(15.3);
    expect(r.filas[0].costo_fob).toBeNull();
    expect(r.filas[0].costo_cif).toBeNull();

    const h = hallazgos(r.filas);
    expect(h.sinDesglosar).toBe(1);
    // Y NO se cuenta como "FOB igual al CIF": es otra cosa.
    expect(h.fobIgualACif).toBe(0);
    expect(h.fobDistintoDeCif).toBe(0);
  });

  it("el resumen de 7 columnas también se lee", () => {
    const r = parseResumenCsv(
      [
        "FECHA;N.INTERNO;SUCURSAL;PROVEEDOR;CANTIDAD;COSTO;TOTAL",
        "2023-01-29;19-000000001;PRINCIPAL; American  Fashion  Wear,  SA ;94.00;15.30;1438.20",
      ].join("\n"),
    );
    expect(r.variante).toBe("costo_unico");
    expect(r.unidades).toBe(94);
    expect(r.documentos[0].costo_fob).toBeNull();
  });

  it("🩸 el documento corrupto de active_shoes ROMPE el cuadre en vez de colarse", () => {
    // REAL: active_shoes doc 19-000000011 (2023-12-10, LATIN FITNESS GROUP)
    // trae 55 renglones con cantidad 999.999.999,9999 — es el mismo documento
    // que ya había devuelto `subTotal 4.46e12` por el API. El detalle suma
    // 54.999.999.999,99 y el resumen dice 1.000.000.000: NO cuadra, y por eso
    // esa empresa no se carga. Los otros 104 documentos cuadran exacto.
    const corruptas = Array.from(
      { length: 55 },
      (_, i) =>
        `2023-12-10;19-000000011;PRINCIPAL; LATIN  FITNESS  GROUP ;10002576${i};Art;10002576${i};54.00;999999999.9999;54.00;54.00;54.00;0.00`,
    );
    const d = parseDetalleCsv("active_shoes", [HDR_DETALLE, ...corruptas].join("\n"));
    // Los números medidos en producción, tal cual.
    expect(d.unidades).toBe(54_999_999_999.99);
    const r = parseResumenCsv(
      [HDR_RESUMEN, "2023-12-10;19-000000011;PRINCIPAL; LATIN  FITNESS  GROUP ;1000000000.00;4461.00;4461.00;1000000000.00"].join("\n"),
    );
    const c = cuadrar(d.filas, r.documentos);

    expect(c.ok).toBe(false);
    expect(c.documentosDescuadrados).toHaveLength(1);
    expect(c.diferencia).toBe(53_999_999_999.99);
    // La fila se guarda TAL CUAL: no se recorta, no se pone en cero, no se tira.
    expect(d.filas[0].cantidad).toBe(999999999.9999);
    expect(d.skips).toEqual([]);
  });

  it("lista un costo absurdo sin rechazarlo ni cambiarlo", () => {
    const absurdo =
      "2026-03-01;19-000000602;PRINCIPAL; Proveedor  X ;AAA;Art;AAA;20.00;1.00;12.50;1000000000;12.50;30.00";
    const r = parseDetalleCsv("vistana", [HDR_DETALLE, absurdo].join("\n"));
    const h = hallazgos(r.filas);
    expect(h.montosAbsurdos).toHaveLength(1);
    expect(h.montosAbsurdos[0].campo).toBe("costo_cif");
    expect(h.montosAbsurdos[0].valor).toBe(1_000_000_000);
    // La fila NO se tocó: el valor crudo sigue ahí para que una persona decida.
    expect(r.filas[0].costo_cif).toBe(1_000_000_000);
    expect(r.skips).toEqual([]);
  });
});
