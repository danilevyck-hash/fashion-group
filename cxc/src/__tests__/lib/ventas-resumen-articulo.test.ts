// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de `src/lib/ventas/resumen-articulo.ts` — los TRES números del tab
// Ventas › Referencia y el MARGEN REAL.
//
// La especificación es una frase de Daniel, textual: *"cuánto tiempo demoré en
// vender mi compra, cuánto por mes, para cuántos meses me queda el stock
// actual"*. Los números de acá NO son inventados: son mediciones contra
// producción del 11-ago-2026 (vistana). Si el cálculo no da ESTO, está mal el
// código — no el test.
//
//   NB2570001 · existencia 345 · CIF $16.555 · lista $27
//     compras: 19-feb-2026 180u | 11-feb-2026 120u | 21-oct-2025 60u |
//              9-abr-2025 240u | 1-abr-2025 240u | (2 más de +3 años)
//     ventana ago-2025→jul-2026: 331 u por $8.910,60
//
//   QD3958033 · existencia 126 · CIF $4.466 · lista $7
//     única compra: 26-dic-2025 180u · van 54 vendidas
//     ventana: 54 u por $366,00, repartidas en ene→may 2026
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  MESES_FUERTES,
  MESES_VENTANA,
  armarFicha,
  barrasDeVentana,
  lineaComparacion,
  margenReal,
  mesesDeStock,
  primerMesConVenta,
  promedioMensual,
  resumirCompra,
  temporadaFuerte,
  textoSinMargen,
  ultimosMesesCompletos,
} from "@/lib/ventas/resumen-articulo";
import { armarArticulo, ventasPorMes, ventasNetasPorDia, type FilaIngreso } from "@/lib/ventas/compras";

const HOY = "2026-08-11";
const HOY_MES = "2026-08";

type FilaVenta = { fecha: string; tipo: string; cantidad_total: number | string; venta_total: number | string };
const v = (fecha: string, tipo: string, unidades: number, venta: number): FilaVenta => ({
  fecha,
  tipo,
  cantidad_total: unidades,
  venta_total: venta,
});

