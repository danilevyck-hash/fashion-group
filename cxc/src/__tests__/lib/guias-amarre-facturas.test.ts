/**
 * 🔴 GUÍA › CADA FACTURA AMARRADA A SWITCH (25-nov-2026, Daniel: «sí, los tres»).
 * Para COMPLETAR, cada número es una factura de Switch de la MISMA empresa y del
 * MISMO cliente, o «Traslado». Al completar, las etiquetas pendientes de esas
 * facturas pasan a «ya salió». Casos reales: GT-313 (2943 en vez de 2643) y
 * GT-293 / GT-315 («0000»).
 */
import { describe, it, expect } from "vitest";
import {
  GUIA_AMARRE_FACTURAS_2026_11,
  etiquetasQueSalen,
  partesDelRenglon,
  sinAmarre,
  textoSinAmarre,
  type FacturaDeSwitch,
} from "@/lib/guias/amarre-facturas";

const SWITCH: FacturaDeSwitch[] = [
  { empresa_key: "fashion_shoes", secuencial: "11-000002643", cliente_codigo: "D-47" },
  { empresa_key: "fashion_shoes", secuencial: "11-000002612", cliente_codigo: "D-86" },
  { empresa_key: "vistana", secuencial: "11-000003185", cliente_codigo: "D-25" },
];

describe("🔴 el interruptor", () => {
  it("está PRENDIDO", () => expect(GUIA_AMARRE_FACTURAS_2026_11).toBe(true));
});

describe("🔴 cada número del renglón", () => {
  it("misma empresa + mismo cliente + últimos 4 dígitos = amarrada", () => {
    const p = partesDelRenglon({ empresa: "Fashion Shoes", cliente_codigo: "D-86", facturas: "11-000002612" }, SWITCH);
    expect(p).toEqual([{ texto: "11-000002612", tipo: "ok", factura: SWITCH[1] }]);
  });

  it("el error de dedo de la GT-313 (2943 por 2643) NO pasa", () => {
    const p = partesDelRenglon({ empresa: "Fashion Shoes", cliente_codigo: "D-47", facturas: "2943" }, SWITCH);
    expect(p[0].tipo).toBe("falta");
  });

  it("la factura de OTRO cliente no amarra (GT-304: 3185 es de D-25, no de D-108)", () => {
    const p = partesDelRenglon({ empresa: "Vistana International", cliente_codigo: "D-108", facturas: "3185" }, SWITCH);
    expect(p[0].tipo).toBe("falta");
  });

  it("la misma factura en OTRA empresa no amarra", () => {
    const p = partesDelRenglon({ empresa: "Fashion Wear", cliente_codigo: "D-86", facturas: "2612" }, SWITCH);
    expect(p[0].tipo).toBe("falta");
  });

  it("sin código de cliente, alcanza con la empresa", () => {
    const p = partesDelRenglon({ empresa: "Fashion Shoes", cliente_codigo: null, facturas: "2643" }, SWITCH);
    expect(p[0].tipo).toBe("ok");
  });

  it("«Traslado» siempre vale; «0000» ya no (es Traslado)", () => {
    const p = partesDelRenglon({ empresa: "Fashion Wear", cliente_codigo: "D-108", facturas: "Traslado, 00000" }, SWITCH);
    expect(p.map((x) => x.tipo)).toEqual(["traslado", "falta"]);
  });

  it("🔑 lo que no se puede saber no frena: Boston, o Switch sin leer", () => {
    expect(partesDelRenglon({ empresa: "Confecciones Boston", facturas: "0000" }, SWITCH)[0].tipo).toBe("sin_dato");
    expect(partesDelRenglon({ empresa: "Fashion Shoes", cliente_codigo: "D-47", facturas: "2943" }, null)[0].tipo).toBe("sin_dato");
  });
});

describe("🔴 lo que dice al completar", () => {
  it("señala el renglón, la factura y la empresa", () => {
    const faltan = sinAmarre(
      [
        { empresa: "Fashion Shoes", cliente: "Kings Sport", cliente_codigo: "D-86", facturas: "2612" },
        { empresa: "Fashion Shoes", cliente: "Dorado Sports 60", cliente_codigo: "D-47", facturas: "2943" },
      ],
      SWITCH,
    );
    expect(faltan).toEqual(["Renglón 2: la factura 2943 no está en Fashion Shoes para Dorado Sports 60"]);
    expect(textoSinAmarre(faltan)).toMatch(/^Falta amarrar 1 factura — Renglón 2: .*Selecciona la factura del cliente o marca Traslado\.$/);
  });

  it("todo amarrado = se completa", () => {
    expect(sinAmarre([{ empresa: "Fashion Shoes", cliente_codigo: "D-47", facturas: "2643, Traslado" }], SWITCH)).toEqual([]);
    expect(textoSinAmarre([])).toBe("");
  });
});

describe("🔴 al completar, las etiquetas de sus facturas pasan a «ya salió»", () => {
  const renglones = [
    { id: "r1", empresa: "Fashion Shoes", facturas: "2612" },
    { id: "r2", empresa: "Fashion Wear", facturas: "3345, 3352" },
  ];
  it("misma empresa + últimos 4 dígitos → su renglón", () => {
    const r = etiquetasQueSalen(renglones, [
      { id: 123, empresa_key: "fashion_shoes", secuencial: "11-000002612" },
      { id: 99, empresa_key: "fashion_wear", secuencial: "11-000003345" },
    ]);
    expect(r).toEqual([{ etiquetaId: 123, renglonId: "r1" }, { etiquetaId: 99, renglonId: "r2" }]);
  });
  it("otra empresa u otro número: no se toca", () => {
    expect(
      etiquetasQueSalen(renglones, [
        { id: 1, empresa_key: "vistana", secuencial: "11-000002612" },
        { id: 2, empresa_key: "fashion_shoes", secuencial: "11-000002438" },
        { id: 3, empresa_key: null, secuencial: "Traslado" },
      ]),
    ).toEqual([]);
  });
});
