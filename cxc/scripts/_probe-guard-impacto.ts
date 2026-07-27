/**
 * SOLO LECTURA. Impacto EXACTO del guard de mostrador (cliente_codigo='TCKCTA')
 * sobre es_retencion y sobre el "último pago" del CXC.
 *
 * Re-clasifica la ventana del cron offline con el mapa de impuestos PAGINADO,
 * con y sin el guard, y compara contra lo guardado hoy.
 */
import fs from "node:fs";
function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}
const RET_WINDOW_MS = 35 * 864e5;
const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
type Recibo = { id: string; fecha: string | null; fecha_creacion: string | null; cliente_switch_id: number | null; cliente_codigo: string | null; cliente_nombre: string | null; total: unknown; es_retencion: boolean };

async function main() {
  cargarEnv();
  const { supabaseServer } = await import("../src/lib/supabase-server");
  const sync = await import("../src/lib/switch-api/sync-recibos");
  const { fechaPanamaDe } = await import("../src/lib/fecha-panama");

  const meses = sync.mesesCronRecibos();
  const sorted = [...meses].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  const f0 = sorted[0], lN = sorted[sorted.length - 1];
  const winFrom = new Date(Date.UTC(f0.year, f0.month - 1, 1) - RET_WINDOW_MS).toISOString().slice(0, 10);
  const ny = lN.month === 12 ? lN.year + 1 : lN.year, nm = lN.month === 12 ? 1 : lN.month + 1;
  const winTo = `${ny}-${String(nm).padStart(2, "0")}-01`;
  const mesInicio = `${f0.year}-${String(f0.month).padStart(2, "0")}-01`;
  console.log(`ventana del cron: ${mesInicio} → ${winTo} (excl)\n`);

  const leerRecibos = async (e: string): Promise<Recibo[]> => {
    const out: Recibo[] = []; let esperadas: number | null = null;
    for (let p = 0; p < 1000; p++) {
      const { data, error, count } = await supabaseServer.from("switch_recibos")
        .select("id,fecha,fecha_creacion,cliente_switch_id,cliente_codigo,cliente_nombre,total,es_retencion", p === 0 ? { count: "exact" } : {})
        .eq("empresa_key", e).order("id", { ascending: true }).range(p * 1000, p * 1000 + 999);
      if (error) throw new Error(error.message);
      if (p === 0) esperadas = count ?? null;
      const lote = (data ?? []) as unknown as Recibo[]; out.push(...lote);
      if (lote.length < 1000) break;
      if (esperadas != null && out.length >= esperadas) break;
    }
    if (esperadas == null || out.length !== esperadas) throw new Error(`lectura incompleta ${e}: ${out.length} vs ${esperadas}`);
    return out;
  };

  const ultimoPago = (recibos: Recibo[], ret: (r: Recibo) => boolean) => {
    const best = new Map<number, Recibo>();
    for (const r of recibos) {
      if (!r.fecha || ret(r)) continue;
      const k = r.cliente_switch_id; if (k == null) continue;
      const prev = best.get(k);
      if (!prev || (r.fecha_creacion ?? "") > (prev.fecha_creacion ?? "")) best.set(k, r);
    }
    return best;
  };

  let totalFlips = 0, totalUP = 0;
  for (const e of sync.RECIBOS_EMPRESA_KEYS) {
    const map = await sync.loadImpuestoMap(e as never, winFrom, winTo);
    const recibos = await leerRecibos(e);
    const enVentana = (r: Recibo) => r.fecha != null && r.fecha >= mesInicio && r.fecha < winTo;
    const ventana = recibos.filter(enVentana);

    const heur = (r: Recibo) => {
      const cid = r.cliente_switch_id; if (cid == null || !r.fecha) return false;
      const list = map.get(cid); if (!list) return false;
      const rf = Date.parse(r.fecha), t = num(r.total);
      return list.some((f) => Math.abs(rf - Date.parse(f.fecha)) <= RET_WINDOW_MS && Math.abs(t - f.imp / 2) <= 0.01);
    };
    const mostrador = (r: Recibo) => (r.cliente_codigo ?? "").trim().toUpperCase() === "TCKCTA";
    const sinGuard = new Map(ventana.map((r) => [r.id, heur(r)]));
    const conGuard = new Map(ventana.map((r) => [r.id, !mostrador(r) && heur(r)]));

    const nSin = ventana.filter((r) => sinGuard.get(r.id)).length;
    const nCon = ventana.filter((r) => conGuard.get(r.id)).length;
    const guardadas = ventana.filter((r) => r.es_retencion).length;
    // Filas que el guard apaga respecto de la heurística sola
    const apagadas = ventana.filter((r) => sinGuard.get(r.id) && !conGuard.get(r.id));
    // Cambio NETO contra lo que está guardado hoy en la tabla
    const flips = ventana.filter((r) => conGuard.get(r.id) !== r.es_retencion);
    totalFlips += flips.length;

    const hoy = ultimoPago(recibos, (r) => r.es_retencion);
    const desp = ultimoPago(recibos, (r) => (enVentana(r) ? conGuard.get(r.id)! : r.es_retencion));
    const cambiosUP: string[] = [];
    for (const c of new Set([...hoy.keys(), ...desp.keys()])) {
      const a = hoy.get(c), b = desp.get(c);
      const sa = a ? `${a.fecha} $${num(a.total).toFixed(2)}` : "—";
      const sb = b ? `${b.fecha} $${num(b.total).toFixed(2)}` : "—";
      if (sa !== sb) cambiosUP.push(`      cli ${c} "${a?.cliente_nombre ?? b?.cliente_nombre}": ${sa} → ${sb}`);
    }
    totalUP += cambiosUP.length;

    console.log(`── ${e}`);
    console.log(`   en ventana: ${ventana.length} recibos · es_retencion guardado hoy: ${guardadas}`);
    console.log(`   heurística sola (paginada): ${nSin}   ·   con guard TCKCTA: ${nCon}   ·   apaga ${apagadas.length}`);
    console.log(`   CAMBIO NETO vs tabla actual: ${flips.length === 0 ? "✅ ninguno" : `🔴 ${flips.length}`}`);
    for (const r of flips.slice(0, 12))
      console.log(`      ${r.fecha} ${r.cliente_codigo}/${r.cliente_nombre} $${num(r.total).toFixed(2)}: ${r.es_retencion} → ${conGuard.get(r.id)}`);
    console.log(`   último pago: ${cambiosUP.length === 0 ? "✅ ninguno cambia" : `🔴 ${cambiosUP.length} cambian`}`);
    for (const l of cambiosUP.slice(0, 10)) console.log(l);
    console.log("");
  }
  console.log("═══ TOTAL ═══");
  console.log(`recibos que cambian es_retencion: ${totalFlips}`);
  console.log(`clientes cuyo último pago cambia: ${totalUP}`);
}
main().catch((e) => { console.error("FALLO:", e); process.exit(1); });
