// Tests del export Excel de catálogos (I11): workbook compartido de pedidos
// (las 3 marcas) + sheet "sin foto" del admin Reebok, ambos con la estructura
// estándar del helper. La ESTRUCTURA es compartida; la PALETA es de cada marca
// (antes las 3 salían con el navy de Reebok).
//
// Los estilos se asserten sobre el worksheet EN MEMORIA (antes de write):
// xlsx-js-style no siempre preserva los estilos en el read de vuelta.

import { describe, it, expect } from "vitest";
import XLSX from "xlsx-js-style";
import {
  buildPedidosWorkbook,
  HOJA_COMPROBANTES,
  VENDEDOR_DEL_CLIENTE,
  EN_SWITCH_NO,
  ROJO_FALTA,
  type PedidoExportRow,
} from "../lib/catalogos/pedidos-excel";
import { serialExcel, DATE_FMT } from "../lib/excel-export";
import { buildReebokSinFotoWorkbook } from "../lib/catalogos/sinfoto-excel";
import {
  MONEY_FMT,
  REEBOK_PALETTE,
  JOYBEES_PALETTE,
  TOMMY_PALETTE,
  paletaDeMarca,
} from "../lib/excel-export";

const A = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

const NAVY = REEBOK_PALETTE.pri; // 1A2656

// Fixture: 2 pedidos con items (uno del link con datos completos, uno mío sin cliente).
const PEDIDOS: PedidoExportRow[] = [
  {
    origen: "link",
    cliente: "Almacén La Rebaja",
    vendor: "Edwin",
    item_count: 3,
    total: 1234.56,
    created_at: "2026-07-01T14:30:00.000Z",
    // Del link SIN convertir: todavía no tiene número de la casa, y tampoco
    // pudo haber salido a Switch.
    numero_pedido: null,
    switch_numero: null,
    switch_documento: null,
    fuente: "publicos",
  },
  {
    origen: "mio",
    cliente: null,
    vendor: null,
    item_count: 1,
    total: 100,
    created_at: "2026-07-02T10:00:00.000Z",
    numero_pedido: "PED-018",
    switch_numero: "16-000000506",
    switch_documento: "cotizacion",
    fuente: "orders",
  },
];

// Layout estándar desde el 27-ago-2026: r0 ENCABEZADOS · r1.. datos · spacer
// · totales. Nada arriba de los encabezados.
const HDR_ROW = 0;
const DATA_ROW = 1;

