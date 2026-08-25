// SOLO LECTURA. Mide la cartera de Boston y los bordes de la identidad nueva.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });

const EMP = "confecciones_boston";
const PAGINA = 1000;

type Fila = {
  ccte_id: number; secuencial: string | null; fecha_creacion: string | null;
  saldo: number | null; tipo_comprobante: string | null; cliente_switch_id: number | null;
  synced_at: string | null;
};

async function todas(): Promise<Fila[]> {
  const out: Fila[] = [];
  for (let d = 0; d < 200_000; d += PAGINA) {
    const { data, error } = await sb
      .from("switch_estadocuenta")
      .select("ccte_id,secuencial,fecha_creacion,saldo,tipo_comprobante,cliente_switch_id,synced_at")
      .eq("empresa_key", EMP)
      .order("ccte_id")
      .range(d, d + PAGINA - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...(data as Fila[]));
    if (data.length < PAGINA) break;
  }
  return out;
}

const SIGNO: Record<string, -1 | 1> = {
  "Nota de Crédito": -1, Recibo: -1, "Recibo Saldo Anterior": -1,
  Factura: 1, "Nota de Débito": 1, "Saldo Anterior": 1, "Transacción": 1, Tiquete: 1,
};

(async () => {
  const filas = await todas();
  console.log(`TOTAL FILAS Boston en switch_estadocuenta: ${filas.length}`);

  const sinteticas = filas.filter((f) => f.ccte_id >= 10_000_000);
  const nativas = filas.filter((f) => f.ccte_id < 10_000_000);
  console.log(`  sintéticas (ccte_id >= 1e7): ${sinteticas.length}`);
  console.log(`  nativas    (ccte_id <  1e7): ${nativas.length}`);
  console.log(`  nativas con saldo != 0     : ${nativas.filter((f) => Number(f.saldo ?? 0) !== 0).length}`);
  console.log(`  nativas |saldo| máximo      : ${Math.max(0, ...nativas.map((f) => Math.abs(Number(f.saldo ?? 0))))}`);
  const syncNativas = new Set(nativas.map((f) => (f.synced_at ?? "").slice(0, 10)));
  console.log(`  nativas synced_at (fechas) : ${[...syncNativas].sort().join(", ")}`);

  // Cartera con signo aplicado (lo que muestra la pestaña)
  const clientes = new Map<string, number>();
  let t0 = 0, t1 = 0, t2 = 0;
  // buckets por dias no están acá; el total con signo:
  let total = 0;
  for (const f of filas) {
    const s = SIGNO[f.tipo_comprobante ?? ""] ?? 0;
    const v = s * Number(f.saldo ?? 0);
    if (Number(f.saldo ?? 0) === 0) continue;
    total += v;
    const k = String(f.cliente_switch_id ?? "");
    clientes.set(k, (clientes.get(k) ?? 0) + v);
  }
  const conSaldo = [...clientes.values()].filter((v) => Math.abs(v) >= 0.01).length;
  console.log(`\nTOTAL con signo (todas las filas): ${total.toFixed(2)} · clientes ${conSaldo}`);

  // ── Bordes de la identidad nueva ──
  const rango = { minAnio: 9999, maxAnio: 0, sinFecha: 0, maxCorrelativo: 0, maxSerie: 0, malFormato: 0 };
  const nuevaId = new Map<number, string[]>();
  const porSecuencial = new Map<string, Set<string>>();
  for (const f of sinteticas) {
    const m = /^(\d{1,4})-(\d{1,12})$/.exec((f.secuencial ?? "").trim());
    if (!m) { rango.malFormato++; continue; }
    const serie = parseInt(m[1], 10), corr = parseInt(m[2], 10);
    rango.maxSerie = Math.max(rango.maxSerie, serie);
    rango.maxCorrelativo = Math.max(rango.maxCorrelativo, corr);
    if (!f.fecha_creacion) { rango.sinFecha++; continue; }
    const anio = parseInt(f.fecha_creacion.slice(0, 4), 10);
    rango.minAnio = Math.min(rango.minAnio, anio);
    rango.maxAnio = Math.max(rango.maxAnio, anio);
    const nid = serie * 10_000_000 + (anio - 2000) * 100_000 + corr;
    const arr = nuevaId.get(nid) ?? [];
    arr.push(`${f.secuencial}@${f.fecha_creacion}`);
    nuevaId.set(nid, arr);
    const set = porSecuencial.get(f.secuencial!) ?? new Set<string>();
    set.add(f.fecha_creacion);
    porSecuencial.set(f.secuencial!, set);
  }
  console.log(`\nBORDES (solo filas sintéticas, ${sinteticas.length}):`);
  console.log(`  serie máx ${rango.maxSerie} · correlativo máx ${rango.maxCorrelativo}`);
  console.log(`  año mín ${rango.minAnio} · año máx ${rango.maxAnio}`);
  console.log(`  sin fecha_creacion: ${rango.sinFecha} · secuencial mal formado: ${rango.malFormato}`);
  const choques = [...nuevaId.entries()].filter(([, v]) => new Set(v).size > 1);
  console.log(`  colisiones de la ID NUEVA: ${choques.length}`);
  for (const [id, v] of choques.slice(0, 5)) console.log(`    ${id} ← ${[...new Set(v)].join(" | ")}`);
  const repetidos = [...porSecuencial.entries()].filter(([, v]) => v.size > 1);
  console.log(`  secuenciales con MÁS DE UNA fecha en la tabla: ${repetidos.length}`);
  for (const [s, v] of repetidos.slice(0, 10)) console.log(`    ${s} → ${[...v].sort().join(" · ")}`);
})().catch((e) => { console.error(e); process.exit(1); });
