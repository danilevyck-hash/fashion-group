/**
 * SOLO LECTURA. Mide el churn real del sync de recibos y prueba, fila por fila,
 * que la escritura selectiva deja el mismo estado final que el DELETE+INSERT.
 *
 *   npx tsx scripts/_diag-recibos-churn.ts [empresa1,empresa2|all]
 *
 * No escribe NADA: ni en switch_recibos ni en switch_sync_log. Sí abre sesión
 * en Switch (lectura) → correr fuera de las ventanas de cron y con logout final.
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
  const sync = await import("../src/lib/switch-api/sync-recibos");
  const diffMod = await import("../src/lib/switch-api/recibos-diff");
  const clientMod = await import("../src/lib/switch-api/client");
  const { supabaseServer } = await import("../src/lib/supabase-server");

  const arg = process.argv[2] ?? "all";
  const empresas =
    arg === "all"
      ? sync.RECIBOS_EMPRESA_KEYS
      : (arg.split(",").map((s) => s.trim()) as typeof sync.RECIBOS_EMPRESA_KEYS);
  const meses = sync.mesesCronRecibos();
  console.log(`ventana: ${meses.map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`).join(", ")}`);
  console.log(`empresas: ${empresas.join(", ")}\n`);

  // ─── FASE 0 (solo DB) — higiene de la tabla y verificación de zona horaria ──
  console.log("═══ FASE 0 — DB sola ═══");
  {
    const { count: total } = await supabaseServer
      .from("switch_recibos")
      .select("id", { count: "exact", head: true });
    const { count: sinFecha } = await supabaseServer
      .from("switch_recibos")
      .select("id", { count: "exact", head: true })
      .is("fecha", null);
    console.log(`switch_recibos: ${total} filas totales · ${sinFecha} con fecha NULL`);
    if ((sinFecha ?? 0) > 0) {
      console.log("  ⚠️  filas con fecha NULL: el DELETE por rango NUNCA las alcanza (se re-insertan cada corrida)");
    }
  }
  // ¿la base guarda los timestamptz ingenuos como UTC? Si no, el día de
  // fecha_creacion renderizado en UTC no coincidiría con la columna `fecha`.
  {
    const { data } = await supabaseServer
      .from("switch_recibos")
      .select("fecha,fecha_creacion")
      .not("fecha_creacion", "is", null)
      .order("fecha_creacion", { ascending: false })
      .limit(5000);
    let desfase = 0;
    let tarde = 0;
    for (const r of (data ?? []) as { fecha: string; fecha_creacion: string }[]) {
      const utc = new Date(r.fecha_creacion);
      if (utc.getUTCHours() >= 19) tarde += 1;
      if (utc.toISOString().slice(0, 10) !== String(r.fecha).slice(0, 10)) desfase += 1;
    }
    console.log(
      `zona horaria: ${data?.length ?? 0} filas revisadas · ${tarde} con hora UTC >= 19:00 · ${desfase} con día(fecha_creacion UTC) != fecha`,
    );
    console.log(
      desfase === 0 && tarde > 0
        ? "  ✅ la base interpreta los timestamps ingenuos como UTC (hipótesis confirmada con filas nocturnas)"
        : desfase === 0
          ? "  ⚠️  sin filas nocturnas en la muestra: la confirmación es débil (el diff solo perdería ahorro, no exactitud)"
          : "  ❌ HAY DESFASE — revisar antes de seguir",
    );
  }

  // ─── FASE 1 — churn real y equivalencia contra Switch ──────────────────────
  console.log("\n═══ FASE 1 — Switch vs DB (solo lectura) ═══");
  let gTraidas = 0;
  let gGuardadas = 0;
  let gInsertar = 0;
  let gBorrar = 0;
  let gSinCambio = 0;
  let gFallosEquiv = 0;
  let gFallosCampo = 0;

  for (const empresaKey of empresas) {
    const t0 = Date.now();
    const { impuestoMap, carteraMap } = await sync.cargarMapasRecibos(empresaKey, meses);
    for (const { year, month } of meses) {
      const etiqueta = `${empresaKey} ${year}-${String(month).padStart(2, "0")}`;
      const traidas = await sync.fetchRecibosMes(empresaKey, year, month, impuestoMap, carteraMap);
      const inicio = `${year}-${String(month).padStart(2, "0")}-01`;
      const ny = month === 12 ? year + 1 : year;
      const nm = month === 12 ? 1 : month + 1;
      const finExcl = `${ny}-${String(nm).padStart(2, "0")}-01`;
      const guardadas = await sync.leerMesGuardado(empresaKey, inicio, finExcl);
      const plan = diffMod.diffRecibos(guardadas, traidas);

      // ── PRUEBA A: el estado final del plan == el estado final del delete+insert
      const borrar = new Set(plan.borrarIds);
      const finalNuevo = [
        ...guardadas.filter((g) => !borrar.has(g.id)).map((g) => diffMod.claveRecibo(g)),
        ...plan.insertar.map((d) => diffMod.claveRecibo(d)),
      ].sort();
      const finalViejo = traidas.map((d) => diffMod.claveRecibo(d)).sort();
      const equiv =
        finalNuevo.length === finalViejo.length && finalNuevo.every((k, i) => k === finalViejo[i]);
      if (!equiv) {
        gFallosEquiv += 1;
        console.log(`  ❌ ${etiqueta}: estado final DISTINTO (${finalNuevo.length} vs ${finalViejo.length})`);
      }

      // ── PRUEBA B: las filas que se CONSERVAN son iguales campo por campo,
      // comparando los valores CRUDOS (no la clave), para descartar que la
      // normalización esté tapando una diferencia real.
      const porClaveApi = new Map<string, Record<string, unknown>[]>();
      for (const d of traidas as unknown as Record<string, unknown>[]) {
        const k = diffMod.claveRecibo(d as never);
        (porClaveApi.get(k) ?? porClaveApi.set(k, []).get(k)!).push(d);
      }
      const campos = [
        "fecha",
        "cliente_switch_id",
        "cliente_codigo",
        "cliente_nombre",
        "vendedor_registro",
        "vendedor_cartera",
        "es_retencion",
      ] as const;
      for (const g of guardadas) {
        if (borrar.has(g.id)) continue;
        const par = porClaveApi.get(diffMod.claveRecibo(g))?.pop();
        if (!par) {
          gFallosCampo += 1;
          console.log(`  ❌ ${etiqueta}: fila conservada ${g.id} sin par en el API`);
          continue;
        }
        const gr = g as unknown as Record<string, unknown>;
        for (const c of campos) {
          const a = gr[c] ?? null;
          const b = par[c] ?? null;
          if (String(a) !== String(b)) {
            gFallosCampo += 1;
            console.log(`  ❌ ${etiqueta}: ${g.id} campo ${c}: DB=${JSON.stringify(a)} API=${JSON.stringify(b)}`);
          }
        }
        // total: igualdad numérica a la precisión de la columna numeric(14,4)
        if (Number(gr.total ?? 0).toFixed(4) !== Number(par.total ?? 0).toFixed(4)) {
          gFallosCampo += 1;
          console.log(`  ❌ ${etiqueta}: ${g.id} total DB=${gr.total} API=${par.total}`);
        }
        // fecha_creacion: el valor de la DB, leído como UTC, debe ser exactamente
        // la cadena ingenua que el sync le pasó a Postgres.
        const dbNaive = gr.fecha_creacion ? new Date(String(gr.fecha_creacion)).toISOString().slice(0, 19) : null;
        const apiNaive = par.fecha_creacion ? String(par.fecha_creacion).slice(0, 19) : null;
        if (dbNaive !== apiNaive) {
          gFallosCampo += 1;
          console.log(`  ❌ ${etiqueta}: ${g.id} fecha_creacion DB=${dbNaive} API=${apiNaive}`);
        }
      }

      const pct = traidas.length ? ((plan.insertar.length / traidas.length) * 100).toFixed(1) : "0.0";
      console.log(
        `  ${etiqueta.padEnd(34)} switch=${String(traidas.length).padStart(5)} db=${String(guardadas.length).padStart(5)}` +
          ` → insertar=${String(plan.insertar.length).padStart(4)} borrar=${String(plan.borrarIds.length).padStart(4)}` +
          ` sinCambio=${String(plan.sinCambio).padStart(5)} (${pct}% escrito)${equiv ? " ✅" : " ❌"}`,
      );
      gTraidas += traidas.length;
      gGuardadas += guardadas.length;
      gInsertar += plan.insertar.length;
      gBorrar += plan.borrarIds.length;
      gSinCambio += plan.sinCambio;
    }
    console.log(`  (${empresaKey} en ${f2((Date.now() - t0) / 1000)}s)`);
  }

  console.log("\n═══ RESUMEN ═══");
  console.log(`ventana (3 meses × ${empresas.length} empresas): ${gTraidas} filas en Switch, ${gGuardadas} en DB`);
  console.log(`VIEJO  por corrida: ${gGuardadas} DELETE + ${gTraidas} INSERT = ${gGuardadas + gTraidas} escrituras`);
  console.log(`NUEVO  por corrida: ${gBorrar} DELETE + ${gInsertar} INSERT = ${gBorrar + gInsertar} escrituras`);
  console.log(`sin tocar: ${gSinCambio} filas`);
  const viejo = gGuardadas + gTraidas;
  const nuevo = gBorrar + gInsertar;
  console.log(`reducción de escrituras: ${viejo ? f2((1 - nuevo / viejo) * 100) : "0"}%`);
  console.log(`filas muertas por corrida: ${gGuardadas} → ${gBorrar}   (×4 corridas/día: ${gGuardadas * 4} → ${gBorrar * 4})`);
  console.log(`\nequivalencia: ${gFallosEquiv === 0 ? "✅ EXACTA" : `❌ ${gFallosEquiv} meses distintos`}`);
  console.log(`campo por campo en filas conservadas: ${gFallosCampo === 0 ? "✅ sin diferencias" : `❌ ${gFallosCampo} diferencias`}`);

  await clientMod.logoutAllSwitchSessions();
}

main().catch(async (e) => {
  console.error("FALLO:", e);
  process.exit(1);
});
