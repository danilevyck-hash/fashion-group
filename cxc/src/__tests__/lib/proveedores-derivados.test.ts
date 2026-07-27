// ─────────────────────────────────────────────────────────────────────────────
// Candado de los campos derivados de CxP (Comprado YTD, Pagado YTD, Último pago).
//
// El bug que cerró este archivo: `parseFecha()` del sync exigía DD-MM-YYYY y
// Switch manda YYYY-MM-DD → 66 de 66 filas con las tres columnas en cero.
// Los tests usan fechas FIJAS: nada acá depende de cuándo se corran.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

// buildList/buildFicha son puras, pero viven en un módulo que crea el cliente de
// Supabase al importarse. No se toca la base en ningún test de este archivo.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import {
  derivarProveedor,
  fechaPanamaDelLedger,
  anioPanama,
  esPagoAProveedor,
  montoDocumento,
  diasDesde,
  esDelAnio,
  type ElementoLedger,
} from "@/lib/proveedores-derivados";
import { buildFicha, buildList, type ProveedorRow } from "@/lib/proveedores";

// Renglón con la forma REAL que devuelve /apiproveedor/info (muestra copiada de
// switch_proveedor_estadocuenta en producción).
const factura = (fecha: string, monto: number, extra: Partial<ElementoLedger> = {}): ElementoLedger => ({
  fechaCreacion: fecha,
  abrev: "FA",
  tipoComprobante: "Factura",
  credito: String(monto.toFixed(4)),
  debito: 0,
  total: String(monto.toFixed(4)),
  saldo: String(monto.toFixed(4)),
  dias: 0,
  ...extra,
});

const pago = (fecha: string, monto: number, extra: Partial<ElementoLedger> = {}): ElementoLedger => ({
  fechaCreacion: fecha,
  abrev: "PP",
  tipoComprobante: "Pago a proveedores",
  credito: 0,
  debito: monto,
  total: monto,
  saldo: -monto,
  dias: 0,
  ...extra,
});

const notaCredito = (fecha: string, monto: number): ElementoLedger => ({
  fechaCreacion: fecha,
  abrev: "NC",
  tipoComprobante: "Nota de Crédito",
  credito: 0,
  debito: monto,
  total: monto,
  saldo: -monto,
  dias: 0,
});

const HOY = "2026-07-27";
const OPTS = { hoy: HOY, anio: 2026 };

describe("fechaPanamaDelLedger — el formato que Switch manda de verdad", () => {
  it("acepta YYYY-MM-DD (821/821 renglones reales vienen así)", () => {
    expect(fechaPanamaDelLedger("2026-05-11")).toBe("2026-05-11");
    expect(fechaPanamaDelLedger("  2026-05-11  ")).toBe("2026-05-11");
  });

  it("sigue aceptando DD-MM-YYYY (lo que decía el comentario viejo)", () => {
    expect(fechaPanamaDelLedger("11-05-2026")).toBe("2026-05-11");
    expect(fechaPanamaDelLedger("31-12-2025")).toBe("2025-12-31");
  });

  it("no inventa fechas: basura, zero-dates y no-strings dan null", () => {
    expect(fechaPanamaDelLedger("0000-00-00")).toBeNull();
    expect(fechaPanamaDelLedger("2026-13-40")).toBeNull();
    expect(fechaPanamaDelLedger("2026-02-30")).toBeNull(); // 30 de febrero no existe
    expect(fechaPanamaDelLedger("")).toBeNull();
    expect(fechaPanamaDelLedger(null)).toBeNull();
    expect(fechaPanamaDelLedger(undefined)).toBeNull();
    expect(fechaPanamaDelLedger(20260511)).toBeNull();
    expect(fechaPanamaDelLedger("mayo 11")).toBeNull();
  });

  it("una hora SIN zona es hora Panamá: el día no se mueve", () => {
    expect(fechaPanamaDelLedger("2025-12-31 23:00:00")).toBe("2025-12-31");
    expect(fechaPanamaDelLedger("2026-01-01T00:30:00")).toBe("2026-01-01");
  });

  it("con zona explícita, el día se corta en Panamá (UTC−5), no en UTC", () => {
    // 31-dic 23:00 de Panamá = 1-ene 04:00 UTC. En UTC ya es enero; en Panamá no.
    expect(fechaPanamaDelLedger("2026-01-01T04:00:00Z")).toBe("2025-12-31");
    expect(fechaPanamaDelLedger("2025-12-31T23:00:00-05:00")).toBe("2025-12-31");
    // 1-ene 00:30 de Panamá = 1-ene 05:30 UTC.
    expect(fechaPanamaDelLedger("2026-01-01T05:30:00Z")).toBe("2026-01-01");
    expect(fechaPanamaDelLedger("2026-01-01T00:30:00-05:00")).toBe("2026-01-01");
  });
});

