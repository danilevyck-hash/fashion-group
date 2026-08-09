#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MEDICIÓN + CAPTURA de /api/multifashion/productos. SOLO LECTURA.
//
// Pega N veces la ruta (12 meses y un mes suelto), mide el tiempo de respuesta y
// el tamaño del payload comprimido y crudo, y GUARDA la respuesta completa en
// disco para poder compararla campo por campo después de optimizar.
//
// Uso:
//   BASE=https://www.fashiongr.com OUT=/tmp/antes node scripts/_medir-productos-multifashion.mjs
//
// NUNCA escribe en producción: solo hace GET a la ruta con una cookie de sesión
// ya existente (no crea sesiones).
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from "fs";
import { createHmac } from "crypto";
import { gzipSync } from "zlib";

const BASE = process.env.BASE || "https://www.fashiongr.com";
const OUT = process.env.OUT || "/tmp/mf-productos";
const REPS = Number(process.env.REPS || 3);
const TOKEN = process.env.SESSION_TOKEN;
const SECRET = process.env.SESSION_SECRET;
if (!TOKEN || !SECRET) throw new Error("faltan SESSION_TOKEN / SESSION_SECRET");

// Mismo formato que src/lib/session-cookie.ts (base64url del JSON + "." + HMAC).
function signSession(payload) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const mac = createHmac("sha256", SECRET).update(b64).digest("base64url");
  return `${b64}.${mac}`;
}

const cookie = `cxc_session=${signSession({
  role: "admin",
  userId: "daniel",
  userName: "daniel",
  sessionToken: TOKEN,
})}`;

const CASOS = [
  { nombre: "12m", qs: "periodo=12m" },
  { nombre: "mes", qs: "periodo=mes&year=2026&mes=8" },
];

mkdirSync(OUT, { recursive: true });

for (const caso of CASOS) {
  const url = `${BASE}/api/multifashion/productos?${caso.qs}`;
  const tiempos = [];
  let texto = null;
  let bytesRed = 0;
  for (let i = 0; i < REPS; i += 1) {
    const t0 = Date.now();
    const res = await fetch(url, {
      headers: { cookie, "accept-encoding": "gzip, br" },
      cache: "no-store",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const ms = Date.now() - t0;
    if (!res.ok) throw new Error(`${caso.nombre}: HTTP ${res.status} ${buf.toString().slice(0, 300)}`);
    tiempos.push(ms);
    texto = buf.toString("utf8");
    bytesRed = buf.length;
    // Espaciado: esta ruta lee decenas de miles de filas; no se la martillea.
    await new Promise(r => setTimeout(r, 2500));
  }
  const crudo = Buffer.byteLength(texto, "utf8");
  const comprimido = gzipSync(Buffer.from(texto, "utf8"), { level: 6 }).length;
  const j = JSON.parse(texto);
  writeFileSync(`${OUT}/${caso.nombre}.json`, texto);
  console.log(
    [
      `[${caso.nombre}] ${url}`,
      `  tiempos ms      : ${tiempos.join(", ")}  (min ${Math.min(...tiempos)}, mediana ${
        [...tiempos].sort((a, b) => a - b)[Math.floor(tiempos.length / 2)]
      })`,
      `  payload crudo   : ${(crudo / 1024).toFixed(1)} KB`,
      `  payload gzip    : ${(comprimido / 1024).toFixed(1)} KB   (bytes por la red: ${(bytesRed / 1024).toFixed(1)} KB)`,
      `  filasLeidas     : ${j.filasLeidas}  · comparativo.filasLeidas: ${j.comparativo?.filasLeidas ?? "—"}`,
      `  rango           : ${j.desde} → ${j.hasta}  · comp ${j.comparativo?.desde ?? "—"} → ${j.comparativo?.hasta ?? "—"}`,
      `  venta total     : ${j.ranking?.totales?.venta}  · margen ${j.ranking?.totales?.margen}`,
      `  categorias      : ${j.ranking?.categorias?.length}  · codigos: ${j.ranking?.codigos?.length}`,
      `  marcaDisponible : ${j.marcaDisponible}  · porMarca.grupos: ${j.porMarca?.grupos?.length ?? "—"}`,
      `  fuentes         : ${j.fuentes ? JSON.stringify(j.fuentes) : "(sin campo — build viejo)"}`,
    ].join("\n"),
  );
}
console.log(`\nRespuestas guardadas en ${OUT}/`);
