/**
 * SOLO LECTURA — DB, sin tocar Switch, sin escribir una sola fila.
 *
 * Mide el impacto real de paginar `loadImpuestoMap()`. La pregunta que responde
 * es la única que importa antes de mergear: ¿cambia HOY algún `es_retencion`, y
 * por lo tanto algún "último pago" del CXC?
 *
 *   npx tsx scripts/_diag-impuesto-truncado.ts
 *
 * Cómo: `es_retencion` es una función pura de (cliente, fecha, total, mapa de
 * impuestos). Los tres primeros ya están guardados en switch_recibos, así que se
 * puede RE-CLASIFICAR la ventana entera offline con los dos mapas —el truncado
 * de antes y el paginado de ahora— sin pedirle nada a Switch ni escribir nada.
 *
 * El "último pago" se recalcula replicando la vista switch_ultimo_pago_cliente_v2
 * (DISTINCT ON (empresa, cliente) ... WHERE es_retencion = false ORDER BY
 * fecha_creacion DESC) sobre la historia COMPLETA de recibos, con el flag de la
 * ventana sustituido por el re-clasificado. Fuera de la ventana el sync no
 * escribe, así que ese tramo queda tal cual está en la tabla.
 */
import fs from "node:fs";

function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}

type Recibo = {
  id: string;
  fecha: string | null;
  fecha_creacion: string | null;
  cliente_switch_id: number | null;
  cliente_codigo: string | null;
  total: unknown;
  es_retencion: boolean;
};

const RET_WINDOW_MS = 35 * 864e5;
const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

