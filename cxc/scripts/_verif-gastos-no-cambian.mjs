// ¿El retiro del mayor movió ALGÚN número del módulo de Gastos?
//
// La respuesta tiene que ser NO: la pantalla ya mostraba Egresos Varios por
// defecto (`FUENTE_POR_DEFECTO = "egresos"`), así que lo único que se retiró es
// una fuente ALTERNATIVA que había que elegir a mano. Este script lo prueba
// leyendo la MISMA API en los dos builds y comparando campo por campo.
//
//   BASE=http://localhost:3461 OTRO=http://localhost:3472 node scripts/_verif-gastos-no-cambian.mjs
import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const A = process.env.BASE ?? "http://localhost:3461";
const B = process.env.OTRO ?? "http://localhost:3472";
const MESES = ["2026-01", "2026-03", "2026-04", "2026-05", "2026-07", "2026-08"];

function cookie() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(JSON.stringify({ role: "admin", userId: "m", userName: "m", sessionToken: "m%l" })).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url")}`;
}
const C = cookie();
const get = (base, mes) =>
  fetch(`${base}/api/gastos-contabilidad/egresos?mes=${mes}`, { headers: { Cookie: `cxc_session=${C}` } }).then((r) => r.json());

/** Aplana el JSON a `ruta = valor` para poder diferenciar POSICIÓN por posición:
 *  como CONJUNTO, dos empresas intercambiadas se verían idénticas. */
function aplanar(v, ruta = "", out = {}) {
  if (v === null || typeof v !== "object") { out[ruta] = v; return out; }
  if (Array.isArray(v)) { v.forEach((x, i) => aplanar(x, `${ruta}[${i}]`, out)); return out; }
  for (const [k, x] of Object.entries(v)) aplanar(x, ruta ? `${ruta}.${k}` : k, out);
  return out;
}

let campos = 0;
const difs = [];
for (const mes of MESES) {
  const [a, b] = await Promise.all([get(A, mes), get(B, mes)]);
  const fa = aplanar(a), fb = aplanar(b);
  const claves = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  for (const k of claves) {
    campos += 1;
    if (JSON.stringify(fa[k]) !== JSON.stringify(fb[k])) difs.push(`${mes} ${k}: ${JSON.stringify(fb[k])} → ${JSON.stringify(fa[k])}`);
  }
}
console.log(`${MESES.length} meses · ${campos} campos comparados · ${difs.length} diferencias`);
for (const d of difs.slice(0, 40)) console.log("   ", d);
if (campos < 100) { console.error("🔴 se compararon casi nada: el arnés no leyó"); process.exit(1); }
process.exit(difs.length === 0 ? 0 : 1);
