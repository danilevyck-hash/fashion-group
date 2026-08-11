// ─────────────────────────────────────────────────────────────────────────────
// CANDADO DE `src/lib/ventas/compras.ts` — las COMPRAS REALES del tab
// Ventas › Referencia.
//
// 🩸 ESTE ARCHIVO EXISTE PORQUE EL MÓDULO ANTERIOR MENTÍA. No tenía los
// ingresos de mercancía, así que ADIVINABA las "tandas" a partir de las ventas
// y calculaba promedios metiendo el mes en curso adentro. Los números de acá NO
// son inventados: son mediciones contra producción. Si el cálculo no da ESTO,
// está mal el código — no el test.
//
// El caso que manda es `40HM265032` (vistana), que Daniel reconstruyó A MANO
// con el Kardex: 280 compradas el 28-nov-2023, 279 vendidas, 0 en bodega, y
// "se vendió en 16,4 meses". Todo lo demás son bordes alrededor de eso.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  DIAS_POR_MES,
  UMBRAL_VENDIDO,
  PCT_IMPORTACION,
  agruparCompras,
  armarArticulo,
  costosDeLinea,
  cuadrar,
  diasEntre,
  medirCompra,
  repartirExistencia,
  repartirFifo,
  textoMesesVendidos,
  ventasNetasPorDia,
  type Compra,
  type FilaIngreso,
  type VentaDia,
} from "@/lib/ventas/compras";
import { signoTipo, diffMeses } from "@/lib/ventas/referencia";
import { mesesDeCompra, textoAgotadas, textoSeVendio } from "@/lib/ventas/referencia-excel";

const HOY = "2026-08-11";

// ── Constructores cortos ─────────────────────────────────────────────────────

type FilaVenta = { fecha: string; tipo: string; cantidad_total: number | string; venta_total: number | string };

const v = (fecha: string, tipo: string, unidades: number, venta: number): FilaVenta => ({
  fecha,
  tipo,
  cantidad_total: unidades,
  venta_total: venta,
});

const ingreso = (p: Partial<FilaIngreso>): FilaIngreso => ({
  empresa_key: "vistana",
  fecha: "2024-01-01",
  n_interno: "19-000000001",
  codigo_articulo: "X001",
  articulo: "ARTICULO DE PRUEBA",
  proveedor: "PROVEEDOR",
  cantidad: 100,
  precio: 10,
  costo_fob: 4,
  costo_cif: 5,
  ...p,
});

const compra = (fecha: string, unidades: number, p: Partial<Compra> = {}): Compra => ({
  empresa: "vistana",
  codigo: "X001",
  fecha,
  documento: `DOC-${fecha}`,
  proveedor: "PROVEEDOR",
  articulo: "ARTICULO DE PRUEBA",
  unidades,
  costos: { cif: 5, fob: 4, fobOrigen: "real", lista: 10 },
  ...p,
});

// ─────────────────────────────────────────────────────────────────────────────
// EL CASO DE DANIEL — 40HM265032 (vistana), reconstruido a mano con el Kardex.
// ─────────────────────────────────────────────────────────────────────────────

const INGRESO_40HM265032: FilaIngreso[] = [
  ingreso({
    fecha: "2023-11-28",
    n_interno: "19-000000100",
    codigo_articulo: "40HM265032",
    articulo: "40HM265032",
    proveedor: "American Designer Fashion",
    cantidad: 280,
    costo_fob: 11.55,
    costo_cif: 11.55,
    precio: 16,
  }),
];

/** Las 23 filas de venta REALES del artículo, tal como las manda la base:
 *  la NC viene con la cantidad en POSITIVO (magnitud). */
const VENTAS_40HM265032: FilaVenta[] = [
  v("2024-01-31", "FA", 28, 448.0),
  v("2024-02-01", "FA", 21, 336.0),
  v("2024-03-04", "NC", 7, 112.0),
  v("2024-03-04", "FA", 7, 112.0),
  v("2024-03-05", "FA", 7, 112.0),
  v("2024-03-15", "TQ", 1, 16.0),
  v("2024-04-01", "FA", 20, 320.0),
  v("2024-04-10", "FA", 14, 224.0),
  v("2024-04-18", "FA", 7, 112.0),
  v("2024-08-13", "FA", 14, 224.0),
  v("2024-09-18", "FA", 14, 224.0),
  v("2024-10-30", "FA", 14, 224.0),
  v("2024-11-15", "FA", 14, 224.0),
  v("2024-11-26", "FA", 14, 224.0),
  v("2024-12-19", "FA", 8, 128.0),
  v("2024-12-20", "FA", 14, 224.0),
  v("2024-12-30", "FA", 14, 224.0),
  v("2025-01-23", "FA", 14, 224.0),
  v("2025-01-29", "FA", 14, 224.0),
  v("2025-03-18", "FA", 12, 192.0),
  v("2025-04-10", "FA", 14, 224.0),
  v("2025-05-09", "FA", 14, 224.0),
  v("2025-09-01", "FA", 7, 112.0),
];

function articulo40HM265032() {
  return armarArticulo(
    {
      empresa: "vistana",
      codigo: "40HM265032",
      descripcion: "40HM265032",
      ingresos: INGRESO_40HM265032,
      ventas: VENTAS_40HM265032,
      existencia: 0,
      precioEtiqueta: 16,
      catalogoSyncedAt: "2026-08-11T12:00:00.000Z",
    },
    HOY,
  );
}