describe("buildPedidosWorkbook — Reebok (con Origen)", () => {
  const wb = buildPedidosWorkbook({ marca: "reebok", conOrigen: true, pedidos: PEDIDOS });
  const ws = wb.Sheets[HOJA_COMPROBANTES];

  // 🔄 22-sep-2026 — CAMBIA DE DIRECCIÓN, NO DE SENTIDO. La hoja se llamaba
  // «Pedidos» y adentro venían cotizaciones (5 de 48 en el Tommy real del
  // 20-sep-2026). El panel ya se llama «Comprobantes» desde el 25-ago-2026 por
  // esta misma razón; el Excel que se baja de él arrastraba el nombre viejo.
  // Lo que se exige sigue siendo lo mismo: UNA hoja, y A1 es el primer
  // encabezado, sin nada arriba.
  it("hoja única 'Comprobantes', y A1 es el PRIMER ENCABEZADO (nada arriba)", () => {
    expect(wb.SheetNames).toEqual(["Comprobantes"]);
    expect(HOJA_COMPROBANTES).toBe("Comprobantes");
    expect(ws[A(0, 0)].v).toBe("Origen");
    expect(ws[A(0, 0)].s.fill.fgColor.rgb).toBe(NAVY);
  });

  it("headers correctos con fill navy 1A2656", () => {
    const headers = ["Origen", "Cliente", "Vendedor", "Items", "Total", "Fecha", "N° pedido", "Switch", "Tipo", "En Switch"];
    headers.forEach((h, c) => {
      expect(ws[A(HDR_ROW, c)].v).toBe(h);
      expect(ws[A(HDR_ROW, c)].s.fill.fgColor.rgb).toBe(NAVY);
    });
  });

  // 🔄 22-sep-2026 — CAMBIA DE DIRECCIÓN, NO DE SENTIDO (dos veces).
  //   · El ORIGEN: la pantalla dice «Del cliente» / «Del vendedor» desde el
  //     6-sep-2026 y el Excel seguía escribiendo «Del link» / «Mío». Lo que se
  //     exige sigue siendo que el origen se LEA, no que diga esas palabras.
  //   · La FECHA: era el TEXTO "01/07/2026" en los cuatro archivos reales, así
  //     que no se podía filtrar por rango ni ordenar. Ahora es el NÚMERO de
  //     Excel con formato de fecha — se sigue viendo 01/07/2026.
  it("datos: origen con las palabras de la pantalla, 'Sin nombre', fecha REAL", () => {
    expect(ws[A(DATA_ROW, 0)].v).toBe("Del cliente");
    expect(ws[A(DATA_ROW, 1)].v).toBe("Almacén La Rebaja");
    expect(ws[A(DATA_ROW + 1, 0)].v).toBe("Del vendedor");
    expect(ws[A(DATA_ROW + 1, 1)].v).toBe("Sin nombre");

    const fecha = ws[A(DATA_ROW, 5)];
    expect(fecha.t, "la fecha volvió a ser texto").toBe("n");
    expect(fecha.z).toBe(DATE_FMT);
    expect(fecha.v).toBe(serialExcel(new Date("2026-07-01T14:30:00.000Z")));
    // Y el número es el del día calendario, sin fracción de hora: si llevara la
    // hora, el filtro «igual a 01/07/2026» dejaría la fila afuera.
    expect(Number.isInteger(fecha.v)).toBe(true);
  });

  // ── 🔴 LO QUE ES CADA FILA, EN SU COLUMNA (22-sep-2026) ────────────────────
  it("🔴 «Tipo» dice pedido · cotización · borrador, sin leer el texto de Switch", () => {
    expect(ws[A(DATA_ROW, 8)].v).toBe("Pedido");       // del link, sin convertir
    expect(ws[A(DATA_ROW + 1, 8)].v).toBe("Cotización");
    const wb3 = buildPedidosWorkbook({
      marca: "reebok", conOrigen: true,
      pedidos: [{ ...PEDIDOS[1], status: "borrador" }],
    });
    expect(wb3.Sheets[HOJA_COMPROBANTES][A(DATA_ROW, 8)].v).toBe("Borrador");
  });

  it("🔴 «En Switch» se ve a la primera: una palabra, y el «No» en ROJO", () => {
    // 🩸 En el Excel real de Reebok había 6 de 21 filas sin mandar, por
    // $31.116, y lo único que las distinguía era una frase adentro de la
    // columna más larga de la hoja.
    const noSalio = ws[A(DATA_ROW, 9)];
    expect(noSalio.v).toBe(EN_SWITCH_NO);
    expect(noSalio.s.font.color.rgb).toBe(ROJO_FALTA);
    expect(noSalio.s.font.bold).toBe(true);
    expect(ws[A(DATA_ROW + 1, 9)].v).toBe("Sí");
    // Y la frase completa NO se fue: sigue en su columna, para el que lea.
    expect(ws[A(DATA_ROW, 7)].v).toBe("No se ha mandado a Switch");
  });

  it("🔴 el vendedor de un pedido del link NO es una celda en blanco", () => {
    // 6 filas en blanco en el archivo real, y no es un dato que falte: no hubo
    // vendedor porque lo armó el cliente.
    const wb3 = buildPedidosWorkbook({
      marca: "reebok", conOrigen: true,
      pedidos: [{ ...PEDIDOS[0], vendor: null }],
    });
    expect(wb3.Sheets[HOJA_COMPROBANTES][A(DATA_ROW, 2)].v).toBe(VENDEDOR_DEL_CLIENTE);
    // Y el interno sin vendedor dice otra cosa: ahí sí falta el dato.
    expect(ws[A(DATA_ROW + 1, 2)].v).toBe("Sin vendedor");
  });

  // ── 🔴 LOS DOS NÚMEROS (25-ago-2026) ───────────────────────────────────────
  it("🔴 las columnas nuevas van AL FINAL — las 6 de siempre no se movieron", () => {
    // Daniel puede tener una planilla enganchada a este archivo: mover una
    // columna existente se la corre entera. Las viejas quedan donde estaban.
    // 🔄 22-sep-2026: las dos de 25-ago siguen en 6 y 7, y «Tipo» y «En Switch»
    // entran DETRÁS, en 8 y 9 — por la misma razón por la que aquéllas fueron
    // al final.
    expect(ws[A(HDR_ROW, 0)].v).toBe("Origen");
    expect(ws[A(HDR_ROW, 5)].v).toBe("Fecha");
    expect(ws[A(HDR_ROW, 6)].v).toBe("N° pedido");
    expect(ws[A(HDR_ROW, 7)].v).toBe("Switch");
    expect(ws[A(HDR_ROW, 8)].v).toBe("Tipo");
    expect(ws[A(HDR_ROW, 9)].v).toBe("En Switch");
    expect(ws[A(HDR_ROW, 10)]).toBeUndefined();
    // Y el orden de las FILAS tampoco: primero el del cliente, después el de la
    // casa.
    expect(ws[A(DATA_ROW, 0)].v).toBe("Del cliente");
    expect(ws[A(DATA_ROW + 1, 0)].v).toBe("Del vendedor");
  });

  it("🔴 el que no salió DICE que no salió — no un guion", () => {
    // Un guion en la columna de un número se lee como un cero o como un dato
    // que no cargó. Criterio EXACTO de la pantalla (#593).
    expect(ws[A(DATA_ROW, 7)].v).toBe("No se ha mandado a Switch");
    expect(ws[A(DATA_ROW, 7)].v).not.toBe("—");
    expect(ws[A(DATA_ROW, 7)].v).not.toBe("-");
    // Y el del link sin convertir tampoco miente con un blanco.
    expect(ws[A(DATA_ROW, 6)].v).toBe("Se numera al abrirlo");
  });

  it("🔴 la columna de Switch DICE si fue pedido o COTIZACIÓN", () => {
    // Una cotización NO aparta mercancía: con el número solo, las dos se ven
    // iguales en la planilla.
    expect(ws[A(DATA_ROW + 1, 6)].v).toBe("PED-018");
    expect(ws[A(DATA_ROW + 1, 7)].v).toBe("Cotización en Switch: 16-000000506");
  });

  it("un pedido de verdad (documento='pedido') se nombra pedido", () => {
    const wb2 = buildPedidosWorkbook({
      marca: "reebok", conOrigen: true,
      pedidos: [{ ...PEDIDOS[1], switch_documento: "pedido" }],
    });
    expect(wb2.Sheets[HOJA_COMPROBANTES][A(DATA_ROW, 7)].v).toBe("Pedido en Switch: 16-000000506");
  });

  it("un envío VIEJO sin la columna `documento` se sigue leyendo como pedido", () => {
    // La DDL 20260824160000 puede no estar corrida: ausencia ⇒ pedido, que es
    // lo único que el sistema sabía crear.
    const wb2 = buildPedidosWorkbook({
      marca: "reebok", conOrigen: true,
      pedidos: [{ ...PEDIDOS[1], switch_documento: null }],
    });
    expect(wb2.Sheets[HOJA_COMPROBANTES][A(DATA_ROW, 7)].v).toBe("Pedido en Switch: 16-000000506");
  });

  it("🔴 la banda de TOTALES llega hasta la última columna — no se corta a la mitad", () => {
    // `buildReportSheet` pinta la fila de totales recorriendo el arreglo que se
    // le pasa: si queda más corto que las columnas, las últimas quedan SIN
    // celda y la banda de color se ve cortada justo donde están los números
    // nuevos. Se mira el ESTILO, no el valor: las dos celdas van vacías.
    const totRow = DATA_ROW + PEDIDOS.length + 1;
    for (let c = 0; c <= 9; c++) {
      const cel = ws[A(totRow, c)];
      expect(cel, `la fila de totales no llega a la columna ${c}`).toBeTruthy();
      expect(cel.s.fill.fgColor.rgb, `la columna ${c} de totales sin banda`).toBe(NAVY);
    }
    expect(ws[A(totRow, 10)]).toBeUndefined();
  });

  it("`conNumeros: false` deja el libro EXACTAMENTE como antes (6 columnas)", () => {
    // El escalón por si la vista no diera `id_natural`/`fuente`: sin esos datos
    // escribir «No se ha mandado a Switch» en todas las filas sería MENTIRA.
    const wb2 = buildPedidosWorkbook({
      marca: "reebok", conOrigen: true, conNumeros: false, pedidos: PEDIDOS,
    });
    const ws2 = wb2.Sheets[HOJA_COMPROBANTES];
    expect(ws2[A(HDR_ROW, 5)].v).toBe("Fecha");
    expect(ws2[A(HDR_ROW, 6)]).toBeUndefined();
    // Sin saber si hay envío no se puede escribir «Tipo» ni «En Switch»: las
    // cuatro columnas que dependen del envío se van juntas.
    expect(ws2[A(DATA_ROW, 6)]).toBeUndefined();
  });

  it("moneda como número real con MONEY_FMT y cantidades con z '0'", () => {
    const money = ws[A(DATA_ROW, 4)];
    expect(money.t).toBe("n");
    expect(typeof money.v).toBe("number");
    expect(money.v).toBeCloseTo(1234.56, 2);
    expect(money.z).toBe(MONEY_FMT);

    const items = ws[A(DATA_ROW, 3)];
    expect(items.t).toBe("n");
    expect(items.v).toBe(3);
    expect(items.z).toBe("0");
  });

  // 🔄 22-sep-2026 — CAMBIA DE DIRECCIÓN, NO DE SENTIDO. La palabra «TOTAL»
  // estaba en la columna 3, que es «Items»: el gran total de dinero se leía
  // como si fueran items ($19.362 items en el Calvin real). La palabra baja a
  // la primera columna —texto— y la de Items ahora SÍ suma. Lo que se sigue
  // exigiendo es que la fila de totales esté, en la banda de la marca, con la
  // suma correcta del dinero.
  it("fila de totales en banda navy 1A2656 (no gris) con la suma correcta", () => {
    // r4-r5 datos, r6 espaciador, r7 totales
    const totRow = DATA_ROW + PEDIDOS.length + 1;
    const label = ws[A(totRow, 0)];
    const total = ws[A(totRow, 4)];
    expect(label.v).toBe("TOTAL");
    expect(label.s.fill.fgColor.rgb).toBe(NAVY);
    // 🔴 Y «Items» suma: es una columna de cantidades, no un rótulo.
    expect(ws[A(totRow, 3)].t).toBe("n");
    expect(ws[A(totRow, 3)].v).toBe(4);
    // La columna de Items no lleva la palabra encima nunca más.
    expect(ws[A(totRow, 3)].v).not.toBe("TOTAL");
    expect(total.t).toBe("n");
    expect(total.v).toBeCloseTo(1334.56, 2);
    expect(total.z).toBe(MONEY_FMT);
    expect(total.s.fill.fgColor.rgb).toBe(NAVY);
  });

  it("sobrevive el roundtrip write → read con datos intactos", () => {
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const rb = XLSX.read(buf, { type: "buffer" });
    expect(rb.SheetNames).toEqual(["Comprobantes"]);
    const rws = rb.Sheets[HOJA_COMPROBANTES];
    expect(rws[A(0, 0)].v).toBe("Origen");
    expect(rws[A(HDR_ROW, 1)].v).toBe("Cliente");
    expect(rws[A(DATA_ROW, 4)].t).toBe("n");
    expect(rws[A(DATA_ROW, 4)].v).toBeCloseTo(1234.56, 2);
    const totRow = DATA_ROW + PEDIDOS.length + 1;
    expect(rws[A(totRow, 4)].v).toBeCloseTo(1334.56, 2);
    // 🔴 La fecha llega al otro lado como FECHA, no como texto.
    expect(rws[A(DATA_ROW, 5)].t).not.toBe("s");
  });
});

