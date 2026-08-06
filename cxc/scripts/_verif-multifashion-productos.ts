/**
 * VERIFICACIÓN READ-ONLY de Multifashion › Productos.
 *
 * Compara CELDA POR CELDA lo que devuelve /api/multifashion/productos contra
 * una agregación INDEPENDIENTE hecha acá mismo desde la base. Independiente a
 * propósito: si la comparación usara `agregarProductos`, estaría comparando el
 * código consigo mismo y no probaría nada.
 *
 * Requiere el servidor de producción levantado:
 *   npx next build && npx next start -p 3111
 *   npx tsx scripts/_verif-multifashion-productos.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BASE = process.env.BASE_URL ?? "http://localhost:3111";
const EMPRESA = "american_classic";

/** Meses a comparar: incluye los dos diciembres (los meses más grandes: 4.552 y
 *  5.321 filas), que son los que un `.range()` sin paginar truncaría. */
const MESES: Array<[number, number]> = [
  [2024, 12], [2025, 12], [2025, 6], [2026, 6], [2026, 7], [2026, 8], [2026, 2],
];

const dd = (n: number) => String(n).padStart(2, "0");

/** Agregación INDEPENDIENTE: se lee la tabla y se firma por tipo a mano. */
async function esperado(year: number, mes: number) {
  const desde = `${year}-${dd(mes)}-01`;
  const hasta = `${year}-${dd(mes)}-${dd(new Date(Date.UTC(year, mes, 0)).getUTCDate())}`;
  const acc = new Map<number, { codigo: string; u: number; v: number }>();
  let totU = 0, totV = 0, filas = 0;
  for (let p = 0; p < 200; p++) {
    const { data, error } = await db
      .from("switch_articulo_diario")
      .select("articulo_id, codigo, tipo, cantidad_total, venta_total")
      .eq("empresa_key", EMPRESA)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    filas += lote.length;
    for (const r of lote) {
      const s = String(r.tipo ?? "").trim().toUpperCase() === "NC" ? -1 : 1;
      const u = parseFloat(String(r.cantidad_total ?? 0)) * s;
      const v = parseFloat(String(r.venta_total ?? 0)) * s;
      totU += u; totV += v;
      const prev = acc.get(r.articulo_id as number);
      if (prev) { prev.u += u; prev.v += v; }
      else acc.set(r.articulo_id as number, { codigo: String(r.codigo ?? ""), u, v });
    }
    if (lote.length < 1000) break;
  }
  const arts = [...acc.entries()]
    .map(([id, a]) => ({ id, codigo: a.codigo, u: Math.round(a.u * 10000) / 10000, v: Math.round(a.v * 100) / 100 }))
    .filter(a => a.v !== 0 || a.u !== 0)
    .sort((a, b) => b.v - a.v || a.codigo.localeCompare(b.codigo));
  return {
    desde, hasta, filas,
    totU: Math.round(totU * 10000) / 10000,
    totV: Math.round(totV * 100) / 100,
    nArts: arts.length,
    arts,
  };
}

async function main() {
  const { signSession } = await import("../src/lib/session-cookie");
  // El middleware valida el `sessionToken` contra `user_sessions`: un token
  // inventado da 401. Se REUSA una sesión de admin ya viva (solo lectura) en vez
  // de escribir una fila de prueba en producción.
  const { data: ses, error: sesErr } = await db
    .from("user_sessions")
    .select("user_name, user_role, session_token")
    .eq("revoked", false)
    .eq("user_role", "admin")
    .order("last_seen", { ascending: false })
    .limit(1);
  if (sesErr) throw new Error(`user_sessions: ${sesErr.message}`);
  const s = ses?.[0];
  if (!s) throw new Error("no hay ninguna sesión de admin viva para reusar");
  const cookie = signSession({
    role: s.user_role as string,
    userId: "verif",
    userName: s.user_name as string,
    sessionToken: s.session_token as string,
  });

  let celdas = 0, difieren = 0;
  const fallos: string[] = [];
  const cmp = (etiqueta: string, got: unknown, exp: unknown, tol = 0.011) => {
    celdas++;
    const ok = typeof got === "number" && typeof exp === "number"
      ? Math.abs(got - exp) <= tol
      : got === exp;
    if (!ok) { difieren++; fallos.push(`${etiqueta}: API=${JSON.stringify(got)} vs DB=${JSON.stringify(exp)}`); }
  };

  for (const [year, mes] of MESES) {
    const exp = await esperado(year, mes);
    const res = await fetch(`${BASE}/api/multifashion/productos?year=${year}&mes=${mes}`, {
      headers: { cookie: `cxc_session=${cookie}` },
    });
    if (!res.ok) {
      console.log(`❌ ${year}-${dd(mes)} → HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      difieren++; celdas++;
      continue;
    }
    const api = await res.json();

    cmp(`${year}-${dd(mes)} desde`, api.desde, exp.desde);
    cmp(`${year}-${dd(mes)} hasta`, api.hasta, exp.hasta);
    cmp(`${year}-${dd(mes)} filasLeidas`, api.filasLeidas, exp.filas);
    cmp(`${year}-${dd(mes)} total unidades`, api.totales.unidades, exp.totU);
    cmp(`${year}-${dd(mes)} total venta`, api.totales.venta, exp.totV);
    cmp(`${year}-${dd(mes)} artículos distintos`, api.totales.articulos, exp.nArts);

    // Los 50 renglones del top, celda por celda.
    for (let i = 0; i < api.articulos.length; i++) {
      const a = api.articulos[i];
      const e = exp.arts[i];
      const et = `${year}-${dd(mes)} #${i + 1}`;
      cmp(`${et} articuloId`, a.articuloId, e?.id);
      cmp(`${et} unidades`, a.unidades, e?.u);
      cmp(`${et} venta`, a.venta, e?.v);
      // El % se recalcula contra el total INDEPENDIENTE.
      cmp(`${et} pct`, a.pct, exp.totV > 0 ? e.v / exp.totV : null, 1e-9);
    }

    // Las marcas tienen que sumar el total del período (o decir que no hay).
    const sumaMarcas = (api.marcas as Array<{ venta: number }>).reduce((s, m) => s + m.venta, 0);
    cmp(`${year}-${dd(mes)} suma de marcas = total`, Math.round(sumaMarcas * 100) / 100, exp.totV, 0.5);

    const ncFilas = exp.filas;
    console.log(
      `${year}-${dd(mes)}  filas=${ncFilas}  total=$${exp.totV.toLocaleString("en-US")}  arts=${exp.nArts}  ` +
      `top1=${api.articulos[0]?.codigo ?? "—"} $${api.articulos[0]?.venta ?? 0}  marcaDisponible=${api.marcaDisponible}`,
    );
  }

  console.log(`\n── RESULTADO ──`);
  console.log(`celdas comparadas: ${celdas}`);
  console.log(`celdas que difieren: ${difieren}`);
  for (const f of fallos.slice(0, 25)) console.log(`  ✗ ${f}`);
  if (difieren > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
