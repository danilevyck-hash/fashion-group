/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA MENUDA — LAS REGLAS PURAS DEL REDISEÑO (7-sep-2026).
 *
 * Todo lo que se congela acá está MEDIDO contra producción: 3 períodos,
 * 77 recibos vivos por $563.28, una sola persona cargándolos (Angela).
 * La medición vive en `scripts/_medir-caja-rediseno.mjs`.
 *
 * Lo que vigila este archivo:
 *  1. 🩸 la plata se redondea a centavos ANTES de compararse — el período Nº2
 *     se veía EN ROJO con «−$0.00» estando cuadrado al centavo;
 *  2. 🔴 el aviso de gasto repetido caza los DOS dobles toques reales y NO
 *     acusa a los cuatro recibos legítimos de Market Fresh;
 *  3. 🔴 avisa, nunca bloquea: la fecha fuera del período también se dice;
 *  4. 🔴 la responsable es del PERÍODO y se reconoce por su CÓDIGO;
 *  5. 🔴 la foto es opcional, la lista SUMA y no repite.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import {
  centavos,
  reposicionDelPeriodo,
  saldoDelPeriodo,
  montoEnPantalla,
  saldoEsNegativo,
  sumaMontos,
  totalGastado,
} from "@/lib/caja/dinero";
import {
  buscarGastoRepetido,
  esElMismoRecibo,
  facturaNormalizada,
  mensajeGastoRepetido,
  proveedorNormalizado,
} from "@/lib/caja/gasto-repetido";
import { fechaFueraDelPeriodo, mensajeFechaFueraDelPeriodo } from "@/lib/caja/fecha-en-periodo";
import { etiquetaResponsable, nombreEnPantalla, responsableDelPeriodo } from "@/lib/caja/responsable";
import { quitarArchivo, sumarArchivos, validarArchivoFoto, MAX_BYTES_FOTO } from "@/lib/caja/fotos";

// ── Los 26 recibos REALES del período Nº2, en el orden en que la pantalla los
// dibuja (fecha, luego created_at). Suman $200.00 exactos en la base y
// 200.00000000000003 sumados uno a uno en el navegador.
const PERIODO_2 = [6, 30, 20, 5, 5, 6, 4, 5, 6.2, 5, 1, 12.3, 10, 10.59, 10.59, 12.4,
  11.02, 5, 2.78, 5, 5, 5, 5, 7.49, 2.5, 2.13].map((total) => ({ total }));

