/**
 * SOLO LECTURA — NO BORRA NADA. Barrido de montos IMPOSIBLES ya guardados en
 * todas las tablas de plata que vienen de Switch.
 *
 * Corte: |monto| > $1,000,000 en un documento/día suelto. Referencia medida:
 * el día de costo más caro jamás registrado en el grupo es $141,707.12 y el
 * costo de las 8 empresas juntas en junio (mes cerrado, certificado) fue
 * $489,788.26. Un millón en UNA fila es más que el grupo entero en un mes.
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

const CORTE = 1_000_000;

const TABLAS = [
  { t: "switch_costo_diario", id: "empresa_key,fecha", cols: ["venta_total", "costo_total", "utilidad_total"] },
  { t: "switch_articulo_diario", id: "empresa_key,fecha,codigo,tipo", cols: ["venta_total", "costo_total"] },
  { t: "switch_facturas", id: "empresa_key,secuencial,fecha,tipo_comprobante", cols: ["subtotal", "subtotal_descuento", "impuesto", "total", "saldo", "descuento"] },
  { t: "switch_estadocuenta", id: "empresa_key,secuencial,cliente_nombre", cols: ["total", "saldo", "debito", "credito", "saldo_original", "total_original"] },
  { t: "switch_recibos", id: "empresa_key,fecha,cliente_nombre", cols: ["total"] },
  { t: "switch_factura_utilidad", id: "empresa_key,secuencial,fecha,cliente", cols: ["subtotal_con_descuento", "costo", "utilidad"] },
  { t: "switch_proveedor_estadocuenta", id: "empresa_key,nombre", cols: ["saldo_total", "comprado_ytd", "pagado_ytd", "ultimo_pago_monto"] },
  { t: "cxc_rows", id: "company_key,comprobante,fecha", cols: ["debito", "credito", "saldo"] },
  { t: "ventas_raw", id: "empresa,fecha,n_sistema,cliente", cols: ["costo", "subtotal", "total", "utilidad"] },
  { t: "multifashion_tickets", id: "secuencial,fecha", cols: ["subtotal", "total", "saldo"] },
];

const f = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let totalHallazgos = 0;
for (const { t, id, cols } of TABLAS) {
  const filtro = cols.map((c) => `${c}.gt.${CORTE},${c}.lt.-${CORTE}`).join(",");
  const url = `${URL_}/rest/v1/${t}?select=${id},${cols.join(",")}&or=(${filtro})&limit=200`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) {
    console.log(`\n### ${t} — ERROR ${r.status}: ${(await r.text()).slice(0, 150)}`);
    continue;
  }
  const filas = await r.json();
  console.log(`\n### ${t} — ${filas.length} fila(s) con |monto| > $${f(CORTE)}`);
  for (const fila of filas) {
    totalHallazgos++;
    const clave = id.split(",").map((k) => fila[k]).join(" · ");
    const montos = cols
      .filter((c) => Math.abs(Number(fila[c] ?? 0)) > CORTE)
      .map((c) => `${c}=${f(fila[c])}`)
      .join("  ");
    console.log(`  🔴 ${clave}  →  ${montos}`);
  }
}
console.log(`\n═══ TOTAL: ${totalHallazgos} fila(s) con montos imposibles en toda la base ═══`);
