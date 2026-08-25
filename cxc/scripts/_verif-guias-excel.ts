// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — NO TOCA LA BASE. Las guías se arman A MANO en este archivo.
//
// ABRE EL EXCEL DE VERDAD Y LEE SUS CELDAS, CON **DOS PARSERS DISTINTOS**:
//   · `xlsx-js-style` — la MISMA librería que lo escribe;
//   · `openpyxl` (python3) — un lector INDEPENDIENTE.
//
// 🩸 POR QUÉ DOS. Leerlo con la librería que lo escribió prueba que el objeto en
// memoria era el esperado, no que el ARCHIVO salga bien: un bug de serialización
// (una celda que se escribe como texto, un tipo mal puesto) se ve idéntico en
// las dos puntas del mismo `xlsx-js-style`. El repo ya usó este doble chequeo
// (`_verif-excel-propio.ts`). Si los dos lectores discrepan, el archivo miente.
//
// Qué defectos atrapa, uno por uno:
//
//  1. «LOS 4 ENVÍOS DE UNA GUÍA SIGUEN AMONTONADOS EN UNA FILA» — el reporte
//     sirve para reclamarle al transportista: hay que poder cruzar SU número
//     con ESA factura y ESE cliente. Se exige 1 fila por envío.
//  2. «UNA CELDA JUNTA DOS N° DE TRANSPORTISTA DISTINTOS» (`725, 724, 726`) —
//     el defecto original: con los tres pegados no se sabe cuál va con cuál.
//  3. «NO SE SABE QUÉ ENVÍO ES CADA FILA» — cuatro GT-229 seguidos se leen como
//     un error del reporte. La columna «Envío» tiene que decir `1 de 4` … `4 de 4`.
//  4. «LOS BULTOS SALEN COMO TEXTO» — una columna de texto no se suma en Excel
//     y el «suma de la selección» de abajo queda mudo. Se exige tipo numérico
//     (`n`) en los DOS lectores.
//  5. «LA BANDA DE TOTALES MIENTE O SE CORRIÓ» — «N guías», «N envíos» y el
//     total de bultos, cada uno en su columna.
//  6. «UNA GUÍA SIN RENGLONES DESAPARECE DEL REPORTE» — que se caiga de un
//     reporte por faltarle el detalle es peor que verla vacía.
//  7. «SE IMPRIME UN "0" PELADO COMO N°» — tiene que salir «—».
//
// Uso:  npx tsx scripts/_verif-guias-excel.ts
// Requiere python3 con openpyxl (`python3 -m pip install openpyxl`).
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import XLSX from "xlsx-js-style";
import { buildGuiasSheet } from "../src/app/guias/components/excel-guias";
import { workbookFromSheets } from "../src/lib/excel-export";
import type { Guia, GuiaItem } from "../src/app/guias/components/types";

const SALIDA = "/tmp/verif-guias-excel";
const ARCHIVO = path.join(SALIDA, "guias.xlsx");
const fallas: string[] = [];
const ok = (m: string) => console.log(`  ✅ ${m}`);
const mal = (m: string) => {
  fallas.push(m);
  console.log(`  🔴 ${m}`);
};

// ─── El juego de guías, armado a mano ────────────────────────────────────────

function item(p: Partial<GuiaItem> & { orden: number; cliente: string }): GuiaItem {
  return {
    direccion: "Panamá",
    empresa: "Fashion Wear",
    facturas: "F-000",
    bultos: 1,
    numero_guia_transp: "",
    ...p,
  } as GuiaItem;
}

function guia(p: Partial<Guia> & { numero: number }): Guia {
  return {
    id: `g-${p.numero}`,
    fecha: "2026-08-25",
    transportista: "Transporte Sol",
    placa: "AB-1234",
    observaciones: "",
    total_bultos: 0,
    item_count: 0,
    monto_total: 0,
    estado: "Completada",
    entregado_por: "Julio",
    tipo_despacho: "externo",
    modo_entrega: "transportista",
    ...p,
  } as Guia;
}