describe("🩸 1. UN SALDO EN ROJO POR UNA BILLONÉSIMA", () => {
  it("el defecto existe: los 26 recibos del período Nº2 suman de más en coma flotante", () => {
    const crudo = PERIODO_2.reduce((s, g) => s + g.total, 0);
    expect(crudo).toBe(200.00000000000003);
    expect(200 - crudo).toBeLessThan(0); // así se pintaba de rojo
  });

  it("redondeado a centavos, el período Nº2 cierra en $0.00 y NO es negativo", () => {
    expect(totalGastado(PERIODO_2)).toBe(200);
    expect(saldoDelPeriodo(200, PERIODO_2)).toBe(0);
    expect(saldoEsNegativo(saldoDelPeriodo(200, PERIODO_2))).toBe(false);
  });

  it("nunca devuelve «-0» (que se imprime «−$0.00»)", () => {
    expect(Object.is(centavos(-0.000000001), -0)).toBe(false);
    expect(centavos(-0.000000001)).toBe(0);
    expect(saldoDelPeriodo(200, [{ total: 200.00000000000003 }])).toBe(0);
  });

  it("🔴 `saldoEsNegativo` es LA pregunta, y el residuo crudo NO es negativo", () => {
    // El residuo exacto que producía el rojo del período Nº2, tal cual salía de
    // restar sin redondear. Preguntado con `< 0` a pelo da true; por acá, no.
    const residuo = 200 - 200.00000000000003;
    expect(residuo < 0).toBe(true);
    expect(saldoEsNegativo(residuo)).toBe(false);
    expect(saldoEsNegativo(-0.0000001)).toBe(false);
    expect(saldoEsNegativo("-0.000000001")).toBe(false);
  });

  it("el monto se escribe con el menos TIPOGRÁFICO delante del peso", () => {
    // Diccionario de la casa: `−$36.50`, nunca `$-36.50` ni `-$36.50`.
    expect(montoEnPantalla(-36.5)).toBe("\u2212$36.50");
    expect(montoEnPantalla(36.5)).toBe("$36.50");
    expect(montoEnPantalla(1234.5)).toBe("$1,234.50");
    // Y un residuo NO se imprime como negativo.
    expect(montoEnPantalla(200 - 200.00000000000003)).toBe("$0.00");
  });

  it("un saldo negativo DE VERDAD sigue siendo negativo — no se tapa nada", () => {
    expect(saldoDelPeriodo(200, [{ total: 236.5 }])).toBe(-36.5);
    expect(saldoEsNegativo(-36.5)).toBe(true);
    expect(saldoEsNegativo(-0.01)).toBe(true);
  });

  it("el período Nº3, medido: gastado $163.28, saldo $36.72, a reponer $163.28", () => {
    const p3 = [4.05, 24.75, 7.65, 1.6, 4.4, 3.5, 5, 5.05, 2.7, 5, 5, 13.84, 5, 6.4, 5,
      5, 5, 9.55, 5, 7.65, 5, 5, 5, 1.39, 3.5, 12.25].map((total) => ({ total }));
    expect(totalGastado(p3)).toBe(163.28);
    expect(saldoDelPeriodo(200, p3)).toBe(36.72);
    expect(reposicionDelPeriodo(200, p3)).toBe(163.28);
  });

  it("«a reponer» es lo gastado: el fondo vuelve a su monto", () => {
    expect(reposicionDelPeriodo(200, PERIODO_2)).toBe(200);
    expect(reposicionDelPeriodo(200, 16.05)).toBe(16.05);
  });

  it("lo que no es número vale 0, nunca NaN", () => {
    expect(centavos(null)).toBe(0);
    expect(centavos(undefined)).toBe(0);
    expect(centavos("no es un monto")).toBe(0);
    expect(sumaMontos([1.01, null, "2.5", undefined])).toBe(3.51);
  });
});

describe("🔴 2. EL MISMO RECIBO CARGADO DOS VECES — avisa, nunca bloquea", () => {
  // Los dos dobles toques REALES, medidos.
  const super99A = { id: "a", fecha: "2026-07-09", proveedor: "Super 99", nro_factura: "196854200", total: 10.59 };
  const super99B = { id: "b", fecha: "2026-07-09", proveedor: "Super 99", nro_factura: "196854200", total: 10.59 };
  const parrilladaA = { id: "c", fecha: "2026-08-13", proveedor: "La Parrillada", nro_factura: "", total: 5 };
  const parrilladaB = { id: "d", fecha: "2026-08-13", proveedor: "La Parrillada", nro_factura: "", total: 5 };

  // Los CUATRO recibos legítimos de Market Fresh: mismo día, mismo lugar,
  // mismo monto — y facturas DISTINTAS.
  const marketFresh = [
    { id: "m1", fecha: "2026-07-09", proveedor: "Market Fresh", nro_factura: "00016528", total: 5 },
    { id: "m2", fecha: "2026-07-09", proveedor: "Market Fresh", nro_factura: "00016706", total: 5 },
    { id: "m3", fecha: "2026-07-09", proveedor: "Market Fresh", nro_factura: "00016500", total: 5 },
    { id: "m4", fecha: "2026-07-09", proveedor: "Market Fresh", nro_factura: "00016579", total: 5 },
  ];

  it("con factura: mismo día + misma factura = repetido (Super 99, 39 segundos)", () => {
    expect(esElMismoRecibo(super99A, super99B)).toBe(true);
  });

  it("sin factura: mismo día + mismo proveedor + mismo monto = repetido (La Parrillada)", () => {
    expect(esElMismoRecibo(parrilladaA, parrilladaB)).toBe(true);
  });

  it("🔴 CONTROL: los 4 recibos de Market Fresh NO se acusan entre sí", () => {
    for (let i = 0; i < marketFresh.length; i++) {
      expect(buscarGastoRepetido(marketFresh[i], marketFresh.slice(0, i))).toBeNull();
    }
  });

  it("🔴 CONTROL: otro día NO es repetido, aunque todo lo demás coincida", () => {
    expect(esElMismoRecibo(super99A, { ...super99B, fecha: "2026-07-10" })).toBe(false);
  });

  it("🔴 CONTROL: otro monto sin factura NO es repetido", () => {
    expect(esElMismoRecibo(parrilladaA, { ...parrilladaB, total: 5.01 })).toBe(false);
  });

  it("no se parea consigo mismo al editar", () => {
    expect(buscarGastoRepetido(super99A, [super99A])).toBeNull();
  });

  it("el pareo es EXACTO, nunca por parecido: «Market Fresh» ≠ «Market Fresch»", () => {
    expect(proveedorNormalizado("Market Fresh")).not.toBe(proveedorNormalizado("Market Fresch"));
    expect(esElMismoRecibo(
      { fecha: "2026-07-09", proveedor: "Market Fresh", total: 5 },
      { fecha: "2026-07-09", proveedor: "Market Fresch", total: 5 },
    )).toBe(false);
  });

  it("el proveedor se compara sin acentos, sin bordes y en minúsculas", () => {
    expect(proveedorNormalizado("  SÚPER  99 ")).toBe("super 99");
    expect(esElMismoRecibo(
      { fecha: "2026-07-09", proveedor: "súper 99", total: 5 },
      { fecha: "2026-07-09", proveedor: "SUPER  99", total: 5 },
    )).toBe(true);
  });

  it("la factura ignora ceros de adelante y símbolos; «0» y la basura NO identifican", () => {
    expect(facturaNormalizada("00016528")).toBe("16528");
    expect(facturaNormalizada("16528")).toBe("16528");
    expect(facturaNormalizada("0")).toBe("");
    expect(facturaNormalizada("")).toBe("");
    expect(facturaNormalizada("  ")).toBe("");
    // «Comida» sí identifica como texto: no es un cero, es un número mal
    // escrito. Que dos recibos del mismo día lo tengan igual es motivo de aviso.
    expect(facturaNormalizada("Comida")).toBe("COMIDA");
  });

  it("el aviso dice el día, el lugar, el monto y la factura", () => {
    expect(mensajeGastoRepetido(super99A))
      .toBe("Ya hay un gasto igual el 9 de julio: Super 99, $10.59, factura 196854200.");
    expect(mensajeGastoRepetido(parrilladaA))
      .toBe("Ya hay un gasto igual el 13 de agosto: La Parrillada, $5.00.");
  });
});

