// ─────────────────────────────────────────────────────────────────────────────
// MEDICIÓN — qué VE y qué PUEDE cada rol en las DOS pantallas de pedidos, con
// cookies FIRMADAS rol por rol, contra el build de producción.
//
//   node scripts/_medir-pedidos-roles-api.mjs
//
// 🔴 NADA SE MANDA A SWITCH NI SE BORRA NADA. Solo se tocan GET y el POST de
// `pedidos-export`, que genera un Excel y no escribe una fila. Los caminos que
// MUTAN (checkout, enviar-switch, bulk-delete, DELETE, convertir) NO se llaman:
// su guard se congela en los tests, no acá.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3910";
const COOKIES = JSON.parse(readFileSync("/tmp/t910-cookies.json", "utf8"));
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];
const ROLES = ["admin", "secretaria", "vendedor"];

const PROHIBIDO = /\/(checkout|enviar-switch|bulk-delete|convertir)(\/|$)/;

async function pedir(role, url, method = "GET") {
  if (PROHIBIDO.test(url) || (method !== "GET" && method !== "POST")) {
    throw new Error(`ABORTADO — camino que muta: ${method} ${url}`);
  }
  const r = await fetch(`${BASE}${url}`, {
    method,
    headers: { Cookie: `cxc_session=${COOKIES[role]}` },
  });
  let n = null;
  if (r.ok) {
    const ct = r.headers.get("content-type") ?? "";
    if (ct.includes("json")) { const j = await r.json(); n = Array.isArray(j) ? j.length : "obj"; }
    else n = `${Math.round((await r.arrayBuffer()).byteLength / 1024)}KB`;
  }
  return { status: r.status, n };
}

console.log("PANTALLA DEL VENDEDOR  ·  GET /api/catalogo/<marca>/orders");
for (const marca of MARCAS) {
  const out = [];
  for (const role of ROLES) {
    const { status, n } = await pedir(role, `/api/catalogo/${marca}/orders`);
    out.push(`${role} ${status}${status === 200 ? ` (${n} filas)` : ""}`);
  }
  console.log(`  ${marca.padEnd(8)} ${out.join("  ·  ")}`);
}

console.log("\nPANTALLA DE ADMINISTRAR  ·  GET /api/catalogo/<marca>/pedidos-unificado");
for (const marca of MARCAS) {
  const out = [];
  for (const role of ROLES) {
    const { status, n } = await pedir(role, `/api/catalogo/${marca}/pedidos-unificado`);
    out.push(`${role} ${status}${status === 200 ? ` (${n} filas)` : ""}`);
  }
  console.log(`  ${marca.padEnd(8)} ${out.join("  ·  ")}`);
}

console.log("\nEXPORTAR EXCEL  ·  POST /api/catalogo/<marca>/pedidos-export  (no escribe nada)");
for (const marca of MARCAS) {
  const out = [];
  for (const role of ROLES) {
    const { status, n } = await pedir(role, `/api/catalogo/${marca}/pedidos-export`, "POST");
    out.push(`${role} ${status}${status === 200 ? ` (${n})` : ""}`);
  }
  console.log(`  ${marca.padEnd(8)} ${out.join("  ·  ")}`);
}

console.log("\nLA PÁGINA (HTML) — ¿el servidor la entrega igual a los tres?");
for (const [etiqueta, url] of [
  ["/catalogo/reebok/pedidos       ", "/catalogo/reebok/pedidos"],
  ["/catalogos/admin/reebok?tab=... ", "/catalogos/admin/reebok?tab=pedidos"],
]) {
  const out = [];
  for (const role of ROLES) {
    const { status } = await pedir(role, url);
    out.push(`${role} ${status}`);
  }
  console.log(`  ${etiqueta} ${out.join("  ·  ")}`);
}
