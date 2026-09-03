// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. ¿CUÁNTO DICE SWITCH DE COSTO POR EMPRESA Y MES, INCLUIDAS LAS ND?
//
// 🩸 POR QUÉ. Ventas › Resumen sacaba el costo de `switch_articulo_diario`
// (`/apireporte/ventasucursal`), que NO trae notas de débito. El 27-ago-2026
// Active Wear anuló una NC de $74.166 con una ND de $73.752 y el costo del mes
// quedó en −$44.483,03: utilidad mayor que la venta. Antes de rearmar la vista
// hay que tener el número del panel («Reportes › Total de ventas», columna
// Costo) para las 8 empresas × may–ago 2026.
//
// Qué hace: por empresa, `/autenticacion` + `GET /apireporte/totalventas?tipo=04`
// (el AÑO en curso por mes, con `total, costo, utilidad` — el mismo reporte
// del panel visto por mes; `tipo=03` es el que llena `switch_costo_diario`).
// Imprime costo por mes. No escribe nada.
//
// ⚠️ Abre UNA sesión de API por empresa con el usuario de Daniel: expulsa a
// quien esté en el panel de esa empresa. Correrlo fuera del horario de oficina
// y lejos de los crons de Switch (ver la tabla de CLAUDE.md).
//
//   npx tsx scripts/_diag-costo-nd-panel.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolveSwitchEnvKey } from "../src/lib/switch-api/empresas";

// `.env.local` a mano: `-r dotenv/config` no siempre corre antes de los imports ESM.
for (const cruda of readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8").split("\n")) {
  const l = cruda.trim();
  if (!l || l.startsWith("#")) continue;
  const i = l.indexOf("=");
  if (i < 0) continue;
  const k = l.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = l.slice(i + 1).trim();
}

const EMPRESAS = (process.env.EMPRESAS?.split(",") ?? [
  "vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep",
  "confecciones_boston", "american_classic",
]);

function parseAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function reporteAnual(empresaKey: string) {
  const upper = resolveSwitchEnvKey(empresaKey);
  const url = (process.env[`SWITCH_${upper}_API_URL`] ?? "").replace(/\/+$/, "");
  // Las credenciales del API JSON viven solo en Vercel (marcadas sensibles: no
  // se pueden bajar). El API entra con el MISMO usuario que el panel web
  // (`client.ts`, encabezado), así que se prueba con las credenciales web.
  const usuario = process.env[`SWITCH_${upper}_API_USER`] ?? process.env[`SWITCH_${upper}_WEB_USER`]?.replace(/^"|"$/g, "");
  const password = process.env[`SWITCH_${upper}_API_PASSWORD`] ?? process.env[`SWITCH_${upper}_WEB_PASSWORD`]?.replace(/^"|"$/g, "");
  if (!url || !usuario || !password) throw new Error(`faltan env vars de ${empresaKey}`);

  const auth = await fetch(`${url}/autenticacion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ usuario, password }),
  });
  const authJson = (await auth.json()) as { data?: { token?: string } };
  const token = authJson.data?.token;
  if (!token) throw new Error(`${empresaKey}: auth sin token (${auth.status})`);

  const r = await fetch(`${url}/apireporte/totalventas?tipo=04`, {
    headers: { Accept: "application/json", Authorization: token },
  });
  const json = (await r.json()) as {
    data?: { totales?: Record<string, { total: unknown; costo: unknown; utilidad: unknown; etiqueta: unknown; fecha?: unknown }> };
  };
  const totales = json.data?.totales ?? {};
  return Object.entries(totales).map(([k, v]) => ({
    clave: k,
    etiqueta: String(v.etiqueta ?? ""),
    fecha: v.fecha == null ? "" : String(v.fecha),
    venta: parseAmount(v.total),
    costo: parseAmount(v.costo),
    utilidad: parseAmount(v.utilidad),
  }));
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const salida: Array<{ empresa: string; clave: string; etiqueta: string; fecha: string; venta: number; costo: number; utilidad: number }> = [];
  for (const e of EMPRESAS) {
    try {
      const filas = await reporteAnual(e);
      for (const f of filas) salida.push({ empresa: e, ...f });
      console.log(`\n${e}`);
      for (const f of filas) console.log(`  ${f.clave.padStart(2)} ${f.etiqueta.padEnd(4)} ${f.fecha.padEnd(12)} venta ${fmt(f.venta).padStart(14)}  costo ${fmt(f.costo).padStart(14)}  utilidad ${fmt(f.utilidad).padStart(14)}`);
    } catch (err) {
      console.log(`\n${e}: ERROR ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log("\nJSON:");
  console.log(JSON.stringify(salida));
}

main().catch((e) => { console.error(e); process.exit(1); });