describe("el borde del año se corta en hora Panamá", () => {
  it("una compra del 31-dic 23:00 de Panamá NO cuenta para el año siguiente", () => {
    const d = derivarProveedor([factura("2025-12-31T23:00:00-05:00", 1000)], OPTS);
    expect(d.comprado_ytd).toBe(0);
    // ...y sí cuenta para 2025.
    expect(derivarProveedor([factura("2025-12-31T23:00:00-05:00", 1000)], { hoy: "2025-12-31", anio: 2025 }).comprado_ytd).toBe(1000);
  });

  it("una compra del 1-ene 00:30 de Panamá SÍ cuenta para el año nuevo", () => {
    const d = derivarProveedor([factura("2026-01-01T00:30:00-05:00", 1000)], OPTS);
    expect(d.comprado_ytd).toBe(1000);
  });

  it("un pago del 31-dic 23:00 de Panamá no entra al Pagado YTD del año nuevo", () => {
    const d = derivarProveedor([pago("2025-12-31T23:00:00-05:00", 500), pago("2026-01-01T00:30:00-05:00", 300)], OPTS);
    expect(d.pagado_ytd).toBe(300);
    // el último pago sigue siendo el más reciente, sea de qué año sea
    expect(d.ultimo_pago_fecha).toBe("2026-01-01");
  });

  it("el 1-ene 00:00 de Panamá es el primer instante que cuenta", () => {
    expect(esDelAnio("2026-01-01", 2026)).toBe(true);
    expect(esDelAnio("2025-12-31", 2026)).toBe(false);
    expect(esDelAnio("2026-12-31", 2026)).toBe(true);
    expect(esDelAnio("2027-01-01", 2026)).toBe(false);
  });

  it("anioPanama no salta de año en las últimas 5 horas del 31-dic de Panamá", () => {
    // 1-ene 02:00 UTC = 31-dic 21:00 en Panamá: todavía es 2025.
    expect(anioPanama(new Date("2026-01-01T02:00:00Z"))).toBe(2025);
    // 1-ene 05:00 UTC = 1-ene 00:00 en Panamá.
    expect(anioPanama(new Date("2026-01-01T05:00:00Z"))).toBe(2026);
    expect(anioPanama(new Date("2026-07-27T12:00:00Z"))).toBe(2026);
  });
});

