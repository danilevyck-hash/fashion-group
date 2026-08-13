// Verificación del payload de /api/dashboard/vista-general — SOLO LECTURA.
//
// Baja la respuesta ENTERA de un BASE y la escribe como JSON. Corriendo el
// MISMO script contra `origin/main` y contra la rama, se comparan CLAVE POR
// CLAVE y VALOR POR VALOR — nada de "se ve igual".
//
// 🔴 LO QUE ESTO TIENE QUE DEMOSTRAR: que la DISPONIBILIDAD ($629.531,03) y
// todo lo demás siguen EXACTAMENTE iguales, y que lo único que cambió es lo que
// se agregó a propósito.
//
//   PORT=3186 npm run start   (en cada worktree)
//   BASE=http://localhost:3186 OUT=/tmp/vg-rama.json node scripts/_verif-vista-general-payload.mjs
//   node scripts/_verif-vista-general-payload.mjs --diff /tmp/vg-main.json /tmp/vg-rama.json

import { existsSync, readFileSync, writeFileSync } from "fs";
import crypto from "crypto";

// ── Modo diff: compara dos volcados ya bajados ───────────────────────────────
if (process.argv[2] === "--diff") {
  const a = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const b = JSON.parse(readFileSync(process.argv[4], "utf8"));
  // Campos que cambian en cada llamada por definición: no son datos.
  const VOLATILES = new Set(["generadoEn", "ms"]);

  const plano = (o, pre = "", out = new Map()) => {
    if (Array.isArray(o)) o.forEach((v, i) => plano(v, `${pre}[${i}]`, out));
    else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) plano(v, pre ? `${pre}.${k}` : k, out);
    } else out.set(pre, o);
    return out;
  };
  const A = plano(a), B = plano(b);
  const claves = [...new Set([...A.keys(), ...B.keys()])].sort();
  const cambiadas = [], soloA = [], soloB = [];
  for (const k of claves) {
    if (VOLATILES.has(k.split(".").pop())) continue;
    if (!B.has(k)) soloA.push(`${k} = ${JSON.stringify(A.get(k))}`);
    else if (!A.has(k)) soloB.push(`${k} = ${JSON.stringify(B.get(k))}`);
    else if (JSON.stringify(A.get(k)) !== JSON.stringify(B.get(k)))
      cambiadas.push(`${k}: ${JSON.stringify(A.get(k))} → ${JSON.stringify(B.get(k))}`);
  }
  console.log(`claves comparadas: ${claves.length}`);
  console.log(`\n🔴 CLAVES QUE CAMBIARON DE VALOR: ${cambiadas.length}`);
  for (const c of cambiadas) console.log(`   ${c}`);
  console.log(`\n➖ SOLO EN ${process.argv[3]}: ${soloA.length}`);
  for (const c of soloA) console.log(`   ${c}`);
  console.log(`\n➕ SOLO EN ${process.argv[4]}: ${soloB.length}`);
  for (const c of soloB.slice(0, 80)) console.log(`   ${c}`);
  if (soloB.length > 80) console.log(`   … y ${soloB.length - 80} más`);
  process.exit(0);
}

const BASE = process.env.BASE ?? "http://localhost:3186";
const OUT = process.env.OUT ?? "/tmp/vg.json";
const MES = process.env.MES ?? "";

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const url = `${BASE}/api/dashboard/vista-general${MES ? `?mes=${MES}` : ""}`;
const r = await fetch(url, { headers: { cookie: `cxc_session=${cookieDeSesion()}` } });
if (!r.ok) {
  console.error(`HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
  process.exit(1);
}
const j = await r.json();
writeFileSync(OUT, JSON.stringify(j, null, 2));
console.log(`${url} → ${OUT}`);
console.log(`  disponibilidad.total = ${j.disponibilidad?.total}`);
console.log(`  ventas.total         = ${j.ventas?.total}`);
console.log(`  cxc.total            = ${j.cxc?.total}`);
console.log(`  cxp.total            = ${j.cxp?.total}`);
console.log(`  gastos.total         = ${JSON.stringify(j.gastos?.total)}`);
if (j.inventario) {
  console.log(`  inventario.fuente    = ${j.inventario.fuente}`);
  console.log(`  inventario.totalCosto= ${j.inventario.totalCosto}`);
  console.log(`  inventario.totalPrecio=${j.inventario.totalPrecio}`);
  console.log(`  inventario.unidades  = ${j.inventario.totalUnidades}`);
  console.log(`  inventario.medidoEn  = ${j.inventario.medidoEn} (viejo=${j.inventario.viejo}, ${j.inventario.horas}h)`);
  for (const e of j.inventario.porEmpresa) {
    console.log(`     ${e.key.padEnd(20)} ${String(e.unidades).padStart(8)} u  costo ${String(e.costo).padStart(12)}  precio ${String(e.precio).padStart(12)}`);
  }
  console.log(`  sinInventario        = ${j.inventario.sinInventario.map((s) => s.key).join(", ")}`);
  console.log(`  sinCosto             = ${JSON.stringify(j.inventario.sinCosto)}`);
}
