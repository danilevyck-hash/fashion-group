/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL EXCEL DE COMPROBANTES SE PUEDE FILTRAR (22-sep-2026)
 *
 * 🩸 MEDIDO LEYENDO EL XML CRUDO de los cuatro archivos REALES bajados el
 * 20-sep-2026 (`excel-comprobantes-reebok/joybees/tommy/calvin.xlsx`):
 *
 *   1. La columna «Fecha» era **TEXTO** (`"14/09/2026"`, celda `s`) en los
 *      CUATRO. Es la columna que más se filtraría y no se podía pedir un rango
 *      ni ordenar de viejo a nuevo.
 *   2. **No había columna «Tipo»**: que algo fuera pedido o cotización estaba
 *      escondido adentro del texto de la última columna, y la hoja se llamaba
 *      «Pedidos» aunque traía cotizaciones (5 de 48 en Tommy).
 *   3. «No se ha mandado a Switch» era más texto de esa misma columna:
 *      **6 de 21 filas en Reebok, por $31.116**, sin nada que las distinguiera.
 *   4. «Vendedor» salía **vacío** en los que entraron por el enlace.
 *   5. La columna «Items» **no se sumaba** y la palabra «TOTAL» se ponía justo
 *      encima de ella, así que el gran total de dinero se leía como items.
 *   6. La pantalla dice «Del vendedor» y el Excel decía «Mío» para lo mismo.
 *
 * ⚠️ LO QUE YA ESTABA BIEN Y NO SE TOCÓ (comprobado en el mismo XML): los
 * encabezados en la FILA 1, la fila congelada (`<pane ySplit="1" …>`), el
 * filtro desde A1 que deja FUERA la fila del TOTAL, el total como número real
 * con `$#,##0.00`, y los anchos de columna a medida.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import XLSX from "xlsx-js-style";

import {
  buildPedidosWorkbook,
  HOJA_COMPROBANTES,
  TIPO_LABEL,
  EN_SWITCH_SI,
  EN_SWITCH_NO,
  ROJO_FALTA,
  VENDEDOR_DEL_CLIENTE,
  VENDEDOR_SIN_DATO,
  fechaPedido,
  fmtFechaPedido,
  type PedidoExportRow,
} from "@/lib/catalogos/pedidos-excel";
import { serialExcel, DATE_FMT, MONEY_FMT, workbookBytes } from "@/lib/excel-export";
import { ORIGEN_LABEL } from "@/lib/catalogo/origen-comprobante";

const A = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
const HDR = 0;
const D0 = 1;

/** Las seis situaciones REALES que hay hoy en los cuatro archivos. */
const FILAS: PedidoExportRow[] = [
  // Del cliente, sin convertir: no tiene número de la casa ni vendedor.
  {
    origen: "link", cliente: "Nathalie", vendor: null, item_count: 1, total: 360,
    created_at: "2026-07-26T18:00:00.000Z",
    numero_pedido: null, switch_numero: "16-000000507", switch_documento: "pedido",
    fuente: "publicos", en_switch: true,
  },
  // Pedido de la casa, en Switch.
  {
    origen: "mio", cliente: "Nova Lux, S.A.", vendor: "REINALDO ESPINOSA",
    item_count: 50, total: 31080, created_at: "2026-09-03T15:00:00.000Z",
    numero_pedido: "PED-023", switch_numero: "16-000000525", switch_documento: "pedido",
    fuente: "orders", status: "confirmado", en_switch: true,
  },
  // COTIZACIÓN: no aparta mercancía.
  {
    origen: "mio", cliente: "Outlet Duty Free N2, S.A.", vendor: "REINALDO ESPINOSA",
    item_count: 20, total: 10064, created_at: "2026-09-10T15:00:00.000Z",
    numero_pedido: "TOM-044", switch_numero: "15-000000031", switch_documento: "cotizacion",
    fuente: "orders", status: "confirmado", en_switch: true,
  },
  // 🩸 SIN MANDAR: terminado y nunca salió. Seis así en el Reebok real.
  {
    origen: "mio", cliente: "Hafez, S.A.", vendor: "REINALDO ESPINOSA",
    item_count: 8, total: 2520, created_at: "2026-08-14T15:00:00.000Z",
    numero_pedido: "PED-019", switch_numero: null, switch_documento: null,
    fuente: "orders", status: "confirmado", en_switch: false,
  },
  // Borrador: no está terminado.
  {
    origen: "mio", cliente: "Aidy Shop No.2", vendor: "DEFAULT",
    item_count: 1, total: 36, created_at: "2026-07-04T15:00:00.000Z",
    numero_pedido: "PED-007", switch_numero: null, switch_documento: null,
    fuente: "orders", status: "borrador", en_switch: false,
  },
  // Interno sin vendedor: ahí sí falta el dato.
  {
    origen: "mio", cliente: null, vendor: null,
    item_count: 4, total: 2100, created_at: "2026-07-04T15:00:00.000Z",
    numero_pedido: "PED-006", switch_numero: "16-000000490", switch_documento: "pedido",
    fuente: "orders", status: "confirmado", en_switch: true,
  },
];

