// ─────────────────────────────────────────────────────────────────────────────
// Candado del campo derivado de CxP que QUEDA: Último pago.
//
// El bug que abrió este archivo: `parseFecha()` del sync exigía DD-MM-YYYY y
// Switch manda YYYY-MM-DD → 66 de 66 filas con las columnas en cero.
// Lo que lo cerró: "Comprado YTD" y "Pagado YTD" se ELIMINARON (27-jul-2026)
// porque el ledger de /apiproveedor/info solo trae lo que todavía se debe.
// Acá abajo hay un candado explícito para que nadie los vuelva a agregar.
// Los tests usan fechas FIJAS: nada acá depende de cuándo se corran.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

// buildList/buildFicha son puras, pero viven en un módulo que crea el cliente de
// Supabase al importarse. No se toca la base en ningún test de este archivo.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import {
  derivarProveedor,
  fechaPanamaDelLedger,
  esPagoAProveedor,
  montoDocumento,
  diasDesde,
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
const OPTS = { hoy: HOY };

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

describe("⛔ Comprado YTD / Pagado YTD ELIMINADOS — no se vuelven a agregar", () => {
  // La regla de Daniel: "solo quiero info que se pueda sacar al centavo desde
  // Switch; lo que no, se elimina". El ledger de /apiproveedor/info solo trae lo
  // que TODAVÍA se debe: una factura del año pagada al 100% se cae de ahí y se
  // lleva su pago con ella. Los dos totales eran un subconjunto arbitrario.
  it("derivarProveedor NO devuelve comprado_ytd ni pagado_ytd", () => {
    const d = derivarProveedor(
      [factura("2026-05-11", 41428), factura("2026-06-11", 39628.03), pago("2026-07-13", 25000)],
      OPTS,
    );
    expect(Object.keys(d).sort()).toEqual(["ultimo_pago_dias", "ultimo_pago_fecha", "ultimo_pago_monto"]);
    for (const muerto of ["comprado_ytd", "pagado_ytd", "num_facturas", "num_pagos"]) {
      expect(d).not.toHaveProperty(muerto);
    }
  });

  it("el módulo ya no exporta el corte de año que solo servía para el YTD", async () => {
    const mod = await import("@/lib/proveedores-derivados");
    expect(mod).not.toHaveProperty("anioPanama");
    expect(mod).not.toHaveProperty("esDelAnio");
  });

  it("la ficha y la lista tampoco los exponen", () => {
    const f = buildFicha(
      [fila("fashion_wear", "X SA", [factura("2026-02-01", 100000), pago("2026-07-16", 45394.77)], 54605.23)],
      "X SA",
    )!;
    expect(f.total_grupo).not.toHaveProperty("comprado_ytd");
    expect(f.total_grupo).not.toHaveProperty("pagado_ytd");
    expect(f.empresas[0]).not.toHaveProperty("comprado_ytd");
    expect(f.empresas[0]).not.toHaveProperty("pagado_ytd");
  });
});

describe("el parseo de fechas y montos sigue vivo (la regresión del bug)", () => {
  it("con el formato real de Switch, el último pago sale con número", () => {
    const d = derivarProveedor(
      [factura("2026-05-11", 41428), factura("2026-06-11", 39628.03), pago("2026-07-13", 25000)],
      OPTS,
    );
    expect(d.ultimo_pago_fecha).toBe("2026-07-13");
    expect(d.ultimo_pago_monto).toBe(25000);
  });

  it("montos con coma de miles (formato US de Switch) no se pierden", () => {
    const d = derivarProveedor([pago("2026-03-02", 0, { debito: "1,234.5600", total: "1,234.5600" })], OPTS);
    expect(d.ultimo_pago_monto).toBe(1234.56);
  });

  it("una fecha ilegible no rompe el resto: se ignora ese renglón, no la fila", () => {
    const d = derivarProveedor([pago("basura", 999), pago("2026-04-01", 50)], OPTS);
    expect(d.ultimo_pago_fecha).toBe("2026-04-01");
    expect(d.ultimo_pago_monto).toBe(50);
  });

  it("sin elements devuelve todo vacío, sin explotar", () => {
    for (const v of [[], null, undefined]) {
      const d = derivarProveedor(v as ElementoLedger[] | null | undefined, OPTS);
      expect(d.ultimo_pago_fecha).toBeNull();
      expect(d.ultimo_pago_monto).toBeNull();
      expect(d.ultimo_pago_dias).toBeNull();
    }
  });
});

describe("el monto es el del DOCUMENTO, no el saldo que le queda", () => {
  it("una factura pagada casi entera cuenta por su total, no por lo que resta", () => {
    // Caso real (LATIN FITNESS / active_wear): factura de $125.374,80 con $374,80 abiertos.
    const el = factura("2026-05-11", 0, { credito: "374.8000", saldo: "374.8000", total: "125374.8000" });
    expect(montoDocumento(el)).toBe(125374.8);
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
  });

  it("un proveedor con SOLO notas de crédito tampoco tiene último pago", () => {
    // Caso real: vistana / AQUALINDA PANAMA S.A — su único débito es una NC del
    // 21-jul-2026. El agregador viejo lo habría mostrado como "último pago".
    const d = derivarProveedor([factura("2026-07-01", 1889.92), notaCredito("2026-07-21", 1889.92)], OPTS);
    expect(d.ultimo_pago_fecha).toBeNull();
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
    const fw = f.empresas.find((e) => e.empresa === "fashion_wear")!;
    const fs = f.empresas.find((e) => e.empresa === "fashion_shoes")!;
    expect(fw.ultimo_pago_fecha).toBe("2026-07-16");
    expect(fs.ultimo_pago_fecha).toBe("2026-06-29");
  });

  it("la lista muestra el pago MÁS RECIENTE entre las empresas", () => {
    const { proveedores } = buildList(rows, {});
    const afw = proveedores.find((p) => p.key === "AMERICAN FASHION WEAR SA")!;
    expect(afw.empresas_count).toBe(2);
    expect(afw.ultimo_pago_dias).toBe(11); // 16-jul, no 29-jun
  });

  it("un proveedor sin pagos en ninguna empresa sigue sin último pago", () => {
    const { proveedores } = buildList(rows, {});
    expect(proveedores.find((p) => p.key === "OTRO PROVEEDOR")!.ultimo_pago_dias).toBeNull();
  });
});
