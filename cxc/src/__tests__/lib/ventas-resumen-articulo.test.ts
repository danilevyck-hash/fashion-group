// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de `src/lib/ventas/resumen-articulo.ts` — las TRES cajas del tab
// Ventas › Referencia y el MARGEN REAL.
//
// Lo que Daniel quiere saber, textual: *"yo lo que quiero ver en cuanto tiempo
// se me mueve el articulo, para saber si con el stock actual que tengo debo de
// comprar mas, menos o no comprar. pero no quiero que decidas tu, lo decido yo
// con la data que me extraigas"*. De ahí las tres cajas: **Compras** (fecha y
// cantidad, CRUDAS), **Vendo por mes** y **Me queda para**.
//
// 🩸 LA PRIMERA CAJA DEJÓ DE INTERPRETAR. Decía "Mi última compra · todavía no
// se acaba · llegó 180 el 19 feb · van 0", y ese "van 0" salía de repartir las
// ventas entre las compras. Ver los tests marcados 🩸 en NB2570001.
//
// Los números de acá NO son inventados: son mediciones contra producción del
// 11-ago-2026 (vistana). Si el cálculo no da ESTO, está mal el código — no el
// test.
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
  COMPRAS_VISIBLES,
  MESES_FUERTES,
  MESES_VENTANA,
  armarFicha,
  barrasDeVentana,
  cambioDeCosto,
  centavos,
  listaDeCompras,
  margenReal,
  medirRitmo,
  medirVendidoMeses,
  mesesDeStock,
  leyendaLlegadas,
  medirNoventa,
  pieGrandeMeses,
  primerMesConVenta,
  promedioMensual,
  valorGrandeMeses,
  subDesdeLlegada,
  temporadaFuerte,
  textoCompra,
  textoLineaNoventa,
  textoNoventa,
  textoNoventaCorto,
  textoParteVendida,
  textoRestantes,
  textoMesesCelda,
  textoSinMargen,
  textoVendidoCelda,
  textoVendoPorMes,
  tituloDesdeLlegada,
  tresGrandes,
  ultimosMesesCompletos,
  vistaDeBarras,
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

  it("con 345 en bodega le queda para 11,7 meses (al ritmo desde el ancla, 29,5 u/mes)", () => {
    // El alcance usa el MISMO ritmo que la pantalla declara (desde oct-2025),
    // no el promedio de la ventana de 12 — dos bases serían dos verdades.
    expect(f().alcance!).toBeCloseTo(345 / 29.5, 2);
  });

  it("🔴 la caja de Compras dice FECHA y CANTIDAD, la más reciente arriba", () => {
    const l = f().compras;
    expect(l.visibles.map(textoCompra)).toEqual([
      "19 feb 2026 · 180 u",
      "11 feb 2026 · 120 u",
      "21 oct 2025 · 60 u",
      "9 abr 2025 · 240 u",
    ]);
    // 🔴 UNA sola línea gris con TODO lo que no se ve: la 5ª de los 3 años + las
    // 2 de más de 3 años. No se despliega y no se separa en dos renglones — esa
    // separación (payload sí / payload no) es NUESTRA, no de Daniel.
    expect(l.restantes).toBe(3);
    expect(textoRestantes(l.restantes)).toBe("y 3 compras más");
    expect(l.unica).toBe(false);
  });

  it("🔴 el costo NO cambió entre las dos últimas compras: no se muestra nada", () => {
    // Las dos son de $16.555. Repetirlo al lado del costo de hoy sería el mismo
    // relleno que la columna fija que se eliminó.
    expect(f().cambioCosto).toBeNull();
  });

  it("🔴 el Costo FOB es CALCULADO — CIF ÷ 1,10, no el que manda Switch", () => {
    const ficha = f();
    expect(ficha.fobCalculado!).toBeCloseTo(15.05, 2); // 16,555 ÷ 1,1
    // El FOB de Switch llega IGUAL al CIF (el error de carga del 93%): si se
    // mostrara ése, la fila diría $16.56 dos veces.
    expect(ficha.ultima!.costos.fob).toBeCloseTo(16.555, 3);
    expect(ficha.fobCalculado!).not.toBeCloseTo(ficha.ultima!.costos.cif!, 2);
    // Y NUNCA CIF × 0,9, que no es la inversa: daría 14,90.
    expect(ficha.fobCalculado!).not.toBeCloseTo(16.555 * 0.9, 2);
  });

  it("🩸 NO dice 'van 0 de 180' — ese número salía de repartirle ventas a una compra", () => {
    // Ésta es LA razón del cambio: bajo FIFO las tres compras más recientes de
    // este artículo no tenían ni una venta asignada, así que la caja anunciaba
    // "todavía no se acaba · llegó 180 el 19 feb · van 0" mientras el artículo
    // vendía 28 u/mes. Cero información, en el lugar más visible.
    const texto = f().compras.visibles.map(textoCompra).join(" ");
    expect(texto).not.toMatch(/van \d/);
    expect(texto).not.toMatch(/no se acaba/);
    expect(texto).not.toMatch(/mes/);
  });

  it("🩸 la línea 'Esta: … · Anterior: …' se fue: nacía del mismo reparto inventado", () => {
    expect(f()).not.toHaveProperty("comparacion");
    expect(f()).not.toHaveProperty("viejas");
  });

  it("`ultima` y `anterior` quedan SOLO para el costo, sin nada de sus ventas", () => {
    const ficha = f();
    expect(ficha.ultima!.fecha).toBe("2026-02-19");
    expect(ficha.anterior!.fecha).toBe("2026-02-11");
    expect(ficha.ultima!.costos.cif).toBeCloseTo(16.555, 3);
    for (const p of ["vendidas", "quedan", "meses", "estado", "precioVendido"]) {
      expect(ficha.ultima).not.toHaveProperty(p);
    }
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

  it("con 126 en bodega le queda para 18,7 meses (al ritmo desde la llegada; entre 12 daría 28)", () => {
    expect(f().alcance!).toBeCloseTo(126 / 6.75, 2);
    expect(mesesDeStock(126, 54 / 12)).toBeCloseTo(28, 0); // la mutación que esto caza
  });

  it("una sola compra se muestra sola, y la caja LO DICE: 'única compra'", () => {
    const l = f().compras;
    expect(l.visibles.map(textoCompra)).toEqual(["26 dic 2025 · 180 u"]);
    expect(l.restantes).toBe(0);
    expect(textoRestantes(l.restantes)).toBeNull(); // "y 0 compras más" sería ruido
    expect(l.unica).toBe(true);
  });

  it("sin compra anterior no hay CIF anterior que mostrar — se omite, no se rellena", () => {
    expect(f().anterior).toBeNull();
    expect(f().cambioCosto).toBeNull();
  });

  it("su Costo FOB calculado son $4.06 (4,466 ÷ 1,10)", () => {
    expect(f().fobCalculado!).toBeCloseTo(4.06, 2);
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
// 🔴 LOS TRES GRANDES: Compré · Vendí · Me quedan (12-ago-2026)
//
// Daniel, textual: *"cuanto compre es importante, cuanto vendi en total es
// importante"*. Tres fuentes distintas, y NO se fuerza el cuadre entre ellas.
// ─────────────────────────────────────────────────────────────────────────────

describe("los tres grandes", () => {
  it("NB2570001: Compré 935 (TODAS las compras, también las de +3 años) · Vendí 552 · Me quedan 345", () => {
    const g = armarFicha(NB2570001(), HOY_MES).grandes;
    // 935 = 39+56+240+240+60+120+180 — las 7 compras, no solo las 4 visibles.
    expect(g.comprado).toBe(935);
    expect(g.vendido).toBe(552);
    // 🔴 Me quedan = existencia de Switch, NUNCA deducido: 935 − 552 = 383 ≠ 345.
    // El cuadre NO se fuerza — esa diferencia la explican los avisos.
    expect(g.quedan).toBe(345);
    expect(g.quedan).not.toBe(g.comprado! - g.vendido);
  });

  it("Vendí dice qué parte de lo comprado es: 552 ÷ 935 = el 59%", () => {
    const g = armarFicha(NB2570001(), HOY_MES).grandes;
    expect(textoParteVendida(g.parteVendida)).toBe("el 59% de lo comprado");
  });

  it("QD3958033: Compré 180 · Vendí 54 (el 30%) · Me quedan 126", () => {
    const g = armarFicha(QD3958033(), HOY_MES).grandes;
    expect(g.comprado).toBe(180);
    expect(g.vendido).toBe(54);
    expect(g.quedan).toBe(126);
    expect(textoParteVendida(g.parteVendida)).toBe("el 30% de lo comprado");
  });

  it("sin compra registrada Compré es null — no se inventa un 0 que parecería dato", () => {
    const g = tresGrandes({
      cuadre: { comprado: 0, vendido: 40, existencia: null, residuo: null, ajusteConfiable: false },
      existencia: null,
      sinCompraRegistrada: true,
    });
    expect(g.comprado).toBeNull();
    expect(g.vendido).toBe(40);
    expect(g.parteVendida).toBeNull(); // sin compras no hay porcentaje honesto
  });

  it("con vendido negativo (puras devoluciones) no hay porcentaje — '−5% de lo comprado' no es castellano", () => {
    const g = tresGrandes({
      cuadre: { comprado: 100, vendido: -5, existencia: 100, residuo: 5, ajusteConfiable: false },
      existencia: 100,
      sinCompraRegistrada: false,
    });
    expect(g.parteVendida).toBeNull();
  });

  it("textoParteVendida — bordes: menos del 1%, y más del 100% se dice tal cual", () => {
    expect(textoParteVendida(0.004)).toBe("menos del 1% de lo comprado");
    expect(textoParteVendida(1)).toBe("el 100% de lo comprado");
    // Vendió MÁS de lo comprado (vendidoDeMas): el número es verdad y el aviso
    // de descuadre explica el hueco. No se recorta a 100.
    expect(textoParteVendida(1.2)).toBe("el 120% de lo comprado");
    expect(textoParteVendida(null)).toBeNull();
  });

  it("una respuesta vieja cacheada (sin `cuadre`) degrada, no revienta", () => {
    const art = { ...QD3958033(), cuadre: undefined } as unknown as ReturnType<typeof QD3958033>;
    const g = armarFicha(art, HOY_MES).grandes;
    expect(g.comprado).toBeNull();
    expect(g.vendido).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA LÍNEA DEL 90% — en cuánto se vende una compra (12-ago-2026)
//
// Daniel: *"creo que es mas importante saber en cuanto meses se vendio digamos
// que el 80%? 90%? siento que es mas util que unidades por mes"*. Confirmó 90%.
// Y el "vendo N u por mes" quedó de dato chiquito al final de la línea.
// ─────────────────────────────────────────────────────────────────────────────

describe("la línea del 90%", () => {
  it("🔴 el caso del mockup (CVM253CR02001): compra viva → 'En 10 meses va el 80% de la compra'", () => {
    // Compró 120 el 23-oct-2025 (única) · vendió 96 · quedan 24.
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "CVM253CR02001",
        descripcion: "Men-Socks Sport",
        ingresos: [
          ing("2025-10-23", 120, { codigo_articulo: "CVM253CR02001", precio: 13.5, costo_fob: 8.47, costo_cif: 8.47 }),
        ],
        ventas: [
          v("2025-11-15", "FA", 12, 162),
          v("2025-12-15", "FA", 24, 324),
          v("2026-03-15", "FA", 36, 486),
          v("2026-05-15", "FA", 24, 324),
        ],
        existencia: 24,
        precioEtiqueta: 13.5,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const f = armarFicha(art, HOY_MES);
    expect(f.grandes).toMatchObject({ comprado: 120, vendido: 96, quedan: 24 });
    expect(textoParteVendida(f.grandes.parteVendida)).toBe("el 80% de lo comprado");
    expect(f.noventa).toEqual({ tipo: "en-curso", meses: 10, parte: 0.8, retrocedio: false });
    // 🔴 El ritmo va PRIMERO y sale DESDE LA LLEGADA (Daniel: *"¿cuántas
    // unidades vendo al mes desde que llegó?"*): 96 vendidas ÷ 10 meses en
    // bodega = 9.6 — no el promedio de la ventana de 12 meses (11).
    expect(f.ritmo).toEqual({ meses: 10, porMes: 9.6, base: "unica-viva", desdeMes: "2025-10" });
    expect(textoLineaNoventa(f.noventa, f.ritmo)).toBe(
      "Vendo 9.6 u por mes · En 10 meses va el 80% de la compra",
    );
    expect(textoNoventaCorto(f.noventa)).toBe("va el 80%");
  });

  it("🔴 compra única que ya cruzó el 90%: 'El 90% se vendió en N meses'", () => {
    // 280 u el 28-nov-2023; 90% = 252; el acumulado cruza en abr-2024 (276).
    const n = medirNoventa(
      {
        compras: [
          {
            empresa: "vistana",
            codigo: "40HM265032",
            fecha: "2023-11-28",
            documento: "D",
            proveedor: null,
            articulo: null,
            unidades: 280,
            costos: { cif: 11.55, fob: null, fobOrigen: "sin-dato", lista: 16 },
          },
        ],
        comprasFueraDeVentana: 0,
        serie: [
          { mes: "2024-01", unidades: 70, venta: 1120 },
          { mes: "2024-02", unidades: 70, venta: 1120 },
          { mes: "2024-03", unidades: 70, venta: 1120 },
          { mes: "2024-04", unidades: 66, venta: 1056 },
        ],
        sinCompraRegistrada: false,
      },
      HOY_MES,
    );
    expect(n).toEqual({ tipo: "vendido", meses: 5, alCruce: 276 }); // nov-2023 → abr-2024
    expect(textoNoventa(n)).toBe("El 90% se vendió en 5 meses");
    expect(textoNoventaCorto(n)).toBe("5 meses");
  });

  it("🔴 EL 90% SOLO SE AFIRMA SI EL NETO SE SOSTIENE — el caso real 4D5077G001 (12-ago-2026)", () => {
    // Llegó 36 u el 29-mar-2026; mayo vendió +36 (cruzó el 90%) y junio
    // devolvió −18: el neto quedó en el 50%. Decir "El 90% se vendió en 2
    // meses" es una verdad a medias con la que Daniel COMPRA — la línea dice
    // el estado real en curso, marcado con la devolución.
    const base = {
      compras: [
        {
          empresa: "vistana",
          codigo: "4D5077G001",
          fecha: "2026-03-29",
          documento: "D",
          proveedor: null,
          articulo: null,
          unidades: 36,
          costos: { cif: 5, fob: null, fobOrigen: "sin-dato" as const, lista: 10 },
        },
      ],
      comprasFueraDeVentana: 0,
      sinCompraRegistrada: false,
    };
    const n = medirNoventa(
      { ...base, serie: [
        { mes: "2026-05", unidades: 36, venta: 360 },
        { mes: "2026-06", unidades: -18, venta: -180 },
      ] },
      HOY_MES,
    );
    expect(n).toEqual({ tipo: "en-curso", meses: 5, parte: 0.5, retrocedio: true });
    expect(textoNoventa(n)).toBe("En 5 meses va el 50% de la compra (bajó por devoluciones)");
    // La versión corta sigue diciendo el estado, sin la nota (la devolución se
    // ve en las barras al abrir la fila).
    expect(textoNoventaCorto(n)).toBe("va el 50%");

    // Y si después de la devolución el neto VUELVE a cruzar y se sostiene, el
    // cruce que vale es el que nunca volvió a bajar (jul-2026 → 4 meses).
    const n2 = medirNoventa(
      { ...base, serie: [
        { mes: "2026-05", unidades: 36, venta: 360 },
        { mes: "2026-06", unidades: -18, venta: -180 },
        { mes: "2026-07", unidades: 16, venta: 160 },
      ] },
      HOY_MES,
    );
    expect(n2).toEqual({ tipo: "vendido", meses: 4, alCruce: 34 });
  });

  it("🔴 con VARIAS compras NO se atribuye por tanda: agregado rotulado, anclado en la primera llegada de la ventana", () => {
    // NB2570001: 5 compras en 3 años + 2 más viejas. Ancla = oct-2025 (la
    // primera de los últimos 12 meses); llegaron 60+120+180 = 360; vendidas
    // desde oct-2025 = 295 (mes en curso incluido: es un acumulado).
    const f = armarFicha(NB2570001(), HOY_MES);
    expect(f.noventa).toEqual({ tipo: "agregado", desdeMes: "2025-10", llegaron: 360, van: 295 });
    // El ritmo usa LA MISMA ancla del agregado: 295 ÷ 10 meses = 29,5 → "30".
    expect(f.ritmo).toEqual({ meses: 10, porMes: 29.5, base: "agregado", desdeMes: "2025-10" });
    expect(textoLineaNoventa(f.noventa, f.ritmo)).toBe(
      "Vendo 30 u por mes · Desde oct 2025 llegaron 360 u · van vendidas 295",
    );
    expect(textoNoventaCorto(f.noventa)).toBe("van 295 de 360");
  });

  it("🩸 el ancla se EXTIENDE hacia atrás cuando lo llegado no cubre lo vendido — el caso real NB3705906", () => {
    // Compra grande de jul-2024 (120 u) todavía viva + refuerzo de sep-2025
    // (20 u). Anclado en sep (la única llegada de los últimos 12 meses), la
    // línea decía "llegaron 20 · van vendidas 36" — vendió más de lo que llegó,
    // un número que se lee ROTO. El grupo de compras vivas es el sufijo que
    // alcanza a cubrir las ventas: se retrocede hasta jul-2024.
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "NB3705906",
        descripcion: "Men-Trunk",
        ingresos: [
          ing("2024-07-16", 120, { codigo_articulo: "NB3705906", precio: 27, costo_cif: 9.46, costo_fob: 9.46 }),
          ing("2025-09-15", 20, { codigo_articulo: "NB3705906", precio: 27, costo_cif: 16.555, costo_fob: 16.555 }),
        ],
        ventas: [
          v("2024-09-15", "FA", 30, 810),
          v("2025-03-15", "FA", 31, 837),
          v("2025-11-15", "FA", 20, 540),
          v("2026-02-15", "FA", 16, 432),
        ],
        existencia: 43,
        precioEtiqueta: 27,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const n = medirNoventa(art, HOY_MES);
    expect(n).toEqual({ tipo: "agregado", desdeMes: "2024-07", llegaron: 140, van: 97 });
    expect(textoNoventaCorto(n)).toBe("van 97 de 140");
    // La mutación que esto caza: anclar en sep-2025 daría "van 36 de 20".
    expect(textoNoventaCorto(n)).not.toContain("de 20");
  });

  it("compra única viva SIN historia rara: QD3958033 va por el 30% a los 8 meses", () => {
    const f = armarFicha(QD3958033(), HOY_MES);
    expect(f.noventa).toEqual({ tipo: "en-curso", meses: 8, parte: 0.3, retrocedio: false });
    // Ritmo desde la llegada (dic-2025): 54 ÷ 8 = 6,75 → "6.8", NO el promedio
    // de su vida en la ventana (7,7).
    expect(f.ritmo).toEqual({ meses: 8, porMes: 6.75, base: "unica-viva", desdeMes: "2025-12" });
    expect(textoLineaNoventa(f.noventa, f.ritmo)).toBe(
      "Vendo 6.8 u por mes · En 8 meses va el 30% de la compra",
    );
  });

  it("🔴 sin compra registrada no se inventa: el ritmo cae al promedio de 12 meses, DICIÉNDOLO", () => {
    const art = {
      compras: [],
      comprasFueraDeVentana: 0,
      serie: [{ mes: "2026-05", unidades: 40, venta: 400 }],
      sinCompraRegistrada: true,
    };
    const n = medirNoventa(art, HOY_MES);
    expect(n).toEqual({ tipo: "sin-dato" });
    expect(textoNoventa(n)).toBeNull();
    expect(textoNoventaCorto(n)).toBe("—");
    // Sin llegada no hay ancla: el ritmo usa la ventana de 12 y lo ROTULA.
    const r = medirRitmo(art, HOY_MES, n, promedioMensual(barrasDeVentana(art.serie, HOY_MES)));
    expect(r.base).toBe("ventana-12");
    expect(r.meses).toBeNull();
    // 40 u en su único mes vivo, promediadas entre sus 3 meses de vida en la
    // ventana (may→jul) = 13,3 → "13".
    expect(textoLineaNoventa(n, r)).toBe("Vendo 13 u por mes (promedio de los últimos 12 meses)");
    // Sin ventas, la línea entera desaparece.
    expect(textoLineaNoventa(n, { meses: null, porMes: null, base: null, desdeMes: null })).toBeNull();
  });

  it("🔴 nada de '∞' ni '0 meses': los bordes hablan castellano", () => {
    expect(textoNoventa({ tipo: "vendido", meses: 0 })).toBe("El 90% se vendió en menos de 1 mes");
    expect(textoNoventa({ tipo: "en-curso", meses: 0, parte: 0.12 })).toBe(
      "En menos de 1 mes va el 12% de la compra",
    );
    expect(textoNoventa({ tipo: "en-curso", meses: 4, parte: 0 })).toBe(
      "En 4 meses no se ha vendido nada de la compra",
    );
    expect(textoNoventa({ tipo: "en-curso", meses: 4, parte: 0.004 })).toBe(
      "En 4 meses va menos del 1% de la compra",
    );
    expect(textoVendoPorMes(0)).toBeNull(); // "Vendo 0 u por mes" no se dice
    // 🔴 El redondeo de Daniel: 1 decimal por debajo de 10, entero de ahí para
    // arriba — 3.6 y 9.6 son la diferencia entre comprar y no comprar.
    expect(textoVendoPorMes(0.3)).toBe("Vendo 0.3 u por mes");
    expect(textoVendoPorMes(3.6)).toBe("Vendo 3.6 u por mes");
    expect(textoVendoPorMes(9.6)).toBe("Vendo 9.6 u por mes");
    expect(textoVendoPorMes(4)).toBe("Vendo 4 u por mes");
    expect(textoVendoPorMes(28.4)).toBe("Vendo 28 u por mes");
    expect(textoVendoPorMes(0.01)).toBe("Vendo menos de 0.1 u por mes");
  });

  it("🔴 el CUARTO grande es MESES, con su pie por forma", () => {
    // Daniel: *"que me diga cuanto tiempo lleva alado de los 3 kpi. deberia de
    // ser: compre, vendi, stock, meses (de venta) y abajo u/mes"*.
    expect(valorGrandeMeses({ meses: 5, porMes: 3.6, base: "unica-viva", desdeMes: "2026-03" })).toBe("5");
    expect(pieGrandeMeses({ meses: 5, porMes: 3.6, base: "unica-viva", desdeMes: "2026-03" })).toBe("de venta");
    expect(pieGrandeMeses({ meses: 5, porMes: 50, base: "unica-vendida", desdeMes: "2023-11" })).toBe(
      "en vender el 90%",
    );
    expect(pieGrandeMeses({ meses: 10, porMes: 29.5, base: "agregado", desdeMes: "2025-10" })).toBe(
      "de venta, desde oct 2025",
    );
    expect(valorGrandeMeses({ meses: null, porMes: 3, base: "ventana-12", desdeMes: null })).toBe("—");
    expect(pieGrandeMeses({ meses: null, porMes: 3, base: "ventana-12", desdeMes: null })).toBe(
      "sin fecha de llegada",
    );
  });

  it("🔴 compra única YA VENDIDA: el ritmo es el de MIENTRAS se vendía, no diluido por los meses de después", () => {
    // 280 u, el 90% cruzó a los 5 meses con 276 acumuladas → 276 ÷ 5 = 55,2.
    // Dividir entre los meses en bodega (que siguen corriendo después del
    // agote) daría un ritmo cada vez más chico para el mismo artículo.
    const n = { tipo: "vendido", meses: 5, alCruce: 276 } as const;
    const r = medirRitmo(
      { compras: [{ fecha: "2023-11-28" }] as never, serie: [] },
      HOY_MES,
      n,
      { porMes: null, unidades: 0, venta: 0, meses: 12, desdeQueEmpezo: false },
    );
    expect(r).toEqual({ meses: 5, porMes: 55.2, base: "unica-vendida", desdeMes: "2023-11" });
  });

  it("van vendidas NEGATIVAS (devoluciones netas desde el ancla) se dicen como lo que son", () => {
    expect(textoNoventa({ tipo: "agregado", desdeMes: "2026-02", llegaron: 100, van: -5 })).toBe(
      "Desde feb 2026 llegaron 100 u · van devueltas 5",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 VENDIDO · MESES — las dos celdas del modo pedido (12-ago-2026)
//
// Daniel: la columna "90% en" no se entendía ("va el 29%" no dice cuánto
// tiempo lleva). La reemplazan DOS columnas que salen de UNA función
// (`medirVendidoMeses`) — la tabla y el Excel llaman LA MISMA. Los casos con
// código son las filas de la captura de Daniel: si el cálculo no da ESTO,
// está mal el código, no el test.
// ─────────────────────────────────────────────────────────────────────────────

describe("VENDIDO · MESES (medirVendidoMeses)", () => {
  /** Arma un artículo mínimo y devuelve las dos celdas ya medidas. */
  const celdas = (art: Parameters<typeof armarFicha>[0]) => {
    const f = armarFicha(art, HOY_MES);
    const vm = medirVendidoMeses(f);
    return { vm, vendido: textoVendidoCelda(vm), meses: textoMesesCelda(vm) };
  };

  it("🔴 la fila de la captura (4F5003G001): 48 compradas · 14 vendidas → 29% · 8, VIVO (gris)", () => {
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "4F5003G001",
        descripcion: "Men-Polo",
        ingresos: [ing("2025-12-10", 48, { codigo_articulo: "4F5003G001" })],
        ventas: [v("2026-02-15", "FA", 8, 160), v("2026-05-15", "FA", 6, 120)],
        existencia: 34,
        precioEtiqueta: 20,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const { vm, vendido, meses } = celdas(art);
    // VENDIDO = Vendí ÷ Compré (los TOTALES de los tres grandes): 14/48 = 29%.
    // MESES = calendario desde la llegada: dic-2025 → ago-2026 = 8.
    expect(vm).toEqual({ parte: 14 / 48, meses: 8, terminado: false });
    expect(vendido).toBe("29%");
    expect(meses).toBe("8");
  });

  it("🔴 TERMINADO se CONGELA en el cruce (4K5026G102: 24/24/0 → 90% · 2) aunque lleve meses más en bodega", () => {
    // Única compra ene-2026 (24 u); el 90% (21,6) se cruza en mar-2026 con 24
    // acumuladas. Al corte ago-2026 lleva 7 meses en bodega — la celda dice 2:
    // la cola no cuenta (regla vieja de Daniel).
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "4K5026G102",
        descripcion: "Men-Tee",
        ingresos: [ing("2026-01-10", 24, { codigo_articulo: "4K5026G102" })],
        ventas: [v("2026-02-15", "FA", 12, 240), v("2026-03-15", "FA", 12, 240)],
        existencia: 0,
        precioEtiqueta: 20,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const { vm, vendido, meses } = celdas(art);
    expect(vm).toEqual({ parte: 0.9, meses: 2, terminado: true });
    // 🔴 CONGELADO: dice 90% (no "100%") y 2 (no los 7 de bodega).
    expect(vendido).toBe("90%");
    expect(meses).toBe("2");
  });

  it("🔴 SIN VENTAS va como vivo (4F5036G001: 36/0/36 → 0% · 4) — el 0% es un dato, no un hueco", () => {
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "4F5036G001",
        descripcion: "Men-Short",
        ingresos: [ing("2026-04-20", 36, { codigo_articulo: "4F5036G001" })],
        ventas: [],
        existencia: 36,
        precioEtiqueta: 20,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const { vm, vendido, meses } = celdas(art);
    expect(vm).toEqual({ parte: 0, meses: 4, terminado: false });
    expect(vendido).toBe("0%");
    expect(meses).toBe("4");
  });

  it("🔴 el caso vivo de producción (CVM253CR02001: 120/96/24) → 80% · 10", () => {
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "CVM253CR02001",
        descripcion: "Men-Socks Sport",
        ingresos: [
          ing("2025-10-23", 120, { codigo_articulo: "CVM253CR02001", precio: 13.5, costo_fob: 8.47, costo_cif: 8.47 }),
        ],
        ventas: [
          v("2025-11-15", "FA", 12, 162),
          v("2025-12-15", "FA", 24, 324),
          v("2026-03-15", "FA", 36, 486),
          v("2026-05-15", "FA", 24, 324),
        ],
        existencia: 24,
        precioEtiqueta: 13.5,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const { vm, vendido, meses } = celdas(art);
    expect(vm).toEqual({ parte: 0.8, meses: 10, terminado: false });
    expect(vendido).toBe("80%");
    expect(meses).toBe("10");
  });

  it("🔴 el mes en curso queda FUERA de los promedios, pero mueve el % y los MESES cuentan el calendario real", () => {
    // Compra dic-2025 (48 u); la ÚNICA venta es de agosto (el mes en curso).
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "4F5003G001",
        descripcion: "Men-Polo",
        ingresos: [ing("2025-12-10", 48, { codigo_articulo: "4F5003G001" })],
        ventas: [v("2026-08-05", "FA", 12, 240)],
        existencia: 36,
        precioEtiqueta: 20,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const f = armarFicha(art, HOY_MES);
    // Las barras y el promedio NO ven agosto (regla de la casa)…
    expect(promedioMensual(f.barras).unidades).toBe(0);
    // …pero VENDIDO es el neto histórico (12/48 = 25%) y MESES el calendario
    // real (dic-2025 → ago-2026 = 8): la venta de hoy no se esconde.
    const vm = medirVendidoMeses(f);
    expect(vm).toEqual({ parte: 0.25, meses: 8, terminado: false });
  });

  it("🔴 con VARIAS compras los MESES usan el ancla EXTENDIDA de la ficha (NB3705906) — no una segunda cuenta", () => {
    // 120 u de jul-2024 vivas + refuerzo de 20 en sep-2025; vendidas 97.
    // Anclado en sep-2025 diría 11 meses; el ancla extendida dice jul-2024 → 25.
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "NB3705906",
        descripcion: "Men-Trunk",
        ingresos: [
          ing("2024-07-16", 120, { codigo_articulo: "NB3705906" }),
          ing("2025-09-15", 20, { codigo_articulo: "NB3705906" }),
        ],
        ventas: [
          v("2024-09-15", "FA", 30, 810),
          v("2025-03-15", "FA", 31, 837),
          v("2025-11-15", "FA", 20, 540),
          v("2026-02-15", "FA", 16, 432),
        ],
        existencia: 43,
        precioEtiqueta: 27,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const f = armarFicha(art, HOY_MES);
    const vm = medirVendidoMeses(f);
    expect(f.ritmo.desdeMes).toBe("2024-07"); // el ancla extendida
    expect(vm.meses).toBe(f.ritmo.meses); // LA MISMA, no una segunda
    expect(vm).toEqual({ parte: 97 / 140, meses: 25, terminado: false });
    expect(textoVendidoCelda(vm)).toBe("69%");
  });

  it("🔴 retrocedió por devoluciones (4D5077G001): NO se congela — dice el estado real en curso", () => {
    // Cruzó el 90% en mayo y junio devolvió: el neto quedó en 18/36 = 50%.
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "4D5077G001",
        descripcion: "Men-Cap",
        ingresos: [ing("2026-03-29", 36, { codigo_articulo: "4D5077G001" })],
        ventas: [v("2026-05-10", "FA", 36, 360), v("2026-06-10", "NC", 18, 180)],
        existencia: 18,
        precioEtiqueta: 10,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const { vm, vendido, meses } = celdas(art);
    expect(vm).toEqual({ parte: 0.5, meses: 5, terminado: false });
    expect(vendido).toBe("50%");
    expect(meses).toBe("5");
  });

  it('🔴 lo indecidible dice "—", nunca se inventa: sin compra con fecha → las DOS celdas; vendido>comprado (TERMO) → solo VENDIDO', () => {
    // Sin compra registrada (RETENCION): ni % ni ancla.
    const sinCompra = celdas(
      armarArticulo(
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
      ),
    );
    expect(sinCompra.vm).toEqual({ parte: null, meses: null, terminado: false });
    expect(sinCompra.vendido).toBe("—");
    expect(sinCompra.meses).toBe("—");

    // Vendido > comprado (el caso TERMO: faltan compras EN Switch): un "150%"
    // sería mentira, pero los meses desde el ancla SÍ se saben y se dicen.
    const termo = celdas(
      armarArticulo(
        {
          empresa: "active_shoes",
          codigo: "TERMO",
          descripcion: "TERMO",
          ingresos: [
            ing("2024-07-01", 60, { codigo_articulo: "TERMO", empresa_key: "active_shoes" }),
            ing("2025-10-01", 40, { codigo_articulo: "TERMO", empresa_key: "active_shoes" }),
          ],
          ventas: [v("2025-11-06", "FA", 150, 1500)],
          existencia: 0,
          precioEtiqueta: 10,
          catalogoSyncedAt: null,
        },
        HOY,
      ),
    );
    expect(termo.vm).toEqual({ parte: null, meses: 25, terminado: false });
    expect(termo.vendido).toBe("—");
    expect(termo.meses).toBe("25");
  });

  it("un vendido NEGATIVO (más devoluciones que ventas) tampoco es un % afirmable", () => {
    const vm = medirVendidoMeses({
      grandes: { comprado: 100, vendido: -5, quedan: 100, parteVendida: null },
      noventa: { tipo: "en-curso", meses: 3, parte: -0.05 },
      ritmo: { meses: 3, porMes: null, base: "unica-viva", desdeMes: "2026-05" },
    });
    expect(vm).toEqual({ parte: null, meses: 3, terminado: false });
    expect(textoVendidoCelda(vm)).toBe("—");
  });

  it("los textos redondean a ENTERO y el borde no promete de más", () => {
    expect(textoVendidoCelda({ parte: 14 / 48, meses: 8, terminado: false })).toBe("29%");
    expect(textoVendidoCelda({ parte: 0.9, meses: 2, terminado: true })).toBe("90%");
    expect(textoVendidoCelda({ parte: 0.004, meses: 1, terminado: false })).toBe("0%");
    expect(textoVendidoCelda({ parte: 1, meses: 4, terminado: false })).toBe("100%");
    expect(textoMesesCelda({ parte: 0.5, meses: 0, terminado: false })).toBe("0");
    expect(textoMesesCelda({ parte: null, meses: null, terminado: false })).toBe("—");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LAS BARRAS ANCLADAS A LA LLEGADA (12-ago-2026, mockup aprobado)
// ─────────────────────────────────────────────────────────────────────────────

describe("la vista de las barras", () => {
  const CVM = () =>
    armarArticulo(
      {
        empresa: "vistana",
        codigo: "CVM253CR02001",
        descripcion: "Men-Socks Sport",
        ingresos: [
          ing("2025-10-23", 120, { codigo_articulo: "CVM253CR02001", precio: 13.5, costo_fob: 8.47, costo_cif: 8.47 }),
        ],
        ventas: [
          v("2025-11-15", "FA", 12, 162),
          v("2025-12-15", "FA", 24, 324),
          v("2026-03-15", "FA", 36, 486),
          v("2026-05-15", "FA", 24, 324),
        ],
        existencia: 24,
        precioEtiqueta: 13.5,
        catalogoSyncedAt: null,
      },
      HOY,
    );

  it("🔴 una sola compra: las barras ARRANCAN el mes que llegó, con el acumulado del mockup", () => {
    const vista = vistaDeBarras(CVM(), HOY_MES);
    expect(vista.modo).toBe("desde-llegada");
    expect(vista.barras.map((b) => b.mes)).toEqual([
      "2025-10", "2025-11", "2025-12", "2026-01", "2026-02",
      "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
    ]);
    // El acumulado del mockup aprobado: 0 · 12 · 36 · 36 · 36 · 72 · 72 · 96 · 96 · 96
    expect(vista.acumulado).toEqual([0, 12, 36, 36, 36, 72, 72, 96, 96, 96]);
    expect(vista.recortada).toBe(false);
    expect(tituloDesdeLlegada(vista.llegada!)).toBe("Desde que llegó · 23 oct 2025 · 120 u");
    expect(subDesdeLlegada(vista, HOY_MES)).toBe("10 meses en bodega · van vendidas 96 de 120");
    // Desde que llegó, la mercancía está en la calle: no hay "antes de empezar".
    expect(vista.barras.every((b) => !b.antesDeEmpezar)).toBe(true);
    // Oct·nov·dic siguen resaltados.
    expect(vista.barras.filter((b) => b.fuerte).map((b) => b.mes)).toEqual(["2025-10", "2025-11", "2025-12"]);
  });

  it("🔴 una compra de más de 12 meses se RECORTA a los primeros 12, y el subtítulo lo dice", () => {
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "40HM265032",
        descripcion: "KAHLO",
        ingresos: [ing("2023-11-28", 280, { codigo_articulo: "40HM265032", precio: 16, costo_cif: 11.55, costo_fob: 11.55 })],
        ventas: [v("2024-01-15", "FA", 70, 1120)],
        existencia: 0,
        precioEtiqueta: 16,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const vista = vistaDeBarras(art, HOY_MES);
    expect(vista.modo).toBe("desde-llegada");
    expect(vista.barras).toHaveLength(12);
    expect(vista.barras[0].mes).toBe("2023-11");
    expect(vista.barras[11].mes).toBe("2024-10");
    expect(vista.recortada).toBe(true);
    expect(subDesdeLlegada(vista, HOY_MES)).toContain("se muestran los primeros 12 meses");
  });

  it("🔴 varias compras: últimos 12 meses con cada llegada marcada con ▲ y su leyenda", () => {
    const vista = vistaDeBarras(NB2570001(), HOY_MES);
    expect(vista.modo).toBe("ultimos-12");
    expect(vista.barras).toHaveLength(12);
    expect(vista.acumulado).toBeNull();
    // Las llegadas DE LA VENTANA: oct-2025 (60) y feb-2026 (120 y 180). Las de
    // abr-2025 quedan fuera de los 12 meses y no se marcan.
    expect(vista.llegadas).toEqual([
      { mes: "2025-10", cantidades: [60] },
      { mes: "2026-02", cantidades: [120, 180] },
    ]);
    expect(leyendaLlegadas(vista.llegadas)).toBe("▲ oct: llegaron 60 u · ▲▲ feb: llegaron 120 y 180 u");
  });

  it("sin llegadas en la ventana no hay leyenda — no se dibuja un pie vacío", () => {
    expect(leyendaLlegadas([])).toBeNull();
  });

  it("una compra que llegó EN el mes en curso cae a últimos-12 (no hay mes completo que anclar)", () => {
    const art = armarArticulo(
      {
        empresa: "vistana",
        codigo: "NUEVO001",
        descripcion: "NUEVO",
        ingresos: [ing("2026-08-05", 100, { codigo_articulo: "NUEVO001" })],
        ventas: [],
        existencia: 100,
        precioEtiqueta: 10,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const vista = vistaDeBarras(art, HOY_MES);
    expect(vista.modo).toBe("ultimos-12");
    expect(vista.barras).toHaveLength(12);
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

  it("la caja muestra 4 compras y las demás se CUENTAN en una sola línea", () => {
    expect(COMPRAS_VISIBLES).toBe(4);
    const l = listaDeCompras(NB2570001());
    expect(l.visibles).toHaveLength(COMPRAS_VISIBLES);
    // 5 dentro de los 3 años (1 fuera de las visibles) + 2 de más de 3 años.
    expect(l.restantes).toBe(3);
  });

  it("🔴 la lista NO expone las compras escondidas: no hay nada que desplegar", () => {
    // Si `ListaCompras` volviera a traer el arreglo, volvería el botón — y con
    // él los dos renglones que Daniel pidió juntar en uno.
    const l = listaDeCompras(NB2570001());
    expect(l).not.toHaveProperty("ocultas");
    expect(Object.keys(l).sort()).toEqual(["restantes", "unica", "visibles"]);
  });

  it("con 4 compras o menos no queda nada que contar", () => {
    expect(listaDeCompras(QD3958033()).restantes).toBe(0);
  });

  it("sin ninguna compra la caja queda vacía, sin inventar una llegada", () => {
    const l = listaDeCompras({ compras: [], comprasFueraDeVentana: 0 });
    expect(l).toEqual({ visibles: [], restantes: 0, unica: false });
  });

  it("'y 1 compra más' va en singular", () => {
    expect(textoRestantes(1)).toBe("y 1 compra más");
    expect(textoRestantes(2)).toBe("y 2 compras más");
    expect(textoRestantes(0)).toBeNull();
    expect(textoRestantes(-1)).toBeNull();
  });

  it("una respuesta vieja cacheada (sin `compras`) degrada, no revienta", () => {
    const art = { ...QD3958033(), compras: undefined } as unknown as ReturnType<typeof QD3958033>;
    const ficha = armarFicha(art, HOY_MES);
    expect(ficha.compras.visibles).toEqual([]);
    expect(ficha.ultima).toBeNull();
    expect(ficha.margen.motivo).toBe("sin-costo");
  });

  it("temporadaFuerte no divide entre cero", () => {
    expect(temporadaFuerte(barrasDeVentana([], HOY_MES)).parte).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL CIF ANTERIOR: SOLO CUANDO CAMBIÓ
//
// Era una columna fija que repetía el mismo número en casi todos los artículos.
// Ahora es la SEÑAL de que te subieron el costo, y si no cambió no ocupa lugar.
// ─────────────────────────────────────────────────────────────────────────────

describe("centavos — el Excel redondea IGUAL que la pantalla", () => {
  it("🩸 el CIF real de NB2570001 (16,555) da $16.56, no $16.55", () => {
    // `toFixed(2)` mira el binario (16,554999…) y devuelve 16.55, mientras la
    // pantalla muestra $16.56. Con eso el Excel decía un centavo menos que la
    // ficha del MISMO artículo.
    expect(centavos(16.555)).toBe(16.56);
    expect(Number((16.555).toFixed(2))).toBe(16.55); // la mutación que esto caza
  });

  it("coincide con lo que se ve, dígito por dígito", () => {
    for (const x of [16.555, 4.466, 26.9203, 15.05, 27, 0.005, 1234.567]) {
      expect(centavos(x)!.toFixed(2)).toBe(
        x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ""),
      );
    }
  });

  it("sin número no inventa un cero", () => {
    expect(centavos(null)).toBeNull();
    expect(centavos(undefined)).toBeNull();
    expect(centavos(Number.NaN)).toBeNull();
  });
});

describe("cambioDeCosto", () => {
  it("mismo costo = NADA que mostrar", () => {
    expect(cambioDeCosto(16.555, 16.555)).toBeNull();
  });

  it("subió: lo dice y para qué lado", () => {
    expect(cambioDeCosto(16.56, 14.2)).toEqual({ anterior: 14.2, subio: true });
  });

  it("bajó: también se muestra — es la misma señal al revés", () => {
    expect(cambioDeCosto(14.2, 16.56)).toEqual({ anterior: 16.56, subio: false });
  });

  it("🩸 se compara a la precisión que se MUESTRA: media milésima no es un cambio", () => {
    // Los costos son promedios PONDERADOS de varias líneas, así que dos compras
    // "iguales" pueden diferir en la milésima. Anunciar "(antes $16.56)" al lado
    // de "$16.56" sería una señal que no señala nada.
    expect(cambioDeCosto(16.5551, 16.5559)).toBeNull(); // los dos se ven $16.56
    // Un centavo entero SÍ es un cambio y se dice.
    expect(cambioDeCosto(16.56, 16.55)).toEqual({ anterior: 16.55, subio: true });
  });

  it("sin compra anterior (o sin costo) no hay nada que comparar", () => {
    expect(cambioDeCosto(16.555, null)).toBeNull();
    expect(cambioDeCosto(null, 16.555)).toBeNull();
    expect(cambioDeCosto(null, null)).toBeNull();
    expect(cambioDeCosto(Number.NaN, 16.555)).toBeNull();
  });
});