const wb = buildPedidosWorkbook({ marca: "reebok", conOrigen: true, pedidos: FILAS });
const ws = wb.Sheets[HOJA_COMPROBANTES];
const COL = {
  origen: 0, cliente: 1, vendedor: 2, items: 3, total: 4,
  fecha: 5, numero: 6, switch: 7, tipo: 8, enSwitch: 9,
};
const TOT_ROW = D0 + FILAS.length + 1;

describe("🔴 1. la fecha es una FECHA, no un texto que se le parece", () => {
  it("las seis filas traen número + formato de fecha, nunca una celda de texto", () => {
    for (let i = 0; i < FILAS.length; i++) {
      const c = ws[A(D0 + i, COL.fecha)];
      expect(c.t, `la fila ${i + 1} volvió a tener la fecha como texto`).toBe("n");
      expect(c.z, `la fila ${i + 1} sin formato de fecha`).toBe(DATE_FMT);
      expect(typeof c.v).toBe("number");
    }
  });

  it("🔴 el número es el del DÍA, sin la hora adentro", () => {
    // Con la hora, el filtro «igual a 03/09/2026» dejaría la fila afuera.
    const c = ws[A(D0 + 1, COL.fecha)];
    expect(Number.isInteger(c.v)).toBe(true);
    expect(c.v).toBe(serialExcel(fechaPedido("2026-09-03T15:00:00.000Z")!));
  });

  it("🔴 el número y lo que se LEE son el mismo día — no se separan", () => {
    // `fmtFechaPedido` es lo que la celda venía diciendo y lo que la celda
    // sigue mostrando por el formato. Si un día el número y el texto se
    // separan, la planilla filtraría por un día distinto al que se ve.
    for (const iso of [
      "2026-07-01T14:30:00.000Z", "2026-09-03T15:00:00.000Z", "2026-12-31T05:00:00.000Z",
    ]) {
      const d = fechaPedido(iso)!;
      const [dd, mm, yyyy] = fmtFechaPedido(iso).split("/").map(Number);
      expect(serialExcel(d)).toBe(serialExcel(new Date(yyyy, mm - 1, dd)));
    }
  });

  it("🔴 y ORDENA de verdad: lo que como texto salía al revés, acá no", () => {
    // Como texto, "10/01/2026" va antes que "09/12/2025" (se comparan letras).
    const viejo = serialExcel(new Date(2025, 11, 9));
    const nuevo = serialExcel(new Date(2026, 0, 10));
    expect(nuevo).toBeGreaterThan(viejo);
    expect("10/01/2026" < "09/12/2025").toBe(false);
  });

  it("una fecha vacía o rota deja la celda EN BLANCO, nunca un cero", () => {
    // Un 0 con formato de fecha se ve «00/01/1900», que parece un dato.
    const wb2 = buildPedidosWorkbook({
      marca: "reebok", conOrigen: true,
      pedidos: [{ ...FILAS[0], created_at: "" }, { ...FILAS[0], created_at: "no es fecha" }],
    });
    for (const r of [D0, D0 + 1]) {
      const c = wb2.Sheets[HOJA_COMPROBANTES][A(r, COL.fecha)];
      expect(c.t).toBe("s");
      expect(c.v).toBe("");
    }
    expect(fechaPedido("")).toBeNull();
    expect(fechaPedido("no es fecha")).toBeNull();
  });
});