const ing = (fecha: string, cantidad: number, p: Partial<FilaIngreso> = {}): FilaIngreso => ({
  empresa_key: "vistana",
  fecha,
  n_interno: `19-${fecha}`,
  codigo_articulo: "NB2570001",
  articulo: "Men-Boxer Brief",
  proveedor: "American Designer Fashion",
  cantidad,
  precio: 27,
  costo_fob: 16.555,
  costo_cif: 16.555,
  ...p,
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL MES EN CURSO NUNCA ENTRA
// ─────────────────────────────────────────────────────────────────────────────

describe("la ventana son 12 meses COMPLETOS", () => {
  it("en agosto la ventana termina en JULIO — el mes en curso no entra", () => {
    const meses = ultimosMesesCompletos("2026-08");
    expect(meses).toHaveLength(12);
    expect(meses[11]).toBe("2026-07");
    expect(meses[0]).toBe("2025-08");
    expect(meses).not.toContain("2026-08");
  });

  it("🩸 el defecto que esto impide: medido el 10-ago en 40HM265001, los 'últimos 3 meses' daban 18,3 u/mes con 10 días de agosto adentro y 34,3 con meses completos — EL DOBLE", () => {
    // Un mes en curso con 10 de 31 días diluye el promedio. Acá se comprueba
    // que ni siquiera aparece como barra.
    const serie = [
      { mes: "2026-06", unidades: 30, venta: 300 },
      { mes: "2026-07", unidades: 30, venta: 300 },
      { mes: "2026-08", unidades: 9, venta: 90 }, // el mes en curso, a 10 días
    ];
    const barras = barrasDeVentana(serie, "2026-08");
    expect(barras.map((b) => b.mes)).not.toContain("2026-08");
    expect(promedioMensual(barras).unidades).toBe(60); // 30 + 30, sin los 9
  });

  it("el borde de año: en enero la ventana va de ene del año pasado a dic", () => {
    const meses = ultimosMesesCompletos("2026-01");
    expect(meses[0]).toBe("2025-01");
    expect(meses[11]).toBe("2025-12");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOS TRES NÚMEROS, CONTRA PRODUCCIÓN
// ─────────────────────────────────────────────────────────────────────────────

/** NB2570001 tal como está en producción el 11-ago-2026. */
function NB2570001() {
  return armarArticulo(
    {
      empresa: "vistana",
      codigo: "NB2570001",
      descripcion: "Men-Boxer Brief",
      ingresos: [
        ing("2022-10-25", 39, { costo_fob: 15.79, costo_cif: 15.79 }),
        ing("2023-06-28", 56),
        ing("2025-04-01", 240),
        ing("2025-04-09", 240),
        ing("2025-10-21", 60),
        ing("2026-02-11", 120),
        ing("2026-02-19", 180),
      ],
      ventas: [
        v("2022-11-15", "FA", 14, 336),
        v("2023-08-15", "FA", 24, 576),
        v("2023-10-15", "FA", 31, 744),
        v("2024-05-15", "FA", 1, 20),
        v("2025-04-15", "FA", 84, 2268),
        v("2025-05-15", "FA", 13, 351),
        v("2025-06-15", "FA", 12, 324),
        v("2025-07-15", "FA", 42, 1116),
        v("2025-09-15", "FA", 36, 972),
        v("2025-10-15", "FA", 36, 972),
        v("2025-11-15", "FA", 73, 1965.6),
        v("2025-12-15", "FA", 61, 1647),
        v("2026-01-15", "FA", 24, 648),
        v("2026-02-15", "FA", 12, 324),
        v("2026-03-15", "FA", 21, 558),
        v("2026-04-15", "FA", 26, 708),
        v("2026-05-15", "FA", 6, 144),
        v("2026-07-15", "FA", 36, 972),
      ],
      existencia: 345,
      precioEtiqueta: 27,
      catalogoSyncedAt: "2026-08-11T04:30:29.523Z",
    },
    HOY,
  );
}

/** QD3958033 tal como está en producción el 11-ago-2026: UNA sola compra que
 *  todavía no se acaba. */
function QD3958033() {
  return armarArticulo(
    {
      empresa: "vistana",
      codigo: "QD3958033",
      descripcion: "Women-Panties",
      ingresos: [
        ing("2025-12-26", 180, { codigo_articulo: "QD3958033", precio: 7, costo_fob: 4.466, costo_cif: 4.466 }),
      ],
      ventas: [
        v("2026-01-15", "FA", 12, 84),
        v("2026-02-15", "FA", 12, 84),
        v("2026-03-15", "FA", 6, 30),
        v("2026-04-15", "FA", 12, 84),
        v("2026-05-15", "FA", 12, 84),
      ],
      existencia: 126,
      precioEtiqueta: 7,
      catalogoSyncedAt: "2026-08-11T04:30:29.523Z",
    },
    HOY,
  );
}

describe("NB2570001 — los tres números contra producción", () => {
  const f = () => armarFicha(NB2570001(), HOY_MES);

  it("vende 27,6 u por mes: 331 unidades en los 12 meses completos", () => {
    const p = f().promedio;
    expect(p.unidades).toBe(331);
    expect(p.meses).toBe(12);
    expect(p.desdeQueEmpezo).toBe(false); // vende desde 2022: la ventana entera cuenta
    expect(p.porMes!).toBeCloseTo(27.58, 2);
  });

  it("con 345 en bodega le queda para 12,5 meses", () => {
    expect(f().alcance!).toBeCloseTo(12.51, 2);
  });

  it("🔴 'Mi última compra' es la del 19-feb-2026 y TODAVÍA NO SE ACABA — no se cae a la agotada", () => {
    const ficha = f();
    expect(ficha.ultima!.fecha).toBe("2026-02-19");
    const r = resumirCompra(ficha.ultima!);
    expect(r.titular).toBe("todavía no se acaba");
    expect(r.detalle).toBe("llegó 180 el 19 feb 2026 · van 0");
    expect(r.viva).toBe(true);
  });

  it("🩸 con las DOS últimas compras vivas la comparación se OMITE — decía dos veces lo mismo", () => {
    // Bajo FIFO, las de 11 y 19-feb-2026 todavía no vendieron nada: la línea
    // habría dicho "Esta: todavía no se acaba · Anterior: todavía no se acaba".
    expect(f().anterior!.fecha).toBe("2026-02-11");
    expect(f().comparacion).toBeNull();
  });

  it("la comparación SÍ sale cuando hay tendencia que ver, y va en UNA sola línea", () => {
    const art = NB2570001();
    // Las dos de abril-2025 sí se acabaron: ésas son las que comparan.
    const dosAgotadas = art.compras.filter((c) => c.estado === "medida");
    expect(dosAgotadas.length).toBeGreaterThanOrEqual(2);
    const linea = lineaComparacion(dosAgotadas[0], dosAgotadas[1])!;
    expect(linea).toMatch(/^Esta: \d+ u en \d+ meses · Anterior: \d+ u en \d+ meses$/);
    expect(linea.split("\n")).toHaveLength(1);
  });

  it("oct · nov · dic salen marcados y pesan el 51% del año", () => {
    const t = f().temporada;
    expect(t.unidades).toBe(36 + 73 + 61);
    expect(t.total).toBe(331);
    expect(t.parte!).toBeCloseTo(0.5136, 4);
    expect(t.todaviaNoPaso).toBe(false);
  });

  it("las 12 barras salen SIEMPRE, con ago-2025 y jun-2026 en cero", () => {
    const b = f().barras;
    expect(b).toHaveLength(12);
    expect(b.find((x) => x.mes === "2025-08")!.unidades).toBe(0);
    expect(b.find((x) => x.mes === "2026-06")!.unidades).toBe(0);
    expect(b.find((x) => x.mes === "2025-11")!.unidades).toBe(73);
    // Ninguno es "antes de empezar": vende desde 2022.
    expect(b.every((x) => !x.antesDeEmpezar)).toBe(true);
  });
});

describe("QD3958033 — el artículo NUEVO, que es donde el promedio se rompía", () => {
  const f = () => armarFicha(QD3958033(), HOY_MES);

  it("🩸 se promedia desde que EMPEZÓ A VENDERSE (7 meses), no entre 12", () => {
    const p = f().promedio;
    expect(p.unidades).toBe(54);
    expect(p.meses).toBe(7); // ene → jul 2026
    expect(p.desdeQueEmpezo).toBe(true);
    expect(p.porMes!).toBeCloseTo(7.71, 2);
    // Dividido entre 12 daría 4,5 → y el alcance se iría al DOBLE.
    expect(p.porMes!).not.toBeCloseTo(54 / 12, 2);
  });

  it("con 126 en bodega le queda para 16,3 meses (entre 12 daría 28)", () => {
    expect(f().alcance!).toBeCloseTo(16.33, 2);
    expect(mesesDeStock(126, 54 / 12)).toBeCloseTo(28, 0); // la mutación que esto caza
  });

  it("su única compra dice EN QUÉ VA: 'llegó 180 el 26 dic 2025 · van 54'", () => {
    const r = resumirCompra(f().ultima!);
    expect(r.titular).toBe("todavía no se acaba");
    expect(r.detalle).toBe("llegó 180 el 26 dic 2025 · van 54");
  });

  it("sin compra anterior la línea de comparación se OMITE — nada de guiones mudos", () => {
    const ficha = f();
    expect(ficha.anterior).toBeNull();
    expect(ficha.comparacion).toBeNull();
    expect(ficha.viejas).toHaveLength(0);
  });

  it("todavía no pasó por su temporada fuerte, y la pantalla lo puede decir", () => {
    const t = f().temporada;
    expect(t.todaviaNoPaso).toBe(true);
    expect(t.unidades).toBe(0);
  });

  it("los meses anteriores a su primera venta se marcan aparte — no son un cero de venta", () => {
    const b = f().barras;
    expect(b.filter((x) => x.antesDeEmpezar).map((x) => x.mes)).toEqual([
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
    ]);
    // jun y jul 2026 SÍ cuentan: el artículo ya estaba en la calle y no vendió.
    expect(b.find((x) => x.mes === "2026-06")!.antesDeEmpezar).toBe(false);
    expect(b.find((x) => x.mes === "2026-07")!.antesDeEmpezar).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL MARGEN — contra el CIF, y cuando no se puede se DICE
// ─────────────────────────────────────────────────────────────────────────────

describe("el margen real", () => {
  it("NB2570001: vendió a $26,92 contra un CIF de $16,555 → 38,5%", () => {
    const m = armarFicha(NB2570001(), HOY_MES).margen;
    expect(m.precioReal!).toBeCloseTo(26.92, 2);
    expect(m.costo!).toBeCloseTo(16.555, 3);
    expect(m.margen!).toBeCloseTo(0.38504, 5);
    expect(m.motivo).toBeNull();
  });

  it("QD3958033: vendió a $6,78 contra un CIF de $4,466 → 34,1%", () => {
    const m = armarFicha(QD3958033(), HOY_MES).margen;
    expect(m.precioReal!).toBeCloseTo(6.7778, 4);
    expect(m.margen!).toBeCloseTo(0.3411, 4);
  });

  it("🔴 el costo es el CIF, NUNCA el FOB — el FOB llega igual al CIF en el 93% de las líneas", () => {
    // Un FOB creíble y distinto: el margen tiene que seguir saliendo del CIF.
    const conFobReal = margenReal(1000, 100, 6); // precio 10, CIF 6 → 40%
    expect(conFobReal.margen!).toBeCloseTo(0.4, 4);
    // Sobre un FOB de 5 (CIF ÷ 1,2) daría 50% — el número que NO se muestra.
    expect(conFobReal.margen).not.toBeCloseTo(0.5, 2);
  });

  it("🩸 sin ventas en el período NO se inventa un margen: se dice por qué", () => {
    const m = margenReal(0, 0, 16.55);
    expect(m.margen).toBeNull();
    expect(m.motivo).toBe("sin-ventas");
    expect(textoSinMargen(m.motivo!, 12)).toMatch(/No se puede calcular el margen/);
    expect(textoSinMargen(m.motivo!, 12)).toMatch(/no vendió nada en los últimos 12 meses/);
  });

  it("🩸 sin CIF en la última compra tampoco se inventa — y el precio real SÍ se muestra", () => {
    const m = margenReal(1000, 100, null);
    expect(m.precioReal).toBe(10);
    expect(m.margen).toBeNull();
    expect(m.motivo).toBe("sin-costo");
    expect(textoSinMargen(m.motivo!, 12)).toMatch(/costo CIF/);
  });

  it("puras devoluciones dejan el precio en negativo: tampoco hay margen", () => {
    const m = margenReal(-500, 50, 6);
    expect(m.margen).toBeNull();
    expect(m.motivo).toBe("precio-no-positivo");
  });

  it("un margen NEGATIVO sí se calcula y se muestra — es justo el caso que frena una compra", () => {
    const m = margenReal(400, 100, 6); // vendió a 4, costó 6
    expect(m.motivo).toBeNull();
    expect(m.margen!).toBeCloseTo(-0.5, 4);
  });

  it("🔴 el precio real NO es el de lista: los descuentos ya están adentro", () => {
    // NB2570001 tiene lista $27 y vendió a $26,92 — la diferencia son descuentos
    // reales. Mostrar $27 como "a lo que vendí" sería la mentira que este
    // número vino a eliminar.
    const m = armarFicha(NB2570001(), HOY_MES).margen;
    expect(m.precioReal!).toBeLessThan(27);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LAS NC RESTAN — la firma del error es que la diferencia da EXACTO el doble
// ─────────────────────────────────────────────────────────────────────────────

describe("las notas de crédito ya vienen restadas", () => {
  it("una NC de 7 u baja el mes de 285 a 278, no lo sube a 292", () => {
    const dias = ventasNetasPorDia([
      v("2026-03-05", "FA", 285, 2850),
      v("2026-03-20", "NC", 7, 70), // magnitud POSITIVA, como llega de Switch
    ]);
    const serie = ventasPorMes(dias);
    expect(serie).toHaveLength(1);
    expect(serie[0].unidades).toBe(278);
    expect(serie[0].venta).toBe(2780);
    // Sumadas mal darían 292: la diferencia (14) es EXACTO el doble de la NC.
    expect(292 - 278).toBe(2 * 7);
  });

  it("el promedio y el margen heredan el signo, no lo vuelven a aplicar", () => {
    const barras = barrasDeVentana(
      ventasPorMes(ventasNetasPorDia([v("2026-07-05", "FA", 100, 1000), v("2026-07-20", "NC", 10, 100)])),
      HOY_MES,
    );
    const p = promedioMensual(barras);
    expect(p.unidades).toBe(90);
    expect(p.venta).toBe(900);
    expect(margenReal(p.venta, p.unidades, 6).precioReal).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bordes
// ─────────────────────────────────────────────────────────────────────────────

describe("bordes", () => {
  it("sin existencia de Switch no se inventa un alcance", () => {
    expect(mesesDeStock(null, 10)).toBeNull();
  });

  it("sin ventas no se divide entre cero", () => {
    expect(mesesDeStock(100, null)).toBeNull();
    expect(mesesDeStock(100, 0)).toBeNull();
  });

  it("con la bodega en cero el alcance es 0, no null: es un dato, no un hueco", () => {
    expect(mesesDeStock(0, 10)).toBe(0);
  });

  it("un artículo que nunca vendió no tiene primer mes", () => {
    expect(primerMesConVenta([])).toBeNull();
    expect(primerMesConVenta([{ mes: "2026-01", unidades: 0, venta: 0 }])).toBeNull();
  });

  it("los meses fuertes son oct, nov y dic — los de Daniel", () => {
    expect([...MESES_FUERTES]).toEqual([10, 11, 12]);
    const b = barrasDeVentana([], HOY_MES);
    expect(b.filter((x) => x.fuerte).map((x) => x.mes)).toEqual(["2025-10", "2025-11", "2025-12"]);
  });

  it("la ventana son 12 meses y la constante lo dice", () => {
    expect(MESES_VENTANA).toBe(12);
    expect(barrasDeVentana([], HOY_MES)).toHaveLength(12);
  });

  it("sin serie (respuesta vieja cacheada) la pantalla degrada, no revienta", () => {
    const art = { ...QD3958033(), serie: undefined } as unknown as ReturnType<typeof QD3958033>;
    const ficha = armarFicha(art, HOY_MES);
    expect(ficha.barras).toHaveLength(12);
    expect(ficha.promedio.porMes).toBeNull();
    expect(ficha.margen.motivo).toBe("sin-ventas");
  });

  it("lineaComparacion no arma nada si falta alguna de las dos compras", () => {
    const f = armarFicha(NB2570001(), HOY_MES);
    expect(lineaComparacion(f.ultima, null)).toBeNull();
    expect(lineaComparacion(null, f.anterior)).toBeNull();
  });

  it("temporadaFuerte no divide entre cero", () => {
    expect(temporadaFuerte(barrasDeVentana([], HOY_MES)).parte).toBeNull();
  });
});
