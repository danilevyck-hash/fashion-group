import { describe, it, expect } from "vitest";
import XLSX from "xlsx-js-style";
import { workbookFromSheets } from "@/lib/excel-export";
import { buildGuiasSheet } from "@/app/guias/components/excel-guias";
import { buildProveedoresSheet } from "@/app/proveedores/excel-proveedores";
import type { Guia, GuiaItem } from "@/app/guias/components/types";
import type { ProveedorExportRow } from "@/app/proveedores/excel-proveedores";
import fs from "fs";
import path from "path";

// Round-trip: construir la hoja → escribir a buffer → RE-leer con XLSX.read.
// Valida que los builds puros (sin DOM) produzcan workbooks reales con el
// layout estándar del helper: título en A1, subtítulo, separador, headers en
// fila 4 y números como t:"n" (no strings "$1,234.56").
function roundTrip(name: string, ws: XLSX.WorkSheet): XLSX.WorkSheet {
  const wb = workbookFromSheets([{ name, ws }]);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  // cellNF:true para que la lectura conserve el numFmt (.z) de las celdas
  const read = XLSX.read(buf, { type: "buffer", cellNF: true });
  expect(read.SheetNames).toEqual([name]);
  return read.Sheets[name];
}

/**
 * 🔴 UNA FILA POR ENVÍO (25-ago-2026) — este bloque CAMBIÓ DE DIRECCIÓN.
 *
 * 🩸 LO QUE MEDÍA ANTES: una fila por GUÍA, o sea el formato viejo, donde los
 * datos de todos los envíos iban apretados en la misma celda. GT-229 salía con
 * `725, 724, 726` en «N° Guía Transp.», los clientes resumidos como
 * *"America Clasic y 3 mas"* y las facturas de los tres envíos pegadas con
 * comas en un solo cuadrito.
 *
 * Este reporte es el que se usa para RECLAMARLE AL TRANSPORTISTA: hay que poder
 * cruzar **su** número con **esa** factura y **ese** cliente, y con los tres
 * amontonados no se sabe cuál va con cuál. Por eso ahora cada envío tiene SU
 * fila, y el candado exige lo contrario de lo que exigía.
 *
 * 🔑 Se genera la hoja de verdad y se leen las CELDAS. Un barrido sobre
 * `excel-guias.ts` se cumpliría con el comentario que explica el cambio.
 */
