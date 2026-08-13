/**
 * READ-ONLY — el antes/después del "último pago" al excluir los recibos de $0,00.
 *
 * Reproduce la vista `switch_ultimo_pago_cliente_v2` EXACTAMENTE (mismo
 * DISTINCT ON, mismo orden por `fecha_creacion DESC NULLS LAST`) y verifica esa
 * reproducción contra la vista real antes de sacar conclusiones: si difieren, lo
 * que se mide no es lo que ve Daniel. Después vuelve a resolver el último pago
 * excluyendo `total = 0` y lista cliente por cliente qué fecha y qué monto
 * mostraba y cuáles muestra ahora.
 *
 * ⚠️ PAGINA TODO. `db-max-rows` = 1000 corta EN SILENCIO y esta vista tiene
 * 3.264 filas: leyendo una sola página se ven 8 casos en vez de 166.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-ultimo-pago-cero.ts
 *
 * NO ESCRIBE NADA.
 */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function paginado<T>(etiqueta: string, ejec: (c: boolean, d: number, h: number) => any): Promise<T[]> {
  const filas: T[] = []; let esperadas: number | null = null;
  for (let p = 0; p < 1000; p++) {
    const { data, error, count } = await ejec(p === 0, p * 1000, p * 1000 + 999);
    if (error) throw new Error(`${etiqueta}: ${error.message}`);
    if (p === 0) esperadas = count ?? null;
    filas.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    if (esperadas != null && filas.length >= esperadas) break;
  }
  if (esperadas == null) throw new Error(`${etiqueta}: sin COUNT`);
  if (filas.length !== esperadas) throw new Error(`${etiqueta}: ${filas.length} vs ${esperadas}`);
  console.error(`[${etiqueta}] ${filas.length} filas`);
  return filas;
}

interface Vista { empresa_key: string; cliente_switch_id: number; cliente_codigo: string | null; ultimo_pago_fecha: string; ultimo_pago_monto: number }
interface Rec { empresa_key: string; cliente_switch_id: number | null; cliente_codigo: string | null; cliente_nombre: string | null; fecha: string | null; fecha_creacion: string | null; total: number; es_retencion: boolean }

(async () => {
  const vista = await paginado<Vista>("vista v2", (c, d, h) =>
    db.from("switch_ultimo_pago_cliente_v2").select("empresa_key,cliente_switch_id,cliente_codigo,ultimo_pago_fecha,ultimo_pago_monto", c ? { count: "exact" } : {})
      .order("empresa_key").order("cliente_switch_id").range(d, h));

  const recibos = await paginado<Rec>("switch_recibos", (c, d, h) =>
    db.from("switch_recibos").select("empresa_key,cliente_switch_id,cliente_codigo,cliente_nombre,fecha,fecha_creacion,total,es_retencion", c ? { count: "exact" } : {})
      .order("id").range(d, h));

  // Reproduce la vista (DISTINCT ON empresa+cliente_switch_id, orden fecha_creacion DESC NULLS LAST)
  const mejor = (filtro: (r: Rec) => boolean) => {
    const m = new Map<string, Rec>();
    for (const r of recibos) {
      if (!r.fecha) continue;
      if (r.es_retencion) continue;
      if (!filtro(r)) continue;
      const k = `${r.empresa_key}|${r.cliente_switch_id}`;
      const prev = m.get(k);
      if (!prev) { m.set(k, r); continue; }
      const a = r.fecha_creacion ?? "", b = prev.fecha_creacion ?? "";
      if (a > b) m.set(k, r);
    }
    return m;
  };
  const antes = mejor(() => true);
  const despues = mejor((r) => Number(r.total) !== 0);

  // Sanidad: ¿mi reproducción coincide con la vista real?
  let mismatch = 0;
  for (const v of vista) {
    const k = `${v.empresa_key}|${v.cliente_switch_id}`;
    const a = antes.get(k);
    if (!a || a.fecha !== v.ultimo_pago_fecha || Math.abs(Number(a.total) - Number(v.ultimo_pago_monto)) > 0.005) mismatch++;
  }
  console.log(`\nSANIDAD: vista ${vista.length} filas · reproducción ${antes.size} · discrepancias ${mismatch}`);

  // Impacto
  const cambian: { emp: string; cod: string; nom: string; fA: string; mA: number; fD: string | null; mD: number | null }[] = [];
  for (const [k, a] of antes) {
    if (Number(a.total) !== 0) continue;
    const d = despues.get(k) ?? null;
    cambian.push({ emp: a.empresa_key, cod: a.cliente_codigo ?? String(a.cliente_switch_id), nom: a.cliente_nombre ?? "", fA: a.fecha!, mA: Number(a.total), fD: d?.fecha ?? null, mD: d ? Number(d.total) : null });
  }
  cambian.sort((x, y) => x.emp.localeCompare(y.emp) || x.cod.localeCompare(y.cod));
  const porEmp = new Map<string, { total: number; sinPago: number }>();
  for (const c of cambian) {
    const e = porEmp.get(c.emp) ?? { total: 0, sinPago: 0 };
    e.total++; if (c.fD === null) e.sinPago++;
    porEmp.set(c.emp, e);
  }
  console.log(`\n=== CLIENTES AFECTADOS: ${cambian.length} ===`);
  for (const [e, v] of [...porEmp].sort()) console.log(` ${e.padEnd(22)} ${String(v.total).padStart(4)}   (sin ningún pago real: ${v.sinPago})`);
  console.log(` TOTAL sin ningún pago real tras el arreglo: ${cambian.filter(c => c.fD === null).length}`);

  console.log(`\n=== DETALLE cliente por cliente ===`);
  console.log("empresa|codigo|nombre|fecha_vieja|monto_viejo|fecha_nueva|monto_nuevo");
  for (const c of cambian) console.log(`${c.emp}|${c.cod}|${c.nom}|${c.fA}|${c.mA.toFixed(2)}|${c.fD ?? "SIN PAGO"}|${c.mD == null ? "-" : c.mD.toFixed(2)}`);

  // Recibos $0 por empresa
  const ceroEmp = new Map<string, number>();
  for (const r of recibos) if (Number(r.total) === 0) ceroEmp.set(r.empresa_key, (ceroEmp.get(r.empresa_key) ?? 0) + 1);
  console.log(`\n=== recibos total=0 por empresa ===`, [...ceroEmp].sort());
  const ceroRet = recibos.filter(r => Number(r.total) === 0 && r.es_retencion).length;
  console.log(`recibos total=0 marcados como retención: ${ceroRet}`);
})();
