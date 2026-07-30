/**
 * SOLO LECTURA — cuánto pesan las retenciones de ITBMS en la comisión sobre
 * cobro, por empresa y por vendedor. Julio 2026 por defecto.
 *
 *   npx tsx scripts/_probe-retenciones-impacto.ts
 *   npx tsx scripts/_probe-retenciones-impacto.ts 2026 6      # otro período
 *
 * NO escribe nada. Sólo SELECT sobre switch_recibos y comision_vendedor_tasa,
 * más la RPC comision_b2b_v5 (STABLE, sólo lee). No toca la API de Switch, así
 * que no consume la sesión única de ninguna empresa.
 *
 * QUÉ RESPONDE
 *   La regla (Daniel, 30-jul-2026): la retención baja la deuda del cliente pero
 *   NO paga comisión. Ese filtro YA está en la base de cobro de todas las RPC de
 *   comisión (`AND r.es_retencion = false`) desde el 4-jun-2026. Lo que este
 *   script mide es CUÁNTO está evitando ese filtro: la comisión que se pagaría
 *   de más si alguien lo borrara. Es la cifra con la que Daniel puede confirmar
 *   la magnitud que recuerda (~4.211 USD de retenciones en julio en Fashion
 *   Wear) y ver el reparto por empresa.
 *
 *   Por empresa imprime:
 *     base_cobro HOY        = lo que devuelve comision_b2b_v5 (sin retenciones)
 *     retenciones del mes   = switch_recibos con es_retencion = true, mismos
 *                             filtros de la RPC (TCKCTA y MFH fuera, cartera
 *                             asignada)
 *     comisión de más       = Σ por vendedor (retención × su tasa_cobro), que es
 *                             exactamente lo que cambiaría la comisión pagada
 *
 * SI LOS NÚMEROS NO CUADRAN con lo que Daniel recuerda, lo primero a revisar NO
 * es la comisión sino la heurística que marca el flag (sync-recibos.ts): un
 * recibo de retención mal clasificado sale acá como cobro real, y al revés.
 */
import fs from "node:fs";

function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}

const m2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Paginado con COUNT exacto: PostgREST corta en 1.000 filas SIN error y sin
 *  señal en el payload (ver src/lib/supabase-paginado.ts). Un probe que sume
 *  plata truncada miente peor que uno que no corre. */
