/**
 * ANTES/DESPUÉS de `STOCK_CONCURRENCIA` — los 4 catálogos, CONTRA PRODUCCIÓN.
 *
 * Mide lo mismo que `_verif-produccion-sync-paralelo.ts` (PR #541) pero para las
 * CUATRO marcas: dispara el cron REAL en Vercel y lee la duración que queda
 * registrada en `switch_sync_log` — la misma fuente de la que salen las medianas
 * de referencia. Este script NO sincroniza nada por su cuenta: solo LEE Supabase
 * y le pega al endpoint de producción, así que todo el trabajo contra Switch lo
 * hace Vercel con UNA sesión, como cualquier cron.
 *
 * Y hace la pregunta que de verdad importa: **¿el dato quedó igual?** Saca foto
 * de las 5 tablas (los 4 catálogos + el inventario de Reebok) ANTES y DESPUÉS y
 * las compara fila por fila y campo por campo, por llave. La foto se guarda en
 * disco para poder comparar TAMBIÉN entre etapas (antes-de-todo vs después-de-
 * todo), que es lo único que prueba que la foto de un producto no se movió.
 *
 * ⚠️ SESIÓN ÚNICA POR EMPRESA. Mirar el calendario de crons antes de correr:
 * reebok→active_shoes (12:10, 17:00) · joybees→joystep (11:00, 17:05) ·
 * tommy→fashion_shoes (12:40, 17:40) · calvin→vistana (12:50, 16:40), más las
 * pasadas de `facturas` (11:50/15/19/23) y `estadocuenta` (16:0x y 21:1x).
 * La franja 01:00-04:00 UTC está libre para las cuatro.
 *
 *   ETAPA=antes  DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-stock-concurrencia.ts
 *   ETAPA=despues DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-stock-concurrencia.ts
 *   MARCAS=tommy,calvin  → acota a esas marcas
 *   VUELTAS=2            → repite la tanda (para tener mediana)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = process.env.PROD_URL ?? "https://www.fashiongr.com";
const ETAPA = process.env.ETAPA ?? "antes";
const VUELTAS = Number(process.env.VUELTAS ?? 1);
const DIR = process.env.OUT ?? "/tmp/stock-concurrencia";

const RELOJ = new Set(["synced_at", "updated_at", "created_at", "last_synced_at"]);

/**
 * Campos que el sync EXISTE para mover: si cambian, es que la realidad cambió en
 * Switch. Todo lo demás es IDENTIDAD y NO puede cambiar — `image_url` es el que
 * más duele, y por eso está fuera de esta lista a propósito.
 */
const MOVIMIENTO_LEGITIMO = new Set([
  "existencia", "disponibilidad", "stock", "price", "active", "quantity",
]);

type Fila = Record<string, unknown>;

interface Marca {
  key: string;
  cron: string;
  syncType: string;
  empresa: string;
  tablas: { tabla: string; llave: string; db: () => Promise<SupabaseClient>; orden: string }[];
}

const server = async () => supabaseServer;
const reebok = async () => (await import("../src/lib/reebok-supabase-server")).reebokServer;
const joybees = async () => (await import("../src/lib/joybees-supabase-server")).joybeesServer;
const tommy = async () => (await import("../src/lib/tommy-supabase-server")).tommyServer;
const calvin = async () => (await import("../src/lib/calvin-supabase-server")).calvinServer;
void server;

const MARCAS: Marca[] = [
  {
    key: "joybees", cron: "/api/cron/joybees-catalogo", syncType: "catalogo_joybees", empresa: "joystep",
    tablas: [{ tabla: "joybees_products", llave: "sku", db: joybees, orden: "sku" }],
  },
  {
    key: "reebok", cron: "/api/cron/reebok-catalogo", syncType: "catalogo_reebok", empresa: "active_shoes",
    tablas: [
      { tabla: "products", llave: "sku", db: reebok, orden: "sku" },
      { tabla: "inventory", llave: "id", db: reebok, orden: "id" },
    ],
  },
  {
    key: "calvin", cron: "/api/cron/calvin-catalogo", syncType: "catalogo_calvin", empresa: "vistana",
    tablas: [{ tabla: "calvin_products", llave: "sku", db: calvin, orden: "sku" }],
  },
  {
    key: "tommy", cron: "/api/cron/tommy-catalogo", syncType: "catalogo_tommy", empresa: "fashion_shoes",
    tablas: [{ tabla: "tommy_products", llave: "sku", db: tommy, orden: "sku" }],
  },
];