describe("el cálculo NO da cero cuando hay compras (la regresión del bug)", () => {
  it("con el formato real de Switch, comprado y pagado salen con número", () => {
    const d = derivarProveedor(
      [factura("2026-05-11", 41428), factura("2026-06-11", 39628.03), pago("2026-07-13", 25000)],
      OPTS,
    );
    expect(d.comprado_ytd).toBe(81056.03);
    expect(d.pagado_ytd).toBe(25000);
    expect(d.num_facturas).toBe(2);
    expect(d.num_pagos).toBe(1);
    expect(d.ultimo_pago_fecha).toBe("2026-07-13");
  });

  it("montos con coma de miles (formato US de Switch) no se pierden", () => {
    const d = derivarProveedor([factura("2026-03-02", 0, { credito: "1,234.5600", total: "1,234.5600" })], OPTS);
    expect(d.comprado_ytd).toBe(1234.56);
  });

  it("documentos de años anteriores no entran al YTD pero sí se cuentan", () => {
    const d = derivarProveedor([factura("2025-12-03", 2926.36), factura("2026-01-15", 100)], OPTS);
    expect(d.comprado_ytd).toBe(100);
    expect(d.num_facturas).toBe(2);
  });

  it("una fecha ilegible no rompe el resto: se ignora ese renglón, no la fila", () => {
    const d = derivarProveedor([factura("basura", 999), factura("2026-04-01", 50)], OPTS);
    expect(d.comprado_ytd).toBe(50);
    expect(d.num_facturas).toBe(2);
  });

  it("sin elements devuelve todo vacío, sin explotar", () => {
    for (const v of [[], null, undefined]) {
      const d = derivarProveedor(v as ElementoLedger[] | null | undefined, OPTS);
      expect(d.comprado_ytd).toBe(0);
      expect(d.ultimo_pago_fecha).toBeNull();
    }
  });
});

describe("el monto es el del DOCUMENTO, no el saldo que le queda", () => {
  it("una factura pagada casi entera cuenta por su total, no por lo que resta", () => {
    // Caso real (LATIN FITNESS / active_wear): factura de $125.374,80 con $374,80 abiertos.
    const el = factura("2026-05-11", 0, { credito: "374.8000", saldo: "374.8000", total: "125374.8000" });
    expect(montoDocumento(el)).toBe(125374.8);
    expect(derivarProveedor([el], OPTS).comprado_ytd).toBe(125374.8);
  });

  it("si Switch no manda total, cae al crédito/débito sin quedarse en cero", () => {
    expect(montoDocumento({ credito: "500.00", total: 0 })).toBe(500);
    expect(montoDocumento({ debito: 250, total: null })).toBe(250);
  });
});

describe("Último pago — solo pagos de verdad, nunca una fecha inventada", () => {
  it("un proveedor SIN pagos queda vacío (no cero, no una fecha cualquiera)", () => {
    const d = derivarProveedor([factura("2026-02-01", 100), factura("2026-03-01", 200)], OPTS);
    expect(d.ultimo_pago_fecha).toBeNull();
    expect(d.ultimo_pago_monto).toBeNull();
    expect(d.ultimo_pago_dias).toBeNull();
    expect(d.num_pagos).toBe(0);
  });

  it("un proveedor con SOLO notas de crédito tampoco tiene último pago", () => {
    // Caso real: vistana / AQUALINDA PANAMA S.A — su único débito es una NC del
    // 21-jul-2026. El agregador viejo lo habría mostrado como "último pago".
    const d = derivarProveedor([factura("2026-07-01", 1889.92), notaCredito("2026-07-21", 1889.92)], OPTS);
    expect(d.ultimo_pago_fecha).toBeNull();
    expect(d.pagado_ytd).toBe(0);
    expect(d.num_pagos).toBe(0);
  });

  it("con pagos y notas mezclados, gana el último PAGO, no la última nota", () => {
    // Caso real: fashion_wear / American Fashion Wear — NC del 17-jul tapaba el
    // pago del 16-jul.
    const d = derivarProveedor(
      [pago("2026-07-16", 45394.77), notaCredito("2026-07-17", 16666.32), pago("2026-05-02", 1000)],
      OPTS,
    );
    expect(d.ultimo_pago_fecha).toBe("2026-07-16");
    expect(d.ultimo_pago_monto).toBe(45394.77);
    expect(d.pagado_ytd).toBe(46394.77); // la NC no suma
    expect(d.num_pagos).toBe(2);
  });

  it("esPagoAProveedor distingue por abreviatura y por descripción", () => {
    expect(esPagoAProveedor({ abrev: "PP", tipoComprobante: "Pago a proveedores" })).toBe(true);
    expect(esPagoAProveedor({ abrev: "NC", tipoComprobante: "Nota de Crédito" })).toBe(false);
    expect(esPagoAProveedor({ abrev: "ND", tipoComprobante: "Nota de Débito" })).toBe(false);
    expect(esPagoAProveedor({ abrev: "", tipoComprobante: "PAGO A PROVEEDORES" })).toBe(true);
    expect(esPagoAProveedor({ abrev: "", tipoComprobante: "Factura" })).toBe(false);
    expect(esPagoAProveedor({})).toBe(false);
  });

  it("los días se calculan contra hoy, no se copian del sync", () => {
    const d = derivarProveedor([pago("2026-07-13", 25000)], OPTS);
    expect(d.ultimo_pago_dias).toBe(14); // 13-jul → 27-jul
  });

  it("un documento con fecha futura nunca produce 'hace N días' falso", () => {
    // El ledger real trae una factura del 12-dic-2026 con dias:137 (valor absoluto).
    expect(diasDesde("2026-12-12", HOY)).toBe(0);
    expect(diasDesde("2026-07-27", HOY)).toBe(0);
    expect(diasDesde("2024-04-15", HOY)).toBe(833);
  });

  it("ignora el campo 'dias' que manda Switch aunque venga con basura", () => {
    const d = derivarProveedor([pago("2026-07-13", 25000, { dias: 9999 })], OPTS);
    expect(d.ultimo_pago_dias).toBe(14);
  });
});