describe("buildPedidosWorkbook — Joybees (sin Origen)", () => {
  const pedidos: PedidoExportRow[] = PEDIDOS.map(({ origen: _o, ...p }) => p);
  const wb = buildPedidosWorkbook({ marca: "joybees", conOrigen: false, pedidos });
  const ws = wb.Sheets[HOJA_COMPROBANTES];

  it("mismo layout compartido, paleta propia y sin la columna Origen", () => {
    expect(ws[A(0, 0)].v).toBe("Cliente");
    // La banda es del GRIS de Joybees, no del navy de Reebok.
    expect(ws[A(0, 0)].s.fill.fgColor.rgb).toBe(JOYBEES_PALETTE.pri);
    expect(ws[A(0, 0)].s.fill.fgColor.rgb).not.toBe(NAVY);
    const headers = ["Cliente", "Vendedor", "Items", "Total", "Fecha", "N° pedido", "Switch", "Tipo", "En Switch"];
    headers.forEach((h, c) => {
      expect(ws[A(HDR_ROW, c)].v).toBe(h);
      expect(ws[A(HDR_ROW, c)].s.fill.fgColor.rgb).toBe(JOYBEES_PALETTE.pri);
    });
    expect(ws[A(HDR_ROW, 9)]).toBeUndefined();
    // Los dos números también acá: Joybees es espejo EXACTO de Reebok.
    expect(ws[A(DATA_ROW, 5)].v).toBe("Se numera al abrirlo");
    expect(ws[A(DATA_ROW + 1, 5)].v).toBe("PED-018");
    expect(ws[A(DATA_ROW + 1, 6)].v).toBe("Cotización en Switch: 16-000000506");
  });

  it("moneda numérica y total en la banda de la marca", () => {
    expect(ws[A(DATA_ROW, 3)].t).toBe("n");
    expect(ws[A(DATA_ROW, 3)].z).toBe(MONEY_FMT);
    const totRow = DATA_ROW + pedidos.length + 1;
    expect(ws[A(totRow, 3)].v).toBeCloseTo(1334.56, 2);
    expect(ws[A(totRow, 3)].s.fill.fgColor.rgb).toBe(JOYBEES_PALETTE.pri);
  });
});

