/**
 * PRUEBA CONTRA PRODUCCIÓN: el catálogo y el CXC quedan IDÉNTICOS antes y
 * después de correr los syncs ya paralelizados (13-ago-2026).
 *
 * Corre los syncs DE VERDAD (es lo que hace el cron cada día; son idempotentes)
 * y compara la foto de las tablas antes y después, **fila por fila y campo por
 * campo, por LLAVE** — como conjunto no alcanza: dos filas intercambiadas se
 * verían idénticas, y el orden es justo lo que el paralelismo puede romper.
 *
 *   · calvin_products      (catálogo Calvin, empresa vistana)
 *   · switch_estadocuenta  (cartera de vistana)
 *
 * ⚠️ Lo único que puede diferir legítimamente es `synced_at`/`updated_at` — son
 * el reloj de la corrida, no el dato. Se excluyen y se dice cuáles se excluyen.
 *
 * ⚠️ SESIÓN ÚNICA. Mirar el calendario de crons: vistana no puede estar
 * sincronizando. Cierra sesión al terminar.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-sync-paralelo-db.ts
 */

import { logoutAllSwitchSessions } from "../src/lib/switch-api/client";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { supabaseServer } from "../src/lib/supabase-server";

const EMPRESA = "vistana";
const seg = (n: number) => (n / 1000).toFixed(1);

/** Columnas que son el RELOJ de la corrida, no el dato. */
const RELOJ = new Set(["synced_at", "updated_at", "created_at"]);

type Fila = Record<string, unknown>;

function comparar(
  antes: Fila[],
  despues: Fila[],
  llave: (f: Fila) => string,
  etiqueta: string,
): { ok: boolean; detalle: string[] } {
  const det: string[] = [];
  const mapA = new Map(antes.map((f) => [llave(f), f]));
  const mapD = new Map(despues.map((f) => [llave(f), f]));
  if (mapA.size !== mapD.size) {
    det.push(`${etiqueta}: ${mapA.size} filas antes vs ${mapD.size} después`);
  }
  let campos = 0;
  for (const [k, a] of mapA) {
    const d = mapD.get(k);
    if (!d) {
      det.push(`${etiqueta} ${k}: DESAPARECIÓ`);
      continue;
    }
    for (const col of Object.keys(a)) {
      if (RELOJ.has(col)) continue;
      campos++;
      if (JSON.stringify(a[col]) !== JSON.stringify(d[col])) {
        det.push(`${etiqueta} ${k}.${col}: ${JSON.stringify(a[col])} → ${JSON.stringify(d[col])}`);
      }
    }
  }
  for (const k of mapD.keys()) if (!mapA.has(k)) det.push(`${etiqueta} ${k}: APARECIÓ`);
  console.log(`   ${etiqueta}: ${mapA.size} filas · ${campos} campos comparados`);
  return { ok: det.length === 0, detalle: det.slice(0, 20) };
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

function totalSaldo(filas: Fila[]): string {
  return filas.reduce((s, f) => s + (Number(f.saldo) || 0), 0).toFixed(2);
}

async function main() {
  console.log(`\n════ ${EMPRESA} — el dato no se mueve ════\n`);

  // ── A. Catálogo Calvin ─────────────────────────────────────────────────────
  console.log("── A. catálogo Calvin (calvin_products) ──");
  const antesCat = await fotoCalvin();
  const { syncCatalogoCalvin } = await import("../src/lib/switch-api/sync-catalogo-calvin");
  const t1 = Date.now();
  const rCat = await syncCatalogoCalvin({ triggeredBy: "manual" });
  const msCat = Date.now() - t1;
  const emp = rCat.empresas[0];
  console.log(
    `   sync: ${seg(msCat)} s · ${emp?.switchCount ?? 0} artículos en Switch · ` +
      `${emp?.stockChecks ?? 0} /stock · +${emp?.agregados ?? 0} agregados · ` +
      `${emp?.actualizados ?? 0} actualizados${emp?.error ? ` · ERROR: ${emp.error}` : ""}`,
  );
  const despuesCat = await fotoCalvin();
  const cat = comparar(antesCat, despuesCat, (f) => String(f.sku), "producto");
  console.log(cat.ok ? "   🟢 IDÉNTICO\n" : `   🔴 ${cat.detalle.length} diferencia(s):\n${cat.detalle.map((d) => "      " + d).join("\n")}\n`);

  // ── B. Cartera de vistana ──────────────────────────────────────────────────
  console.log("── B. cartera CXC (switch_estadocuenta) ──");
  const antesCxc = await fotoCartera();
  console.log(`   saldo total ANTES:   ${totalSaldo(antesCxc)}`);
  const { syncEmpresaEstadoCuenta } = await import("../src/lib/switch-api/sync-empresa");
  const hoy = new Date().toISOString().slice(0, 10);
  const t2 = Date.now();
  const rCxc = await syncEmpresaEstadoCuenta(EMPRESA as never, {
    desde: hoy,
    hasta: hoy,
    triggeredBy: "manual",
  });
  const msCxc = Date.now() - t2;
  console.log(
    `   sync: ${seg(msCxc)} s · ins=${rCxc.inserted} upd=${rCxc.updated} skip=${rCxc.skipped}`,
  );
  const despuesCxc = await fotoCartera();
  console.log(`   saldo total DESPUÉS: ${totalSaldo(despuesCxc)}`);
  const cxc = comparar(antesCxc, despuesCxc, (f) => String(f.ccte_id), "documento");
  console.log(cxc.ok ? "   🟢 IDÉNTICO\n" : `   🔴 ${cxc.detalle.length} diferencia(s):\n${cxc.detalle.map((d) => "      " + d).join("\n")}\n`);

  console.log(cat.ok && cxc.ok ? "🟢 VEREDICTO: ni un dato se movió.\n" : "🔴 VEREDICTO: hay diferencias, mirar arriba.\n");
}

main()
  .catch((e) => {
    console.error("FALLÓ:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await logoutAllSwitchSessions();
  });