// ─── Integración con el módulo: un proveedor con pagos en VARIAS empresas ─────

const fila = (empresa: string, nombre: string, elements: ElementoLedger[], saldo: number): ProveedorRow =>
  ({
    empresa_key: empresa,
    proveedor_switch_id: 1,
    codigo: null,
    nombre,
    identificacion: null,
    dv: null,
    direccion: null,
    contacto: null,
    telefono: null,
    celular: null,
    email: null,
    tipo_proveedor: null,
    saldo_total: saldo,
    aging: [],
    synced_at: "2026-07-27T09:30:00Z",
    ...derivarProveedor(elements, OPTS),
  }) as ProveedorRow;

describe("un proveedor con pagos en más de una empresa", () => {
  // Caso real: AMERICAN FASHION WEAR SA aparece en fashion_wear y fashion_shoes.
  const rows = [
    fila("fashion_wear", "American Fashion Wear, SA", [factura("2026-02-01", 100000), pago("2026-07-16", 45394.77)], 54605.23),
    fila("fashion_shoes", "American Fashion Wear, SA", [factura("2026-03-01", 50000), pago("2026-06-29", 25000)], 25000),
    fila("vistana", "Otro Proveedor", [factura("2026-01-05", 10)], 10),
  ];

  it("la ficha suma las dos empresas y cada una conserva SU último pago", () => {
    const f = buildFicha(rows, "AMERICAN FASHION WEAR SA")!;
    expect(f.empresas).toHaveLength(2);
    expect(f.total_grupo.comprado_ytd).toBe(150000);
    expect(f.total_grupo.pagado_ytd).toBe(70394.77);
    const fw = f.empresas.find((e) => e.empresa === "fashion_wear")!;
    const fs = f.empresas.find((e) => e.empresa === "fashion_shoes")!;
    expect(fw.ultimo_pago_fecha).toBe("2026-07-16");
    expect(fs.ultimo_pago_fecha).toBe("2026-06-29");
    expect(fw.pagado_ytd).toBe(45394.77);
  });

  it("la lista muestra el pago MÁS RECIENTE entre las empresas", () => {
    const { proveedores } = buildList(rows, {});
    const afw = proveedores.find((p) => p.key === "AMERICAN FASHION WEAR SA")!;
    expect(afw.empresas_count).toBe(2);
    expect(afw.comprado_ytd).toBe(150000);
    expect(afw.ultimo_pago_dias).toBe(11); // 16-jul, no 29-jun
  });

  it("un proveedor sin pagos en ninguna empresa sigue sin último pago", () => {
    const { proveedores } = buildList(rows, {});
    expect(proveedores.find((p) => p.key === "OTRO PROVEEDOR")!.ultimo_pago_dias).toBeNull();
  });
});
