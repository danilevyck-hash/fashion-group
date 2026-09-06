// ─────────────────────────────────────────────────────────────────────────────
// «DEJÓ DE VENDERSE» — el reverso de la etiqueta «Nuevo» (5-sep-2026).
//
// Ventas › Productos ya marcaba en verde lo que este año existe y el pasado no
// («Nuevo», en `DeltaCell`). Faltaba lo contrario: lo que el año pasado, en
// este MISMO período, vendió — y este año no vendió nada. Es el mismo dato al
// revés y no estaba en NINGUNA pantalla del sistema.
//
// 🔴 NO CUESTA UNA CONSULTA. Las dos ventanas ya viajan: la pantalla pide el
// período actual y el mismo período del año anterior (`?previo=1`) para poder
// pintar la columna de cambio. Esto es la resta entre esas dos listas, hecha en
// el navegador.
//
// ⚠️ NO ES «se agotó» NI «se descontinuó»: el sistema no sabe eso. Es
// literalmente «el año pasado vendió $X en este período y este año $0», y el
// rótulo dice lo que se midió y nada más.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { dejoDeVenderse, totalDejadoDeVender } from "@/lib/ventas/productos-dejados";

const p = (descripcion: string, venta: number) => ({ descripcion, venta });

describe("qué dejó de venderse", () => {
  it("lo que vendía el año pasado y este año no está en la lista", () => {
    const salida = dejoDeVenderse(
      [p("CAMISA POLO", 9_000)],
      { "CAMISA POLO": 8_000, "SANDALIA VIEJA": 4_500 },
    );
    expect(salida).toEqual([{ descripcion: "SANDALIA VIEJA", ventaAntes: 4_500 }]);
  });

  it("🔑 «vendió 0» y «no está en la lista» cuentan igual — y es a propósito", () => {
    // Una descripción puede llegar con venta 0 porque una nota de crédito
    // canceló exactamente lo facturado. En los dos casos ese producto no dejó
    // plata este período, que es la pregunta.
    const salida = dejoDeVenderse(
      [p("CAMISA POLO", 9_000), p("SANDALIA VIEJA", 0)],
      { "SANDALIA VIEJA": 4_500 },
    );
    expect(salida.map((f) => f.descripcion)).toEqual(["SANDALIA VIEJA"]);
  });

  it("de MAYOR a menor plata perdida — es el orden en el que se decide qué mirar", () => {
    const salida = dejoDeVenderse([], {
      CHICA: 200,
      GRANDE: 50_000,
      MEDIANA: 3_000,
    });
    expect(salida.map((f) => f.descripcion)).toEqual(["GRANDE", "MEDIANA", "CHICA"]);
  });

  it("empate: desempata por nombre, para que dos corridas den la misma lista", () => {
    const salida = dejoDeVenderse([], { ZAPATO: 1_000, ABRIGO: 1_000 });
    expect(salida.map((f) => f.descripcion)).toEqual(["ABRIGO", "ZAPATO"]);
  });

  it("🔴 los centavos no son una baja: por debajo de $100 no se lista", () => {
    // Mismo piso que `BASE_MIN_COMPARATIVO`, la regla del Δ% de toda la app: por
    // debajo de $100 el número no significa nada y llenaría la lista de ruido
    // tapando las bajas que sí importan.
    const salida = dejoDeVenderse([], { RUIDO: 12.5, REAL: 900 });
    expect(salida.map((f) => f.descripcion)).toEqual(["REAL"]);
  });

  it("un dato roto no rompe la lista: se omite", () => {
    const salida = dejoDeVenderse([], { MALA: NaN, BUENA: 900 } as Record<string, number>);
    expect(salida.map((f) => f.descripcion)).toEqual(["BUENA"]);
  });

  it("sin ventana anterior no se afirma nada: la lista queda vacía", () => {
    expect(dejoDeVenderse([p("CAMISA POLO", 9_000)], {})).toEqual([]);
  });

  it("el total es la plata que este período NO entró por esos productos", () => {
    const salida = dejoDeVenderse([], { A: 1_000, B: 2_500 });
    expect(totalDejadoDeVender(salida)).toBe(3_500);
    expect(totalDejadoDeVender([])).toBe(0);
  });
});

describe("es EXACTAMENTE el reverso de «Nuevo»", () => {
  it("lo que sale «Nuevo» arriba no puede salir «dejó de venderse» abajo", () => {
    // «Nuevo» = hay venta este año y no había el pasado. «Dejó de venderse» =
    // había el pasado y no hay este. Son conjuntos disjuntos por construcción, y
    // que se pisaran sería la firma de que uno de los dos mira la ventana
    // equivocada.
    const actual = [p("ESTRENO", 5_000), p("DE SIEMPRE", 8_000)];
    const previo = { "DE SIEMPRE": 7_000, RETIRADO: 6_000 };
    const dejados = dejoDeVenderse(actual, previo).map((f) => f.descripcion);
    const nuevos = actual.filter((x) => !(x.descripcion in previo)).map((x) => x.descripcion);
    expect(nuevos).toEqual(["ESTRENO"]);
    expect(dejados).toEqual(["RETIRADO"]);
    expect(dejados.filter((d) => nuevos.includes(d))).toEqual([]);
  });
});
