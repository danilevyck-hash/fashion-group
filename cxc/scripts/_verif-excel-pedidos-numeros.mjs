// 🔴 EL EXCEL SE ABRE DE VERDAD Y SE LEEN LAS CELDAS — con DOS parsers (25-ago-2026)
//
// El botón «Exportar» de «Catálogos › Administrar › Pedidos» baja un .xlsx que
// desde hoy lleva los DOS números que la pantalla ya muestra. Un test que mire
// el workbook EN MEMORIA no prueba que el archivo salga bien: entre el objeto y
// el archivo hay un `XLSX.write`, un `Content-Type`, un zip y un navegador.
//
// Este script pide el archivo a la app CORRIENDO (build de producción, datos de
// producción), lo guarda y lo abre con DOS parsers independientes:
//   1. `xlsx-js-style` — la misma librería que lo escribe.
//   2. `jszip` + el XML crudo de `xl/worksheets/sheet1.xml` y `sharedStrings.xml`
//      — no comparte una línea de código con la anterior. Si las dos coinciden,
//      lo que se leyó está en el ARCHIVO y no en la cabeza del que lo escribió.
//
// 🔴 SOLO LECTURA. `POST /pedidos-export` no escribe nada: lee la vista, arma el
// libro y lo devuelve. No se toca ni un pedido.
//
//   npx next build && npx next start -p 3479
//   BASE=http://localhost:3479 node scripts/_verif-excel-pedidos-numeros.mjs

import { existsSync, readFileSync, writeFileSync } from "fs";
import crypto from "crypto";
import XLSX from "xlsx-js-style";
import JSZip from "jszip";

const BASE = process.env.BASE ?? "http://localhost:3479";
const MARCAS = (process.env.MARCAS ?? "reebok,joybees,tommy,calvin").split(",");
const SALIDA = process.env.SALIDA ?? "/tmp/pedidos-export";

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "verif", userName: "verif", sessionToken: "verif%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const COOKIE = `cxc_session=${cookieDeSesion()}`;
const fallos = [];
const A = (r, c) => XLSX.utils.encode_cell({ r, c });
const HDR = 3;
const DATA = 4;

/**
 * PARSER 2 — el XML crudo del .xlsx. `xl/worksheets/sheet1.xml` guarda los
 * textos como índices a `sharedStrings.xml` (`t="s"`), así que hay que resolver
 * la tabla para leer una celda. Cero código compartido con xlsx-js-style.
 */
async function leerCrudo(buf) {
  const zip = await JSZip.loadAsync(buf);
  const nombres = Object.keys(zip.files);
  const hoja = nombres.find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n));
  if (!hoja) return null;
  const xmlHoja = await zip.file(hoja).async("string");
  const compartidas = [];
  const ss = zip.file("xl/sharedStrings.xml");
  if (ss) {
    const xml = await ss.async("string");
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      // Un <si> puede venir partido en varios <t> (texto con formato mezclado).
      const partes = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
      compartidas.push(
        partes
          .join("")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
      );
    }
  }
  const celdas = new Map();
  for (const m of xmlHoja.matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
    const [, ref, attrs, cuerpo] = m;
    const tipo = (attrs.match(/\st="([^"]+)"/) || [])[1];
    const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    if (v === undefined) continue;
    celdas.set(ref, tipo === "s" ? compartidas[Number(v)] : v);
  }
  return celdas;
}