async function foto(t: Marca["tablas"][number]): Promise<Fila[]> {
  const db = await t.db();
  return (await leerTodoPaginado<Fila>(t.tabla, (pedirCount, desde, hasta) =>
    db
      .from(t.tabla)
      .select("*", pedirCount ? { count: "exact" } : undefined)
      .order(t.orden)
      .range(desde, hasta),
  )) as Fila[];
}

function comparar(antes: Fila[], despues: Fila[], llave: string, etiqueta: string) {
  const det: string[] = [];
  const A = new Map(antes.map((f) => [String(f[llave]), f]));
  const D = new Map(despues.map((f) => [String(f[llave]), f]));
  if (A.size !== D.size) det.push(`${etiqueta}: ${A.size} filas antes vs ${D.size} después`);
  let campos = 0;
  let movimiento = 0;
  const identidad: string[] = [];
  for (const [k, a] of A) {
    const d = D.get(k);
    if (!d) { identidad.push(`${etiqueta} ${k}: DESAPARECIÓ`); continue; }
    for (const col of Object.keys(a)) {
      if (RELOJ.has(col)) continue;
      campos++;
      if (JSON.stringify(a[col]) !== JSON.stringify(d[col])) {
        const linea = `${etiqueta} ${k}.${col}: ${JSON.stringify(a[col])} → ${JSON.stringify(d[col])}`;
        if (MOVIMIENTO_LEGITIMO.has(col)) { movimiento++; det.push(`🟡 ${linea}`); }
        else identidad.push(`🔴 IDENTIDAD ${linea}`);
      }
    }
  }
  for (const k of D.keys()) if (!A.has(k)) identidad.push(`${etiqueta} ${k}: APARECIÓ`);
  const fotos = antes.filter((f) => f.image_url).length;
  return { filas: A.size, campos, movimiento, identidad, det, fotos };
}

async function ultimaCorrida(m: Marca, desdeIso: string) {
  const { data } = await supabaseServer
    .from("switch_sync_log")
    .select("status, started_at, finished_at, records_inserted, records_updated, records_skipped, error_message, skip_details")
    .eq("empresa_key", m.empresa)
    .eq("sync_type", m.syncType)
    .gte("started_at", desdeIso)
    .order("started_at", { ascending: false })
    .limit(1);
  const r = data?.[0];
  if (!r) return null;
  const s = r.finished_at ? (+new Date(r.finished_at) - +new Date(r.started_at)) / 1000 : null;
  // Contadores de escritura del #549 (viajan en skip_details, sin DDL): cuántos
  // UPDATE se hicieron de verdad y cuántos se ahorraron por ya estar iguales.
  const det = Array.isArray(r.skip_details)
    ? (r.skip_details as Array<{ campo?: string; valorCrudo?: Record<string, number> }>).find(
        (d) => d?.campo === "catalogo_escrituras",
      )?.valorCrudo
    : undefined;
  return { ...r, segundos: s, escrituras: det?.escrituras, sinCambios: det?.sinCambios };
}

async function dispararCron(path: string) {
  const t = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: "no-store",
  });
  const txt = await res.text();
  return { status: res.status, txt: txt.slice(0, 400), pared: (Date.now() - t) / 1000 };
}

