/**
 * 🔴 LOS EXCELS SE ESCRIBEN A DISCO Y SE ABREN — con DOS parsers independientes
 *
 * Un test que mire el workbook EN MEMORIA no prueba que el archivo salga bien:
 * entre el objeto y el archivo hay un `XLSX.write`, un re-empaquetado del ZIP
 * (el que le mete el `<pane>`, porque la librería no sabe escribirlo) y, del
 * otro lado, Excel. Mismo precedente que `_verif-excel-pedidos-numeros.mjs` y
 * `_verif-excel-propio.ts`.
 *
 *   1. `xlsx-js-style` — la misma librería que lo escribe.
 *   2. `jszip` + el XML CRUDO de `xl/worksheets/sheetN.xml` — no comparte una
 *      línea con la anterior.
 *   3. `openpyxl` (script hermano, en Python) — otro programa, otro lenguaje,
 *      y el que lee `freeze_panes` / `auto_filter` como los lee Excel.
 *
 * 🔴 SOLO LECTURA / SOLO ESCRITURA EN /tmp. No toca la base ni Switch: llama a
 * los builders PUROS con fixtures y escribe en una carpeta temporal.
 *
 *   npx tsx scripts/_verif-excel-panel-fijo.ts
 *   python3 scripts/_verif-excel-panel-fijo-openpyxl.py /tmp/excel-panel-fijo
 */

import fs from "fs";
import path from "path";
import os from "os";
import XLSX from "xlsx-js-style";
import JSZip from "jszip";

import { workbookBuffer, workbookFromSheets, buildReportSheet, MONEY_FMT } from "../src/lib/excel-export";
import { buildCajaWorkbook } from "../src/lib/exports/caja-excel";
import { buildPrestamosWorkbook } from "../src/lib/exports/prestamos-excel";
import { buildPedidosWorkbook } from "../src/lib/catalogos/pedidos-excel";
import { buildReebokSinFotoWorkbook } from "../src/lib/catalogos/sinfoto-excel";
import { buildProveedoresSheet } from "../src/app/proveedores/excel-proveedores";
import { buildChequesSheet } from "../src/app/cheques/excel-cheques";
import { buildGuiasSheet } from "../src/app/guias/components/excel-guias";

const SALIDA = process.env.SALIDA ?? path.join(os.tmpdir(), "excel-panel-fijo");

// 🔴 El texto EXACTO que Daniel mandó conservar («dejalo»). Se escribe acá tal
// cual para que este verificador lo busque en el archivo de verdad.
const AVISO_PLANILLA =
  "del 25 jul al 10 ago 2026 · NO es una quincena: " +
  "sueldo base al 110.4 % y SIN los montos escritos a mano";

// ── fixtures mínimos (sin base, sin red) ────────────────────────────────────