async function main() {
  cargarEnv();
  const { supabaseServer } = await import("../src/lib/supabase-server");
  const sync = await import("../src/lib/switch-api/sync-recibos");
  const { fechaPanamaDe } = await import("../src/lib/fecha-panama");

  type ImpuestoMap = Map<number, { fecha: string; imp: number }[]>;

  /** La lectura VIEJA, tal cual estaba: un solo select con .range(0, 99999). */
  async function mapaTruncado(empresaKey: string, from: string, toExcl: string) {
    const { data, error } = await supabaseServer
      .from("switch_facturas")
      .select("cliente_switch_id,fecha,impuesto")
      .eq("empresa_key", empresaKey)
      .eq("tipo_comprobante", "Factura")
      .gte("fecha", `${from}T00:00:00-05:00`)
      .lt("fecha", `${toExcl}T00:00:00-05:00`)
      .range(0, 99999);
    if (error) throw new Error(error.message);
    const map: ImpuestoMap = new Map();
    for (const f of (data ?? []) as { cliente_switch_id: number | null; fecha: string; impuesto: unknown }[]) {
      const k = f.cliente_switch_id;
      if (k == null) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ fecha: fechaPanamaDe(String(f.fecha)), imp: num(f.impuesto) });
    }
    return { map, filas: (data ?? []).length };
  }

  async function countFacturas(empresaKey: string, from: string, toExcl: string) {
    const { count, error } = await supabaseServer
      .from("switch_facturas")
      .select("id", { count: "exact", head: true })
      .eq("empresa_key", empresaKey)
      .eq("tipo_comprobante", "Factura")
      .gte("fecha", `${from}T00:00:00-05:00`)
      .lt("fecha", `${toExcl}T00:00:00-05:00`);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  function esRetencion(cliId: number | null, fecha: string | null, total: number, map: ImpuestoMap) {
    if (cliId == null || !fecha) return false;
    const list = map.get(cliId);
    if (!list) return false;
    const rf = Date.parse(fecha);
    return list.some((f) => {
      const ff = Date.parse(f.fecha);
      return Math.abs(rf - ff) <= RET_WINDOW_MS && Math.abs(total - f.imp / 2) <= 0.01;
    });
  }

  /** Lee TODOS los recibos de una empresa, paginando de verdad. */
  async function todosLosRecibos(empresaKey: string): Promise<Recibo[]> {
    const out: Recibo[] = [];
    let esperadas: number | null = null;
    for (let p = 0; p < 1000; p += 1) {
      const desde = p * 1000;
      const { data, error, count } = await supabaseServer
        .from("switch_recibos")
        .select("id,fecha,fecha_creacion,cliente_switch_id,cliente_codigo,total,es_retencion", p === 0 ? { count: "exact" } : {})
        .eq("empresa_key", empresaKey)
        .order("id", { ascending: true })
        .range(desde, desde + 999);
      if (error) throw new Error(error.message);
      if (p === 0) esperadas = count ?? null;
      const lote = (data ?? []) as unknown as Recibo[];
      out.push(...lote);
      if (lote.length < 1000) break;
      if (esperadas != null && out.length >= esperadas) break;
    }
    if (esperadas == null || out.length !== esperadas) {
      throw new Error(`lectura incompleta de switch_recibos ${empresaKey}: ${out.length} vs ${esperadas}`);
    }
    return out;
  }

  /** Replica switch_ultimo_pago_cliente_v2 sobre un arreglo de recibos. */
  function ultimoPago(recibos: Recibo[], flag: (r: Recibo) => boolean) {
    const best = new Map<number, Recibo>();
    for (const r of recibos) {
      if (!r.fecha || flag(r)) continue;
      const k = r.cliente_switch_id;
      if (k == null) continue;
      const prev = best.get(k);
      const key = (x: Recibo) => x.fecha_creacion ?? "";
      if (!prev || key(r) > key(prev)) best.set(k, r);
    }
    return best;
  }

  const meses = sync.mesesCronRecibos();
  const sorted = [...meses].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  const f0 = sorted[0];
  const lN = sorted[sorted.length - 1];
  const winFrom = new Date(Date.UTC(f0.year, f0.month - 1, 1) - RET_WINDOW_MS).toISOString().slice(0, 10);
  const ny = lN.month === 12 ? lN.year + 1 : lN.year;
  const nm = lN.month === 12 ? 1 : lN.month + 1;
  const winTo = `${ny}-${String(nm).padStart(2, "0")}-01`;
  const mesInicio = `${f0.year}-${String(f0.month).padStart(2, "0")}-01`;
  const mesFinExcl = winTo;

  console.log(`ventana del cron: ${meses.map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`).join(", ")}`);
  console.log(`mapa de impuestos: facturas de ${winFrom} (incl) a ${winTo} (excl)\n`);

  let totalCambios = 0;
  let totalUltimoPagoCambios = 0;

  for (const empresaKey of sync.RECIBOS_EMPRESA_KEYS) {
    const exact = await countFacturas(empresaKey, winFrom, winTo);
    const { map: mapVieja, filas: leidasViejas } = await mapaTruncado(empresaKey, winFrom, winTo);
    const mapNueva = await sync.loadImpuestoMap(empresaKey as never, winFrom, winTo);
    const truncada = leidasViejas < exact;

    const recibos = await todosLosRecibos(empresaKey);
    const enVentana = (r: Recibo) => r.fecha != null && r.fecha >= mesInicio && r.fecha < mesFinExcl;
    const ventana = recibos.filter(enVentana);

    const clasVieja = new Map<string, boolean>();
    const clasNueva = new Map<string, boolean>();
    for (const r of ventana) {
      const t = num(r.total);
      clasVieja.set(r.id, esRetencion(r.cliente_switch_id, r.fecha, t, mapVieja));
      clasNueva.set(r.id, esRetencion(r.cliente_switch_id, r.fecha, t, mapNueva));
    }

    const guardadasTrue = ventana.filter((r) => r.es_retencion).length;
    const viejasTrue = ventana.filter((r) => clasVieja.get(r.id)).length;
    const nuevasTrue = ventana.filter((r) => clasNueva.get(r.id)).length;
    const histTrue = recibos.filter((r) => r.es_retencion).length;

    const difieren = ventana.filter((r) => clasVieja.get(r.id) !== clasNueva.get(r.id));
    const difierenVsGuardado = ventana.filter((r) => clasNueva.get(r.id) !== r.es_retencion);
    totalCambios += difieren.length;

    // Último pago: HOY (flag guardado) vs DESPUÉS (flag re-clasificado en la ventana).
    const hoy = ultimoPago(recibos, (r) => r.es_retencion);
    const despues = ultimoPago(recibos, (r) => (enVentana(r) ? clasNueva.get(r.id)! : r.es_retencion));
    const clientes = new Set([...hoy.keys(), ...despues.keys()]);
    const cambiosUP: string[] = [];
    for (const c of clientes) {
      const a = hoy.get(c);
      const b = despues.get(c);
      const sa = a ? `${a.fecha} $${num(a.total).toFixed(2)}` : "—";
      const sb = b ? `${b.fecha} $${num(b.total).toFixed(2)}` : "—";
      if (sa !== sb) cambiosUP.push(`      cliente ${c} (${a?.cliente_codigo ?? b?.cliente_codigo}): ${sa} → ${sb}`);
    }
    totalUltimoPagoCambios += cambiosUP.length;

    console.log(`── ${empresaKey}`);
    console.log(
      `   facturas en ventana: ${exact} reales · lectura VIEJA trajo ${leidasViejas}` +
        `${truncada ? `  🔴 TRUNCADA (faltaban ${exact - leidasViejas})` : "  ✅ completa"}` +
        ` · lectura NUEVA verificada contra el COUNT (${exact})`,
    );
    console.log(
      `   recibos: ${recibos.length} en total (${ventana.length} en la ventana) · es_retencion=true: ${histTrue} histórico, ${guardadasTrue} en ventana`,
    );
    console.log(
      `   es_retencion recalculado en la ventana → ANTES(truncado)=${viejasTrue}  DESPUÉS(paginado)=${nuevasTrue}` +
        `  ${difieren.length === 0 ? "✅ sin cambios" : `🔴 ${difieren.length} CAMBIAN`}`,
    );
    if (difierenVsGuardado.length > 0) {
      console.log(`   ⚠️  ${difierenVsGuardado.length} recibos donde el flag NUEVO difiere del guardado hoy en la tabla:`);
      for (const r of difierenVsGuardado.slice(0, 20)) {
        console.log(`      ${r.id} ${r.fecha} cli=${r.cliente_switch_id} $${num(r.total).toFixed(2)}: guardado=${r.es_retencion} → nuevo=${clasNueva.get(r.id)}`);
      }
    }
    console.log(`   último pago por cliente: ${clientes.size} clientes · ${cambiosUP.length === 0 ? "✅ ninguno cambia" : `🔴 ${cambiosUP.length} CAMBIAN`}`);
    for (const l of cambiosUP.slice(0, 20)) console.log(l);
    console.log("");
  }

  console.log("═══ VEREDICTO ═══");
  console.log(`recibos cuyo es_retencion cambia al paginar: ${totalCambios}`);
  console.log(`clientes cuyo "último pago" cambia:          ${totalUltimoPagoCambios}`);
  console.log(totalCambios === 0 && totalUltimoPagoCambios === 0 ? "✅ NADA CAMBIA HOY" : "🔴 HAY CAMBIOS — revisar uno por uno antes de mergear");
}

main().catch((e) => {
  console.error("FALLO:", e);
  process.exit(1);
});