describe("🔴 2. «Tipo» es una columna, no una frase escondida", () => {
  it("las tres palabras de la pantalla, en su columna", () => {
    expect(ws[A(HDR, COL.tipo)].v).toBe("Tipo");
    expect(ws[A(D0 + 1, COL.tipo)].v).toBe(TIPO_LABEL.pedido);
    expect(ws[A(D0 + 2, COL.tipo)].v).toBe(TIPO_LABEL.cotizacion);
    expect(ws[A(D0 + 4, COL.tipo)].v).toBe(TIPO_LABEL.borrador);
    expect(TIPO_LABEL.cotizacion).toBe("Cotización");
  });

  it("🔴 el borrador se reconoce por el `status`, no por «no salió a Switch»", () => {
    // Son dos preguntas distintas: en producción hubo un pedido en borrador Y
    // en Switch (PED-018). Sin `status`, un borrador se lee como pedido — que
    // es como se leía este Excel hasta hoy.
    const sinStatus = buildPedidosWorkbook({
      marca: "reebok", conOrigen: true, pedidos: [{ ...FILAS[4], status: null }],
    });
    expect(sinStatus.Sheets[HOJA_COMPROBANTES][A(D0, COL.tipo)].v).toBe(TIPO_LABEL.pedido);
  });

  it("🔴 la HOJA se llama Comprobantes: adentro hay pedidos Y cotizaciones", () => {
    expect(wb.SheetNames).toEqual(["Comprobantes"]);
    expect(wb.SheetNames).not.toContain("Pedidos");
  });
});

describe("🔴 3. el que no salió a Switch se ve a la primera", () => {
  it("columna «En Switch» de una palabra, y el «No» en rojo y en negrita", () => {
    expect(ws[A(HDR, COL.enSwitch)].v).toBe("En Switch");
    const no = ws[A(D0 + 3, COL.enSwitch)];
    expect(no.v).toBe(EN_SWITCH_NO);
    expect(no.s.font.color.rgb).toBe(ROJO_FALTA);
    expect(no.s.font.bold).toBe(true);
    expect(ws[A(D0 + 1, COL.enSwitch)].v).toBe(EN_SWITCH_SI);
  });

  it("🔴 «está en Switch» es tener ENVÍO, no tener número", () => {
    // Un envío activo sin `numero_interno` existe: leerlo como «no salió» sería
    // lo contrario de la verdad.
    const wb2 = buildPedidosWorkbook({
      marca: "reebok", conOrigen: true,
      pedidos: [{ ...FILAS[1], switch_numero: null, en_switch: true }],
    });
    const w = wb2.Sheets[HOJA_COMPROBANTES];
    expect(w[A(D0, COL.enSwitch)].v).toBe(EN_SWITCH_SI);
    expect(w[A(D0, COL.switch)].v).toBe("Pedido en Switch, sin número");
  });

  it("y la frase completa NO se fue: sigue en su columna", () => {
    expect(ws[A(D0 + 3, COL.switch)].v).toBe("No se ha mandado a Switch");
  });
});