function libros(): { nombre: string; bytes: Buffer; hojas: string[] }[] {
  const out: { nombre: string; bytes: Buffer; hojas: string[] }[] = [];
  const add = (nombre: string, wb: XLSX.WorkBook) =>
    out.push({ nombre, bytes: workbookBuffer(wb), hojas: wb.SheetNames });

  add("caja", buildCajaWorkbook(
    { numero: 7, fecha_apertura: "2026-06-01", fondo_inicial: 200 },
    [
      { fecha: "2026-06-02", descripcion: "Taxi", proveedor: "Uber", categoria: "Transporte", subtotal: 10, itbms: 0.7, total: 10.7, responsable: "Ana" },
      { fecha: "2026-06-03", descripcion: "Café", categoria: "Varios", subtotal: 5, itbms: 0.35, total: 5.35, responsable: "Ana" },
    ],
  ));

  add("prestamos", buildPrestamosWorkbook([
    {
      id: "e1", nombre: "Juan Pérez", empresa: "Fashion Wear", deduccion_quincenal: 50, activo: true,
      prestamos_movimientos: [
        { id: "m1", fecha: "2026-05-01", concepto: "Préstamo", monto: 500, notas: null, estado: "aprobado", created_at: "2026-05-01" },
        { id: "m2", fecha: "2026-06-01", concepto: "Pago", monto: 100, notas: null, estado: "aprobado", created_at: "2026-06-01" },
      ],
    },
  ]));

  for (const marca of ["reebok", "joybees", "tommy", "calvin"]) {
    add(`pedidos-${marca}`, buildPedidosWorkbook({
      marca,
      conOrigen: marca === "reebok",
      pedidos: [
        { origen: "mio", cliente: "Zapatería Nueva", vendor: "Nathalie", item_count: 3, total: 1234.56, created_at: "2026-07-01T10:00:00.000Z", numero_pedido: "PED-017", switch_numero: null, fuente: "orders" },
        { origen: "link", cliente: null, vendor: "", item_count: 1, total: 100, created_at: "2026-07-02T10:00:00.000Z", numero_pedido: "PED-018", switch_numero: "16-000000506", switch_documento: "cotizacion", fuente: "orders" },
      ],
    }));
  }

  add("reebok-sin-foto", buildReebokSinFotoWorkbook([
    { sku: "100074688", name: "Club C 85", category: "footwear", available: 24, stock: 30 },
    { sku: "100074689", name: "Nano X4", category: "footwear", available: null, stock: null },
  ] as unknown as Parameters<typeof buildReebokSinFotoWorkbook>[0]));

  add("proveedores", workbookFromSheets([{
    name: "Proveedores",
    ws: buildProveedoresSheet([
      { nombre: "Proveedor Uno", aging_current: 200, aging_watch: 50, aging_overdue: 0, saldo_total: 250, ultimo_pago_dias: 12, empresas_count: 2 },
      { nombre: "Proveedor Dos", aging_current: 0, aging_watch: 0, aging_overdue: 75.25, saldo_total: 75.25, ultimo_pago_dias: null, empresas_count: 1 },
    ]),
  }]));

  const ch = buildChequesSheet([
    { cliente: "Cliente X", numero_cheque: "1001", monto: 350.75, fecha_deposito: "2026-07-10", vendedor: "Ana" },
    { cliente: "Cliente Y", numero_cheque: "1002", monto: 120, fecha_deposito: "2026-07-11", vendedor: "" },
  ], "vencen hoy");
  add("cheques", workbookFromSheets([{ name: ch.sheetName, ws: ch.ws }]));

  add("guias", workbookFromSheets([{
    name: "Guías",
    ws: buildGuiasSheet([
      {
        id: "g1", numero: 229, fecha: "2026-08-20", estado: "Completada",
        transportista_id: null, transportistas: { nombre: "Edwin" },
        modo_entrega: "externo", tipo_despacho: "externo", numero_guia_transp: "",
        total_bultos: 5,
        guia_items: [
          { id: "i1", orden: 1, cliente: "America Clasic", direccion: "Paso Canoas", empresa: "Vistana", facturas: "F-1", bultos: 3, numero_guia_transp: "TR-4471" },
          { id: "i2", orden: 2, cliente: "Jerusalem", direccion: "David", empresa: "Fashion Wear", facturas: "F-2", bultos: 2, numero_guia_transp: "TR-9999" },
        ],
      },
    ] as unknown as Parameters<typeof buildGuiasSheet>[0]),
  }]));

  // 🔴 EL AVISO DE LA PLANILLA. Se arma con el MISMO helper que usan los 24
  // exports, con el texto tal cual sale de `avisoRangoLibre`.
  add("planilla-rango-libre", workbookFromSheets([{
    name: "Planilla",
    ws: buildReportSheet({
      columns: [
        { header: "Persona", wch: 28 },
        { header: "Neto a pagar", wch: 14, align: "right", fmt: MONEY_FMT },
      ],
      rows: [["ALEJANDRA CAMAÑO", 252.64], ["HECTOR LEONEL PEREZ", 267]],
      totals: ["TOTAL — 2 personas", 519.64],
      nota: AVISO_PLANILLA,
    }),
  }]));

  return out;
}

// ── verificación ────────────────────────────────────────────────────────────

const fallos: string[] = [];
const oks: string[] = [];
const ok = (m: string) => oks.push(`✅ ${m}`);
const mal = (m: string) => fallos.push(`🔴 ${m}`);