describe("buildPedidosWorkbook — Tommy Hilfiger", () => {
  const pedidos: PedidoExportRow[] = PEDIDOS.map(({ origen: _o, ...p }) => p);
  const wb = buildPedidosWorkbook({ marca: "tommy", conOrigen: false, pedidos });
  const ws = wb.Sheets[HOJA_COMPROBANTES];

  it("misma estructura, banda con el navy de Tommy (no el de Reebok)", () => {
    expect(ws[A(0, 0)].v).toBe("Cliente");
    expect(ws[A(0, 0)].s.fill.fgColor.rgb).toBe(TOMMY_PALETTE.pri);
    expect(ws[A(0, 0)].s.fill.fgColor.rgb).not.toBe(NAVY);
    expect(ws[A(HDR_ROW, 0)].s.fill.fgColor.rgb).toBe(TOMMY_PALETTE.pri);
  });
});

describe("paleta de Excel por marca — cada marca la suya", () => {
  const MARCAS = ["reebok", "joybees", "tommy"] as const;

  it("las 3 marcas resuelven una paleta DISTINTA", () => {
    const pris = MARCAS.map((m) => paletaDeMarca(m).pri);
    expect(new Set(pris).size, `paletas repetidas: ${pris.join(", ")}`).toBe(3);
  });

  it("cada paleta es la de su marca y conserva la ESTRUCTURA compartida", () => {
    expect(paletaDeMarca("reebok")).toBe(REEBOK_PALETTE);
    expect(paletaDeMarca("joybees")).toBe(JOYBEES_PALETTE);
    expect(paletaDeMarca("tommy")).toBe(TOMMY_PALETTE);
    // Bordes y zebra son de la casa en las 3: solo cambian pri/mid/sep.
    for (const m of MARCAS) {
      const p = paletaDeMarca(m);
      expect(p.brd, m).toBe(REEBOK_PALETTE.brd);
      expect(p.dataBg, m).toBe(REEBOK_PALETTE.dataBg);
      expect(p.altBg, m).toBe(REEBOK_PALETTE.altBg);
      expect(Object.keys(p).sort(), m).toEqual(Object.keys(REEBOK_PALETTE).sort());
    }
  });

  it("una marca desconocida NO cae al navy de la casa", () => {
    expect(paletaDeMarca("marca-que-no-existe")).toBe(REEBOK_PALETTE);
  });
});