async function main() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const pedidas = (process.env.MARCAS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const marcas = pedidas.length ? MARCAS.filter((m) => pedidas.includes(m.key)) : MARCAS;

  console.log(`\n════ STOCK_CONCURRENCIA · ETAPA=${ETAPA} · ${BASE} ════`);
  console.log(`   ${new Date().toISOString()}   marcas: ${marcas.map((m) => m.key).join(", ")}\n`);

  const resumen: Record<string, number[]> = {};
  let identidadRota = 0;

  for (let v = 1; v <= VUELTAS; v++) {
    if (VUELTAS > 1) console.log(`\n──────── vuelta ${v}/${VUELTAS} ────────`);
    for (const m of marcas) {
      console.log(`── ${m.key} (${m.empresa}) ──`);
      const antes = new Map<string, Fila[]>();
      for (const t of m.tablas) antes.set(t.tabla, await foto(t));

      // La foto de la PRIMERA vuelta de la etapa es la que se guarda como
      // referencia entre etapas: es la que prueba que nada se movió de verdad.
      if (v === 1) {
        for (const t of m.tablas) {
          writeFileSync(join(DIR, `${ETAPA}-${t.tabla}.json`), JSON.stringify(antes.get(t.tabla)));
        }
      }

      const t0 = new Date(Date.now() - 30_000).toISOString();
      const r = await dispararCron(m.cron);
      const log = await ultimaCorrida(m, t0);
      const seg = log?.segundos ?? null;
      if (seg != null) (resumen[m.key] ??= []).push(seg);
      console.log(
        `   HTTP ${r.status} · pared ${r.pared.toFixed(1)} s · ⏱️  PRODUCCIÓN ${seg ?? "?"} s · ${log?.status}` +
          ` · ins=${log?.records_inserted} upd=${log?.records_updated} skip=${log?.records_skipped}` +
          (log?.escrituras !== undefined
            ? ` · ✍️ escrituras=${log.escrituras} sinCambios=${log.sinCambios}`
            : "") +
          (log?.error_message ? ` · ⚠️ ${log.error_message}` : ""),
      );
      if (r.status !== 200) console.log(`   respuesta: ${r.txt}`);

      for (const t of m.tablas) {
        const despues = await foto(t);
        const c = comparar(antes.get(t.tabla)!, despues, t.llave, t.tabla);
        identidadRota += c.identidad.length;
        console.log(
          `   ${t.tabla}: ${c.filas} filas · ${c.campos} campos` +
            (t.tabla.includes("product") ? ` · ${c.fotos} con foto` : "") +
            ` → ${c.identidad.length === 0 ? (c.movimiento ? `🟢 identidad intacta (${c.movimiento} campos de movimiento real)` : "🟢 IDÉNTICO") : "🔴 IDENTIDAD ROTA"}`,
        );
        for (const l of c.identidad.slice(0, 10)) console.log(`      ${l}`);
        if (c.movimiento) for (const l of c.det.slice(0, 4)) console.log(`      ${l}`);
        if (v === VUELTAS) writeFileSync(join(DIR, `${ETAPA}-fin-${t.tabla}.json`), JSON.stringify(despues));
      }
      console.log();
    }
  }

  console.log("──────── DURACIONES EN PRODUCCIÓN ────────");
  for (const m of marcas) {
    const xs = resumen[m.key] ?? [];
    if (!xs.length) { console.log(`   ${m.key.padEnd(9)} sin muestras`); continue; }
    const s = [...xs].sort((a, b) => a - b);
    console.log(`   ${m.key.padEnd(9)} ${xs.map((x) => x.toFixed(0) + " s").join(" · ")}   (mediana ${s[Math.floor(s.length / 2)].toFixed(0)} s)`);
  }
  writeFileSync(join(DIR, `${ETAPA}-duraciones.json`), JSON.stringify(resumen, null, 2));

  // ── Comparación ENTRE ETAPAS: la foto de antes-de-todo contra la de ahora ──
  if (ETAPA === "despues") {
    console.log("\n──────── ANTES DE TODO vs DESPUÉS DE TODO (la prueba que importa) ────────");
    for (const m of marcas) {
      for (const t of m.tablas) {
        const p = join(DIR, `antes-${t.tabla}.json`);
        if (!existsSync(p)) { console.log(`   ${t.tabla}: sin foto de la etapa "antes"`); continue; }
        const a = JSON.parse(readFileSync(p, "utf8")) as Fila[];
        const d = JSON.parse(readFileSync(join(DIR, `despues-fin-${t.tabla}.json`), "utf8")) as Fila[];
        const c = comparar(a, d, t.llave, t.tabla);
        identidadRota += c.identidad.length;
        console.log(
          `   ${t.tabla.padEnd(18)} ${String(c.filas).padStart(5)} filas · ${String(c.campos).padStart(6)} campos` +
            (t.tabla.includes("product") ? ` · ${c.fotos} con foto` : "") +
            ` → ${c.identidad.length === 0 ? (c.movimiento ? `🟢 identidad intacta (${c.movimiento} de movimiento real)` : "🟢 IDÉNTICO") : "🔴 IDENTIDAD ROTA"}`,
        );
        for (const l of c.identidad.slice(0, 10)) console.log(`      ${l}`);
        if (c.movimiento) for (const l of c.det.slice(0, 6)) console.log(`      ${l}`);
      }
    }
  }

  console.log(identidadRota === 0 ? "\n🟢 VEREDICTO: ninguna identidad se movió.\n" : `\n🔴 VEREDICTO: ${identidadRota} campos de identidad cambiaron.\n`);
}

main().catch((e) => {
  console.error("FALLÓ:", e?.message ?? e);
  process.exitCode = 1;
});