/** A — CUATRO ENVÍOS, cada uno con SU N° de transportista distinto. */
const CUATRO = guia({
  numero: 229,
  numero_guia_transp: "725",
  total_bultos: 22,
  item_count: 4,
  guia_items: [
    item({ orden: 1, cliente: "AMERICA CLASIC", facturas: "F-2001", bultos: 5, numero_guia_transp: "725" }),
    item({ orden: 2, cliente: "JERUSALEM PANAMA", facturas: "F-2002", bultos: 6, numero_guia_transp: "724" }),
    item({ orden: 3, cliente: "CITY MALL DAVID", facturas: "F-2003", bultos: 7, numero_guia_transp: "726" }),
    item({ orden: 4, cliente: "WOLF MALL CENTER", facturas: "F-2004", bultos: 4, numero_guia_transp: "727" }),
  ],
});

/** B — UN SOLO ENVÍO. */
const UNO = guia({
  numero: 230,
  numero_guia_transp: "TR-4471",
  total_bultos: 3,
  item_count: 1,
  guia_items: [
    item({ orden: 1, cliente: "SPORTING SHOES", facturas: "F-3001", bultos: 3, numero_guia_transp: "TR-4471" }),
  ],
});

/** C — SIN RENGLONES: tiene que seguir apareciendo. */
const SIN_RENGLONES = guia({
  numero: 231,
  numero_guia_transp: "TR-5000",
  total_bultos: 9,
  item_count: 0,
  guia_items: [],
});

/** D — EL "0" PELADO en la cabecera y en las dos líneas. */
const CEROS = guia({
  numero: 232,
  numero_guia_transp: "0",
  total_bultos: 2,
  item_count: 2,
  guia_items: [
    item({ orden: 1, cliente: "DOLLAR MALL", facturas: "F-4001", bultos: 1, numero_guia_transp: "0" }),
    item({ orden: 2, cliente: "GRUPO HANNA", facturas: "F-4002", bultos: 1, numero_guia_transp: "" }),
  ],
});

const GUIAS = [CUATRO, UNO, SIN_RENGLONES, CEROS];

// La hoja de `buildReportSheet`: fila 1 título · 2 subtítulo · 3 separador ·
// 4 encabezados · 5.. datos · espaciador · totales.
const FILA_HEADERS = 4;
const FILA_DATOS = 5;
const COL = {
  guia: 0, fecha: 1, transportista: 2, envio: 3, cliente: 4,
  destino: 5, empresa: 6, facturas: 7, bultos: 8, numTransp: 9, estado: 10,
};

interface Celda { v: unknown; t: string | null }
type Rejilla = Celda[][];

// ─── Lector 1: xlsx-js-style ─────────────────────────────────────────────────

function leerConXlsx(ruta: string): { rejilla: Rejilla; hoja: string; ref: string } {
  const wb = XLSX.readFile(ruta, { cellStyles: true });
  const hoja = wb.SheetNames[0];
  const ws = wb.Sheets[hoja];
  const ref = String(ws["!ref"]);
  const rango = XLSX.utils.decode_range(ref);
  const rejilla: Rejilla = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fila: Celda[] = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const cel = ws[XLSX.utils.encode_cell({ r, c })];
      fila.push(cel ? { v: cel.v ?? null, t: cel.t ?? null } : { v: null, t: null });
    }
    rejilla.push(fila);
  }
  return { rejilla, hoja, ref };
}

// ─── Lector 2: openpyxl (python3), un parser INDEPENDIENTE ───────────────────

const PY = `
import json, sys
from openpyxl import load_workbook
wb = load_workbook(sys.argv[1], data_only=True)
ws = wb[wb.sheetnames[0]]
out = {"hoja": wb.sheetnames[0], "max_row": ws.max_row, "max_col": ws.max_column,
       "merges": [str(m) for m in ws.merged_cells.ranges], "filas": []}
for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=ws.max_column):
    out["filas"].append([{"v": (c.value if not hasattr(c.value, "isoformat") else c.value.isoformat()),
                          "t": c.data_type} for c in row])
print(json.dumps(out, ensure_ascii=False))
`;