describe("buildReebokSinFotoWorkbook — export 'sin foto' del admin", () => {
  const wb = buildReebokSinFotoWorkbook([
    { sku: "100074688", nombre: "CLASSIC LEATHER", categoria: "Footwear", disponible: 24, existencia: 30 },
    { sku: "100032959", nombre: "GORRA ACTIVE", categoria: "Accessories", disponible: "", existencia: "" },
  ]);
  const ws = wb.Sheets["Sin foto"];

  it("hoja 'Sin foto' con estructura completa: headers navy en la fila 1", () => {
    // Desde el 30-jul-2026 el archivo lleva DOS hojas: primero la réplica de la
    // plantilla del banco B2B (códigos en la columna B, ordenados A-Z) y después
    // este reporte de detalle, que NO se quitó. La forma de la hoja de la
    // plantilla la fija dash-busqueda-excel.test.ts.
    expect(wb.SheetNames).toEqual(["DASHBOARD DE BUSQUEDA", "Sin foto"]);
    expect(ws[A(0, 0)].v).toBe("Código");
    expect(ws[A(0, 0)].s.fill.fgColor.rgb).toBe(NAVY);
    const headers = ["Código", "Descripción", "Categoría", "Disponible", "Existencia"];
    headers.forEach((h, c) => {
      expect(ws[A(HDR_ROW, c)].v).toBe(h);
      expect(ws[A(HDR_ROW, c)].s.fill.fgColor.rgb).toBe(NAVY);
    });
  });

  it("mismas columnas/datos: cantidades numéricas z '0' y vacíos como texto", () => {
    expect(ws[A(DATA_ROW, 0)].v).toBe("100074688");
    expect(ws[A(DATA_ROW, 3)].t).toBe("n");
    expect(ws[A(DATA_ROW, 3)].v).toBe(24);
    expect(ws[A(DATA_ROW, 3)].z).toBe("0");
    expect(ws[A(DATA_ROW + 1, 3)].t).toBe("s");
    expect(ws[A(DATA_ROW + 1, 3)].v).toBe("");
  });

  it("sobrevive el roundtrip write → read", () => {
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const rb = XLSX.read(buf, { type: "buffer" });
    const rws = rb.Sheets["Sin foto"];
    expect(rws[A(0, 0)].v).toBe("Código");
    expect(rws[A(DATA_ROW, 3)].t).toBe("n");
    expect(rws[A(DATA_ROW, 3)].v).toBe(24);
  });
});
