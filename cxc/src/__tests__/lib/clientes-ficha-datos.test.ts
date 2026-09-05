// ─────────────────────────────────────────────────────────────────────────────
// LO QUE LA FICHA LEE DE LA BASE — con la base doblada (5-sep-2026).
//
// Los candados de `ficha.ts` prueban las CUENTAS; éste prueba lo que las
// alimenta: qué se suma al año en curso, qué al año pasado, hasta qué día, y
// qué se descarta. Es donde vive la mitad del riesgo — un año pasado que se
// suma entero infla la comparación de todos los clientes a la vez, y nadie lo
// nota porque el número sigue pareciendo razonable.
//
// Se doblan `leerTodoPaginado` y el cliente de Supabase: acá no se prueba
// PostgREST, se prueba la aritmética y los cortes.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

/** Lo que devuelve cada lectura paginada, por etiqueta. */
let FILAS: Record<string, unknown[]> = {};
/** Los filtros que la consulta llegó a pedir, por etiqueta. */
let CADENA: Record<string, string[]> = {};

vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async (etiqueta: string, ejecutar: (a: boolean, b: number, c: number) => unknown) => {
    // Se ejecuta la cadena de verdad para que el doble registre los filtros:
    // así una consulta que pierde su `.in("empresa_key", …)` se puede cazar.
    await ejecutar(true, 0, 999);
    const clave = Object.keys(FILAS).find((k) => etiqueta.includes(k));
    return clave ? FILAS[clave] : [];
  },
}));

vi.mock("@/lib/supabase-server", () => {
  const hacerCadena = (etiqueta: string) => {
    const registrar = (llamada: string) => {
      (CADENA[etiqueta] ??= []).push(llamada);
      return cadena;
    };
    const cadena: Record<string, unknown> = {
      select: (cols: string) => registrar(`select:${cols}`),
      eq: (c: string, v: unknown) => registrar(`eq:${c}=${String(v)}`),
      neq: (c: string, v: unknown) => registrar(`neq:${c}=${String(v)}`),
      in: (c: string, v: unknown[]) => registrar(`in:${c}=${v.join(",")}`),
      gte: (c: string, v: unknown) => registrar(`gte:${c}=${String(v)}`),
      lt: (c: string, v: unknown) => registrar(`lt:${c}=${String(v)}`),
      not: (c: string, o: string) => registrar(`not:${c}:${o}`),
      order: () => registrar("order"),
      range: () => registrar("range"),
      limit: () => registrar("limit"),
      then: (resolver: (r: unknown) => unknown) =>
        resolver({ data: FILAS[etiqueta] ?? [], error: null }),
    };
    return cadena;
  };
  return {
    supabaseServer: {
      from: (tabla: string) => hacerCadena(tabla),
    },
  };
});

import { comprasDelCliente, pagosDelCliente } from "@/lib/clientes/ficha-datos";

const f = (empresa: string, fecha: string, tipo: string, base: number, id = 1) => ({
  empresa_key: empresa, cliente_switch_id: id, fecha, tipo_comprobante: tipo, subtotal_descuento: base,
});

beforeEach(() => {
  FILAS = {};
  CADENA = {};
});

/** 5-sep-2026 a mediodía de Panamá (17:00 UTC). Fecha FIJA, nunca `new Date()`. */
const AHORA = new Date("2026-09-05T17:00:00.000Z");