describe("excel-guias — buildGuiasSheet", () => {
  const envio = (p: Partial<GuiaItem>): GuiaItem => ({
    orden: 1, cliente: "Cliente", direccion: "", empresa: "Fashion Wear",
    facturas: "F-1", bultos: 1, numero_guia_transp: "", ...p,
  });

  const guias: Guia[] = [
    // (1) El caso de la auditoría: TRES envíos con TRES números distintos.
    {
      id: "229", numero: 229, fecha: "2026-08-20", transportista: "Transporte Sol",
      placa: "", observaciones: "", total_bultos: 12, item_count: 3, monto_total: 0,
      estado: "Completada", numero_guia_transp: "",
      guia_items: [
        envio({ orden: 1, cliente: "America Clasic", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "F-1", bultos: 5, numero_guia_transp: "725" }),
        envio({ orden: 2, cliente: "Jerusalem", direccion: "David", empresa: "Vistana", facturas: "F-2", bultos: 4, numero_guia_transp: "724" }),
        envio({ orden: 3, cliente: "City Mall", direccion: "Santiago", empresa: "Active Shoes", facturas: "F-3", bultos: 3, numero_guia_transp: "726" }),
      ],
    },
    // (2) Herencia: el renglón NO trae número propio → sale el de la cabecera,
    //     igual que en el papel (guías viejas, anteriores al N° por línea).
    {
      id: "230", numero: 230, fecha: "2026-08-21", transportista: "RedNblue",
      placa: "", observaciones: "", total_bultos: 4, item_count: 1, monto_total: 0,
      estado: "Pendiente Bodega", numero_guia_transp: "TR-4471",
      guia_items: [envio({ orden: 1, cliente: "Sporting Shoes", bultos: 4, numero_guia_transp: "" })],
    },
    // (3) El "0" pelado es lo que alguien tecleó para destrabar el botón, no un
    //     número: se trata como vacío. Pero nada que CONTENGA un cero se pierde.
    {
      id: "231", numero: 231, fecha: "2026-08-22", transportista: "Sanjur",
      placa: "", observaciones: "", total_bultos: 5, item_count: 2, monto_total: 0,
      estado: "Completada", numero_guia_transp: "0",
      guia_items: [
        envio({ orden: 1, cliente: "Hanna Calzados", bultos: 3, numero_guia_transp: "0" }),
        envio({ orden: 2, cliente: "Dollar Mall", bultos: 2, numero_guia_transp: "EK0700" }),
      ],
    },
    // (4) Una guía SIN renglones sigue saliendo. Que desaparezca del reporte
    //     por faltarle el detalle es peor que verla vacía.
    {
      id: "232", numero: 232, fecha: "2026-08-23", transportista: "Boston",
      placa: "", observaciones: "", total_bultos: 6, item_count: 0, monto_total: 0,
      estado: "Completada", numero_guia_transp: "",
      guia_items: [],
    },
  ];

  const FILA_HEADERS = 1; // los encabezados abren el archivo
  const PRIMERA_FILA = FILA_HEADERS + 1;
  // 3 + 1 + 2 + 1 = 7 filas: una por envío, más la de la guía sin renglones.
  const FILAS = 7;
  const FILA_TOTALES = PRIMERA_FILA + FILAS + 1; // 1 espaciador de por medio

  const letra = (i: number) => String.fromCharCode(65 + i);
  const valor = (ws: XLSX.WorkSheet, addr: string) =>
    String((ws[addr] as { v?: unknown } | undefined)?.v ?? "");

  /** La columna se BUSCA por su encabezado: si mañana se reordenan, el candado
   *  sigue midiendo la columna correcta en vez de una vecina. */
  function col(ws: XLSX.WorkSheet, header: string): string {
    for (let i = 0; i < 26; i++) {
      if (valor(ws, `${letra(i)}${FILA_HEADERS}`) === header) return letra(i);
    }
    throw new Error(`No hay columna «${header}» en la fila ${FILA_HEADERS}`);
  }
  const celda = (ws: XLSX.WorkSheet, header: string, fila: number) =>
    valor(ws, `${col(ws, header)}${fila}`);
  /** Las filas (números de fila) cuyo «N° Guía» es el de esta guía. */
  const filasDe = (ws: XLSX.WorkSheet, guia: string) =>
    Array.from({ length: FILAS }, (_, i) => PRIMERA_FILA + i)
      .filter((f) => celda(ws, "N° Guía", f) === guia);
  const todasLasCeldas = (ws: XLSX.WorkSheet) =>
    Object.keys(ws).filter((k) => !k.startsWith("!")).map((k) => valor(ws, k));

  it("las 11 columnas, en su orden, con «Envío» entre Transportista y Cliente", () => {
    const ws = roundTrip("Guías", buildGuiasSheet(guias));
    const headers = Array.from({ length: 11 }, (_, i) => valor(ws, `${letra(i)}${FILA_HEADERS}`));
    expect(headers).toEqual([
      "N° Guía", "Fecha", "Transportista", "Envío", "Cliente", "Destino",
      "Empresa", "Facturas", "Bultos", "N° Guía Transp.", "Estado",
    ]);
    // Y ni una columna 12: un encabezado suelto a la derecha es una columna que
    // alguien agregó sin decidir qué va debajo.
    expect(valor(ws, `${letra(11)}${FILA_HEADERS}`)).toBe("");
  });

  it("🔴 una guía con 3 envíos produce 3 FILAS, no 1", () => {
    const ws = roundTrip("Guías", buildGuiasSheet(guias));
    const filas = filasDe(ws, "GT-229");
    expect(filas).toHaveLength(3);
    // Cada fila con SU cliente, SU destino, SU empresa, SU factura y SUS bultos.
    expect(filas.map((f) => celda(ws, "Cliente", f))).toEqual(["America Clasic", "Jerusalem", "City Mall"]);
    expect(filas.map((f) => celda(ws, "Destino", f))).toEqual(["Paso Canoas", "David", "Santiago"]);
    expect(filas.map((f) => celda(ws, "Empresa", f))).toEqual(["Fashion Wear", "Vistana", "Active Shoes"]);
    expect(filas.map((f) => celda(ws, "Facturas", f))).toEqual(["F-1", "F-2", "F-3"]);
    // «2 de 4» dice de un vistazo cuántos envíos lleva la guía: sin eso, tres
    // filas seguidas con el mismo GT-229 se leen como un error del reporte.
    expect(filas.map((f) => celda(ws, "Envío", f))).toEqual(["1 de 3", "2 de 3", "3 de 3"]);
    // La guía se repite entera a la izquierda, para que cada fila se lea sola.
    for (const f of filas) {
      expect(celda(ws, "Fecha", f)).toBe("20/08/2026");
      expect(celda(ws, "Transportista", f)).toBe("Transporte Sol");
      expect(celda(ws, "Estado", f)).toBe("Completada");
    }
    // Y NADIE resume los clientes: "America Clasic y 3 mas" era el formato viejo.
    for (const v of todasLasCeldas(ws)) expect(v).not.toMatch(/ y \d+ mas/i);
  });

  it("🔴 cada fila lleva el N° del transportista de SU renglón — nunca los tres juntos", () => {
    const ws = roundTrip("Guías", buildGuiasSheet(guias));
    const filas = filasDe(ws, "GT-229");
    // Tres celdas DISTINTAS, cada una con el suyo, en el orden de los renglones.
    const direcciones = filas.map((f) => `${col(ws, "N° Guía Transp.")}${f}`);
    expect(new Set(direcciones).size).toBe(3);
    expect(direcciones.map((a) => valor(ws, a))).toEqual(["725", "724", "726"]);
    // 🩸 El defecto que este candado caza: `725, 724, 726` en una sola celda.
    // No alcanza con prohibir esa cadena exacta — cualquier celda que amontone
    // dos de los tres ya perdió la correspondencia número ↔ factura ↔ cliente.
    for (const v of todasLasCeldas(ws)) {
      const amontonados = ["725", "724", "726"].filter((n) => v.includes(n));
      expect(amontonados.length, `la celda «${v}» amontona ${amontonados.join(" + ")}`).toBeLessThanOrEqual(1);
    }
  });

  it("la herencia sigue viva: sin número propio, sale el de la cabecera", () => {
    // La misma regla que aplican el papel, el PDF y el chip ámbar
    // (`numeroTranspImpreso`), no una segunda escrita acá.
    const ws = roundTrip("Guías", buildGuiasSheet(guias));
    const [fila] = filasDe(ws, "GT-230");
    expect(celda(ws, "N° Guía Transp.", fila)).toBe("TR-4471");
  });

  it('un "0" pelado se trata como vacío y la celda dice «—»', () => {
    const ws = roundTrip("Guías", buildGuiasSheet(guias));
    const [conCero, conEK] = filasDe(ws, "GT-231");
    // "0" en la línea Y en la cabecera: no hay número, y no se imprime un 0.
    expect(celda(ws, "N° Guía Transp.", conCero)).toBe("—");
    // Pero nada que CONTENGA un cero se pierde.
    expect(celda(ws, "N° Guía Transp.", conEK)).toBe("EK0700");
  });

  it("una guía SIN renglones sigue apareciendo, con los campos del envío vacíos", () => {
    const ws = roundTrip("Guías", buildGuiasSheet(guias));
    const filas = filasDe(ws, "GT-232");
    expect(filas).toHaveLength(1);
    const [f] = filas;
    for (const h of ["Envío", "Cliente", "Destino", "Empresa", "Facturas"]) {
      expect(celda(ws, h, f), h).toBe("");
    }
    expect(celda(ws, "N° Guía Transp.", f)).toBe("—");
    // La guía sí se identifica: no es una fila fantasma.
    expect(celda(ws, "Transportista", f)).toBe("Boston");
    expect(celda(ws, "Estado", f)).toBe("Completada");
  });

  it("los bultos siguen siendo NÚMEROS y el total de la banda no se movió", () => {
    const ws = roundTrip("Guías", buildGuiasSheet(guias));
    const c = col(ws, "Bultos");
    for (let f = PRIMERA_FILA; f < PRIMERA_FILA + FILAS; f++) {
      expect((ws[`${c}${f}`] as XLSX.CellObject).t, `fila ${f}`).toBe("n");
    }
    expect(valor(ws, `${c}${PRIMERA_FILA}`)).toBe("5");
    // 🔴 El total se sigue sumando POR GUÍA (`total_bultos`), no por envío: la
    // guía sin renglones conserva sus 6 bultos y contarla por envío la dejaría
    // en cero. 12 + 4 + 5 + 6 = 27, contra 21 si se sumaran los renglones.
    const porGuia = guias.reduce((s, g) => s + g.total_bultos, 0);
    const porEnvio = guias.flatMap((g) => g.guia_items ?? []).reduce((s, i) => s + i.bultos, 0);
    expect(porGuia).toBe(27);
    expect(porEnvio).toBe(21);
    expect((ws[`${c}${FILA_TOTALES}`] as XLSX.CellObject).t).toBe("n");
    expect((ws[`${c}${FILA_TOTALES}`] as XLSX.CellObject).v).toBe(porGuia);
    // La banda cuenta las dos cosas, y son distintas: 4 guías, 6 envíos.
    expect(celda(ws, "N° Guía", FILA_TOTALES)).toBe("4 guías");
    expect(celda(ws, "Envío", FILA_TOTALES)).toBe("6 envíos");
  });

});

