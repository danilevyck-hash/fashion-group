/**
 * SOLO LECTURA — calibración del guard de montos imposibles.
 *
 * Para cada tabla/columna protegida: el récord histórico por empresa (top 5) y
 * el récord del grupo. De acá salen los pisos y se justifica el factor.
 * No escribe ni borra nada.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const f = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const OBJETIVOS = [
  { t: "switch_facturas", col: "total", id: "empresa_key,secuencial,fecha" },
  { t: "switch_estadocuenta", col: "saldo", id: "empresa_key,secuencial,cliente_nombre" },
  { t: "switch_factura_utilidad", col: "costo", id: "empresa_key,secuencial,fecha" },
  { t: "switch_factura_utilidad", col: "utilidad", id: "empresa_key,secuencial,fecha" },
  { t: "switch_recibos", col: "total", id: "empresa_key,fecha,cliente_nombre" },
  { t: "switch_proveedor_estadocuenta", col: "saldo_total", id: "empresa_key,nombre" },
  { t: "products", col: "price", id: "id,name" },
];

for (const { t, col, id } of OBJETIVOS) {
  console.log(`\n═══ ${t}.${col} ═══`);
  for (const dir of ["desc", "asc"]) {
    const url = `${URL_}/rest/v1/${t}?select=${id},${col}&order=${col}.${dir}&limit=8`;
    const r = await fetch(url, { headers: H });
    if (!r.ok) {
      console.log(`  ERROR ${r.status}: ${(await r.text()).slice(0, 200)}`);
      break;
    }
    const filas = await r.json();
    console.log(`  ${dir === "desc" ? "TOP 8 (mayores)" : "TOP 8 (menores/negativos)"}`);
    for (const fila of filas) {
      const clave = id.split(",").map((k) => fila[k]).join(" · ");
      console.log(`    ${f(fila[col]).padStart(18)}   ${clave}`);
    }
  }
}