describe("🔴 3. UN RECIBO CON FECHA FUERA DE SU PERÍODO — avisa, nunca bloquea", () => {
  const p3 = { numero: 3, fecha_apertura: "2026-09-02", fecha_cierre: null };
  const p2 = { numero: 2, fecha_apertura: "2026-07-08", fecha_cierre: "2026-09-02" };

  it("el recibo más viejo del período Nº3 (23-jun) cae ANTES de su apertura", () => {
    expect(fechaFueraDelPeriodo("2026-06-23", p3)).toBe("antes");
    expect(mensajeFechaFueraDelPeriodo("2026-06-23", p3))
      .toBe("Este recibo es del 23 de junio, antes de que abriera el período Nº 3 (2 de septiembre).");
  });

  it("un recibo posterior al cierre también se dice", () => {
    expect(fechaFueraDelPeriodo("2026-09-05", p2)).toBe("despues");
    expect(mensajeFechaFueraDelPeriodo("2026-09-05", p2)).toContain("después de que cerrara");
  });

  it("🔴 CONTROL: un recibo ADENTRO no dice nada", () => {
    expect(fechaFueraDelPeriodo("2026-09-03", p3)).toBeNull();
    expect(mensajeFechaFueraDelPeriodo("2026-08-01", p2)).toBeNull();
    // el mismo día de la apertura y el del cierre están adentro
    expect(fechaFueraDelPeriodo("2026-09-02", p3)).toBeNull();
    expect(fechaFueraDelPeriodo("2026-09-02", p2)).toBeNull();
  });

  it("ante la duda no se opina: sin fecha, o con un formato raro, calla", () => {
    expect(fechaFueraDelPeriodo("", p3)).toBeNull();
    expect(fechaFueraDelPeriodo(null, p3)).toBeNull();
    expect(fechaFueraDelPeriodo("hoy", p3)).toBeNull();
    expect(fechaFueraDelPeriodo("2026-06-23", { fecha_apertura: null, fecha_cierre: null })).toBeNull();
  });
});