async function leerTodo<T>(
  sb: any,
  tabla: string,
  cols: string,
  filtros: (q: any) => any,
  orden: string,
): Promise<T[]> {
  const { count, error: cErr } = await filtros(sb.from(tabla).select("id", { count: "exact", head: true }));
  if (cErr) throw new Error(`count ${tabla}: ${cErr.message}`);
  const rows: T[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await filtros(sb.from(tabla).select(cols))
      .order(orden, { ascending: true })
      .range(off, off + 999);
    if (error) throw new Error(`select ${tabla}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  if (count != null && rows.length !== count) {
    throw new Error(`lectura TRUNCADA de ${tabla}: ${rows.length} leídas vs ${count} contadas`);
  }
  return rows;
}

type Recibo = {
  id: number;
  total: unknown;
  vendedor_cartera: string | null;
  cliente_codigo: string | null;
  cliente_nombre: string | null;
};

async function main() {
  cargarEnv();
  const year = Number(process.argv[2] ?? 2026);
  const mes = Number(process.argv[3] ?? 7);
  if (!Number.isInteger(year) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error("uso: npx tsx scripts/_probe-retenciones-impacto.ts [year] [mes]");
  }

  const { supabaseServer: sb } = await import("../src/lib/supabase-server");
  const { B2B_EMPRESA_KEYS } = await import("../src/lib/empresa-mapping");
  const { empresasConRecibos } = await import("../src/lib/switch-api/empresas");

  const inicio = `${year}-${String(mes).padStart(2, "0")}-01`;
  const fin = new Date(Date.UTC(year, mes, 0)).toISOString().slice(0, 10);

  // Tasas de cobro (tabla global, ~decenas de filas).
  const { data: tasasRaw, error: tErr } = await sb
    .from("comision_vendedor_tasa")
    .select("vendedor_nombre,tasa_cobro");
  if (tErr) throw new Error(`comision_vendedor_tasa: ${tErr.message}`);
  const tasa = new Map<string, number>(
    (tasasRaw ?? []).map((t: any) => [t.vendedor_nombre as string, Number(t.tasa_cobro ?? 0.005)]),
  );
  const tasaDe = (v: string) => tasa.get(v) ?? 0.005; // mismo DEFAULT que las RPC

  // Sólo empresas que de verdad sincronizan recibos Y tienen pestaña de comisión.
  const conRecibos = new Set<string>(empresasConRecibos() as unknown as string[]);
  const empresas = (B2B_EMPRESA_KEYS as readonly string[]).filter((e) => conRecibos.has(e));

  console.log(`═══ Impacto de las retenciones en la comisión sobre cobro — ${inicio} a ${fin} ═══`);
  console.log("   (la retención baja la deuda pero NO paga comisión — regla Daniel 30-jul-2026)\n");

  let totalRet = 0;
  let totalComision = 0;

  for (const empresa of empresas) {
    // 1) Base de cobro REAL de hoy, tal cual la ve la pantalla de Comisiones.
    const { data: rpc, error: rErr } = await sb.rpc("comision_b2b_v5", {
      p_empresa_key: empresa,
      p_year: year,
      p_mes: mes,
    });
    if (rErr) throw new Error(`comision_b2b_v5 ${empresa}: ${rErr.message}`);
    const filas = ((rpc as any)?.vendedores ?? []) as { vendedor: string; base_cobro: number; comision_cobro: number }[];
    const baseHoy = filas.reduce((a, f) => a + Number(f.base_cobro ?? 0), 0);
    const comHoy = filas.reduce((a, f) => a + Number(f.comision_cobro ?? 0), 0);

    // 2) Las retenciones del mes, con los MISMOS filtros de la RPC salvo el flag.
    const recibos = await leerTodo<Recibo>(
      sb,
      "switch_recibos",
      "id,total,vendedor_cartera,cliente_codigo,cliente_nombre",
      (q: any) =>
        q
          .eq("empresa_key", empresa)
          .eq("es_retencion", true)
          .gte("fecha", inicio)
          .lte("fecha", fin),
      "id",
    );

    const porVendedor = new Map<string, { monto: number; n: number }>();
    let retExcluidasPorOtroFiltro = 0;
    for (const r of recibos) {
      const v = (r.vendedor_cartera ?? "").trim();
      const cod = (r.cliente_codigo ?? "").trim().toUpperCase();
      const nom = (r.cliente_nombre ?? "").toLowerCase();
      const monto = Number(r.total ?? 0);
      // Estas tres condiciones ya sacaban el recibo de la base de cobro aunque
      // no fuera retención: no se pueden contar como impacto del flag.
      if (v === "" || cod === "TCKCTA" || nom.includes("multi fashion holding")) {
        retExcluidasPorOtroFiltro += monto;
        continue;
      }
      const acc = porVendedor.get(v) ?? { monto: 0, n: 0 };
      acc.monto += monto;
      acc.n += 1;
      porVendedor.set(v, acc);
    }

    const retMonto = [...porVendedor.values()].reduce((a, x) => a + x.monto, 0);
    // Redondeo por vendedor, igual que las RPC (ROUND por componente, no de la suma).
    const comisionDeMas = [...porVendedor.entries()].reduce(
      (a, [v, x]) => a + Math.round(x.monto * tasaDe(v) * 100) / 100,
      0,
    );

    totalRet += retMonto;
    totalComision += comisionDeMas;

    const pct = baseHoy > 0 ? (retMonto / baseHoy) * 100 : 0;
    console.log(`── ${empresa}`);
    console.log(`   base_cobro HOY (v5)      ${m2(baseHoy).padStart(14)}   comisión cobro ${m2(comHoy)}`);
    console.log(
      `   retenciones del mes      ${m2(retMonto).padStart(14)}   ${recibos.length} recibo(s) marcados` +
        `${pct > 0 ? `, ${pct.toFixed(1)}% de la base` : ""}`,
    );
    console.log(`   COMISIÓN DE MÁS si se quitara el filtro: ${m2(comisionDeMas)}`);
    if (retExcluidasPorOtroFiltro > 0) {
      console.log(
        `   (otros ${m2(retExcluidasPorOtroFiltro)} de retenciones ya salían por TCKCTA/MFH/sin cartera)`,
      );
    }
    for (const [v, x] of [...porVendedor.entries()].sort((a, b) => b[1].monto - a[1].monto)) {
      console.log(
        `       ${v.padEnd(28)} ret ${m2(x.monto).padStart(12)} × ${(tasaDe(v) * 100).toFixed(2)}%` +
          ` = ${m2(Math.round(x.monto * tasaDe(v) * 100) / 100)}  (${x.n} recibo/s)`,
      );
    }
    console.log("");
  }

  console.log("═══ TOTAL GRUPO ═══");
  console.log(`   retenciones del mes:                 ${m2(totalRet)}`);
  console.log(`   comisión que el filtro está evitando: ${m2(totalComision)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