function sembrarClientes() {
  FILAS["switch_clientes"] = [
    { codigo: "D-25", empresa_key: "vistana", cliente_switch_id: 1 },
    { codigo: "D-25", empresa_key: "fashion_wear", cliente_switch_id: 2 },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL AÑO PASADO SE CORTA EN LOS MISMOS DÍAS", () => {
  it("una compra del año pasado POSTERIOR al corte no entra", async () => {
    sembrarClientes();
    FILAS["switch_facturas"] = [
      // Año en curso: la última carga es el 27-ago-2026 → corte 27-ago-2025.
      f("vistana", "2026-08-27T15:00:00Z", "Factura", 1000),
      // Año pasado, ANTES del corte: entra.
      f("vistana", "2025-08-20T15:00:00Z", "Factura", 700),
      // Año pasado, DESPUÉS del corte: NO entra. Sumarla infla la comparación
      // de todos los clientes a la vez y nadie lo nota.
      f("vistana", "2025-11-15T15:00:00Z", "Factura", 5000),
    ];
    const r = await comprasDelCliente("D-25", AHORA);
    expect(r.cortePrev).toBe("2025-08-27");
    const v = r.porEmpresa.find((e) => e.empresa === "vistana")!;
    expect(v.compras).toBe(1000);
    expect(v.comprasAnterior).toBe(700);
  });

  it("el corte sale del ÚLTIMO DÍA CARGADO, no de hoy", async () => {
    sembrarClientes();
    FILAS["switch_facturas"] = [f("vistana", "2026-03-10T15:00:00Z", "Factura", 100)];
    const r = await comprasDelCliente("D-25", AHORA);
    expect(r.cortePrev).toBe("2025-03-10");
  });

  it("una factura con fecha FUTURA no corre el corte más allá de hoy", async () => {
    sembrarClientes();
    FILAS["switch_facturas"] = [f("vistana", "2026-12-20T15:00:00Z", "Factura", 100)];
    const r = await comprasDelCliente("D-25", AHORA);
    expect(r.cortePrev).toBe("2025-09-05");
  });

  it("sin nada el año pasado, `comprasAnterior` es null — no cero", async () => {
    sembrarClientes();
    FILAS["switch_facturas"] = [f("vistana", "2026-05-01T15:00:00Z", "Factura", 100)];
    const v = (await comprasDelCliente("D-25", AHORA)).porEmpresa.find((e) => e.empresa === "vistana")!;
    expect(v.comprasAnterior).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LAS NOTAS DE CRÉDITO RESTAN, Y EL BRUTO SE GUARDA APARTE", () => {
  it("🩸 D-119: $21.826 facturados y $21.826 acreditados = neto CERO, bruto $21.826", async () => {
    // Los cuatro documentos reales del 5-sep-2026, con sus montos exactos.
    FILAS["switch_clientes"] = [
      { codigo: "D-119", empresa_key: "fashion_shoes", cliente_switch_id: 117 },
      { codigo: "D-119", empresa_key: "vistana", cliente_switch_id: 237 },
      { codigo: "D-119", empresa_key: "fashion_wear", cliente_switch_id: 236 },
    ];
    FILAS["switch_facturas"] = [
      f("fashion_shoes", "2026-08-26T15:00:00Z", "Factura", 8034, 117),
      f("fashion_shoes", "2026-08-27T15:00:00Z", "Factura", 4500, 117),
      f("vistana", "2026-08-27T15:00:00Z", "Factura", 7590, 237),
      f("fashion_wear", "2026-08-27T15:00:00Z", "Factura", 1702, 236),
      f("vistana", "2026-09-01T15:00:00Z", "Nota de Crédito", 7590, 237),
      f("fashion_shoes", "2026-09-01T15:00:00Z", "Nota de Crédito", 8034, 117),
      f("fashion_shoes", "2026-09-01T15:00:00Z", "Nota de Crédito", 4500, 117),
      f("fashion_wear", "2026-09-01T15:00:00Z", "Nota de Crédito", 1702, 236),
    ];
    const r = await comprasDelCliente("D-119", AHORA);
    const neto = r.porEmpresa.reduce((s, e) => s + e.compras, 0);
    const bruto = r.porEmpresa.reduce((s, e) => s + e.comprasBrutas, 0);
    expect(neto).toBe(0);
    expect(bruto).toBe(21_826);
  });

  it("la nota de DÉBITO suma, y una nota de crédito no es una compra", async () => {
    sembrarClientes();
    FILAS["switch_facturas"] = [
      f("vistana", "2026-03-01T15:00:00Z", "Factura", 100),
      f("vistana", "2026-04-01T15:00:00Z", "Nota de Débito", 50),
      f("vistana", "2026-05-01T15:00:00Z", "Nota de Crédito", 30),
    ];
    const v = (await comprasDelCliente("D-25", AHORA)).porEmpresa.find((e) => e.empresa === "vistana")!;
    expect(v.compras).toBe(120);
    // «Última compra» = la última FACTURA, no la nota de crédito del 1-may.
    expect(v.ultimaCompra).toBe("2026-03-01");
  });

  it("un tipo desconocido vale CERO, no rompe la ficha", async () => {
    sembrarClientes();
    FILAS["switch_facturas"] = [
      f("vistana", "2026-03-01T15:00:00Z", "Factura", 100),
      f("vistana", "2026-03-02T15:00:00Z", "Comprobante Marciano", 999),
    ];
    const v = (await comprasDelCliente("D-25", AHORA)).porEmpresa.find((e) => e.empresa === "vistana")!;
    expect(v.compras).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL PUENTE ES EL PAR (empresa, cliente_switch_id)", () => {
  it("un id que en OTRA empresa es otro cliente no suma", async () => {
    // El id de cliente es POR EMPRESA. Sin exigir el par exacto, el 1 de
    // `joystep` —que allá es otro cliente— entraría a la ficha de D-25.
    sembrarClientes();
    FILAS["switch_facturas"] = [
      f("vistana", "2026-03-01T15:00:00Z", "Factura", 100, 1),
      f("joystep", "2026-03-01T15:00:00Z", "Factura", 999, 1),
    ];
    const r = await comprasDelCliente("D-25", AHORA);
    expect(r.porEmpresa.reduce((s, e) => s + e.compras, 0)).toBe(100);
  });

  it("un cliente sin filas en `switch_clientes` devuelve las 6 en cero", async () => {
    FILAS["switch_clientes"] = [];
    const r = await comprasDelCliente("D-999", AHORA);
    expect(r.porEmpresa).toHaveLength(6);
    expect(r.porEmpresa.every((e) => e.compras === 0 && e.comprasAnterior === null)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 BOSTON NO ENTRA — el filtro va en la MISMA cadena", () => {
  it("las dos consultas de compras acotan a las 6", async () => {
    sembrarClientes();
    FILAS["switch_facturas"] = [];
    await comprasDelCliente("D-25", AHORA);
    for (const tabla of ["switch_clientes", "switch_facturas"]) {
      const cadena = (CADENA[tabla] ?? []).join(" | ");
      expect(cadena, tabla).toContain("in:empresa_key=");
      expect(cadena, tabla).not.toContain("confecciones_boston");
      expect(cadena, tabla).not.toContain("american_classic");
      // Las 6, por inclusión.
      for (const e of ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"]) {
        expect(cadena, `${tabla} sin ${e}`).toContain(e);
      }
    }
  });

  it("los pagos se leen EMPRESA POR EMPRESA, con el filtro de siempre", async () => {
    FILAS["switch_recibos"] = [];
    await pagosDelCliente("D-25");
    const cadena = (CADENA["switch_recibos"] ?? []).join(" | ");
    // Seis lecturas, una por empresa del grupo.
    for (const e of ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"]) {
      expect(cadena, e).toContain(`eq:empresa_key=${e}`);
    }
    expect(cadena).not.toContain("confecciones_boston");
    // Sin retenciones y sin recibos en cero: es el bug del «$0.00 hace 15 días».
    expect(cadena).toContain("eq:es_retencion=false");
    expect(cadena).toContain("neq:total=0");
    expect(cadena).toContain("eq:cliente_codigo=D-25");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("los pagos, agrupados por FECHA", () => {
  it("un día con pagos en dos empresas es UNA línea con el total del día", async () => {
    FILAS["switch_recibos"] = [
      { fecha: "2026-08-20", total: 100 },
      { fecha: "2026-07-29", total: 50 },
    ];
    const r = await pagosDelCliente("D-25");
    // El doble devuelve las mismas dos filas para las 6 empresas.
    expect(r.porFecha[0].fecha).toBe("2026-08-20");
    expect(r.porFecha[0].monto).toBe(600);
    expect(r.porFecha[0].empresas).toHaveLength(6);
    expect(r.ultimoPago).toEqual({ fecha: "2026-08-20", monto: 600 });
  });

  it("sin recibos, `ultimoPago` es null — no se inventa uno", async () => {
    FILAS["switch_recibos"] = [];
    const r = await pagosDelCliente("D-25");
    expect(r.porFecha).toEqual([]);
    expect(r.ultimoPago).toBeNull();
  });

  it("se muestran a lo sumo TRES fechas", async () => {
    FILAS["switch_recibos"] = [
      { fecha: "2026-08-20", total: 1 },
      { fecha: "2026-07-29", total: 1 },
      { fecha: "2026-07-22", total: 1 },
      { fecha: "2026-06-29", total: 1 },
    ];
    expect((await pagosDelCliente("D-25")).porFecha).toHaveLength(3);
  });
});