for (const marca of MARCAS) {
  console.log(`\n${"═".repeat(72)}\n${marca.toUpperCase()}\n${"═".repeat(72)}`);
  const res = await fetch(`${BASE}/api/catalogo/${marca}/pedidos-export`, {
    method: "POST",
    headers: { cookie: COOKIE },
  });
  if (res.status !== 200) {
    fallos.push(`${marca}: el export respondió ${res.status}`);
    console.log(`  ❌ HTTP ${res.status}`);
    continue;
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("spreadsheetml")) fallos.push(`${marca}: Content-Type "${ct}"`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ruta = `${SALIDA}-${marca}.xlsx`;
  writeFileSync(ruta, buf);
  // Firma de zip: si esto no es "PK", no hay archivo que abrir.
  if (buf.subarray(0, 2).toString("latin1") !== "PK") {
    fallos.push(`${marca}: el cuerpo no es un .xlsx`);
    continue;
  }
  console.log(`  archivo: ${ruta} (${(buf.length / 1024).toFixed(1)} KB)`);

  // ── PARSER 1: xlsx-js-style ────────────────────────────────────────────────
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets["Pedidos"];
  if (!ws) { fallos.push(`${marca}: no hay hoja "Pedidos"`); continue; }
  const headers = [];
  for (let c = 0; c < 20; c++) {
    const cel = ws[A(HDR, c)];
    if (!cel) break;
    headers.push(String(cel.v));
  }
  console.log(`  columnas: ${headers.join(" · ")}`);
  if (headers[headers.length - 2] !== "N° pedido" || headers[headers.length - 1] !== "Switch") {
    fallos.push(`${marca}: las dos columnas nuevas no están AL FINAL → ${headers.join(",")}`);
  }
  const iNum = headers.indexOf("N° pedido");
  const iSw = headers.indexOf("Switch");

  // Filas de datos: hasta el espaciador que precede a los totales.
  const filas = [];
  for (let r = DATA; r < DATA + 5000; r++) {
    const cliente = ws[A(r, headers.indexOf("Cliente"))];
    if (!cliente) break;
    filas.push({
      r,
      cliente: String(cliente.v),
      numero: ws[A(r, iNum)] ? String(ws[A(r, iNum)].v) : "",
      switch: ws[A(r, iSw)] ? String(ws[A(r, iSw)].v) : "",
    });
  }
  console.log(`  filas: ${filas.length}`);
  if (filas.length === 0) fallos.push(`${marca}: el Excel salió sin filas`);

  // 🔴 Ni un guion donde va un número, y ni una celda vacía.
  for (const f of filas) {
    if (!f.numero.trim()) fallos.push(`${marca} fila ${f.r}: «N° pedido» VACÍO`);
    if (!f.switch.trim()) fallos.push(`${marca} fila ${f.r}: «Switch» VACÍO`);
    for (const v of [f.numero, f.switch]) {
      if (v.trim() === "—" || v.trim() === "-") fallos.push(`${marca} fila ${f.r}: un guion donde va un número`);
    }
    // El que no salió lo DICE; el que salió nombra pedido o cotización.
    const ok = f.switch === "No se ha mandado a Switch" ||
      /^(Pedido|Cotización) en Switch(: .+|, sin número)$/.test(f.switch);
    if (!ok) fallos.push(`${marca} fila ${f.r}: «Switch» dice "${f.switch}"`);
  }
  const noEnviados = filas.filter((f) => f.switch === "No se ha mandado a Switch").length;
  const cotizaciones = filas.filter((f) => f.switch.startsWith("Cotización")).length;
  const delLink = filas.filter((f) => f.numero === "Se numera al abrirlo").length;
  console.log(
    `  «No se ha mandado a Switch»: ${noEnviados} · cotizaciones: ${cotizaciones} · ` +
      `del link sin convertir: ${delLink}`,
  );
  const ej = filas.find((f) => f.switch.startsWith("Pedido en Switch:")) ?? filas[0];
  console.log(`  ejemplo: ${ej.cliente} → "${ej.numero}" · "${ej.switch}"`);

  // ── PARSER 2: jszip + XML crudo ────────────────────────────────────────────
  const crudo = await leerCrudo(buf);
  if (!crudo) { fallos.push(`${marca}: jszip no encontró la hoja`); continue; }
  const col = (i) => XLSX.utils.encode_col(i);
  let distintas = 0;
  for (const f of filas) {
    const n = crudo.get(`${col(iNum)}${f.r + 1}`);
    const s = crudo.get(`${col(iSw)}${f.r + 1}`);
    if (n !== f.numero || s !== f.switch) {
      distintas++;
      if (distintas <= 3) fallos.push(`${marca} fila ${f.r}: los dos parsers difieren ("${n}"/"${s}")`);
    }
  }
  const hN = crudo.get(`${col(iNum)}${HDR + 1}`);
  const hS = crudo.get(`${col(iSw)}${HDR + 1}`);
  if (hN !== "N° pedido" || hS !== "Switch") {
    fallos.push(`${marca}: el XML crudo dice "${hN}"/"${hS}" en los encabezados`);
  }
  console.log(
    `  2º parser (jszip + XML crudo): ${filas.length * 2} celdas · ` +
      `${distintas === 0 ? "✅ 0 distintas" : `❌ ${distintas} distintas`}`,
  );
}

console.log(`\n${"═".repeat(72)}`);
if (fallos.length === 0) {
  console.log("🟢 el Excel se abre, las columnas van al final y los dos parsers dicen lo mismo");
} else {
  console.log(`🔴 ${fallos.length} hallazgos:`);
  for (const f of fallos) console.log(`   · ${f}`);
}
process.exit(fallos.length === 0 ? 0 : 1);