const PANE = '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>';

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });
  const escritos = libros();
  if (escritos.length === 0) throw new Error("no se generó ni un libro — el verificador no probó nada");

  for (const { nombre, bytes, hojas } of escritos) {
    const ruta = path.join(SALIDA, `${nombre}.xlsx`);
    fs.writeFileSync(ruta, bytes);
    if (bytes.length < 5000) mal(`${nombre}: el archivo pesa ${bytes.length} bytes — no parece un .xlsx`);

    // ── PARSER 1: la librería que lo escribió, releyendo el ARCHIVO ─────────
    const rb = XLSX.read(fs.readFileSync(ruta), { type: "buffer", cellNF: true });
    if (JSON.stringify(rb.SheetNames) !== JSON.stringify(hojas)) {
      mal(`${nombre}: las hojas cambiaron al releer (${rb.SheetNames.join(", ")})`);
    }

    // ── PARSER 2: el XML CRUDO del zip ─────────────────────────────────────
    const zip = await JSZip.loadAsync(fs.readFileSync(ruta));
    const rutasHoja = Object.keys(zip.files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort();
    if (rutasHoja.length !== hojas.length) {
      mal(`${nombre}: ${rutasHoja.length} hojas en el zip contra ${hojas.length} en el libro`);
    }

    for (let i = 0; i < rutasHoja.length; i++) {
      const xml = await zip.file(rutasHoja[i])!.async("string");
      const etiqueta = `${nombre} · ${hojas[i] ?? rutasHoja[i]}`;
      const filtro = /<autoFilter ref="(A1:[A-Z]+\d+)"\/>/.exec(xml);

      // 🔑 UNA HOJA CON LAYOUT PROPIO NO LLEVA FILTRO NI PANEL, y está bien:
      // la plantilla del banco B2B («DASHBOARD DE BUSQUEDA») tiene su rótulo
      // naranja en B1 y los códigos en B2:B201 — congelarle la fila 1 o
      // filtrarla rompería el formato que el portal de PVH espera. Lo que sí se
      // exige es COHERENCIA: sin filtro tampoco puede haber panel.
      if (!filtro) {
        if (xml.includes("<pane ")) mal(`${etiqueta}: se congeló una hoja que no tiene encabezados`);
        else ok(`${etiqueta}: layout propio — sin filtro y sin panel, como debe ser`);
        continue;
      }
      if (!xml.includes(PANE)) { mal(`${etiqueta}: el filtro está pero los encabezados NO quedan fijos`); continue; }
      if (!/<sheetView[^>]*>\s*<pane /.test(xml)) {
        mal(`${etiqueta}: el <pane> está fuera de <sheetView> — Excel lo ignora`);
        continue;
      }

      // Los encabezados abren el archivo: la primera celda con contenido es A1.
      const hoja = rb.Sheets[hojas[i]];
      const a1 = hoja?.["A1"];
      if (!a1 || String(a1.v ?? "").trim() === "") {
        mal(`${etiqueta}: A1 está vacía — hay algo antes de los encabezados`);
        continue;
      }
      ok(`${etiqueta}: encabezados en A1 («${a1.v}») · filtro ${filtro[1]} · fila fija`);
    }
  }

  // ── EL AVISO DE LA PLANILLA, en el archivo y fuera del filtro ────────────
  const rutaPlanilla = path.join(SALIDA, "planilla-rango-libre.xlsx");
  const wsP = XLSX.read(fs.readFileSync(rutaPlanilla), { type: "buffer" }).Sheets["Planilla"];
  const celdas = Object.keys(wsP).filter((k) => !k.startsWith("!"));
  const conAviso = celdas.filter((k) => String((wsP[k] as { v?: unknown }).v ?? "") === AVISO_PLANILLA);
  if (conAviso.length !== 1) {
    mal(`el aviso de la planilla aparece ${conAviso.length} veces (debería aparecer 1)`);
  } else {
    const filaAviso = XLSX.utils.decode_cell(conAviso[0]).r + 1;
    const zipP = await JSZip.loadAsync(fs.readFileSync(rutaPlanilla));
    const xmlP = await zipP.file("xl/worksheets/sheet1.xml")!.async("string");
    const finFiltro = Number(/<autoFilter ref="A1:[A-Z]+(\d+)"\/>/.exec(xmlP)?.[1] ?? "0");
    if (filaAviso <= finFiltro) {
      mal(`el aviso está DENTRO del rango del filtro (fila ${filaAviso} ≤ ${finFiltro}): filtrar lo escondería`);
    } else {
      ok(`el aviso de la planilla está en ${conAviso[0]} (fila ${filaAviso}), FUERA del filtro (termina en ${finFiltro})`);
    }
  }

  // ── informe ─────────────────────────────────────────────────────────────
  for (const l of oks) console.log(l);
  if (fallos.length) {
    console.log("");
    for (const l of fallos) console.log(l);
    console.log(`\n🔴 ${fallos.length} hallazgo(s). Archivos en ${SALIDA}`);
    process.exit(1);
  }
  console.log(`\n🟢 ${oks.length} verificaciones OK · ${escritos.length} archivos en ${SALIDA}`);
  console.log(`   Segundo lenguaje: python3 scripts/_verif-excel-panel-fijo-openpyxl.py ${SALIDA}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
