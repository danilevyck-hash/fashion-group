/**
 * VERIFICACIÓN SOLO LECTURA del módulo Proveedores tras la poda del 27-jul-2026.
 *
 * Corre EXACTAMENTE el mismo código que la pantalla (fetchAllProveedorRows +
 * buildList + buildFicha) contra la base de PRODUCCIÓN y lo imprime al lado del
 * número CRUDO recalculado a mano desde `elements`. Si los dos no coinciden, el
 * módulo está mintiendo.
 *
 * No toca Switch. No escribe nada.
 *
 *   npx tsx scripts/_verif-proveedores-pantalla.ts
 */
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const { fetchAllProveedorRows, buildList, buildFicha } = await import("../src/lib/proveedores");
  const { supabaseServer } = await import("../src/lib/supabase-server");

  // 1) Lo que ve la pantalla.
  const rows = await fetchAllProveedorRows();
  const { proveedores, grupo_saldo } = buildList(rows, {});
  console.log(`filas en switch_proveedor_estadocuenta: ${rows.length}`);
  console.log(`proveedores agrupados: ${proveedores.length} · Por pagar grupo: $${money(grupo_saldo)}\n`);

  // 2) Candado: ningún campo eliminado sobrevive en el payload de la pantalla.
  const muertos = ["comprado_ytd", "pagado_ytd", "num_facturas", "num_pagos"];
  const fugas = new Set<string>();
  for (const p of proveedores) for (const m of muertos) if (m in (p as object)) fugas.add(`lista.${m}`);
  for (const r of rows) for (const m of muertos) if (m in (r as object)) fugas.add(`row.${m}`);
  console.log(fugas.size === 0
    ? "✅ ni comprado_ytd ni pagado_ytd ni los conteos llegan a la pantalla\n"
    : `❌ FUGA: ${[...fugas].join(", ")}\n`);

  // 3) Los 3 proveedores con más saldo: pantalla vs. crudo.
  const top = proveedores.slice(0, 3);
  for (const p of top) {
    const ficha = buildFicha(rows, p.key)!;
    const crudas = rows.filter((r) => r.nombre.trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ") === p.key);

    // CRUDO: saldo sumado a mano desde la columna saldo_total de la tabla.
    const { data: raw } = await supabaseServer
      .from("switch_proveedor_estadocuenta")
      .select("empresa_key,nombre,saldo_total,elements")
      .in("empresa_key", crudas.map((c) => c.empresa_key));
    const mias = (raw ?? []).filter(
      (r: { nombre: string }) => r.nombre.trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ") === p.key,
    );
    const saldoCrudo = mias.reduce((s: number, r: { saldo_total: number }) => s + Number(r.saldo_total), 0);

    // CRUDO: último pago = el renglón PP de fecha más alta, buscado a mano.
    let ultCrudo: { fecha: string; monto: number } | null = null;
    for (const r of mias as { elements: { abrev?: string; fechaCreacion?: string; total?: string; debito?: string }[] }[]) {
      for (const el of r.elements ?? []) {
        if (String(el.abrev ?? "").toUpperCase() !== "PP") continue;
        const f = String(el.fechaCreacion ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) continue;
        const m = Number(String(el.total ?? el.debito ?? 0).replace(/,/g, ""));
        if (!ultCrudo || f > ultCrudo.fecha) ultCrudo = { fecha: f, monto: m };
      }
    }

    console.log(`── ${p.nombre}  (${p.empresas_count} empresa/s)`);
    console.log(`   PANTALLA  Por pagar $${money(ficha.total_grupo.por_pagar)} · 0-90d $${money(p.aging_current)} · 91-120d $${money(p.aging_watch)} · 121d+ $${money(p.aging_overdue)} · último pago ${p.ultimo_pago_dias != null ? `hace ${p.ultimo_pago_dias}d` : "—"}`);
    console.log(`   CRUDO     Por pagar $${money(saldoCrudo)} · último pago ${ultCrudo ? `${ultCrudo.fecha} $${money(ultCrudo.monto)}` : "—"}`);
    const okSaldo = Math.abs(saldoCrudo - ficha.total_grupo.por_pagar) < 0.005;
    const fichaUlt = ficha.empresas.map((e) => e.ultimo_pago_fecha).filter(Boolean).sort().reverse()[0] ?? null;
    const okPago = (ultCrudo?.fecha ?? null) === fichaUlt;
    console.log(`   ${okSaldo ? "✅" : "❌"} saldo cuadra   ${okPago ? "✅" : "❌"} último pago cuadra (pantalla ${fichaUlt ?? "—"})\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
