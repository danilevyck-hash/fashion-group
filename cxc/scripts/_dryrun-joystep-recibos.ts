/**
 * SOLO LECTURA — dry run del backfill de RECIBOS de joystep.
 *
 *   npx tsx scripts/_dryrun-joystep-recibos.ts
 *
 * No escribe NADA: ni en switch_recibos, ni en switch_sync_log, ni en ninguna
 * otra tabla. Abre UNA sesión en Switch (joystep), lee, y cierra con
 * /cierresesion. Correr fuera de las ventanas de cron de joystep.
 *
 * Reporta: cuántos recibos por mes, cuánta plata, desde cuándo hay datos, y
 * cuántas filas escribiría el backfill.
 */
import fs from "node:fs";

function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}

const f2 = (n: number) => n.toFixed(2);

async function main() {
  cargarEnv();
  const clientMod = await import("../src/lib/switch-api/client");
  const { supabaseServer } = await import("../src/lib/supabase-server");

  const EMPRESA = "joystep" as const;
  // Rango ancho: la primera factura de joystep en nuestra base es 2025-07-21,
  // pero un recibo puede aplicar contra un saldo anterior → se pide desde 2024.
  const DESDE = "2024-01-01";
  const HASTA = "2026-12-31";

  console.log(`Dry run recibos ${EMPRESA} — ${DESDE} .. ${HASTA} (SOLO LECTURA)`);
  console.log(`Inicio ${new Date().toISOString()}`);

  const CACHE = "/tmp/_dryrun-joystep-recibos.json";
  const client = clientMod.createSwitchClient(EMPRESA);
  type Recibo = Record<string, unknown>;
  let recibos: Recibo[] = [];
  // Reusar la lectura ya hecha: Switch permite UNA sesión por empresa, así que
  // re-analizar no puede costar un login más.
  if (fs.existsSync(CACHE)) {
    recibos = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    console.log(`\n(reusando ${recibos.length} recibos de ${CACHE} — sin tocar Switch)`);
  } else {
  try {
    let pagina = 1;
    for (;;) {
      const data = await client.listRecibos({
        desde: DESDE,
        hasta: HASTA,
        porPagina: 50,
        paginaActual: pagina,
      });
      const lote = (data.recibos ?? []) as Recibo[];
      recibos.push(...lote);
      const total = data.paginacion?.total ?? lote.length;
      if (recibos.length >= total || lote.length === 0) break;
      pagina += 1;
      if (pagina > 200) throw new Error("demasiadas páginas");
    }
    console.log(`\nSwitch devolvió ${recibos.length} recibos.`);
  } finally {
    await clientMod.logoutAllSwitchSessions();
    console.log(`Sesión cerrada ${new Date().toISOString()}`);
  }
  fs.writeFileSync(CACHE, JSON.stringify(recibos));
  }

  if (recibos.length === 0) {
    console.log("Sin recibos en el rango. Nada que backfillear.");
    return;
  }

  console.log("\nCampos del primer recibo:", JSON.stringify(recibos[0]));

  const num = (v: unknown): number => {
    const n = parseFloat(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const fechaDe = (r: Recibo): string =>
    String((r.fechaCreacion ?? r.fecha ?? "") as string).slice(0, 10);

  // ── Agregado por mes ───────────────────────────────────────────────────────
  const porMes = new Map<string, { n: number; monto: number; cero: number }>();
  for (const r of recibos) {
    const k = fechaDe(r).slice(0, 7);
    const e = porMes.get(k) ?? { n: 0, monto: 0, cero: 0 };
    e.n += 1;
    const t = num(r.total);
    e.monto += t;
    if (t === 0) e.cero += 1;
    porMes.set(k, e);
  }
  console.log("\n=== RECIBOS POR MES (lo que Switch tiene para joystep) ===");
  console.log("mes       n    monto        (de los cuales $0)");
  let totalN = 0;
  let totalM = 0;
  let totalCero = 0;
  for (const k of [...porMes.keys()].sort()) {
    const e = porMes.get(k)!;
    totalN += e.n;
    totalM += e.monto;
    totalCero += e.cero;
    console.log(`${k}  ${String(e.n).padStart(4)}  ${f2(e.monto).padStart(12)}   ${e.cero}`);
  }
  console.log(`TOTAL     ${String(totalN).padStart(4)}  ${f2(totalM).padStart(12)}   ${totalCero}`);

  const fechas = recibos.map(fechaDe).filter(Boolean).sort();
  console.log(`\nPrimer recibo: ${fechas[0]}   Último recibo: ${fechas[fechas.length - 1]}`);

  // ── Clientes distintos y cuáles tienen cartera abierta ─────────────────────
  const clientes = new Map<number, { nombre: string; n: number; monto: number }>();
  for (const r of recibos) {
    const id = Number(r.clienteId ?? r.cliente_id ?? 0);
    const e = clientes.get(id) ?? { nombre: String(r.cliente ?? r.clienteNombre ?? ""), n: 0, monto: 0 };
    e.n += 1;
    e.monto += num(r.total);
    clientes.set(id, e);
  }
  console.log(`\nClientes distintos con recibos: ${clientes.size}`);

  // ── Estado actual en nuestra base (debe ser 0) ─────────────────────────────
  const { count: yaHay } = await supabaseServer
    .from("switch_recibos")
    .select("*", { count: "exact", head: true })
    .eq("empresa_key", EMPRESA);
  console.log(`switch_recibos hoy para joystep: ${yaHay} filas.`);

  // ── Qué escribiría el backfill ─────────────────────────────────────────────
  console.log("\n=== LO QUE ESCRIBIRÍA EL BACKFILL ===");
  console.log(`Tabla switch_recibos: +${totalN} filas nuevas (${f2(totalM)} en cobros).`);
  console.log(`Tabla switch_sync_log: +${porMes.size ? 1 : 0} fila(s) de log por corrida (sync_type='recibos').`);
  console.log("Ninguna fila existente se borra ni se modifica (joystep está en 0).");

  // ── Vendedores de cartera de esos clientes (insumo de comisión) ────────────
  const CACHE_CART = "/tmp/_dryrun-joystep-cartera.json";
  const carteraDe = new Map<number, string>();
  if (fs.existsSync(CACHE_CART)) {
    for (const [k, v] of JSON.parse(fs.readFileSync(CACHE_CART, "utf8"))) carteraDe.set(Number(k), v);
  } else {
    const c = clientMod.createSwitchClient(EMPRESA);
    try {
      let pagina = 1;
      for (;;) {
        const data = await c.listClientes({ porPagina: 500, paginaActual: pagina });
        const cs = data.clientes ?? [];
        for (const cl of cs) {
          if (cl.vendedor && String(cl.vendedor).trim()) carteraDe.set(cl.id, String(cl.vendedor).trim());
        }
        const total = data.paginacion?.total ?? cs.length;
        if (carteraDe.size >= total || cs.length === 0) break;
        pagina += 1;
      }
    } finally {
      await clientMod.logoutAllSwitchSessions();
    }
    fs.writeFileSync(CACHE_CART, JSON.stringify([...carteraDe.entries()]));
  }

  // vendedor_cartera tal como lo calcularía mapRow: dueño del cliente, y si no
  // tiene dueño, el vendedor que registró el recibo.
  const vendedorDe = (r: Recibo): string => {
    const id = Number(r.clienteId ?? 0);
    return (carteraDe.get(id) ?? String(r.vendedor ?? "")).trim();
  };

  const porVendedor = new Map<string, { n: number; monto: number }>();
  for (const r of recibos) {
    const v = vendedorDe(r) || "(vacío)";
    const a = porVendedor.get(v) ?? { n: 0, monto: 0 };
    a.n += 1;
    a.monto += num(r.total);
    porVendedor.set(v, a);
  }
  console.log("\n=== A QUÉ VENDEDOR SE ATRIBUIRÍAN (cartera, todo el histórico) ===");
  for (const [v, a] of [...porVendedor.entries()].sort((x, y) => y[1].monto - x[1].monto)) {
    console.log(`${v.padEnd(32)} ${String(a.n).padStart(4)} recibos  ${f2(a.monto).padStart(12)}`);
  }

  // ── Base de comisión sobre cobro de JULIO 2026, con los filtros de la RPC ──
  // comision_b2b_v5 excluye el mostrador (cliente_codigo='TCKCTA'), el
  // intercompañía ('%multi fashion holding%') y los recibos sin vendedor.
  console.log("\n=== BASE DE COMISIÓN SOBRE COBRO — JULIO 2026 (filtros de comision_b2b_v5) ===");
  const jul = recibos.filter((r) => fechaDe(r).startsWith("2026-07"));
  const base = new Map<string, { n: number; monto: number }>();
  let excluidos = 0;
  let excluidoMonto = 0;
  for (const r of jul) {
    const cod = String(r.clienteCodigo ?? "").trim().toUpperCase();
    const nom = String(r.clienteNombre ?? "");
    const v = vendedorDe(r);
    if (cod === "TCKCTA" || /multi fashion holding/i.test(nom) || !v) {
      excluidos += 1;
      excluidoMonto += num(r.total);
      continue;
    }
    const a = base.get(v) ?? { n: 0, monto: 0 };
    a.n += 1;
    a.monto += num(r.total);
    base.set(v, a);
  }
  console.log(`Recibos de julio: ${jul.length} · excluidos por la RPC: ${excluidos} (${f2(excluidoMonto)})`);
  const { data: tasas } = await supabaseServer.from("comision_vendedor_tasa").select("vendedor_nombre,tasa_cobro");
  const tasaDe = new Map<string, number>((tasas ?? []).map((t: Record<string, unknown>) => [String(t.vendedor_nombre), Number(t.tasa_cobro)]));
  let comisionTotal = 0;
  for (const [v, a] of [...base.entries()].sort((x, y) => y[1].monto - x[1].monto)) {
    const t = tasaDe.get(v) ?? 0.005; // la RPC usa 0.50% por defecto
    const com = Math.round(a.monto * t * 100) / 100;
    comisionTotal += com;
    console.log(
      `${v.padEnd(32)} base ${f2(a.monto).padStart(12)}  tasa ${(t * 100).toFixed(2)}%  → comisión ${f2(com)}` +
        (tasaDe.has(v) ? "" : "   (sin tasa propia: la RPC usa 0,50% por defecto)"),
    );
  }
  console.log(`COMISIÓN SOBRE COBRO DE JULIO que aparecería: ${f2(comisionTotal)}`);
  console.log(`\nFin ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