describe("40HM265032 — el caso que Daniel reconstruyó a mano", () => {
  it("una sola compra de 280, vendido neto 279, medida en ~16,39 meses hasta el 10-abr-2025", () => {
    const a = articulo40HM265032();

    expect(a.sinCompraRegistrada).toBe(false);
    expect(a.compras).toHaveLength(1);
    expect(a.comprasFueraDeVentana).toBe(0);

    const c = a.compras[0];
    expect(c.fecha).toBe("2023-11-28");
    expect(c.documento).toBe("19-000000100");
    expect(c.proveedor).toBe("American Designer Fashion");
    expect(c.unidades).toBe(280);
    expect(c.vendidas).toBe(279);
    expect(c.estado).toBe("medida");
    expect(c.fechaUmbral).toBe("2025-04-10");
    expect(c.meses).toBeCloseTo(16.39, 2);
    expect(c.quedan).toBe(0);
    expect(c.noVendidoNiEnBodega).toBe(1);
  });

  it("la unidad que falta es un ajuste, y el ajuste está HABILITADO: 280 − 279 − 0 = 1", () => {
    const a = articulo40HM265032();
    expect(a.cuadre.comprado).toBe(280);
    expect(a.cuadre.vendido).toBe(279);
    expect(a.cuadre.existencia).toBe(0);
    expect(a.cuadre.residuo).toBe(1);
    expect(a.cuadre.ajusteConfiable).toBe(true);
    // La vida entera del artículo cabe adentro de lo registrado.
    expect(a.vendidoAntes).toBe(0);
    expect(a.vendidoDeMas).toBe(0);
    expect(a.stockSinRespaldo).toBe(0);
  });

  it("salió a $16,00 — el precio de lista, o sea 0% de descuento", () => {
    const c = articulo40HM265032().compras[0];
    expect(c.precioVendido).toBeCloseTo(16.0, 6);
    expect(c.descuento).toBeCloseTo(0, 10);
  });

  it("los meses en que vendió: 2024 ene→abr y ago→dic · 2025 ene, mar→may, sep", () => {
    const c = articulo40HM265032().compras[0];
    expect(textoMesesVendidos(c.mesesConVenta, "2026-08")).toBe(
      "2024: ene→abr, ago→dic · 2025: ene, mar→may, sep",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAS NC RESTAN — el candado de signos.
// ─────────────────────────────────────────────────────────────────────────────

describe("las NC RESTAN — la firma del error es el DOBLE de la nota de crédito", () => {
  it("signoTipo: NC resta; FA, TQ y CNF suman", () => {
    expect(signoTipo("NC")).toBe(-1);
    expect(signoTipo("FA")).toBe(1);
    expect(signoTipo("TQ")).toBe(1);
    expect(signoTipo("CNF")).toBe(1);
  });

  it("40HM265032: el neto es 279, NO 293 — y la diferencia es EXACTO 2 × 7", () => {
    const neto = ventasNetasPorDia(VENTAS_40HM265032).reduce((s, d) => s + d.unidades, 0);
    const sumandoTodo = VENTAS_40HM265032.reduce((s, f) => s + Number(f.cantidad_total), 0);

    expect(neto).toBe(279);
    expect(sumandoTodo).toBe(293); // 285 FA + 1 TQ + 7 NC, si alguien las suma
    expect(sumandoTodo - neto).toBe(14);
    expect(sumandoTodo - neto).toBe(2 * 7); // ← LA FIRMA: el doble de la NC
  });

  it("lo mismo en plata: $4.464,00 netos contra $4.688,00 sumándolas — 2 × $112,00", () => {
    const neto = ventasNetasPorDia(VENTAS_40HM265032).reduce((s, d) => s + d.venta, 0);
    const sumandoTodo = VENTAS_40HM265032.reduce((s, f) => s + Number(f.venta_total), 0);

    expect(neto).toBeCloseTo(4464, 6);
    expect(sumandoTodo).toBeCloseTo(4688, 6);
    expect(sumandoTodo - neto).toBeCloseTo(2 * 112, 6);
  });

  it("la NC del 4-mar-2024 cancela EXACTAMENTE la factura de ese día: el día queda en 0", () => {
    const dia = ventasNetasPorDia(VENTAS_40HM265032).find((d) => d.fecha === "2024-03-04");
    expect(dia).toBeTruthy();
    expect(dia!.unidades).toBe(0);
    expect(dia!.venta).toBeCloseTo(0, 6);
  });

  it("un día con MÁS devoluciones que ventas queda NEGATIVO a propósito — poner 0 inflaría lo vendido", () => {
    const dias = ventasNetasPorDia([v("2026-01-10", "FA", 3, 30), v("2026-01-10", "NC", 8, 80)]);
    expect(dias).toEqual([{ fecha: "2026-01-10", unidades: -5, venta: -50 }]);
  });

  it("los días salen ordenados, uno por fecha", () => {
    const dias = ventasNetasPorDia([
      v("2026-03-01", "FA", 1, 10),
      v("2026-01-01", "FA", 2, 20),
      v("2026-01-01", "FA", 3, 30),
    ]);
    expect(dias.map((d) => d.fecha)).toEqual(["2026-01-01", "2026-03-01"]);
    expect(dias[0].unidades).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOS MESES SE MIDEN EN DÍAS, no en meses calendario.
// ─────────────────────────────────────────────────────────────────────────────

describe("el 'se vendió en N meses' se mide en DÍAS", () => {
  it("28-nov-2023 → 10-abr-2025 son 499 días = 16,39 meses", () => {
    expect(diasEntre("2023-11-28", "2025-04-10")).toBe(499);
    expect(499 / DIAS_POR_MES).toBeCloseTo(16.39, 2);
    expect(DIAS_POR_MES).toBeCloseTo(365.25 / 12, 10);
  });

  it("contar MESES CALENDARIO daría 17 — y 17 no es el número que Daniel tenía", () => {
    // La mutación que hay que cazar: medir con diffMeses en vez de con días.
    expect(diffMeses("2025-04", "2023-11")).toBe(17);

    const c = articulo40HM265032().compras[0];
    expect(Math.round(c.meses!)).toBe(16);
    expect(c.meses).not.toBeCloseTo(17, 1);
    expect(c.meses).toBeLessThan(17);
  });

  it("diasEntre nunca es negativo y una fecha inválida no explota", () => {
    expect(diasEntre("2025-04-10", "2023-11-28")).toBe(0);
    expect(diasEntre("no-es-fecha", "2025-04-10")).toBe(0);
  });

  it("el umbral es el 90%, no el 100%: los últimos 5 no alargan la medición", () => {
    expect(UMBRAL_VENDIDO).toBe(0.9);
    const c = compra("2024-01-01", 100);
    const dias = [
      { fecha: "2024-03-01", unidades: 90, venta: 900 },
      { fecha: "2024-12-31", unidades: 10, venta: 100 }, // la cola larga
    ];
    const m = medirCompra(c, dias, 0, 0, HOY);
    expect(m.fechaUmbral).toBe("2024-03-01");
    expect(m.meses).toBeCloseTo(diasEntre("2024-01-01", "2024-03-01") / DIAS_POR_MES, 10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPARTO FIFO.
// ─────────────────────────────────────────────────────────────────────────────

describe("repartirFifo — lo que entró primero se vende primero", () => {
  it("la venta sale de la compra MÁS VIEJA disponible, y se derrama a la siguiente", () => {
    const compras = [compra("2024-01-01", 100), compra("2024-06-01", 100)];
    const dias: VentaDia[] = [
      { fecha: "2024-02-01", unidades: 60, venta: 600 },
      { fecha: "2024-07-01", unidades: 60, venta: 600 },
    ];
    const r = repartirFifo(compras, dias);
    expect(r.asignadas).toEqual([100, 20]);
    expect(r.vendidoAntes).toBe(0);
    expect(r.vendidoDeMas).toBe(0);
    // La tanda vieja se llevó los dos días; la nueva solo el segundo.
    expect(r.diasPorCompra[0].map((d) => d.fecha)).toEqual(["2024-02-01", "2024-07-01"]);
    expect(r.diasPorCompra[1].map((d) => d.fecha)).toEqual(["2024-07-01"]);
  });

  it("una venta NO puede salir de una compra POSTERIOR a su fecha — se anota como vendido de más", () => {
    const compras = [compra("2024-01-01", 10), compra("2024-06-01", 100)];
    const dias: VentaDia[] = [{ fecha: "2024-02-01", unidades: 50, venta: 500 }];
    const r = repartirFifo(compras, dias);
    expect(r.asignadas).toEqual([10, 0]); // la de junio TODAVÍA NO LLEGÓ
    expect(r.vendidoDeMas).toBe(40);
    expect(r.vendidoAntes).toBe(0);
  });

  it("ventas ANTERIORES a toda compra van a vendidoAntes — NO se le cargan a la primera tanda", () => {
    const compras = [compra("2024-06-01", 100)];
    const dias: VentaDia[] = [
      { fecha: "2024-01-15", unidades: 20, venta: 200 },
      { fecha: "2024-07-01", unidades: 30, venta: 300 },
    ];
    const r = repartirFifo(compras, dias);
    expect(r.vendidoAntes).toBe(20);
    expect(r.vendidoDeMas).toBe(0);
    // 30, no 50: cargarle las 20 de antes le inventaría meses de duración.
    expect(r.asignadas).toEqual([30]);
    expect(r.diasPorCompra[0].map((d) => d.fecha)).toEqual(["2024-07-01"]);
  });

  it("vendidoAntes y vendidoDeMas son baldes DISTINTOS y no se mezclan", () => {
    const compras = [compra("2024-06-01", 10)];
    const dias: VentaDia[] = [
      { fecha: "2024-01-15", unidades: 7, venta: 70 }, // antes de todo
      { fecha: "2024-07-01", unidades: 25, venta: 250 }, // 10 caben, 15 sobran
    ];
    const r = repartirFifo(compras, dias);
    expect(r.vendidoAntes).toBe(7);
    expect(r.vendidoDeMas).toBe(15);
    expect(r.asignadas).toEqual([10]);
  });

  it("un día NETO negativo devuelve unidades a la compra MÁS NUEVA que había consumido", () => {
    const compras = [compra("2024-01-01", 50), compra("2024-02-01", 50)];
    const dias: VentaDia[] = [
      { fecha: "2024-03-01", unidades: 80, venta: 800 },
      { fecha: "2024-04-01", unidades: -10, venta: -100 },
    ];
    const r = repartirFifo(compras, dias);
    // La devolución NO se le saca a la vieja: es el espejo exacto de FIFO.
    expect(r.asignadas).toEqual([50, 20]);
    const devolucion = r.diasPorCompra[1].find((d) => d.fecha === "2024-04-01");
    expect(devolucion).toMatchObject({ unidades: -10 });
    expect(devolucion!.venta).toBeCloseTo(-100, 6);
    expect(r.diasPorCompra[0].some((d) => d.fecha === "2024-04-01")).toBe(false);
  });

  it("la devolución se derrama hacia atrás si a la más nueva no le alcanza", () => {
    const compras = [compra("2024-01-01", 50), compra("2024-02-01", 50)];
    const dias: VentaDia[] = [
      { fecha: "2024-03-01", unidades: 60, venta: 600 },
      { fecha: "2024-04-01", unidades: -20, venta: -200 },
    ];
    const r = repartirFifo(compras, dias);
    // La nueva tenía 10 → devuelve 10 y quedan 10 que salen de la vieja.
    expect(r.asignadas).toEqual([40, 0]);
  });

  it("una devolución sin nada consumido queda en vendidoDeMas NEGATIVO, no se descarta", () => {
    const compras = [compra("2024-01-01", 50)];
    const r = repartirFifo(compras, [{ fecha: "2024-02-01", unidades: -5, venta: -50 }]);
    expect(r.asignadas).toEqual([0]);
    expect(r.vendidoDeMas).toBe(-5);
  });

  it("sin compras registradas, TODO lo vendido queda en vendidoAntes", () => {
    const r = repartirFifo([], [{ fecha: "2024-02-01", unidades: 9, venta: 90 }]);
    expect(r.asignadas).toEqual([]);
    expect(r.vendidoAntes).toBe(9);
    expect(r.vendidoDeMas).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CUADRE — el gate del ajuste, donde estuvo el bug.
// ─────────────────────────────────────────────────────────────────────────────

const SIN_HUECOS = { vendidoAntes: 0, vendidoDeMas: 0 };

describe("cuadrar — 'se perdió en ajuste' solo cuando la cuenta cierra sola", () => {
  it("artículo CERRADO (existencia 0) con residuo positivo → el ajuste se declara", () => {
    const c = cuadrar(280, 279, 0, SIN_HUECOS);
    expect(c.residuo).toBe(1);
    expect(c.ajusteConfiable).toBe(true);
  });

  it("🩸 TWCAPRE001 (real): 444 comprados el 7-ago-2026, 0 vendidos, 384 en bodega → residuo 60 y NADA de ajuste", () => {
    const c = cuadrar(444, 0, 384, SIN_HUECOS);
    expect(c.residuo).toBe(60);
    // Anunciar "60 se perdieron en ajuste" de un contenedor de hace 4 días es
    // exactamente el número inventado que este módulo vino a eliminar.
    expect(c.ajusteConfiable).toBe(false);
  });

  it("🩸 WW0WW505930A8 (real): 48 / 0 vendidos / 40 en bodega → residuo 8 y NADA de ajuste", () => {
    const c = cuadrar(48, 0, 40, SIN_HUECOS);
    expect(c.residuo).toBe(8);
    expect(c.ajusteConfiable).toBe(false);
  });

  it("con stock VIVO no se declara ajuste AUNQUE el residuo sea enorme", () => {
    const c = cuadrar(10_000, 100, 1, SIN_HUECOS);
    expect(c.residuo).toBe(9_899);
    expect(c.ajusteConfiable).toBe(false);
  });

  it("con ventas ANTERIORES a la primera compra tampoco: la vida del artículo no cabe en lo registrado", () => {
    expect(cuadrar(280, 279, 0, { vendidoAntes: 5, vendidoDeMas: 0 }).ajusteConfiable).toBe(false);
  });

  it("con ventas de MÁS tampoco", () => {
    expect(cuadrar(280, 279, 0, { vendidoAntes: 0, vendidoDeMas: 5 }).ajusteConfiable).toBe(false);
  });

  it("residuo 0 o negativo no es un ajuste: no falta nada (o sobra)", () => {
    expect(cuadrar(100, 100, 0, SIN_HUECOS)).toMatchObject({ residuo: 0, ajusteConfiable: false });
    expect(cuadrar(100, 110, 0, SIN_HUECOS)).toMatchObject({ residuo: -10, ajusteConfiable: false });
  });

  it("sin existencia conocida no hay residuo ni ajuste — 'no lo sabemos' ≠ 'da cero'", () => {
    const c = cuadrar(100, 50, null, SIN_HUECOS);
    expect(c.residuo).toBeNull();
    expect(c.ajusteConfiable).toBe(false);
  });

  it("los contenedores frescos, de punta a punta: la fila NO puede encender el ajuste", () => {
    const a = armarArticulo(
      {
        empresa: "fashion_shoes",
        codigo: "TWCAPRE001",
        descripcion: "TWCAPRE001",
        ingresos: [
          ingreso({
            empresa_key: "fashion_shoes",
            codigo_articulo: "TWCAPRE001",
            fecha: "2026-08-07",
            n_interno: "19-000009999",
            cantidad: 444,
            costo_fob: null,
            costo_cif: null,
            costo_sin_desglosar: 39.6,
          }),
        ],
        ventas: [],
        existencia: 384,
        precioEtiqueta: 79.9,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    expect(a.cuadre.residuo).toBe(60);
    expect(a.cuadre.ajusteConfiable).toBe(false);
    expect(a.compras[0].estado).toBe("viva");
    expect(a.compras[0].quedan).toBe(384);
    expect(a.compras[0].noVendidoNiEnBodega).toBe(60);
    expect(a.compras[0].meses).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPARTO DE LA EXISTENCIA.
// ─────────────────────────────────────────────────────────────────────────────

describe("repartirExistencia — lo que está en bodega es lo ÚLTIMO que llegó", () => {
  it("se reparte de la más NUEVA a la más vieja, y Σ quedan = existencia", () => {
    const compras = [compra("2024-01-01", 100), compra("2024-06-01", 100)];
    const { quedan, noVendidoNiEnBodega, sinRespaldo } = repartirExistencia(compras, [60, 90], 30);
    // Capacidad: [40, 10]. La nueva se lleva sus 10 y el resto cae en la vieja.
    expect(quedan).toEqual([20, 10]);
    expect(quedan.reduce((s, q) => s + q, 0)).toBe(30);
    expect(noVendidoNiEnBodega).toEqual([20, 0]);
    expect(sinRespaldo).toBe(0);
  });

  it("cada compra está TOPEADA por lo que le sobró sin vender", () => {
    const compras = [compra("2024-01-01", 100), compra("2024-06-01", 100)];
    const { quedan } = repartirExistencia(compras, [0, 95], 50);
    // La nueva solo puede sostener 5 aunque haya 50 en bodega.
    expect(quedan).toEqual([45, 5]);
  });

  it("lo que no alcanza va a sinRespaldo — se AVISA en vez de repartirse a la fuerza", () => {
    const compras = [compra("2024-01-01", 100), compra("2024-06-01", 100)];
    const { quedan, sinRespaldo } = repartirExistencia(compras, [60, 90], 80);
    expect(quedan).toEqual([40, 10]);
    expect(quedan.reduce((s, q) => s + q, 0)).toBe(50);
    expect(sinRespaldo).toBe(30);
  });

  it("sin existencia conocida se devuelve el sobrante del reparto, sin inventar faltantes", () => {
    const compras = [compra("2024-01-01", 100)];
    const r = repartirExistencia(compras, [60], null);
    expect(r.quedan).toEqual([40]);
    expect(r.noVendidoNiEnBodega).toEqual([0]);
    expect(r.sinRespaldo).toBe(0);
  });

  it("una compra vendida por completo no sostiene stock", () => {
    const compras = [compra("2024-01-01", 100), compra("2024-06-01", 50)];
    const { quedan } = repartirExistencia(compras, [100, 50], 10);
    expect(quedan).toEqual([0, 0]);
    expect(repartirExistencia(compras, [100, 50], 10).sinRespaldo).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COSTOS DE LÍNEA.
// ─────────────────────────────────────────────────────────────────────────────

describe("costosDeLinea — de dónde salió el FOB que se muestra", () => {
  it("(a) FOB distinto del CIF → 'real'", () => {
    const c = costosDeLinea(ingreso({ costo_fob: 9.5, costo_cif: 11.55, precio: 16 }));
    expect(c).toMatchObject({ cif: 11.55, fob: 9.5, fobOrigen: "real", lista: 16 });
  });

  it("(b) FOB IGUAL al CIF → 'igual-al-cif': NO se corrige ni se estima, se muestra tal cual", () => {
    // Es el caso de 40HM265032 y del 86% de las líneas: error de carga conocido.
    const c = costosDeLinea(ingreso({ costo_fob: 11.55, costo_cif: 11.55, precio: 16 }));
    expect(c.cif).toBe(11.55);
    expect(c.fob).toBe(11.55); // ← tal cual, no 10.5 ni ningún número deducido
    expect(c.fobOrigen).toBe("igual-al-cif");
  });

  it("(c) Fashion Shoes sin desglose: costo_sin_desglosar 39,6 → CIF 39,6 y FOB 36,00 'estimado'", () => {
    const c = costosDeLinea(
      ingreso({ empresa_key: "fashion_shoes", costo_fob: null, costo_cif: null, costo_sin_desglosar: 39.6 }),
    );
    expect(c.cif).toBe(39.6);
    expect(c.fobOrigen).toBe("estimado");
    expect(c.fob).toBeCloseTo(36.0, 6);
  });

  it("🩸 la estimación es DIVISIÓN (CIF ÷ 1,1), NUNCA multiplicación (CIF × 0,9)", () => {
    expect(PCT_IMPORTACION).toBe(0.1);
    const c = costosDeLinea(ingreso({ costo_fob: null, costo_cif: null, costo_sin_desglosar: 39.6 }));
    // 39.6 ÷ 1.1 = 36.00 exacto · 39.6 × 0.9 = 35.64. No es la inversa.
    expect(c.fob).toBeCloseTo(39.6 / 1.1, 10);
    expect(c.fob).not.toBeCloseTo(35.64, 2);
    expect(Number(c.fob!.toFixed(2))).toBe(36.0);
    // Y la vuelta cierra: fob × 1.1 = el CIF.
    expect(c.fob! * (1 + PCT_IMPORTACION)).toBeCloseTo(39.6, 6);
  });

  it("la bandera del sync manda sobre la regla derivada", () => {
    const c = costosDeLinea(ingreso({ costo_fob: 11.55, costo_cif: 11.55, fob_confiable: true }));
    expect(c.fobOrigen).toBe("real");
  });

  it("sin FOB (null o 0) el origen es 'sin-dato' — no se inventa uno", () => {
    expect(costosDeLinea(ingreso({ costo_fob: null, costo_cif: 12 }))).toMatchObject({
      cif: 12,
      fob: null,
      fobOrigen: "sin-dato",
    });
    expect(costosDeLinea(ingreso({ costo_fob: 0, costo_cif: 12 })).fobOrigen).toBe("sin-dato");
  });

  it("los números pueden venir como texto (PostgREST manda numeric como string)", () => {
    const c = costosDeLinea(ingreso({ costo_fob: "9.50", costo_cif: "11.55", precio: "16.00" }));
    expect(c).toMatchObject({ cif: 11.55, fob: 9.5, lista: 16, fobOrigen: "real" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEXTO DE LOS MESES.
// ─────────────────────────────────────────────────────────────────────────────

describe("textoMesesVendidos — consecutivos con flecha, sueltos aparte, agrupado por año", () => {
  it("junta los consecutivos y separa los sueltos", () => {
    expect(textoMesesVendidos(["2024-01", "2024-02", "2024-03", "2024-06"], "2026-08")).toBe(
      "2024: ene→mar, jun",
    );
  });

  it("agrupa por año — sin el año no se sabe si 'ene' fue hace 3 meses o hace 3 años", () => {
    expect(textoMesesVendidos(["2024-11", "2024-12", "2025-01"], "2026-08")).toBe(
      "2024: nov→dic · 2025: ene",
    );
  });

  it("un mes solo se muestra solo, sin flecha", () => {
    expect(textoMesesVendidos(["2025-09"], "2026-08")).toBe("2025: sep");
  });

  it("🩸 ROTULA '(en curso)' cuando el último mes es el mes de HOY — el defecto que este módulo vino a matar", () => {
    expect(textoMesesVendidos(["2026-06", "2026-07", "2026-08"], "2026-08")).toBe(
      "2026: jun→ago (en curso)",
    );
    // Un mes en curso visto igual que uno cerrado hace creer que se vendió un
    // mes entero cuando pueden ser 3 días.
    expect(textoMesesVendidos(["2026-06", "2026-07"], "2026-08")).toBe("2026: jun→jul");
  });

  it("el rótulo va SOLO en el año del mes en curso, no en los anteriores", () => {
    expect(textoMesesVendidos(["2025-03", "2026-08"], "2026-08")).toBe(
      "2025: mar · 2026: ago (en curso)",
    );
  });

  it("no ordena por sorpresa: entrada desordenada, salida cronológica", () => {
    expect(textoMesesVendidos(["2025-05", "2024-01", "2025-04"], "2026-08")).toBe(
      "2024: ene · 2025: abr→may",
    );
  });

  it("sin meses no hay texto", () => {
    expect(textoMesesVendidos([], "2026-08")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AGRUPACIÓN DE LÍNEAS EN COMPRAS.
// ─────────────────────────────────────────────────────────────────────────────

describe("agruparCompras — un documento + un código = UNA compra", () => {
  it("varias líneas del mismo documento se suman: es la MISMA llegada, no dos", () => {
    const compras = agruparCompras([
      ingreso({ fecha: "2024-03-01", n_interno: "19-000000200", linea: 1, cantidad: 400, costo_cif: 10, costo_fob: 9 }),
      ingreso({ fecha: "2024-03-01", n_interno: "19-000000200", linea: 2, cantidad: 2, costo_cif: 100, costo_fob: 90 }),
    ]);
    expect(compras).toHaveLength(1);
    expect(compras[0].unidades).toBe(402);
  });

  it("🩸 los costos se promedian PONDERADO por unidades, NO a secas", () => {
    const [c] = agruparCompras([
      ingreso({ fecha: "2024-03-01", n_interno: "19-000000200", cantidad: 400, costo_cif: 10, costo_fob: 9, precio: 20 }),
      ingreso({ fecha: "2024-03-01", n_interno: "19-000000200", cantidad: 2, costo_cif: 100, costo_fob: 90, precio: 200 }),
    ]);
    // Ponderado: (10×400 + 100×2) ÷ 402 = 10,4478. A secas daría 55.
    expect(c.costos.cif).toBeCloseTo(4200 / 402, 10);
    expect(c.costos.cif).not.toBeCloseTo(55, 1);
    expect(c.costos.fob).toBeCloseTo((9 * 400 + 90 * 2) / 402, 10);
    expect(c.costos.lista).toBeCloseTo((20 * 400 + 200 * 2) / 402, 10);
  });

  it("dos documentos DISTINTOS del mismo día son dos compras", () => {
    const compras = agruparCompras([
      ingreso({ fecha: "2024-03-01", n_interno: "19-000000200", cantidad: 100 }),
      ingreso({ fecha: "2024-03-01", n_interno: "19-000000201", cantidad: 50 }),
    ]);
    expect(compras).toHaveLength(2);
    expect(compras.map((c) => c.unidades)).toEqual([100, 50]);
  });

  it("dos códigos del mismo documento son dos compras", () => {
    const compras = agruparCompras([
      ingreso({ n_interno: "19-000000200", codigo_articulo: "A", cantidad: 10 }),
      ingreso({ n_interno: "19-000000200", codigo_articulo: "B", cantidad: 20 }),
    ]);
    expect(compras).toHaveLength(2);
  });

  it("el origen del FOB del documento es el PEOR de sus líneas", () => {
    const [c] = agruparCompras([
      ingreso({ n_interno: "19-000000200", cantidad: 10, costo_fob: 9, costo_cif: 10 }), // real
      ingreso({ n_interno: "19-000000200", cantidad: 10, costo_fob: 10, costo_cif: 10 }), // igual-al-cif
    ]);
    // Si una sola línea no es creíble, el promedio tampoco lo es.
    expect(c.costos.fobOrigen).toBe("igual-al-cif");
  });

  it("salen ordenadas por fecha — la historia arranca por la más vieja", () => {
    const compras = agruparCompras([
      ingreso({ fecha: "2025-05-09", n_interno: "D", cantidad: 180 }),
      ingreso({ fecha: "2024-08-29", n_interno: "A", cantidad: 120 }),
      ingreso({ fecha: "2025-02-25", n_interno: "C", cantidad: 120 }),
      ingreso({ fecha: "2024-11-25", n_interno: "B", cantidad: 120 }),
    ]);
    expect(compras.map((c) => c.fecha)).toEqual(["2024-08-29", "2024-11-25", "2025-02-25", "2025-05-09"]);
  });

  it("sin líneas no hay compras (y la fila lo dirá, no se rellena con una adivinanza)", () => {
    expect(agruparCompras([])).toEqual([]);
    const a = armarArticulo(
      {
        empresa: "vistana",
        codigo: "SIN-COMPRA",
        descripcion: "SIN COMPRA",
        ingresos: [],
        ventas: [v("2026-01-01", "FA", 5, 50)],
        existencia: 0,
        precioEtiqueta: null,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    expect(a.sinCompraRegistrada).toBe(true);
    expect(a.compras).toEqual([]);
    expect(a.vendidoAntes).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D1617001 — multi-compra real. El ORDEN del reparto es lo que se prueba.
// ─────────────────────────────────────────────────────────────────────────────

/** Las 4 compras REALES de D1617001 (vistana), medidas contra producción. Las
 *  ventas son SINTÉTICAS pero calibradas para reproducir las duraciones
 *  medidas: 2,56 · 1,38 · 5,26 meses, y la cuarta todavía VIVA. */
const COMPRAS_D1617001: FilaIngreso[] = [
  ingreso({ codigo_articulo: "D1617001", fecha: "2024-08-29", n_interno: "19-000000301", cantidad: 120, costo_cif: 4.47, costo_fob: 4.47, precio: 7 }),
  ingreso({ codigo_articulo: "D1617001", fecha: "2024-11-25", n_interno: "19-000000302", cantidad: 120, costo_cif: 4.47, costo_fob: 4.47, precio: 7 }),
  ingreso({ codigo_articulo: "D1617001", fecha: "2025-02-25", n_interno: "19-000000303", cantidad: 120, costo_cif: 4.47, costo_fob: 4.47, precio: 7 }),
  ingreso({ codigo_articulo: "D1617001", fecha: "2025-05-09", n_interno: "19-000000304", cantidad: 180, costo_cif: 3.19, costo_fob: 3.19, precio: 7 }),
];

const VENTAS_D1617001: FilaVenta[] = [
  v("2024-11-15", "FA", 108, 108 * 7), // 90% de la 1ª
  v("2024-12-20", "FA", 12, 12 * 7), //  cierra la 1ª
  v("2025-01-06", "FA", 108, 108 * 7), // 90% de la 2ª
  v("2025-03-01", "FA", 12, 12 * 7), //  cierra la 2ª
  v("2025-08-04", "FA", 108, 108 * 7), // 90% de la 3ª
  v("2025-09-01", "FA", 12, 12 * 7), //  cierra la 3ª
];

describe("D1617001 — cuatro llegadas, cada una con SU duración", () => {
  const a = armarArticulo(
    {
      empresa: "vistana",
      codigo: "D1617001",
      descripcion: "D1617001",
      ingresos: COMPRAS_D1617001,
      ventas: VENTAS_D1617001,
      existencia: 180,
      precioEtiqueta: 7,
      catalogoSyncedAt: null,
    },
    HOY,
  );
  // La más NUEVA primero: es la que se está decidiendo comprar otra vez.
  const [d2025_05, d2025_02, d2024_11, d2024_08] = a.compras;

  it("la más NUEVA va primero", () => {
    expect(a.compras.map((c) => c.fecha)).toEqual([
      "2025-05-09",
      "2025-02-25",
      "2024-11-25",
      "2024-08-29",
    ]);
  });

  it("cada tanda se llevó SUS ventas — el reparto va del más viejo al más nuevo", () => {
    expect(d2024_08.vendidas).toBe(120);
    expect(d2024_11.vendidas).toBe(120);
    expect(d2025_02.vendidas).toBe(120);
    expect(d2025_05.vendidas).toBe(0); // llegó y todavía no se tocó
  });

  it("las duraciones medidas: 2,56 · 1,38 · 5,26 meses, y la de mayo sigue VIVA", () => {
    expect(d2024_08.meses).toBeCloseTo(2.56, 2);
    expect(d2024_11.meses).toBeCloseTo(1.38, 2);
    expect(d2025_02.meses).toBeCloseTo(5.26, 2);

    expect(d2024_08.estado).toBe("medida");
    expect(d2024_11.estado).toBe("medida");
    expect(d2025_02.estado).toBe("medida");
    expect(d2025_05.estado).toBe("viva");
    expect(d2025_05.meses).toBeNull();
  });

  it("🩸 la venta de nov-2024 NO se le carga a la compra de nov-2024 SOLO por ser la más nueva: FIFO manda", () => {
    // El 15-nov-2024 la 2ª compra todavía no había llegado (25-nov).
    expect(d2024_08.mesesConVenta).toContain("2024-11");
    expect(d2024_11.mesesConVenta).not.toContain("2024-11");
    // Y lo de diciembre TAMPOCO: a la de agosto todavía le quedaban 12 unidades,
    // así que la de noviembre recién empieza a vender en enero.
    expect(d2024_08.mesesConVenta).toContain("2024-12");
    expect(d2024_11.mesesConVenta[0]).toBe("2025-01");
  });

  it("el stock de hoy se apoya en la ÚLTIMA llegada, y Σ quedan = existencia", () => {
    expect(a.compras.map((c) => c.quedan)).toEqual([180, 0, 0, 0]);
    expect(a.compras.reduce((s, c) => s + c.quedan, 0)).toBe(a.existencia);
    expect(a.stockSinRespaldo).toBe(0);
  });

  it("la cuenta cierra sin ajuste: 540 comprados = 360 vendidos + 180 en bodega", () => {
    expect(a.cuadre).toMatchObject({ comprado: 540, vendido: 360, existencia: 180, residuo: 0 });
    expect(a.cuadre.ajusteConfiable).toBe(false);
  });

  it("el precio de la última llegada bajó de $4,47 a $3,19 de CIF y se lee en SU fila", () => {
    expect(d2025_05.costos.cif).toBeCloseTo(3.19, 6);
    expect(d2024_08.costos.cif).toBeCloseTo(4.47, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS Y BORDES DE medirCompra.
// ─────────────────────────────────────────────────────────────────────────────

describe("medirCompra — los cuatro estados", () => {
  it("'sin-ventas': llegó y no vendió nada, sin stock que la sostenga", () => {
    const m = medirCompra(compra("2024-01-01", 100), [], 0, 100, HOY);
    expect(m.estado).toBe("sin-ventas");
    expect(m.meses).toBeNull();
    expect(m.fechaUmbral).toBeNull();
    expect(m.precioVendido).toBeNull();
    expect(m.descuento).toBeNull();
  });

  it("'viva': todavía queda mercancía de esta llegada", () => {
    const m = medirCompra(compra("2024-01-01", 100), [{ fecha: "2024-02-01", unidades: 10, venta: 100 }], 90, 0, HOY);
    expect(m.estado).toBe("viva");
    expect(m.meses).toBeNull();
  });

  it("'cerrada-sin-90': se cerró sin llegar al 90% y se mide hasta su ÚLTIMA venta", () => {
    const m = medirCompra(
      compra("2024-01-01", 100),
      [
        { fecha: "2024-02-01", unidades: 30, venta: 300 },
        { fecha: "2024-05-01", unidades: 20, venta: 200 },
      ],
      0,
      50,
      HOY,
    );
    expect(m.estado).toBe("cerrada-sin-90");
    expect(m.fechaUmbral).toBeNull();
    expect(m.meses).toBeCloseTo(diasEntre("2024-01-01", "2024-05-01") / DIAS_POR_MES, 10);
  });

  it("el descuento sale de lo que se vendió CONTRA la lista de la compra", () => {
    const c = compra("2024-01-01", 100, { costos: { cif: 5, fob: 4, fobOrigen: "real", lista: 20 } });
    const m = medirCompra(c, [{ fecha: "2024-02-01", unidades: 90, venta: 90 * 15 }], 10, 0, HOY);
    expect(m.precioVendido).toBeCloseTo(15, 6);
    expect(m.descuento).toBeCloseTo(0.25, 6); // (20 − 15) ÷ 20
  });

  it("sin precio de lista no hay descuento — no se inventa uno", () => {
    const c = compra("2024-01-01", 100, { costos: { cif: 5, fob: 4, fobOrigen: "real", lista: null } });
    const m = medirCompra(c, [{ fecha: "2024-02-01", unidades: 90, venta: 900 }], 0, 10, HOY);
    expect(m.precioVendido).toBeCloseTo(10, 6);
    expect(m.descuento).toBeNull();
  });

  it("los meses en que vendió no cuentan los días de DEVOLUCIÓN pura", () => {
    const m = medirCompra(
      compra("2024-01-01", 100),
      [
        { fecha: "2024-02-01", unidades: 95, venta: 950 },
        { fecha: "2024-07-15", unidades: -5, venta: -50 },
      ],
      10,
      0,
      HOY,
    );
    expect(m.mesesConVenta).toEqual(["2024-02"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VENTANA DE HISTORIA.
// ─────────────────────────────────────────────────────────────────────────────

describe("ventana de 3 años — el recorte es de PANTALLA, no del reparto", () => {
  it("una compra vieja queda fuera de la lista pero SÍ absorbió sus ventas", () => {
    const a = armarArticulo(
      {
        empresa: "vistana",
        codigo: "VIEJO",
        descripcion: "VIEJO",
        ingresos: [
          ingreso({ codigo_articulo: "VIEJO", fecha: "2022-11-01", n_interno: "VIEJA", cantidad: 100 }),
          ingreso({ codigo_articulo: "VIEJO", fecha: "2025-01-10", n_interno: "NUEVA", cantidad: 100 }),
        ],
        ventas: [v("2022-12-01", "FA", 100, 1000), v("2025-02-01", "FA", 90, 900)],
        existencia: 10,
        precioEtiqueta: 10,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    expect(a.comprasFueraDeVentana).toBe(1);
    expect(a.compras).toHaveLength(1);
    expect(a.compras[0].fecha).toBe("2025-01-10");
    // Si las ventas de 2022 se le hubieran cargado a la compra visible, ésta
    // saldría con 100 vendidas en vez de 90 — la mentira que se evita.
    expect(a.compras[0].vendidas).toBe(90);
    expect(a.vendidoAntes).toBe(0);
    expect(a.vendidoDeMas).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL RESUMEN DEL ARTÍCULO — "cuánto tengo" y "en cuántos meses se vendió".
//
// 🩸 EL CASO QUE MANDA ES `NB2570001` (Vistana), medido contra producción:
// existencia 345, y DOS compras agotadas de 240 que llegaron con OCHO DÍAS de
// diferencia (1 y 9 de abril de 2025) y tardaron 7,20 y 15,21 meses. El 15,21
// no es "lo que tarda un lote de 240": es lo que tardó ESE lote esperando en
// bodega a que se acabara el de adelante. Por eso acá NO hay promedio (daría
// 11, que no es ninguno de los dos) ni rango (haría creer que 240 unidades
// pueden tardar 15 meses solas).
// ─────────────────────────────────────────────────────────────────────────────


describe("resumen del artículo", () => {
  /**
   * `NB2570001` reconstruido con los números medidos contra producción:
   * 2 tandas de 240 encoladas (1 y 9 de abril), 3 vivas, existencia 345.
   * Las NC van en POSITIVO, como llegan de Switch.
   *
   * El reparto FIFO que producen estas ventas es el REAL:
   *   · 6-nov-2025: 216 u → toda a la tanda A, que cruza su 90% ese día (7,20 m)
   *   · 16-jul-2026: 264 FA − 24 NC = 240 netas → 24 completan A y 216 cruzan
   *     el 90% de B, quince meses después de llegar (15,21 m)
   */
  const NB = {
    empresa: "vistana",
    codigo: "NB2570001",
    descripcion: "Men-Boxer Brief",
    ingresos: [
      ingreso({ codigo_articulo: "NB2570001", fecha: "2025-04-01", n_interno: "A", cantidad: 240 }),
      ingreso({ codigo_articulo: "NB2570001", fecha: "2025-04-09", n_interno: "B", cantidad: 240 }),
      ingreso({ codigo_articulo: "NB2570001", fecha: "2025-10-21", n_interno: "C", cantidad: 60 }),
      ingreso({ codigo_articulo: "NB2570001", fecha: "2026-02-11", n_interno: "D", cantidad: 120 }),
      ingreso({ codigo_articulo: "NB2570001", fecha: "2026-02-19", n_interno: "E", cantidad: 180 }),
    ],
    ventas: [
      v("2025-11-06", "FA", 216, 2160),
      v("2026-07-16", "FA", 264, 2640),
      v("2026-07-16", "NC", 24, 240),
    ],
    existencia: 345,
    precioEtiqueta: 10,
    catalogoSyncedAt: null,
  };

  it("da el total de bodega del artículo entero, no fila por fila", () => {
    const a = armarArticulo(NB, HOY);
    // 180 + 120 + 45 = 345, que es lo que Daniel tenía que sumar de cabeza.
    expect(a.resumen.enBodega).toBe(345);
    expect(a.resumen.bodegaDeSwitch).toBe(true);
    expect(a.compras.reduce((s, c) => s + c.quedan, 0)).toBe(345);
  });

  it("las dos tandas encoladas dan 7 y 15 meses — el reparto FIFO es el real", () => {
    const a = armarArticulo(NB, HOY);
    const agotadas = a.compras.filter((c) => c.fechaCorte != null);
    expect(agotadas).toHaveLength(2);
    expect(agotadas.map((c) => Math.round(c.meses!)).sort((x, y) => x - y)).toEqual([7, 15]);
  });

  it("mide las tandas encoladas como UN bloque, sin sumarlas dos veces", () => {
    const r = armarArticulo(NB, HOY).resumen;
    expect(r.comprasAgotadas).toBe(2);
    expect(r.unidadesAgotadas).toBe(480);

    // Unión 1-abr-2025 → 16-jul-2026 = 471 días = 15,47 meses.
    expect(r.mesesAgotadas).toBeCloseTo(15.47, 1);

    // 🔴 Las tres formas descartadas NO pueden colarse de vuelta:
    // sumar las duraciones daría 22,4 (contaría dos veces el tramo compartido)…
    expect(r.mesesAgotadas!).toBeLessThan(22);
    // …y el promedio simple daría 11, que no describe ninguna de las dos tandas.
    expect(Math.round(r.mesesAgotadas!)).toBe(15);
    // Y jamás se divide para sacar un ritmo: las unidades viajan al lado.
    expect(textoAgotadas(r)).toBe("Ya se acabaron 2 compras: 480 u en 15 meses");
  });

  it("las NC restan: sumarlas cambiaría los meses medidos", () => {
    // Una tanda sola de 100: el 90% son 90 unidades.
    const base = {
      empresa: "vistana",
      codigo: "NCTEST",
      descripcion: "X",
      ingresos: [ingreso({ codigo_articulo: "NCTEST", fecha: "2025-01-01", cantidad: 100 })],
      existencia: 10,
      precioEtiqueta: null,
      catalogoSyncedAt: null,
    };
    // 90 FA − 10 NC = 80 netas en abril (NO llega al 90%), y recién en
    // septiembre cruza el umbral → 8 meses.
    const bien = armarArticulo(
      { ...base, ventas: [v("2025-04-01", "FA", 90, 900), v("2025-04-01", "NC", 10, 100), v("2025-09-01", "FA", 10, 100)] },
      HOY,
    );
    // Si la NC se SUMARA, abril daría 100 netas y el 90% caería ese mismo día.
    const mal = armarArticulo(
      { ...base, ventas: [v("2025-04-01", "FA", 90, 900), v("2025-04-01", "FA", 10, 100), v("2025-09-01", "FA", 10, 100)] },
      HOY,
    );
    expect(Math.round(bien.resumen.mesesAgotadas!)).toBe(8);
    expect(Math.round(mal.resumen.mesesAgotadas!)).toBe(3);
  });

  it("cuando las filas no explican todo el stock, manda el de Switch y se avisa", () => {
    // Medido en `17FN443460`: Switch dice 36 y la única compra solo sostiene 24.
    const a = armarArticulo(
      {
        empresa: "fashion_wear",
        codigo: "17FN443460",
        descripcion: "X",
        ingresos: [ingreso({ codigo_articulo: "17FN443460", fecha: "2025-06-01", cantidad: 24 })],
        ventas: [],
        existencia: 36,
        precioEtiqueta: null,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    expect(a.resumen.enBodega).toBe(36); // el de Switch, nunca el deducido
    expect(a.resumen.bodegaFueraDeLasFilas).toBe(12); // y se dice, no se esconde
  });

  it("sin compras agotadas no inventa un número", () => {
    const a = armarArticulo(
      {
        empresa: "vistana",
        codigo: "VIVO",
        descripcion: "X",
        ingresos: [ingreso({ codigo_articulo: "VIVO", fecha: "2026-06-01", cantidad: 50 })],
        ventas: [v("2026-06-10", "FA", 5, 50)],
        existencia: 45,
        precioEtiqueta: null,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    expect(a.resumen.comprasAgotadas).toBe(0);
    expect(a.resumen.mesesAgotadas).toBeNull(); // ni 0 ni un guion mudo
    expect(a.resumen.unidadesAgotadas).toBe(0);
    expect(a.resumen.enBodega).toBe(45);
    expect(textoAgotadas(a.resumen)).toBe("Todavía no se ha acabado ninguna compra");
  });

  it("un artículo agotado dice 0, no desaparece", () => {
    const a = armarArticulo(
      {
        empresa: "vistana",
        codigo: "SECO",
        descripcion: "X",
        ingresos: [ingreso({ codigo_articulo: "SECO", fecha: "2025-01-01", cantidad: 10 })],
        ventas: [v("2025-03-15", "FA", 10, 100)],
        existencia: 0,
        precioEtiqueta: null,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    expect(a.resumen.enBodega).toBe(0);
    expect(a.resumen.bodegaDeSwitch).toBe(true);
    expect(a.resumen.comprasAgotadas).toBe(1);
  });

  it("sin existencia de Switch el número queda MARCADO como deducido", () => {
    const a = armarArticulo(
      {
        empresa: "fashion_wear",
        codigo: "SINCAT",
        descripcion: "X",
        ingresos: [ingreso({ codigo_articulo: "SINCAT", fecha: "2025-01-01", cantidad: 10 })],
        ventas: [v("2025-02-01", "FA", 4, 40)],
        existencia: null,
        precioEtiqueta: null,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    expect(a.resumen.bodegaDeSwitch).toBe(false);
    expect(a.resumen.enBodega).toBe(6);
  });

  // ── EL CANDADO DEL MES EN CURSO ───────────────────────────────────────────
  // Daniel rechazó los promedios de 3/6/12 meses porque metían el mes en curso
  // adentro: medido, los "últimos 3 meses" daban 18,3 u/mes contra 34,3 con
  // meses completos, el DOBLE. El resumen sale SOLO de tandas ya terminadas,
  // cuyas dos puntas son hechos PASADOS (el día que llegó y el día que se
  // acabó), así que ni el calendario ni una venta de hoy pueden moverlo.
  it("el resumen no depende de qué día es hoy", () => {
    const alDia11 = armarArticulo(NB, "2026-08-11").resumen;
    const alDia31 = armarArticulo(NB, "2026-08-31").resumen;
    expect(alDia31.mesesAgotadas).toBe(alDia11.mesesAgotadas);
    expect(alDia31.unidadesAgotadas).toBe(alDia11.unidadesAgotadas);
    expect(alDia31.comprasAgotadas).toBe(alDia11.comprasAgotadas);
  });

  it("vender HOY sobre una tanda viva no mueve el resumen", () => {
    const base = armarArticulo(NB, HOY).resumen;
    // La venta de hoy sale de una tanda que sigue viva: no acaba nada.
    const conVentaDeHoy = armarArticulo({ ...NB, ventas: [...NB.ventas, v(HOY, "FA", 10, 100)] }, HOY);
    expect(conVentaDeHoy.resumen.mesesAgotadas).toBe(base.mesesAgotadas);
    expect(conVentaDeHoy.resumen.unidadesAgotadas).toBe(base.unidadesAgotadas);
    expect(conVentaDeHoy.resumen.comprasAgotadas).toBe(base.comprasAgotadas);
  });

  it("un hueco sin mercancía entre dos tandas no se cuenta como tiempo vendiendo", () => {
    // Tanda 1: llega ene-2025, se acaba feb-2025. Hueco de casi un año SIN nada.
    // Tanda 2: llega ene-2026, se acaba feb-2026. Son ~2 meses vendiendo, no 13.
    const a = armarArticulo(
      {
        empresa: "vistana",
        codigo: "HUECO",
        descripcion: "X",
        ingresos: [
          ingreso({ codigo_articulo: "HUECO", fecha: "2025-01-01", n_interno: "P", cantidad: 10 }),
          ingreso({ codigo_articulo: "HUECO", fecha: "2026-01-01", n_interno: "Q", cantidad: 10 }),
        ],
        ventas: [v("2025-02-01", "FA", 10, 100), v("2026-02-01", "FA", 10, 100)],
        existencia: 0,
        precioEtiqueta: null,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    expect(a.resumen.comprasAgotadas).toBe(2);
    // ~1 mes + ~1 mes = ~2, NO los 13 meses de punta a punta.
    expect(a.resumen.mesesAgotadas!).toBeLessThan(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// "SE VENDIÓ" — unidades + tiempo, y el inventario UNA sola vez.
//
// 🩸 Daniel, mirando la pantalla publicada: *"me sale dos veces mi inv, esta
// bien? que opinas? y no me esta diciendo cuanto vendi y cuantos meses"*. La
// celda decía "te quedan 126" al lado de la columna QUEDA que ya decía 126.
//
// El caso medido es `QD3958033` (Vistana): llegó el 26-dic-2025 con 180 u, van
// 54 vendidas (netas) y quedan 126 en Switch. 180 − 54 = 126: CUADRA EXACTO.
// ─────────────────────────────────────────────────────────────────────────────

describe("la columna SE VENDIÓ", () => {
  const QD = {
    empresa: "vistana",
    codigo: "QD3958033",
    descripcion: "Women-Panties",
    ingresos: [ingreso({ codigo_articulo: "QD3958033", fecha: "2025-12-26", cantidad: 180, precio: 7 })],
    ventas: [
      v("2026-01-29", "FA", 12, 84),
      v("2026-02-12", "FA", 12, 84),
      v("2026-03-05", "FA", 6, 30),
      v("2026-04-10", "FA", 24, 168),
      v("2026-04-10", "NC", 12, 84), // devolución: llega POSITIVA y RESTA
      v("2026-05-18", "FA", 12, 84),
    ],
    existencia: 126,
    precioEtiqueta: 7,
    catalogoSyncedAt: null,
  };

  it("dice las UNIDADES vendidas, no repite el inventario", () => {
    const c = armarArticulo(QD, HOY).compras[0];
    expect(c.estado).toBe("viva");
    expect(c.vendidas).toBe(54);
    expect(c.quedan).toBe(126);
    // 🔴 El texto NO puede volver a decir lo que ya dice la columna QUEDA.
    const texto = textoSeVendio(c);
    expect(texto).toBe("54 u en 7 meses");
    expect(texto).not.toContain("te quedan");
    expect(texto).not.toContain("126");
  });

  it("la cuenta CUADRA: lo comprado menos lo vendido es lo que dice Switch", () => {
    const a = armarArticulo(QD, HOY);
    // 180 − 54 = 126, el mismo número que reporta Switch. No hay ajuste que
    // mostrar, y no se inventa uno: el residuo es CERO.
    expect(a.cuadre.comprado).toBe(180);
    expect(a.cuadre.vendido).toBe(54);
    expect(a.cuadre.residuo).toBe(0);
    expect(a.resumen.bodegaFueraDeLasFilas).toBe(0);
  });

  it("el precio real sale de las ventas NETAS", () => {
    const c = armarArticulo(QD, HOY).compras[0];
    // $366.00 ÷ 54 = $6.78. Sumar las NC daría $450 ÷ 66 = $6.82.
    expect(c.precioVendido).toBeCloseTo(6.78, 2);
  });

  it("una tanda viva cuenta el tiempo que lleva en la casa; una acabada, lo que tardó", () => {
    const viva = armarArticulo(QD, HOY).compras[0];
    expect(viva.estado).toBe("viva");
    // 26-dic-2025 → 11-ago-2026 = 228 días ≈ 7,5 meses.
    expect(viva.mesesTranscurridos).toBeCloseTo(7.49, 1);
    expect(mesesDeCompra(viva)).toBe(viva.mesesTranscurridos);

    // La misma compra ya acabada mide hasta el 90%, no hasta hoy.
    const acabada = armarArticulo({ ...QD, ventas: [...QD.ventas, v("2026-06-01", "FA", 108, 756)], existencia: 18 }, HOY)
      .compras[0];
    expect(acabada.estado).toBe("medida");
    expect(mesesDeCompra(acabada)).toBe(acabada.meses);
    expect(acabada.meses!).toBeLessThan(acabada.mesesTranscurridos);
  });

  it("sin ninguna venta lo dice con todas las letras, no con un cero pelado", () => {
    const c = armarArticulo({ ...QD, ventas: [], existencia: 180 }, HOY).compras[0];
    // Llegó hace 7 meses y no vendió NADA: el tiempo es justo lo que hay que ver.
    expect(textoSeVendio(c)).toBe("nada en 7 meses");
    expect(textoSeVendio(c)).not.toContain("0 u");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DICE LO MISMO QUE LA PANTALLA.
//
// Daniel baja este Excel para trabajarlo aparte. Si dijera otra cosa que la
// pantalla tendríamos dos verdades, y él no dejaría de creerle al que está mal:
// dejaría de creerles a los dos.
// ─────────────────────────────────────────────────────────────────────────────

describe("el Excel de Referencia", () => {
  const ART = () =>
    armarArticulo(
      {
        empresa: "vistana",
        codigo: "NB2570001",
        descripcion: "Men-Boxer Brief",
        ingresos: [
          ingreso({ codigo_articulo: "NB2570001", fecha: "2025-04-01", n_interno: "A", cantidad: 240 }),
          ingreso({ codigo_articulo: "NB2570001", fecha: "2026-02-19", n_interno: "E", cantidad: 180 }),
        ],
        ventas: [v("2025-11-06", "FA", 216, 2160)],
        existencia: 204,
        precioEtiqueta: 10,
        catalogoSyncedAt: null,
      },
      HOY,
    );

  async function filasDelSheet() {
    const XLSX = await import("xlsx-js-style");
    const { buildComprasSheet } = await import("@/lib/ventas/referencia-excel");
    const ws = await buildComprasSheet([ART()], "2026-08");
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
    const encabezado = filas.find((f) => f.includes("Referencia")) as string[];
    const cuerpo = filas.slice(filas.indexOf(encabezado) + 1);
    const porNombre = (f: unknown[]) =>
      Object.fromEntries(encabezado.map((h, i) => [h, f[i]])) as Record<string, unknown>;
    return { encabezado, cuerpo: cuerpo.map(porNombre) };
  }

  // 🔴 LA HOJA 1 ES LA PANTALLA: una fila por ARTÍCULO con los tres números
  // grandes, el precio real, el margen y los 12 meses. Daniel baja este archivo
  // para escribir en él la cantidad que va a pedir — si trajera solo la materia
  // prima tendría que rehacer la cuenta afuera.
  async function filasDeReferencia() {
    const XLSX = await import("xlsx-js-style");
    const { buildReferenciaSheet } = await import("@/lib/ventas/referencia-excel");
    const ws = await buildReferenciaSheet([ART()], "2026-08");
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
    const encabezado = filas.find((f) => f.includes("Referencia")) as string[];
    const cuerpo = filas.slice(filas.indexOf(encabezado) + 1);
    const porNombre = (f: unknown[]) =>
      Object.fromEntries(encabezado.map((h, i) => [h, f[i]])) as Record<string, unknown>;
    return { encabezado, cuerpo: cuerpo.map(porNombre) };
  }

  it("la hoja 1 trae los TRES números y el margen — una fila por artículo", async () => {
    const { encabezado, cuerpo } = await filasDeReferencia();
    for (const col of [
      "Mi última compra",
      "Vendo por mes",
      "Me queda para (meses)",
      "Vendí a",
      "Me costó (CIF)",
      "Margen",
      "En bodega",
    ]) {
      expect(encabezado, `falta la columna "${col}"`).toContain(col);
    }
    expect(cuerpo).toHaveLength(1); // un artículo = una fila
    expect(cuerpo[0]["Referencia"]).toBe("NB2570001");
    expect(cuerpo[0]["En bodega"]).toBe(204);
    // La ÚLTIMA compra es la del 19-feb-2026, no la agotada de abril.
    expect(cuerpo[0]["Llegó"]).toBe("2026-02-19");
    expect(cuerpo[0]["Anterior: llegó"]).toBe("2025-04-01");
  });

  it("la hoja 1 trae los 12 meses COMPLETOS en columnas, sin el mes en curso", async () => {
    const { encabezado } = await filasDeReferencia();
    // Corte 2026-08 → la ventana termina en jul 2026 y arranca en ago 2025.
    expect(encabezado).toContain("jul 2026");
    expect(encabezado).toContain("ago 2025");
    expect(encabezado).not.toContain("ago 2026"); // 🔴 el mes en curso NUNCA
  });

  it("🩸 la columna DESC. (descuento) se fue de las dos hojas — Daniel: 'no sirve'", async () => {
    const { encabezado: hoja1 } = await filasDeReferencia();
    const { encabezado: hoja2 } = await filasDelSheet();
    for (const h of [...hoja1, ...hoja2]) expect(h).not.toBe("Desc.");
  });

  it("baja las unidades vendidas y los meses de CADA compra, como números", async () => {
    const { encabezado, cuerpo } = await filasDelSheet();
    expect(encabezado).toContain("U. vendidas");
    expect(encabezado).toContain("Meses");
    // La compra agotada: 240 u que tardaron 7,2 meses.
    const agotada = cuerpo.find((f) => f["Llegó"] === "2025-04-01")!;
    expect(agotada["U. vendidas"]).toBe(216);
    expect(agotada["Meses"]).toBeCloseTo(7.2, 1);
    // La viva: 0 vendidas, y los meses son los que lleva en la casa.
    const viva = cuerpo.find((f) => f["Llegó"] === "2026-02-19")!;
    expect(viva["U. vendidas"]).toBe(0);
    expect(typeof viva["Meses"]).toBe("number");
  });

  it("la columna del precio NO se llama como si fuera una cantidad", async () => {
    const { encabezado } = await filasDelSheet();
    expect(encabezado).toContain("Salió a");
    // "Vendido" a secas se leía como unidades — el defecto que cazó Daniel.
    expect(encabezado).not.toContain("Vendido");
    // Y el inventario aparece UNA sola vez por compra.
    expect(encabezado.filter((h) => h === "Queda")).toHaveLength(1);
  });
});