describe("excel-proveedores — buildProveedoresSheet", () => {
  const rows: ProveedorExportRow[] = [
    { nombre: "Proveedor Uno", aging_current: 200, aging_watch: 50, aging_overdue: 0, saldo_total: 250, ultimo_pago_dias: 12, empresas_count: 2 },
    { nombre: "Proveedor Dos", aging_current: 0, aging_watch: 0, aging_overdue: 75.25, saldo_total: 75.25, ultimo_pago_dias: null, empresas_count: 1 },
  ];

  it("round-trip: hoja, headers en la fila 1 y moneda como número", () => {
    const ws = roundTrip("Proveedores", buildProveedoresSheet(rows));

    expect(ws.A1.v).toBe("Proveedor");
    // "Comprado YTD" ERA la columna B y se ELIMINÓ (27-jul-2026): el ledger de
    // Switch solo trae lo que todavía se debe. Ahora B es el primer tramo de aging.
    expect(ws.B1.v).toBe("0-90d");
    expect(ws.E1.v).toBe("Por pagar");
    // Moneda: número real con numFmt, no string
    expect(ws.B2.t).toBe("n");
    expect(ws.B2.v).toBe(200);
    expect(ws.B2.z).toBe("$#,##0.00");
    // Último pago: string; null → "—"
    expect(ws.F2.v).toBe("hace 12d");
    expect(ws.F3.v).toBe("—");
    // Totales en fila 5 (headers 1 + 2 datos + espaciador)
    expect(ws.A5.v).toBe("2 proveedores");
    expect(ws.B5.t).toBe("n");
    expect(ws.B5.v).toBeCloseTo(200, 2);
    expect(ws.E5.v).toBeCloseTo(325.25, 2);
    // Candado: ni un encabezado con "YTD" en toda la fila 1.
    for (const col of ["A", "B", "C", "D", "E", "F", "G"]) {
      expect(String(ws[`${col}1`]?.v ?? "")).not.toMatch(/YTD/i);
    }
  });

});