describe("🔴 4. LA RESPONSABLE ES DEL PERÍODO, Y SE RECONOCE POR SU CÓDIGO", () => {
  const personas = [
    { empleado_codigo: "7", nombre: "ANGELA GARCIA" },
    { empleado_codigo: "11", nombre: "JULIO GARAY" },
  ];

  it("el nombre se LEE de Asistencia por el código, no se guarda en Caja", () => {
    const r = responsableDelPeriodo({ responsable_empleado_codigo: "7" }, personas);
    expect(r).toEqual({ codigo: "7", nombre: "Angela Garcia" });
    expect(etiquetaResponsable(r)).toBe("Angela Garcia");
  });

  it("🩸 las tres escrituras del nombre dan lo MISMO en pantalla", () => {
    // Medido: «Angela Garcia» 59 · «Angela garcia» 17 · «Angela garciia» 1.
    // Con el código, el nombre sale UNA vez y de un solo lugar.
    expect(nombreEnPantalla("ANGELA GARCIA")).toBe("Angela Garcia");
    expect(nombreEnPantalla("  ANGELA   GARCIA  ")).toBe("Angela Garcia");
    // Lo que ya viene en minúsculas se respeta tal cual.
    expect(nombreEnPantalla("Angela Garcia")).toBe("Angela Garcia");
  });

  it("sin código puesto NO se dice nada: no se inventa a quién pertenece", () => {
    expect(responsableDelPeriodo({ responsable_empleado_codigo: null }, personas)).toBeNull();
    expect(responsableDelPeriodo({}, personas)).toBeNull();
    expect(responsableDelPeriodo(null, personas)).toBeNull();
    expect(etiquetaResponsable(null)).toBeNull();
  });

  it("un código que Asistencia no conoce se dice como código, nunca con un nombre inventado", () => {
    const r = responsableDelPeriodo({ responsable_empleado_codigo: "99" }, personas);
    expect(r).toEqual({ codigo: "99", nombre: "" });
    expect(etiquetaResponsable(r)).toBe("Colaborador 99");
  });
});

describe("🔴 5. LA FOTO DEL RECIBO — opcional, y la lista SUMA", () => {
  const jpg = { nombre: "recibo.jpg", tipo: "image/jpeg", bytes: 900_000 };

  it("acepta foto y PDF", () => {
    expect(validarArchivoFoto(jpg)).toBeNull();
    expect(validarArchivoFoto({ nombre: "r.pdf", tipo: "application/pdf", bytes: 40_000 })).toBeNull();
    expect(validarArchivoFoto({ nombre: "r.heic", tipo: "image/heic", bytes: 2_000_000 })).toBeNull();
  });

  it("lo que no es foto ni PDF se rechaza diciendo qué hacer", () => {
    const msg = validarArchivoFoto({ nombre: "planilla.xlsx", tipo: "application/vnd.ms-excel", bytes: 1000 });
    expect(msg).toContain("planilla.xlsx");
    expect(msg).toContain("PDF");
  });

  it("un archivo enorme se rechaza con el peso en el mensaje", () => {
    const msg = validarArchivoFoto({ ...jpg, bytes: MAX_BYTES_FOTO + 1 });
    expect(msg).toContain("MB");
  });

  it("🔴 la lista SUMA: volver a elegir agrega, no reemplaza", () => {
    const a = { nombre: "a.jpg", tipo: "image/jpeg", bytes: 10 };
    const b = { nombre: "b.jpg", tipo: "image/jpeg", bytes: 20 };
    expect(sumarArchivos([a], [b]).map((x) => x.nombre)).toEqual(["a.jpg", "b.jpg"]);
  });

  it("🔴 el mismo archivo dos veces NO entra dos veces", () => {
    const a = { nombre: "a.jpg", tipo: "image/jpeg", bytes: 10 };
    expect(sumarArchivos([a], [{ ...a }])).toHaveLength(1);
    expect(sumarArchivos([a], [{ ...a, nombre: "A.JPG" }])).toHaveLength(1);
  });

  it("🔴 se quita UNO sin perder los demás", () => {
    const l = [
      { nombre: "a.jpg", tipo: "image/jpeg", bytes: 1 },
      { nombre: "b.jpg", tipo: "image/jpeg", bytes: 2 },
      { nombre: "c.jpg", tipo: "image/jpeg", bytes: 3 },
    ];
    expect(quitarArchivo(l, 1).map((x) => x.nombre)).toEqual(["a.jpg", "c.jpg"]);
  });
});
