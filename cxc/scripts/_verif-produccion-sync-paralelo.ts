/**
 * VERIFICACIÓN CONTRA PRODUCCIÓN del sync paralelizado (13-ago-2026, PR #540).
 *
 * El A/B de antes/después se midió desde una laptop, y ahí cada round-trip a
 * Switch y a Supabase paga latencia de casa. **El número que importa es el de
 * Vercel**, así que acá se dispara el cron REAL en producción y se lee la
 * duración que queda registrada en `switch_sync_log` — la misma fuente de la
 * que salieron las medianas de referencia (calvin 134 s · estadocuenta 109 s).
 *
 * Y se vuelve a hacer la pregunta que de verdad importa: ¿el dato quedó igual?
 * Se saca foto de las tablas ANTES y DESPUÉS y se comparan **fila por fila y
 * campo por campo, por llave**.
 *
 * Este script NO sincroniza nada por su cuenta: solo LEE Supabase y le pega al
 * endpoint de producción. Todo el trabajo contra Switch lo hace Vercel, con UNA
 * sesión, como cualquier cron.
 *
 * ⚠️ Mirar el calendario de crons antes de correr: vistana no puede estar
 * sincronizando (los `estadocuenta` de vistana van 16:10 y 21:10 UTC; el
 * catálogo Calvin 12:50 y 16:40; `facturas` toca las 8 empresas a las 23:00).
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-produccion-sync-paralelo.ts
 */

import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";

const BASE = process.env.PROD_URL ?? "https://www.fashiongr.com";
const EMPRESA = "vistana";
const RELOJ = new Set(["synced_at", "updated_at", "created_at"]);

type Fila = Record<string, unknown>;

/**
 * Campos que el sync EXISTE para mover: si cambian, es que la realidad cambió en
 * Switch (se vendió una caja, se movió un precio) — no que el sync corrompa.
 *
 * 🩸 Hace falta distinguirlos porque esto se corre EN HORA DE OFICINA de Panamá
 * y el inventario se mueve solo: medido el 13-ago-2026, entre las 21:59 y las
 * 22:18 UTC el set de `/stock` de Calvin pasó de 80 artículos a 79 porque uno se
 * quedó sin disponibilidad. Un cambio ahí es el sync HACIENDO SU TRABAJO.
 * Lo que NUNCA puede cambiar es la identidad: sku, nombre, categoría, foto.
 */
const MOVIMIENTO_LEGITIMO = new Set([
  "existencia", "disponibilidad", "stock", "price", "active",
  "saldo", "total", "debito", "credito", "saldo_original", "total_original", "dias",
]);

function comparar(antes: Fila[], despues: Fila[], llave: (f: Fila) => string, etiqueta: string) {
  const det: string[] = [];
  const A = new Map(antes.map((f) => [llave(f), f]));
  const D = new Map(despues.map((f) => [llave(f), f]));
  if (A.size !== D.size) det.push(`${etiqueta}: ${A.size} filas antes vs ${D.size} después`);
  let campos = 0;
  for (const [k, a] of A) {
    const d = D.get(k);
    if (!d) {
      det.push(`${etiqueta} ${k}: DESAPARECIÓ`);
      continue;
    }
    for (const col of Object.keys(a)) {
      if (RELOJ.has(col)) continue;
      campos++;
      if (JSON.stringify(a[col]) !== JSON.stringify(d[col])) {
        const clase = MOVIMIENTO_LEGITIMO.has(col)
          ? "🟡 movimiento real de Switch (el sync haciendo su trabajo)"
          : "🔴 IDENTIDAD — esto NO puede cambiar";
        det.push(`${etiqueta} ${k}.${col}: ${JSON.stringify(a[col])} → ${JSON.stringify(d[col])}   ${clase}`);
      }
    }
  }
  for (const k of D.keys()) if (!A.has(k)) det.push(`${etiqueta} ${k}: APARECIÓ`);
  const identidad = det.filter((d) => d.includes("🔴 IDENTIDAD") || d.includes("DESAPARECIÓ") || d.includes("APARECIÓ") || d.includes("filas antes"));
  console.log(`   ${A.size} filas · ${campos} campos comparados`);
  // El veredicto lo decide la IDENTIDAD. Un cambio de existencia o de precio a
  // las 17:40 de Panamá es exactamente lo que se le pide al sync.
  return { ok: identidad.length === 0, detalle: det.slice(0, 15), soloMovimiento: det.length > 0 && identidad.length === 0 };
}

async function fotoCartera(): Promise<Fila[]> {
  return (await leerTodoPaginado<Fila>("switch_estadocuenta", (pedirCount, desde, hasta) =>
    supabaseServer
      .from("switch_estadocuenta")
      .select(
        "ccte_id, empresa_key, cliente_switch_id, cliente_nombre, cliente_codigo, secuencial, numero_fiscal, tipo_comprobante, abrev, total, saldo, debito, credito, saldo_original, total_original, plazo_credito, dias, fecha_creacion",
        pedirCount ? { count: "exact" } : undefined,
      )
      .eq("empresa_key", EMPRESA)
      .order("ccte_id")
      .range(desde, hasta),
  )) as Fila[];
}