describe("🔴 4. ninguna celda en blanco sin explicación", () => {
  it("el del enlace dice quién lo armó; el interno sin vendedor dice que falta", () => {
    expect(ws[A(D0, COL.vendedor)].v).toBe(VENDEDOR_DEL_CLIENTE);
    expect(ws[A(D0 + 5, COL.vendedor)].v).toBe(VENDEDOR_SIN_DATO);
    expect(VENDEDOR_DEL_CLIENTE).not.toBe("");
    expect(VENDEDOR_SIN_DATO).not.toBe(VENDEDOR_DEL_CLIENTE);
  });

  it("el vendedor de verdad se escribe tal cual", () => {
    expect(ws[A(D0 + 1, COL.vendedor)].v).toBe("REINALDO ESPINOSA");
  });
});

describe("🔴 5. la fila de totales suma lo que es y no rotula una columna de números", () => {
  it("«TOTAL» en la primera columna —texto—, nunca encima de «Items»", () => {
    expect(ws[A(TOT_ROW, COL.origen)].v).toBe("TOTAL");
    expect(ws[A(TOT_ROW, COL.items)].v).not.toBe("TOTAL");
  });

  it("🔴 «Items» SUMA, y la suma es la de las filas", () => {
    const suma = FILAS.reduce((s, p) => s + p.item_count, 0);
    expect(ws[A(TOT_ROW, COL.items)].t).toBe("n");
    expect(ws[A(TOT_ROW, COL.items)].v).toBe(suma);
  });

  it("el dinero sigue siendo número real con el formato de la casa", () => {
    const total = FILAS.reduce((s, p) => s + p.total, 0);
    expect(ws[A(TOT_ROW, COL.total)].t).toBe("n");
    expect(ws[A(TOT_ROW, COL.total)].v).toBeCloseTo(total, 2);
    expect(ws[A(TOT_ROW, COL.total)].z).toBe(MONEY_FMT);
  });
});

describe("🔴 6. el origen se llama igual en la pantalla y en el Excel", () => {
  it("«Del cliente» y «Del vendedor», del MISMO módulo que los chips", () => {
    expect(ws[A(D0, COL.origen)].v).toBe(ORIGEN_LABEL.link);
    expect(ws[A(D0 + 1, COL.origen)].v).toBe(ORIGEN_LABEL.mio);
    expect(ws[A(D0, COL.origen)].v).not.toBe("Del link");
    expect(ws[A(D0 + 1, COL.origen)].v).not.toBe("Mío");
  });

  it("y no hay una segunda lista de nombres escrita a mano en el Excel", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/catalogos/pedidos-excel.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).toContain("ORIGEN_LABEL[");
    expect(src).not.toMatch(/"Del link"/);
    expect(src).not.toMatch(/"Mío"/);
  });
});

describe("⚠️ lo que YA estaba bien y no se tocó", () => {
  it("encabezados en la FILA 1 y filtro desde A1 que deja fuera el TOTAL", () => {
    expect(ws[A(0, 0)].v).toBe("Origen");
    const ref = (ws["!autofilter"] as { ref: string }).ref;
    expect(ref.startsWith("A1:")).toBe(true);
    // La última fila del filtro es la última fila de DATOS, no la del total.
    expect(ref).toBe(`A1:${A(D0 + FILAS.length - 1, COL.enSwitch)}`);
  });

  it("anchos a medida y una sola hoja", () => {
    expect((ws["!cols"] as { wch: number }[])).toHaveLength(10);
    expect(wb.SheetNames).toHaveLength(1);
  });

  it("🔴 el archivo sale por el camino común (fila fija incluida)", () => {
    // Todo Excel del sistema pasa por `workbookBytes`: escribir con XLSX.write
    // a secas deja la hoja sin la fila de encabezados congelada.
    const bytes = workbookBytes(wb);
    expect(bytes.byteLength).toBeGreaterThan(0);
    const ruta = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/catalogo/[marca]/pedidos-export/route.ts"),
      "utf8",
    );
    expect(ruta).toContain("workbookBuffer(wb)");
    expect(ruta).not.toMatch(/XLSX\.write\(/);
  });
});