/**
 * 🩸 ESTE BLOQUE CAMBIÓ DE DIRECCIÓN EL 5-SEP-2026.
 *
 * LO QUE MEDÍA ANTES: el round-trip del Excel de Cheques —hoja capitalizada,
 * encabezados en la fila 1, el monto como número y la fila de totales.
 *
 * POR QUÉ YA NO: **el Excel de Cheques se retiró.** Daniel, al rediseñar el
 * módulo Recordatorios: *«se va»*. Se borró `app/cheques/excel-cheques.ts` y su
 * botón. Los datos siguen en la base; lo que se fue es la descarga.
 *
 * LO QUE MIDE AHORA: que no VUELVA por la ventana. Un `import` que ya no existe
 * habría dejado el archivo sin poder compilar (que es un rojo honesto, pero se
 * arregla borrando el bloque y ahí se pierde el rastro). Esto deja el rastro y
 * además vigila: si mañana alguien repone un `excel-cheques`, se pone rojo y
 * tiene que venir con la decisión de Daniel escrita al lado.
 */
describe("🔴 el Excel de Cheques se retiró y no vuelve", () => {
  const RAIZ = process.cwd();

  it("no existe ningún archivo de Excel del módulo", () => {
    for (const rel of [
      "src/app/cheques/excel-cheques.ts",
      "src/app/recordatorios/excel-cheques.ts",
      "src/app/recordatorios/components/excel-cheques.ts",
    ]) {
      expect(fs.existsSync(path.join(RAIZ, rel)), `${rel} volvió`).toBe(false);
    }
  });

  it("y la pantalla no ofrece ninguna descarga", () => {
    const src = fs.readFileSync(
      path.join(RAIZ, "src/app/recordatorios/RecordatoriosClient.tsx"),
      "utf8",
    );
    // Sin los comentarios: este archivo CUENTA que el Excel se fue, y un
    // barrido de texto crudo se cumpliría con su propia explicación.
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toContain("exportChequesExcel");
    expect(codigo).not.toContain("Exportar");
    expect(codigo).not.toContain("downloadWorkbook");
  });
});