function leerConOpenpyxl(ruta: string) {
  const py = path.join(SALIDA, "_leer.py");
  writeFileSync(py, PY);
  const salida = execFileSync("python3", [py, ruta], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(salida) as {
    hoja: string; max_row: number; max_col: number; merges: string[];
    filas: Celda[][];
  };
}

// ─── Herramientas de lectura sobre una rejilla ───────────────────────────────

const txt = (c: Celda | undefined) => (c && c.v !== null && c.v !== undefined ? String(c.v) : "");

/** Las filas de DATOS de una guía (por su N°), en el orden en que salieron. */
function filasDe(rej: Rejilla, guiaTxt: string): { fila: number; celdas: Celda[] }[] {
  const res: { fila: number; celdas: Celda[] }[] = [];
  for (let r = FILA_DATOS - 1; r < rej.length; r++) {
    if (txt(rej[r][COL.guia]) === guiaTxt) res.push({ fila: r + 1, celdas: rej[r] });
  }
  return res;
}

/** La banda de totales: la última fila con algo escrito en la columna N° Guía. */
function filaTotales(rej: Rejilla): Celda[] | null {
  for (let r = rej.length - 1; r >= FILA_DATOS - 1; r--) {
    if (/guías?$/i.test(txt(rej[r][COL.guia]))) return rej[r];
  }
  return null;
}

// ─── Las comprobaciones, contra CUALQUIERA de los dos lectores ───────────────

function comprobar(nombre: string, rej: Rejilla, silencioso = false): string[] {
  const propias: string[] = [];
  const ok = silencioso ? () => {} : (m: string) => console.log(`  ✅ ${m}`);
  const mal = (m: string) => {
    propias.push(m);
    if (!silencioso) {
      fallas.push(m);
      console.log(`  🔴 ${m}`);
    }
  };
  if (!silencioso) console.log(`\n── Comprobaciones con ${nombre} ─────────────────────────────`);

  // Guard anti-vacuo: sin datos, todo pasaría en verde sin haber mirado nada.
  const filasConDatos = rej.slice(FILA_DATOS - 1).filter((f) => /^GT-\d+$/.test(txt(f[COL.guia])));
  if (filasConDatos.length < 5) {
    mal(`${nombre}: la hoja trae ${filasConDatos.length} filas de datos — el lector no está viendo el archivo`);
    return propias;
  }
  ok(`${nombre}: ${filasConDatos.length} filas de datos · ${rej[0].length} columnas · ${rej.length} filas en total`);

  // Encabezados exactos (si se corren, todas las columnas de abajo mienten).
  const ESPERADOS = ["N° Guía", "Fecha", "Transportista", "Envío", "Cliente", "Destino", "Empresa", "Facturas", "Bultos", "N° Guía Transp.", "Estado"];
  const headers = rej[FILA_HEADERS - 1].map(txt);
  if (headers.join("|") === ESPERADOS.join("|")) ok(`${nombre}: los 11 encabezados, en orden: ${ESPERADOS.join(" · ")}`);
  else mal(`${nombre}: encabezados distintos → ${headers.join(" · ")}`);

  // (1) 4 envíos = 4 filas, cada una con SU cliente, SU factura y SU N°
  const f229 = filasDe(rej, "GT-229");
  if (f229.length !== 4) mal(`${nombre}: GT-229 ocupa ${f229.length} filas (debería ocupar 4)`);
  else {
    ok(`${nombre}: GT-229 ocupa 4 filas (una por envío)`);
    const esperado = [
      ["AMERICA CLASIC", "F-2001", "725", 5],
      ["JERUSALEM PANAMA", "F-2002", "724", 6],
      ["CITY MALL DAVID", "F-2003", "726", 7],
      ["WOLF MALL CENTER", "F-2004", "727", 4],
    ] as const;
    esperado.forEach(([cli, fac, num, bul], i) => {
      const c = f229[i].celdas;
      const leido = `${txt(c[COL.cliente])} | ${txt(c[COL.facturas])} | ${txt(c[COL.numTransp])} | ${txt(c[COL.bultos])}`;
      if (txt(c[COL.cliente]) === cli && txt(c[COL.facturas]) === fac && txt(c[COL.numTransp]) === num && Number(c[COL.bultos].v) === bul) {
        ok(`${nombre}:   fila ${f229[i].fila} → ${leido}`);
      } else {
        mal(`${nombre}:   fila ${f229[i].fila} esperaba «${cli} | ${fac} | ${num} | ${bul}» y trae «${leido}»`);
      }
    });
  }

  // (2) NINGUNA celda amontona dos N° de transportista distintos
  const NUMEROS = ["725", "724", "726", "727", "TR-4471", "TR-5000"];
  let amontonadas = 0;
  for (let r = FILA_DATOS - 1; r < rej.length; r++) {
    for (const cel of rej[r]) {
      const v = txt(cel);
      if (!v) continue;
      const cuantos = NUMEROS.filter((n) => v.includes(n)).length;
      if (cuantos > 1) {
        amontonadas++;
        mal(`${nombre}: la celda de la fila ${r + 1} junta ${cuantos} N° distintos → «${v}»`);
      }
    }
  }
  if (amontonadas === 0) ok(`${nombre}: ninguna celda junta dos N° de transportista distintos`);

  // (3) la columna «Envío» dice «1 de 4» … «4 de 4»
  const envios = f229.map((f) => txt(f.celdas[COL.envio]));
  if (envios.join(", ") === "1 de 4, 2 de 4, 3 de 4, 4 de 4") ok(`${nombre}: columna Envío → ${envios.join(" · ")}`);
  else mal(`${nombre}: columna Envío dice «${envios.join(" · ")}» en vez de «1 de 4 … 4 de 4»`);
  const envio230 = txt(filasDe(rej, "GT-230")[0]?.celdas[COL.envio]);
  if (envio230 === "1 de 1") ok(`${nombre}: la guía de un solo envío dice «1 de 1»`);
  else mal(`${nombre}: la guía de un solo envío dice «${envio230}»`);

  // (4) los BULTOS son numéricos, no texto
  const noNumericos: string[] = [];
  for (const f of [...f229, ...filasDe(rej, "GT-230"), ...filasDe(rej, "GT-232")]) {
    const cel = f.celdas[COL.bultos];
    if (cel.t !== "n" || typeof cel.v !== "number") noNumericos.push(`fila ${f.fila} (t=${cel.t}, ${typeof cel.v})`);
  }
  if (noNumericos.length === 0) ok(`${nombre}: los bultos son NÚMEROS (tipo "n") en todas las filas`);
  else mal(`${nombre}: bultos no numéricos → ${noNumericos.join(", ")}`);

  // (5) la banda de totales
  const tot = filaTotales(rej);
  if (!tot) mal(`${nombre}: no se encontró la banda de totales`);
  else {
    const guiasTxt = txt(tot[COL.guia]);
    const enviosTxt = txt(tot[COL.envio]);
    const bultosTot = tot[COL.bultos];
    if (guiasTxt === "4 guías") ok(`${nombre}: totales → «${guiasTxt}»`);
    else mal(`${nombre}: totales dice «${guiasTxt}» en vez de «4 guías»`);
    if (enviosTxt === "7 envíos") ok(`${nombre}: totales → «${enviosTxt}»`);
    else mal(`${nombre}: totales dice «${enviosTxt}» en vez de «7 envíos»`);
    const esperadoBultos = GUIAS.reduce((s, g) => s + (g.total_bultos || 0), 0);
    if (Number(bultosTot.v) === esperadoBultos && bultosTot.t === "n") {
      ok(`${nombre}: total de bultos ${esperadoBultos} (numérico), = la suma de total_bultos de las 4 guías`);
    } else {
      mal(`${nombre}: total de bultos «${txt(bultosTot)}» (t=${bultosTot.t}) — se esperaba ${esperadoBultos} numérico`);
    }
  }

  // (6) la guía SIN RENGLONES sigue apareciendo
  const f231 = filasDe(rej, "GT-231");
  if (f231.length !== 1) mal(`${nombre}: la guía sin renglones aparece en ${f231.length} filas (debería ser 1)`);
  else {
    const c = f231[0].celdas;
    const vacios = [COL.envio, COL.cliente, COL.destino, COL.empresa, COL.facturas].every((i) => txt(c[i]) === "");
    if (vacios) ok(`${nombre}: GT-231 (sin renglones) aparece igual, con los campos del envío vacíos`);
    else mal(`${nombre}: GT-231 sin renglones trae campos de envío inventados → «${[COL.envio, COL.cliente, COL.facturas].map((i) => txt(c[i])).join(" | ")}»`);
    if (txt(c[COL.numTransp]) === "TR-5000") ok(`${nombre}: GT-231 conserva el N° de la cabecera (TR-5000)`);
    else mal(`${nombre}: GT-231 muestra «${txt(c[COL.numTransp])}» en el N° (se esperaba TR-5000)`);
  }

  // (7) el "0" pelado sale como «—»
  const f232 = filasDe(rej, "GT-232");
  if (f232.length !== 2) mal(`${nombre}: GT-232 ocupa ${f232.length} filas (debería ocupar 2)`);
  else {
    f232.forEach((f, i) => {
      const v = txt(f.celdas[COL.numTransp]);
      if (v === "—") ok(`${nombre}: GT-232 envío ${i + 1} → «—» (el "0" pelado no se imprime)`);
      else mal(`${nombre}: GT-232 envío ${i + 1} muestra «${v}» en vez de «—»`);
    });
  }

  return propias;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL DE MUTACIÓN **EN MEMORIA** — no toca `src/` ni el archivo escrito.
//
// 🩸 Un verificador que pasa en verde sin poder fallar no verifica nada. Acá se
// le da a `comprobar()` una rejilla ROTA a propósito (el defecto de antes) y se
// exige que la denuncie. Si no la denunciara, todos los ✅ de arriba valdrían lo
// mismo que un barrido que se cumple con su propio comentario.
// ─────────────────────────────────────────────────────────────────────────────

function clonar(rej: Rejilla): Rejilla {
  return rej.map((f) => f.map((c) => ({ ...c })));
}

function controlDeMutacion(base: Rejilla) {
  console.log("\n── Control de mutación (rejillas ROTAS a propósito) ─────────");
  const casos: Array<[string, (r: Rejilla) => Rejilla]> = [
    [
      "los 4 envíos vuelven a una sola fila, con los N° amontonados",
      (r) => {
        const m = clonar(r);
        const i = m.findIndex((f) => txt(f[COL.guia]) === "GT-229");
        m[i][COL.numTransp] = { v: "725, 724, 726, 727", t: "s" };
        m[i][COL.envio] = { v: "", t: "s" };
        m[i][COL.cliente] = { v: "AMERICA CLASIC y 3 mas", t: "s" };
        m.splice(i + 1, 3);
        return m;
      },
    ],
    [
      "los bultos se escriben como TEXTO",
      (r) => {
        const m = clonar(r);
        for (const f of m.slice(FILA_DATOS - 1)) {
          if (typeof f[COL.bultos].v === "number") f[COL.bultos] = { v: String(f[COL.bultos].v), t: "s" };
        }
        return m;
      },
    ],
    [
      "la guía SIN RENGLONES desaparece del reporte",
      (r) => clonar(r).filter((f) => txt(f[COL.guia]) !== "GT-231"),
    ],
    [
      'el "0" pelado vuelve a imprimirse',
      (r) => {
        const m = clonar(r);
        for (const f of m.slice(FILA_DATOS - 1)) {
          if (txt(f[COL.guia]) === "GT-232") f[COL.numTransp] = { v: "0", t: "s" };
        }
        return m;
      },
    ],
    [
      "la banda de totales pierde los envíos",
      (r) => {
        const m = clonar(r);
        const t = m.find((f) => /guías?$/i.test(txt(f[COL.guia])));
        if (t) t[COL.envio] = { v: "", t: "s" };
        return m;
      },
    ],
    [
      "la columna Envío deja de decir cuál de cuántos",
      (r) => {
        const m = clonar(r);
        for (const f of m.slice(FILA_DATOS - 1)) if (txt(f[COL.envio])) f[COL.envio] = { v: "", t: "s" };
        return m;
      },
    ],
  ];
  let cazadas = 0;
  for (const [nombre, mutar] of casos) {
    const rotas = comprobar("mutación", mutar(base), true);
    if (rotas.length > 0) {
      cazadas++;
      console.log(`  ✅ CAZADA (${rotas.length}) — ${nombre}`);
    } else {
      fallas.push(`el control de mutación NO cazó: ${nombre}`);
      console.log(`  🔴 SOBREVIVIÓ — ${nombre}`);
    }
  }
  console.log(`  → ${cazadas} de ${casos.length} mutaciones cazadas`);
}

// ─── Los dos lectores tienen que coincidir ───────────────────────────────────

function compararLectores(a: Rejilla, b: Rejilla) {
  console.log("\n── Los DOS lectores, celda por celda ────────────────────────");
  if (a.length !== b.length) mal(`filas distintas: xlsx-js-style ${a.length} · openpyxl ${b.length}`);
  const filas = Math.min(a.length, b.length);
  let iguales = 0;
  let distintas = 0;
  for (let r = 0; r < filas; r++) {
    const cols = Math.max(a[r].length, b[r].length);
    for (let c = 0; c < cols; c++) {
      const va = txt(a[r]?.[c]);
      const vb = txt(b[r]?.[c]);
      // openpyxl devuelve "" donde xlsx deja la celda con string vacío: mismo dato.
      if (va === vb) iguales++;
      else {
        distintas++;
        if (distintas <= 5) mal(`fila ${r + 1} col ${c + 1}: xlsx «${va}» ≠ openpyxl «${vb}»`);
      }
    }
  }
  if (distintas === 0) ok(`${iguales} celdas leídas por los dos parsers, 0 distintas`);
}

// ─── B) EL EXCEL, ESCRITO Y ABIERTO ──────────────────────────────────────────

function main() {
  mkdirSync(SALIDA, { recursive: true });
  const ws = buildGuiasSheet(GUIAS, "Verificación — 4 guías, 7 envíos");
  const wb = workbookFromSheets([{ name: "Guías", ws }]);
  XLSX.writeFile(wb, ARCHIVO, { bookType: "xlsx" });
  console.log(`Archivo escrito: ${ARCHIVO}\n`);

  const a = leerConXlsx(ARCHIVO);
  const b = leerConOpenpyxl(ARCHIVO);

  console.log("── Qué dijo cada parser ──────────────────────────────────────");
  console.log(`  xlsx-js-style : hoja «${a.hoja}» · rango ${a.ref} · ${a.rejilla.length} filas × ${a.rejilla[0].length} columnas`);
  console.log(`  openpyxl      : hoja «${b.hoja}» · ${b.max_row} filas × ${b.max_col} columnas · ${b.merges.length} rangos combinados`);
  if (a.hoja !== b.hoja) mal(`el nombre de la hoja no coincide entre parsers`);
  if (a.rejilla.length !== b.max_row || a.rejilla[0].length !== b.max_col) {
    mal(`las dimensiones no coinciden: xlsx ${a.rejilla.length}×${a.rejilla[0].length} · openpyxl ${b.max_row}×${b.max_col}`);
  } else {
    ok(`los dos parsers ven la MISMA rejilla: ${b.max_row} filas × ${b.max_col} columnas`);
  }

  comprobar("xlsx-js-style", a.rejilla);
  comprobar("openpyxl", b.filas);
  compararLectores(a.rejilla, b.filas);
  controlDeMutacion(a.rejilla);

  console.log(
    fallas.length === 0
      ? "\n🟢 EXCEL: TODO OK\n"
      : `\n🔴 EXCEL: ${fallas.length} FALLAS\n${fallas.map((f) => "  · " + f).join("\n")}\n`,
  );
  process.exit(fallas.length === 0 ? 0 : 1);
}

main();