async function fotoCalvin(): Promise<Fila[]> {
  const { calvinServer } = await import("../src/lib/calvin-supabase-server");
  return (await leerTodoPaginado<Fila>("calvin_products", (pedirCount, desde, hasta) =>
    calvinServer
      .from("calvin_products")
      .select(
        "id, sku, name, category, gender, price, active, image_url, badge, keep_visible, existencia, disponibilidad, stock",
        pedirCount ? { count: "exact" } : undefined,
      )
      .order("sku")
      .range(desde, hasta),
  )) as Fila[];
}

const suma = (f: Fila[]) => f.reduce((s, x) => s + (Number(x.saldo) || 0), 0).toFixed(2);

/** Duración REAL que registró Vercel, leída de la misma tabla que da las medianas. */
async function ultimaCorrida(syncType: string, desdeIso: string) {
  const { data } = await supabaseServer
    .from("switch_sync_log")
    .select("status, started_at, finished_at, records_inserted, records_updated, records_skipped, error_message")
    .eq("empresa_key", EMPRESA)
    .eq("sync_type", syncType)
    .gte("started_at", desdeIso)
    .order("started_at", { ascending: false })
    .limit(1);
  const r = data?.[0];
  if (!r) return null;
  const s = r.finished_at
    ? (+new Date(r.finished_at) - +new Date(r.started_at)) / 1000
    : null;
  return { ...r, segundos: s };
}

async function dispararCron(path: string): Promise<number> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: "no-store",
  });
  const txt = await res.text();
  console.log(`   HTTP ${res.status} · ${txt.slice(0, 220)}`);
  return res.status;
}

async function main() {
  console.log(`\n════ VERIFICACIÓN EN PRODUCCIÓN · ${BASE} · ${EMPRESA} ════\n`);
  const t0 = new Date(Date.now() - 60_000).toISOString();

  // ── A. Cartera ─────────────────────────────────────────────────────────────
  console.log("── A. CXC vistana (switch_estadocuenta) ──");
  const antesCxc = await fotoCartera();
  console.log(`   saldo total ANTES:   ${suma(antesCxc)}`);
  await dispararCron(`/api/cron/switch-sync?tipo=estadocuenta&empresas=${EMPRESA}&slot=verif-paralelo`);
  const logCxc = await ultimaCorrida("estadocuenta", t0);
  console.log(
    `   ⏱️  PRODUCCIÓN: ${logCxc?.segundos ?? "?"} s · ${logCxc?.status} · ` +
      `ins=${logCxc?.records_inserted} upd=${logCxc?.records_updated} skip=${logCxc?.records_skipped}` +
      (logCxc?.error_message ? ` · ${logCxc.error_message}` : ""),
  );
  const despuesCxc = await fotoCartera();
  console.log(`   saldo total DESPUÉS: ${suma(despuesCxc)}`);
  const cxc = comparar(antesCxc, despuesCxc, (f) => String(f.ccte_id), "documento");
  console.log(cxc.ok ? (cxc.soloMovimiento ? `   🟢 IDENTIDAD INTACTA (solo movimiento real):\n${cxc.detalle.map((d) => "      " + d).join("\n")}\n` : "   🟢 IDÉNTICO\n") : `   🔴\n${cxc.detalle.map((d) => "      " + d).join("\n")}\n`);

  // ── B. Catálogo Calvin ─────────────────────────────────────────────────────
  console.log("── B. catálogo Calvin (calvin_products) ──");
  const antesCat = await fotoCalvin();
  const t1 = new Date(Date.now() - 30_000).toISOString();
  await dispararCron(`/api/cron/calvin-catalogo`);
  const logCat = await ultimaCorrida("catalogo_calvin", t1);
  console.log(
    `   ⏱️  PRODUCCIÓN: ${logCat?.segundos ?? "?"} s · ${logCat?.status} · ` +
      `ins=${logCat?.records_inserted} upd=${logCat?.records_updated}` +
      (logCat?.error_message ? ` · ${logCat.error_message}` : ""),
  );
  const despuesCat = await fotoCalvin();
  const cat = comparar(antesCat, despuesCat, (f) => String(f.sku), "producto");
  console.log(cat.ok ? (cat.soloMovimiento ? `   🟢 IDENTIDAD INTACTA (solo movimiento real):\n${cat.detalle.map((d) => "      " + d).join("\n")}\n` : "   🟢 IDÉNTICO\n") : `   🔴\n${cat.detalle.map((d) => "      " + d).join("\n")}\n`);

  console.log(cxc.ok && cat.ok ? "🟢 VEREDICTO: producción da los mismos datos.\n" : "🔴 VEREDICTO: hay diferencias.\n");
}

main().catch((e) => {
  console.error("FALLÓ:", e?.message ?? e);
  process.exitCode = 1;
});
