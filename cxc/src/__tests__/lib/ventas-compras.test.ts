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
// con el Kardex: 280 compradas el 28-nov-2023, 279 vendidas, 0 en bodega y 1
// perdida en ajuste. Todo lo demás son bordes alrededor de eso.
//
// 🩸 EL "SE VENDIÓ EN 16,4 MESES" YA NO SE CALCULA, Y NO ES UN OLVIDO. Salía de
// repartir las ventas entre las compras (FIFO), y eso solo se sostiene si la
// mercancía viene marcada por tanda — no viene. Cuando llega un contenedor
// SOBRE stock que todavía no se acaba, decir de qué compra salió una venta es
// INVENTAR, y en `NB2570001` el resultado era "van 0 de 180" con el artículo
// vendiendo 28 u/mes. Las compras se muestran CRUDAS y la aritmética que quedó
// es de ARTÍCULO (`ventas-resumen-articulo.test.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  PCT_IMPORTACION,
  agruparCompras,
  armarArticulo,
  cotejarVentasConCompras,
  costosDeLinea,
  cuadrar,
  ventasNetasPorDia,
  type Compra,
  type FilaIngreso,
  type VentaDia,
} from "@/lib/ventas/compras";
import { signoTipo } from "@/lib/ventas/referencia";

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
  it("una sola compra de 280 el 28-nov-2023, y así se muestra: fecha y cantidad", () => {
    const a = articulo40HM265032();

    expect(a.sinCompraRegistrada).toBe(false);
    expect(a.compras).toHaveLength(1);
    expect(a.comprasFueraDeVentana).toBe(0);

    const c = a.compras[0];
    expect(c.fecha).toBe("2023-11-28");
    expect(c.documento).toBe("19-000000100");
    expect(c.proveedor).toBe("American Designer Fashion");
    expect(c.unidades).toBe(280);
    expect(c.costos.cif).toBeCloseTo(11.55, 6);
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
// COTEJO CRONOLÓGICO — lo que reemplazó al reparto FIFO.
//
// 🩸 ACÁ VIVÍAN LOS TESTS DE `repartirFifo`, QUE REPARTÍA LAS VENTAS ENTRE LAS
// COMPRAS PARA PODER DECIR "esta llegada tardó 15 meses". Se fue entero: cuando
// la mercancía llega SOBRE stock que todavía no se acaba, ese reparto es
// INVENTADO —nadie marcó las cajas— y en `NB2570001` producía "van 0 de 180"
// mientras el artículo vendía 28 u/mes.
//
// Lo único que sobrevive es lo que SÍ se puede afirmar sin marcar cajas, y es
// agregado: ¿alcanza lo que había llegado hasta ese día para explicar lo que se
// vendió? Los dos huecos posibles (`vendidoAntes`, `vendidoDeMas`) se conservan
// EXACTAMENTE con la misma semántica que tenían bajo FIFO — son los que
// habilitan o bloquean el aviso del ajuste de inventario.
// ─────────────────────────────────────────────────────────────────────────────

describe("cotejarVentasConCompras — ¿lo vendido sale de lo comprado?", () => {
  it("lo que cabe en lo que ya llegó queda RESPALDADO, sin decir de qué compra salió", () => {
    const compras = [compra("2024-01-01", 100), compra("2024-06-01", 100)];
    const dias: VentaDia[] = [
      { fecha: "2024-02-01", unidades: 60, venta: 600 },
      { fecha: "2024-07-01", unidades: 60, venta: 600 },
    ];
    const r = cotejarVentasConCompras(compras, dias);
    expect(r.respaldado).toBe(120);
    expect(r.vendidoAntes).toBe(0);
    expect(r.vendidoDeMas).toBe(0);
    // 🔴 Y NO hay ningún campo por compra: eso es lo que se eliminó.
    expect(Object.keys(r).sort()).toEqual(["respaldado", "vendidoAntes", "vendidoDeMas"]);
  });

  it("una venta NO se puede explicar con una compra POSTERIOR — va a vendidoDeMas", () => {
    const compras = [compra("2024-01-01", 10), compra("2024-06-01", 100)];
    const r = cotejarVentasConCompras(compras, [{ fecha: "2024-02-01", unidades: 50, venta: 500 }]);
    expect(r.respaldado).toBe(10); // la de junio TODAVÍA NO LLEGÓ
    expect(r.vendidoDeMas).toBe(40);
    expect(r.vendidoAntes).toBe(0);
  });

  it("ventas ANTERIORES a toda compra van a vendidoAntes: falta una compra que no tenemos", () => {
    const compras = [compra("2024-06-01", 100)];
    const r = cotejarVentasConCompras(compras, [
      { fecha: "2024-01-15", unidades: 20, venta: 200 },
      { fecha: "2024-07-01", unidades: 30, venta: 300 },
    ]);
    expect(r.vendidoAntes).toBe(20);
    expect(r.vendidoDeMas).toBe(0);
    expect(r.respaldado).toBe(30); // 30, no 50: las 20 de antes no salieron de acá
  });

  it("vendidoAntes y vendidoDeMas son baldes DISTINTOS y no se mezclan", () => {
    const compras = [compra("2024-06-01", 10)];
    const r = cotejarVentasConCompras(compras, [
      { fecha: "2024-01-15", unidades: 7, venta: 70 }, // antes de todo
      { fecha: "2024-07-01", unidades: 25, venta: 250 }, // 10 caben, 15 sobran
    ]);
    expect(r.vendidoAntes).toBe(7);
    expect(r.vendidoDeMas).toBe(15);
    expect(r.respaldado).toBe(10);
  });

  it("un día NETO negativo devuelve unidades a lo respaldado", () => {
    const compras = [compra("2024-01-01", 50), compra("2024-02-01", 50)];
    const r = cotejarVentasConCompras(compras, [
      { fecha: "2024-03-01", unidades: 80, venta: 800 },
      { fecha: "2024-04-01", unidades: -10, venta: -100 },
    ]);
    expect(r.respaldado).toBe(70);
    expect(r.vendidoDeMas).toBe(0);
  });

  it("una devolución sin nada consumido queda en vendidoDeMas NEGATIVO, no se descarta", () => {
    const r = cotejarVentasConCompras(
      [compra("2024-01-01", 50)],
      [{ fecha: "2024-02-01", unidades: -5, venta: -50 }],
    );
    expect(r.respaldado).toBe(0);
    expect(r.vendidoDeMas).toBe(-5);
  });

  it("sin compras registradas, TODO lo vendido queda en vendidoAntes", () => {
    const r = cotejarVentasConCompras([], [{ fecha: "2024-02-01", unidades: 9, venta: 90 }]);
    expect(r.vendidoAntes).toBe(9);
    expect(r.vendidoDeMas).toBe(0);
    expect(r.respaldado).toBe(0);
  });

  it("una compra de 0 unidades IGUAL es una llegada: lo que sobra ya no es 'vendidoAntes'", () => {
    // El borde que separa "no había llegado nada" de "llegó y se agotó". Si se
    // preguntara por unidades en vez de por compras llegadas, esto daría
    // vendidoAntes y el aviso de pantalla diría lo contrario de lo que pasó.
    const r = cotejarVentasConCompras(
      [compra("2024-01-01", 0)],
      [{ fecha: "2024-02-01", unidades: 5, venta: 50 }],
    );
    expect(r.vendidoAntes).toBe(0);
    expect(r.vendidoDeMas).toBe(5);
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
    expect(a.compras[0].unidades).toBe(444);
    expect(a.stockSinRespaldo).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STOCK SIN RESPALDO — lo que reemplazó a `repartirExistencia`.
//
// 🩸 Repartir la existencia entre las compras ("de esta llegada quedan 180") es
// la misma atribución inventada, mirada del otro lado: nadie marcó las cajas
// que están HOY en la bodega tampoco. Lo que sí se puede afirmar es agregado:
// si Switch dice que hay más de lo que TODAS las compras juntas pueden
// sostener, esa diferencia se AVISA.
// ─────────────────────────────────────────────────────────────────────────────

describe("stockSinRespaldo — bodega que ninguna compra registrada explica", () => {
  const art = (existencia: number | null, ingresos: FilaIngreso[], ventas: FilaVenta[]) =>
    armarArticulo(
      {
        empresa: "vistana",
        codigo: "X001",
        descripcion: "X001",
        ingresos,
        ventas,
        existencia,
        precioEtiqueta: 10,
        catalogoSyncedAt: null,
      },
      HOY,
    );

  it("con la cuenta cerrada no sobra nada", () => {
    const a = art(
      50,
      [ingreso({ fecha: "2024-01-01", n_interno: "A", cantidad: 100 })],
      [v("2024-02-01", "FA", 50, 500)],
    );
    expect(a.stockSinRespaldo).toBe(0);
  });

  it("si Switch dice que hay MÁS de lo que las compras pueden sostener, se avisa", () => {
    // 100 compradas, 60 vendidas → las compras sostienen 40. Switch dice 80.
    const a = art(
      80,
      [ingreso({ fecha: "2024-01-01", n_interno: "A", cantidad: 100 })],
      [v("2024-02-01", "FA", 60, 600)],
    );
    expect(a.stockSinRespaldo).toBe(40);
  });

  it("sin existencia de Switch no se inventan faltantes", () => {
    const a = art(null, [ingreso({ fecha: "2024-01-01", n_interno: "A", cantidad: 100 })], []);
    expect(a.stockSinRespaldo).toBe(0);
  });

  it("una compra vendida por completo no sostiene stock", () => {
    const a = art(
      10,
      [ingreso({ fecha: "2024-01-01", n_interno: "A", cantidad: 100 })],
      [v("2024-02-01", "FA", 100, 1000)],
    );
    expect(a.stockSinRespaldo).toBe(10);
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

describe("D1617001 — cuatro llegadas, CRUDAS", () => {
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
  const [d2025_05, , , d2024_08] = a.compras;

  it("la más NUEVA va primero", () => {
    expect(a.compras.map((c) => c.fecha)).toEqual([
      "2025-05-09",
      "2025-02-25",
      "2024-11-25",
      "2024-08-29",
    ]);
  });

  it("🔴 cada compra trae FECHA, CANTIDAD y COSTOS — y NADA que hable de sus ventas", () => {
    expect(a.compras.map((c) => c.unidades)).toEqual([180, 120, 120, 120]);
    // El candado que importa: si alguien reintroduce el reparto, estos campos
    // vuelven a aparecer y el test se pone rojo.
    for (const c of a.compras) {
      for (const prohibido of [
        "vendidas",
        "quedan",
        "meses",
        "estado",
        "fechaUmbral",
        "fechaCorte",
        "mesesTranscurridos",
        "mesesConVenta",
        "precioVendido",
        "descuento",
        "noVendidoNiEnBodega",
      ]) {
        expect(c, `la compra no puede traer "${prohibido}": eso sería atribución`).not.toHaveProperty(
          prohibido,
        );
      }
    }
  });

  it("la cuenta del ARTÍCULO cierra sin ajuste: 540 comprados = 360 vendidos + 180 en bodega", () => {
    expect(a.cuadre).toMatchObject({ comprado: 540, vendido: 360, existencia: 180, residuo: 0 });
    expect(a.cuadre.ajusteConfiable).toBe(false);
    expect(a.stockSinRespaldo).toBe(0);
    expect(a.vendidoAntes).toBe(0);
    expect(a.vendidoDeMas).toBe(0);
  });

  it("el precio de la última llegada bajó de $4,47 a $3,19 de CIF y se lee en SU fila", () => {
    expect(d2025_05.costos.cif).toBeCloseTo(3.19, 6);
    expect(d2024_08.costos.cif).toBeCloseTo(4.47, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VENTANA DE HISTORIA.
// ─────────────────────────────────────────────────────────────────────────────

describe("ventana de 3 años — se conserva, y lo que queda afuera se DICE", () => {
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

  it("la compra de más de 3 años no se muestra, pero se CUENTA", () => {
    expect(a.comprasFueraDeVentana).toBe(1);
    expect(a.compras).toHaveLength(1);
    expect(a.compras[0].fecha).toBe("2025-01-10");
  });

  it("🔴 el cotejo mira TODAS las compras, también la que no se muestra", () => {
    // Si la vieja quedara fuera del cotejo, las 100 ventas de 2022 no tendrían
    // de dónde salir y la pantalla avisaría un hueco que no existe — y encima
    // apagaría el aviso del ajuste de inventario, que exige que la cuenta cierre.
    expect(a.vendidoAntes).toBe(0);
    expect(a.vendidoDeMas).toBe(0);
    expect(a.cuadre.comprado).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL — dos hojas, y ninguna dice cuánto tardó una compra.
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

  async function leerHoja(cual: "Referencia" | "Compras") {
    const XLSX = await import("xlsx-js-style");
    const mod = await import("@/lib/ventas/referencia-excel");
    const ws =
      cual === "Referencia"
        ? await mod.buildReferenciaSheet([ART()], "2026-08")
        : await mod.buildComprasSheet([ART()], "2026-08");
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
    const encabezado = filas.find((f) => f.includes("Referencia")) as string[];
    const cuerpo = filas.slice(filas.indexOf(encabezado) + 1);
    const porNombre = (f: unknown[]) =>
      Object.fromEntries(encabezado.map((h, i) => [h, f[i]])) as Record<string, unknown>;
    return { encabezado, cuerpo: cuerpo.map(porNombre) };
  }

  // 🔴 LA HOJA 1 SON 13 COLUMNAS: LO ESENCIAL, APROBADO POR DANIEL. Sobre la
  // hoja de 39 columnas dijo, textual: *"mucha info, quiero lo escencial"*
  // (12-ago-2026), y después pidió sumar la Lista. El candado es el encabezado
  // EXACTO — ni una columna más, ni una menos.
  const TRECE = [
    "Referencia",
    "Descripción",
    "Compré",
    "Vendí",
    "Stock",
    "Vendido",
    "Meses",
    "Última compra",
    "Precio prom",
    "Lista",
    "Costo CIF",
    "Margen",
    "Nota",
  ];

  it("🔴 la hoja 1 tiene EXACTAMENTE las 13 columnas esenciales, en su orden", async () => {
    const { encabezado, cuerpo } = await leerHoja("Referencia");
    expect(encabezado).toEqual(TRECE);
    expect(cuerpo).toHaveLength(1); // un artículo = una fila
    expect(cuerpo[0]["Referencia"]).toBe("NB2570001");
    // 🔴 Compré = TODAS las compras (240 + 180) y Vendí = el neto histórico.
    // Stock es la existencia de Switch — y NO se fuerza el cuadre: acá
    // 420 − 216 = 204 sí cierra, pero la columna no sale de esa resta.
    expect(cuerpo[0]["Compré"]).toBe(420);
    expect(cuerpo[0]["Vendí"]).toBe(216);
    expect(cuerpo[0]["Stock"]).toBe(204);
    // La ÚLTIMA compra es la del 19-feb-2026, no la más vieja.
    expect(cuerpo[0]["Última compra"]).toBe("2026-02-19");
    expect(cuerpo[0]["Precio prom"]).toBe(10);
    // La Lista de la ficha: el precio de lista de la última compra.
    expect(cuerpo[0]["Lista"]).toBe(10);
    expect(cuerpo[0]["Costo CIF"]).toBe(5);
    expect(cuerpo[0]["Margen"]).toBe(0.5);
  });

  it("🩸 lo que se FUE de la hoja 1 no vuelve (Daniel: 'quiero lo escencial')", async () => {
    const { encabezado } = await leerHoja("Referencia");
    for (const col of [
      "Empresa",
      "Meses de venta",
      "Última compra: llegó",
      "Última compra: cuánto",
      "Anterior: llegó",
      "Anterior: cuánto",
      "Compras (últimos 3 años)",
      "Compras de más de 3 años",
      "Vendo por mes",
      "Me queda para (meses)",
      "CIF anterior (solo si cambió)",
      "Costo FOB",
      "Costo FOB (calculado)",
      "Si no hay margen, por qué",
      "Oct-nov-dic (u)",
      "Oct-nov-dic (% del año)",
      "FOB de dónde",
      "En bodega",
      "90% en",
    ]) {
      expect(encabezado, `la columna "${col}" volvió a la hoja 1`).not.toContain(col);
    }
    // Y los 12 meses en columnas también se fueron — ninguna celda del
    // encabezado es un "jul 2026".
    for (const h of encabezado) {
      expect(h, `volvió una columna de mes: "${h}"`).not.toMatch(
        /^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic) \d{4}$/,
      );
    }
  });

  it("🔴 sin margen (vendedor/bodega): la columna Margen NO baja; las otras 12 sí, sin correrse", async () => {
    // Daniel: *"quita margen, lo demas dejalo"*. Esconderlo solo en pantalla
    // y dejarlo bajar en el Excel sería teatro.
    const XLSX = await import("xlsx-js-style");
    const mod = await import("@/lib/ventas/referencia-excel");
    const ws = await mod.buildReferenciaSheet([ART()], "2026-08", { margen: false });
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
    const encabezado = filas.find((f) => f.includes("Referencia")) as string[];
    const cuerpo = filas.slice(filas.indexOf(encabezado) + 1);
    expect(encabezado).toEqual(TRECE.filter((c) => c !== "Margen"));
    // Y la fila no queda CORRIDA: quitar la columna del medio sin quitar su
    // celda dejaría la Nota bajo el encabezado del margen.
    const fila = Object.fromEntries(encabezado.map((h, i) => [h, cuerpo[0][i]]));
    expect(fila["Costo CIF"]).toBe(5);
    expect(fila["Nota"] ?? "").toBe("");
  });

  it('🔴 "Si no hay margen, por qué" se FUSIONÓ en la Nota — solo cuando el margen baja', async () => {
    // Compra sin una sola venta → motivo "sin-ventas". Antes era una columna
    // aparte; ahora vive en la Nota (Daniel: *"quiero lo escencial"*).
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "4F5036G001",
        descripcion: "Men-Short",
        ingresos: [ingreso({ codigo_articulo: "4F5036G001", fecha: "2026-04-20", n_interno: "A", cantidad: 36 })],
        ventas: [],
        existencia: 36,
        precioEtiqueta: 10,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const XLSX = await import("xlsx-js-style");
    const mod = await import("@/lib/ventas/referencia-excel");

    const conMargen = await mod.buildReferenciaSheet([art], "2026-08");
    const filas1 = XLSX.utils.sheet_to_json(conMargen, { header: 1, blankrows: false }) as unknown[][];
    const enc1 = filas1.find((f) => f.includes("Referencia")) as string[];
    const fila1 = filas1[filas1.indexOf(enc1) + 1];
    expect(String(fila1[enc1.indexOf("Nota")])).toContain("No se puede calcular el margen");

    // Sin margen visible (vendedor/bodega) tampoco se explica su ausencia:
    // sería hablar de una columna que esa hoja no tiene.
    const sinMargen = await mod.buildReferenciaSheet([art], "2026-08", { margen: false });
    const filas2 = XLSX.utils.sheet_to_json(sinMargen, { header: 1, blankrows: false, defval: "" }) as unknown[][];
    const enc2 = filas2.find((f) => f.includes("Referencia")) as string[];
    const fila2 = filas2[filas2.indexOf(enc2) + 1];
    expect(String(fila2[enc2.indexOf("Nota")])).not.toContain("margen");
  });

  it("la hoja 2 baja UNA FILA POR COMPRA con fecha, cantidad y costos", async () => {
    const { encabezado, cuerpo } = await leerHoja("Compras");
    expect(encabezado).toEqual([
      "Referencia",
      "Descripción",
      "Empresa",
      "Llegó",
      "Cuánto",
      "CIF",
      "FOB",
      "FOB de dónde",
      "Lista",
      "Proveedor",
      "Documento",
    ]);
    expect(cuerpo).toHaveLength(2);
    const vieja = cuerpo.find((f) => f["Llegó"] === "2025-04-01")!;
    expect(vieja["Cuánto"]).toBe(240);
    expect(vieja["CIF"]).toBe(5);
    const nueva = cuerpo.find((f) => f["Llegó"] === "2026-02-19")!;
    expect(nueva["Cuánto"]).toBe(180);
  });

  it("🩸 NINGUNA hoja atribuye ventas a una compra — con stock encima eso no se sabe", async () => {
    const { encabezado: hoja1 } = await leerHoja("Referencia");
    const { encabezado: hoja2 } = await leerHoja("Compras");
    const PROHIBIDAS = [
      "Mi última compra",
      "Vendidas",
      "Meses en venderse",
      "Anterior: meses",
      "U. vendidas",
      "Queda",
      "Meses en que vendió",
      "Salió a",
      "Compras anteriores",
      // Y la que ya se había ido antes: Daniel, textual, *"no sirve"*.
      "Desc.",
      // 🩸 Y los rótulos que repetían el mismo número (11-ago-2026, noche).
      "Vendí a",
      "Me costó (CIF)",
      "CIF compra anterior",
      "CIF de hoy",
      "Precio de lista",
    ];
    for (const h of [...hoja1, ...hoja2]) {
      expect(PROHIBIDAS, `la columna "${h}" volvió`).not.toContain(h);
    }
    // "Meses" existe en la hoja 1 desde el 12-ago-2026 (meses CALENDARIO, de
    // `medirVendidoMeses` — no atribuye nada). En la hoja 2 sigue PROHIBIDA:
    // ahí era "cuánto tardó ESTA compra", que es exactamente el FIFO que se fue.
    expect(hoja2).not.toContain("Meses");
  });

  // ── VENDIDO · MESES — el Excel espejo del modo pedido (12-ago-2026) ────────
  //
  // Daniel: la columna "90% en" no se entendía ("va el 29%" no dice cuánto
  // tiempo lleva). Las dos columnas nuevas salen de `medirVendidoMeses`, LA
  // MISMA función que pinta la tabla del modo pedido.

  it('🔴 la hoja 1 cambió "90% en" por "Vendido" · "Meses", una al lado de la otra', async () => {
    const { encabezado } = await leerHoja("Referencia");
    expect(encabezado).not.toContain("90% en");
    expect(encabezado).toContain("Vendido");
    expect(encabezado).toContain("Meses");
    expect(encabezado.indexOf("Meses")).toBe(encabezado.indexOf("Vendido") + 1);
  });

  it("🔴 Vendido/Meses del Excel = las celdas de la tabla: vivo trae el % actual (Vendí÷Compré) y los meses del ancla", async () => {
    // ART(): 2 compras (240 + 180), 216 vendidas, stock 204 → VIVO. Vendido =
    // 216/420; Meses = ancla del agregado (feb-2026 → ago-2026 = 6) — la misma
    // ancla de la ficha, no una segunda cuenta.
    const { cuerpo } = await leerHoja("Referencia");
    expect(cuerpo[0]["Vendido"]).toBeCloseTo(216 / 420, 10);
    expect(cuerpo[0]["Meses"]).toBe(6);
  });

  it("🔴 con 2+ LLEGADAS el Excel baja Compré · Vendí de la ÚLTIMA — y Stock sigue siendo la existencia REAL", async () => {
    // El caso de la captura (4G5004G001): 36 u en oct-2025 vendidas TODAS,
    // bodega en 0 dic-feb, 36 más en mar-2026 y 25 vendidas. La planilla decía
    // Compré 72 · Vendí 61 mientras Vendido/Meses ya eran de la última llegada
    // (69% · 5) — Daniel: *"que sea coherente"*.
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "4G5004G001",
        descripcion: "Men-Tee",
        ingresos: [
          ingreso({ codigo_articulo: "4G5004G001", fecha: "2025-10-05", n_interno: "A", cantidad: 30 }),
          ingreso({ codigo_articulo: "4G5004G001", fecha: "2025-10-05", n_interno: "B", cantidad: 6 }),
          ingreso({ codigo_articulo: "4G5004G001", fecha: "2026-03-29", n_interno: "C", cantidad: 36 }),
        ],
        ventas: [
          v("2025-10-20", "FA", 12, 120),
          v("2025-11-20", "FA", 24, 240),
          v("2026-04-15", "FA", 6, 60),
          v("2026-05-15", "FA", 18, 180),
          v("2026-06-15", "FA", 1, 10),
        ],
        existencia: 12,
        precioEtiqueta: 10,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const XLSX = await import("xlsx-js-style");
    const mod = await import("@/lib/ventas/referencia-excel");
    const ws = await mod.buildReferenciaSheet([art], "2026-08");
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
    const enc = filas.find((f) => f.includes("Referencia")) as string[];
    const fila = filas[filas.indexOf(enc) + 1];
    expect(fila[enc.indexOf("Compré")]).toBe(36); // no 72
    expect(fila[enc.indexOf("Vendí")]).toBe(25); // no 61
    expect(fila[enc.indexOf("Stock")]).toBe(12); // la existencia, sin recortar
    // 🩸 25 ÷ 37 (lo vendido + lo que queda), no 25 ÷ 36: el % del Excel es el
    // MISMO que el de la pantalla y sale de las dos celdas de al lado.
    expect(fila[enc.indexOf("Vendido")]).toBeCloseTo(25 / 37, 10);
    expect(fila[enc.indexOf("Meses")]).toBe(5);
    // Y la leyenda lo DICE: el encabezado "Compré" no puede mentir en silencio.
    const subtitulo = String((filas[1] ?? [])[0] ?? "");
    expect(subtitulo).toContain("ÚLTIMA LLEGADA");
    // Y dice de qué sale el %, que es lo que cambió el 25-ago-2026.
    expect(subtitulo).toContain("Vendí ÷ (Vendí + Stock)");
    expect(subtitulo).toMatch(/"Stock" es SIEMPRE la existencia total/);
  });

  it("🔴 AGOTADO: el Excel baja el % REAL y los meses hasta la ÚLTIMA VENTA, no los de bodega", async () => {
    // Única compra nov-2023 (280 u); vendió 276 entre ene y abr 2024; stock 0.
    // Al corte 2026-08 lleva 33 meses de calendario — la celda dice 6 (nov-2023
    // → abr-2024, inclusive). Y Vendido dice lo REAL (276/280 → 99%), no un
    // "90%" congelado — Daniel: *"como stock 0 y vendido 90%?"*.
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "40HM265032",
        descripcion: "Men-Brief",
        ingresos: [ingreso({ codigo_articulo: "40HM265032", fecha: "2023-11-28", n_interno: "A", cantidad: 280 })],
        ventas: [
          v("2024-01-06", "FA", 70, 1120),
          v("2024-02-06", "FA", 70, 1120),
          v("2024-03-06", "FA", 70, 1120),
          v("2024-04-06", "FA", 66, 1056),
        ],
        existencia: 0,
        precioEtiqueta: 16,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const XLSX = await import("xlsx-js-style");
    const mod = await import("@/lib/ventas/referencia-excel");
    const ws = await mod.buildReferenciaSheet([art], "2026-08");
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
    const enc = filas.find((f) => f.includes("Referencia")) as string[];
    const fila = filas[filas.indexOf(enc) + 1];
    // Stock 0: se vendió todo lo que hubo. Las 4 que faltan contra lo comprado
    // las explica la Nota (ajuste de inventario), no el porcentaje.
    expect(fila[enc.indexOf("Vendido")]).toBe(1);
    expect(fila[enc.indexOf("Meses")]).toBe(6);
  });

  it('🔴 el VACÍO es solo para lo indivisible (sin compra con fecha); vendido>comprado baja su % igual que la pantalla', async () => {
    const sinCompra = armarArticulo(
      {
        empresa: "vistana",
        codigo: "RETENCION",
        descripcion: "RETENCION",
        ingresos: [],
        ventas: [v("2026-05-06", "FA", 40, 400)],
        existencia: null,
        precioEtiqueta: null,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    // 🩸 El caso TERMO: se vendió MÁS de lo comprado (faltan compras EN
    // Switch). El 150% BAJA, igual que en pantalla — la planilla no puede
    // decir una cosa y la ficha otra (el bug de 44D202G110). El tiempo de
    // venta también se sabe: agotado, del ancla (extendida hasta la compra más
    // vieja con fecha) a su última venta.
    const termo = armarArticulo(
      {
        empresa: "active_shoes",
        codigo: "TERMO",
        descripcion: "TERMO",
        ingresos: [
          ingreso({ codigo_articulo: "TERMO", fecha: "2024-07-01", n_interno: "A", cantidad: 60 }),
          ingreso({ codigo_articulo: "TERMO", fecha: "2025-10-01", n_interno: "B", cantidad: 40 }),
        ],
        ventas: [v("2025-11-06", "FA", 150, 1500)],
        existencia: 0,
        precioEtiqueta: 10,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const XLSX = await import("xlsx-js-style");
    const mod = await import("@/lib/ventas/referencia-excel");
    const ws = await mod.buildReferenciaSheet([sinCompra, termo], "2026-08");
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
    const enc = filas.find((f) => f.includes("Referencia")) as string[];
    const filaSin = filas[filas.indexOf(enc) + 1];
    const filaTermo = filas[filas.indexOf(enc) + 2];
    // La celda vacía ES el dato (misma convención que "CIF anterior").
    expect(filaSin[enc.indexOf("Vendido")] || null).toBeNull();
    expect(filaSin[enc.indexOf("Meses")] || null).toBeNull();
    // Vendió 150 de 100 y quedó en 0: lo que hubo son las 150 que salieron.
    expect(filaTermo[enc.indexOf("Vendido")]).toBe(1);
    // Ancla extendida jul-2024 → última venta nov-2025, inclusive = 17. El
    // reloj NO sigue corriendo hasta hoy (eso daría 25).
    expect(filaTermo[enc.indexOf("Meses")]).toBe(17);
  });
});
